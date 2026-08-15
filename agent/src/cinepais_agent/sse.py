"""SSE streaming logic for the CinePaís agent."""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator, MutableMapping
from typing import Any

from .config import settings
from .events import ErrorEvent, RecommendationEvent, TokenEvent, ToolCallEvent

logger = logging.getLogger(__name__)


def _matches_recommend_best(name: str) -> bool:
    """Match recommend_best, including namespaced forms like cinepais__recommend_best."""
    return name == "recommend_best" or name.endswith("__recommend_best")


async def error_stream(code: str, message: str) -> AsyncGenerator[dict[str, str], None]:
    """Stream a single error event."""
    event = ErrorEvent(code=code, message=message)
    yield {"event": "error", "data": event.model_dump_json()}


async def stream_agent(
    message: str, session_id: str, agent: Any, session_queries: MutableMapping[str, int]
) -> AsyncGenerator[dict[str, str], None]:
    """Stream agent events as SSE."""
    if agent is None:
        yield {
            "event": "error",
            "data": ErrorEvent(
                code="agent_unavailable",
                message="El agente no está disponible en este momento. Intenta de nuevo.",
            ).model_dump_json(),
        }
        return

    queries_used = session_queries.get(session_id, 0)

    _emitted_token = False
    _emitted_recommendation = False
    _emitted_error = False

    try:
        async for event in agent.astream_events(
            {"messages": [{"role": "user", "content": message}]},
            config={"configurable": {"thread_id": session_id}},
            version="v2",
        ):
            event_type = event.get("event", "")
            event_data = event.get("data", {})

            if event_type == "on_chat_model_stream":
                chunk = event_data.get("chunk", {})
                content: str = ""
                if hasattr(chunk, "content"):
                    raw = chunk.content or ""
                    if isinstance(raw, list):
                        content = "".join(
                            p.get("text", "")
                            for p in raw
                            if isinstance(p, dict) and p.get("type") != "thinking"
                        )
                    else:
                        content = raw
                elif isinstance(chunk, dict):
                    content = chunk.get("content", "") or ""
                if content:
                    _emitted_token = True
                    yield {"event": "token", "data": TokenEvent(content=content).model_dump_json()}

            elif event_type == "on_tool_start":
                tool_name = event.get("name", "")
                tool_input = event_data.get("input", {})
                yield {
                    "event": "tool_call",
                    "data": ToolCallEvent(tool=tool_name, input=tool_input).model_dump_json(),
                }

            elif event_type == "on_tool_end":
                tool_name = event.get("name", "")
                if _matches_recommend_best(tool_name):
                    output = event_data.get("output", {})
                    rec_event = parse_recommendation(output)
                    if rec_event is not None:
                        _emitted_recommendation = True
                        yield {"event": "recommendation", "data": rec_event.model_dump_json()}

    except TimeoutError:
        _emitted_error = True
        yield {
            "event": "error",
            "data": ErrorEvent(
                code="timeout",
                message="La consulta tardó demasiado. Intenta de nuevo.",
            ).model_dump_json(),
        }
    except Exception as exc:
        logger.error("Agent stream error: %s", exc, exc_info=True)
        _emitted_error = True
        yield {
            "event": "error",
            "data": ErrorEvent(
                code="internal_error",
                message="Ocurrió un error interno. Intenta de nuevo.",
            ).model_dump_json(),
        }

    if not _emitted_token and not _emitted_recommendation and not _emitted_error:
        yield {
            "event": "error",
            "data": ErrorEvent(
                code="empty_reply",
                message="No pude generar una respuesta. Intenta reformular tu pregunta.",
            ).model_dump_json(),
        }

    from .events import DoneEvent

    yield {
        "event": "done",
        "data": DoneEvent(
            sessionQueriesUsed=queries_used,
            sessionQueryCap=settings.session_query_cap,
        ).model_dump_json(),
    }


def parse_recommendation(output: Any) -> RecommendationEvent | None:
    """Parse recommend_best tool output into a RecommendationEvent.

    Validation chain: dict → JSON string → MCP TextContent → list of content items.
    Returns None if all fail (agent continues narrating).
    """
    if isinstance(output, dict):
        try:
            return RecommendationEvent.model_validate(output)
        except Exception:
            pass

    if isinstance(output, str):
        try:
            return RecommendationEvent.model_validate_json(output)
        except Exception:
            pass

    if hasattr(output, "text"):
        try:
            return RecommendationEvent.model_validate_json(getattr(output, "text"))
        except Exception:
            pass

    if isinstance(output, list) and output:
        first = output[0]
        if hasattr(first, "text"):
            try:
                return RecommendationEvent.model_validate_json(getattr(first, "text"))
            except Exception:
                pass
        if isinstance(first, str):
            try:
                return RecommendationEvent.model_validate_json(first)
            except Exception:
                pass

    logger.warning("Could not parse recommend_best output: %r", output)
    return None
