"""FastAPI SSE service for the CinePaís cinema copilot agent."""

from __future__ import annotations

import logging
import os
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Annotated, Any, cast

import cachetools
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sse_starlette.sse import EventSourceResponse

from .agent import build_agent, close_agent
from .config import settings
from .sse import error_stream, stream_agent

# Uvicorn configures only its own `uvicorn.*` loggers, never the root logger, so without this
# every `cinepais_agent.*` INFO record (notably llm.py's "Using model: ...") is silently dropped
# in production. Runs at import time — before lifespan calls build_agent() — so model selection
# is captured. Uvicorn's own loggers set propagate=False and are unaffected.
logging.basicConfig(level=logging.INFO)

logger = logging.getLogger(__name__)


def _client_ip(request: Request) -> str:
    """Resolve the visitor IP used as the rate-limit bucket key.

    Behind Fly.io's proxy the socket peer is the edge, not the visitor, so `get_remote_address`
    returns the same address for everyone and the per-IP limit collapses into one shared bucket.
    Fly sets `Fly-Client-IP` to the real visitor address. The header is absent in local dev, where
    the socket peer already is the visitor — so the fallback keeps that path unchanged.
    """
    fly_client_ip = request.headers.get("Fly-Client-IP")
    return fly_client_ip if fly_client_ip else get_remote_address(request)


# Rate limiter (decorator-only — NO SlowAPIMiddleware, breaks SSE streaming)
limiter = Limiter(key_func=_client_ip)

_session_queries = cast(
    cachetools.TTLCache[str, int, float], cachetools.TTLCache(maxsize=10_000, ttl=3600)
)


def _utc_day_key() -> str:
    """Bucket key for the global daily request cap — UTC, never the host's local time.

    The counter must roll over at the same instant regardless of which region the machine runs
    in, so the day is derived from UTC rather than from a local-time calendar.
    """
    return datetime.now(UTC).strftime("%Y-%m-%d")


# Global daily request budget, keyed by UTC day. The session cap above is bypassable — the client
# chooses its own sessionId — so this is the only in-app ceiling a stranger cannot rotate around.
# It lives in this process, so a Fly cold start resets it: a courtesy brake, not a hard ceiling.
_daily_requests = cast(
    cachetools.TTLCache[str, int, float], cachetools.TTLCache(maxsize=8, ttl=86_400)
)

# App state (agent + mcp_client, owned by lifespan)
_agent: Any = None
_mcp_client: Any = None


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Initialize agent on startup, close on shutdown."""
    global _agent, _mcp_client

    if settings.langsmith_tracing and settings.langsmith_api_key:
        os.environ["LANGCHAIN_TRACING_V2"] = "true"
        os.environ["LANGCHAIN_API_KEY"] = settings.langsmith_api_key
        os.environ["LANGCHAIN_PROJECT"] = settings.langsmith_project
        logger.info("LangSmith tracing enabled for project: %s", settings.langsmith_project)

    try:
        _agent, _mcp_client = await build_agent()
        logger.info("Agent initialized successfully")
    except Exception as exc:
        logger.error("Failed to initialize agent: %s", exc)
        _agent = None
        _mcp_client = None

    yield

    if _mcp_client is not None:
        await close_agent(_mcp_client)
        logger.info("Agent shut down")


app = FastAPI(title="CinePaís Agent", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={
            "error": "rate_limit_exceeded",
            "message": "Has superado el límite de solicitudes. Intenta de nuevo en un momento.",
            "retryAfter": "60",
        },
    )


class ChatRequest(BaseModel):
    message: str
    sessionId: Annotated[str, Field(min_length=1, max_length=128)]


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/chat")
@limiter.limit("10/minute")
async def chat(request: Request, body: ChatRequest) -> EventSourceResponse:
    """Stream SSE events for a chat message."""
    if not body.message.strip():
        return EventSourceResponse(
            error_stream("empty_message", "El mensaje no puede estar vacío."),
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    if len(body.message) > settings.max_input_chars:
        return EventSourceResponse(
            error_stream(
                "input_too_long",
                "El mensaje es demasiado largo. Máximo 2000 caracteres.",
            ),
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    # Checked after the empty-message and length guards so malformed input never spends budget,
    # and before the session cap because rotating a sessionId must not buy a fresh allowance.
    day_key = _utc_day_key()
    if _daily_requests.get(day_key, 0) >= settings.daily_request_cap:
        return EventSourceResponse(
            error_stream(
                "daily_cap_exceeded",
                "El copiloto alcanzó su cupo de consultas de hoy. Vuelve mañana — "
                "el resto del sitio sigue disponible.",
            ),
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    session_count = _session_queries.get(body.sessionId, 0)
    if session_count >= settings.session_query_cap:
        return EventSourceResponse(
            error_stream(
                "session_cap_exceeded",
                f"Has alcanzado el límite de {settings.session_query_cap} consultas por sesión. "
                "Recarga la página para continuar.",
            ),
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    _session_queries[body.sessionId] = _session_queries.get(body.sessionId, 0) + 1
    _daily_requests[day_key] = _daily_requests.get(day_key, 0) + 1

    return EventSourceResponse(
        stream_agent(body.message, body.sessionId, _agent, _session_queries),
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        ping=15,
    )
