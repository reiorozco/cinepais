"""Tests for the FastAPI SSE service (main.py).

Uses ASGI transport — no real server needed.
Agent is mocked — no GOOGLE_API_KEY needed.
"""

from __future__ import annotations

import json
from collections.abc import Generator
from unittest.mock import MagicMock

import httpx
import pytest
from fastapi import FastAPI
from httpx import ASGITransport

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def parse_sse_events(text: str) -> list[dict]:  # type: ignore[type-arg]
    """Parse SSE text into list of {event, data} dicts."""
    events = []
    current: dict = {}  # type: ignore[type-arg]
    for line in text.splitlines():
        if line.startswith("event:"):
            current["event"] = line[len("event:") :].strip()
        elif line.startswith("data:"):
            current["data"] = line[len("data:") :].strip()
        elif line == "" and current:
            events.append(current)
            current = {}
    if current:
        events.append(current)
    return events


async def _fake_astream_events(
    input_data: object, config: object = None, version: str = "v2"
) -> object:
    """Fake agent that yields token + tool_call events."""
    yield {
        "event": "on_chat_model_stream",
        "data": {"chunk": MagicMock(content="Hola")},
    }
    yield {
        "event": "on_tool_start",
        "name": "search_showtimes",
        "data": {"input": {"city": "Bogotá"}},
    }


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_agent() -> MagicMock:
    """Mock agent that streams fake events."""
    agent = MagicMock()
    agent.astream_events = _fake_astream_events
    return agent


@pytest.fixture
def app_with_mock_agent(mock_agent: MagicMock) -> Generator[FastAPI, None, None]:
    """FastAPI app with mocked agent (no real LLM)."""
    import cinepais_agent.main as main_module

    main_module._agent = mock_agent
    main_module._session_queries.clear()
    yield main_module.app
    main_module._agent = None
    main_module._session_queries.clear()


# ---------------------------------------------------------------------------
# Tests: /health
# ---------------------------------------------------------------------------


async def test_health_endpoint() -> None:
    """GET /health returns {status: ok}."""
    from cinepais_agent.main import app

    async with httpx.AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# Tests: /chat — input validation
# ---------------------------------------------------------------------------


async def test_chat_input_too_long(app_with_mock_agent: FastAPI) -> None:
    """Message > MAX_INPUT_CHARS returns error SSE event."""
    from cinepais_agent.config import settings

    long_message = "x" * (settings.max_input_chars + 1)
    async with httpx.AsyncClient(
        transport=ASGITransport(app=app_with_mock_agent), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/chat",
            json={"message": long_message, "sessionId": "test-1"},
        )
    assert resp.status_code == 200  # SSE always 200
    events = parse_sse_events(resp.text)
    error_events = [e for e in events if e.get("event") == "error"]
    assert len(error_events) >= 1
    data = json.loads(error_events[0]["data"])
    assert data["code"] == "input_too_long"


async def test_chat_session_cap(app_with_mock_agent: FastAPI) -> None:
    """After SESSION_QUERY_CAP queries, returns session_cap_exceeded error."""
    import cinepais_agent.main as main_module
    from cinepais_agent.config import settings

    main_module._session_queries["cap-test"] = settings.session_query_cap

    async with httpx.AsyncClient(
        transport=ASGITransport(app=app_with_mock_agent), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/chat",
            json={"message": "hola", "sessionId": "cap-test"},
        )
    assert resp.status_code == 200
    events = parse_sse_events(resp.text)
    error_events = [e for e in events if e.get("event") == "error"]
    assert len(error_events) >= 1
    data = json.loads(error_events[0]["data"])
    assert data["code"] == "session_cap_exceeded"


# ---------------------------------------------------------------------------
# Tests: /chat — streaming
# ---------------------------------------------------------------------------


async def test_chat_streams_token_events(app_with_mock_agent: FastAPI) -> None:
    """POST /chat streams token events from the agent."""
    async with httpx.AsyncClient(
        transport=ASGITransport(app=app_with_mock_agent), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/chat",
            json={"message": "¿Qué funciones hay?", "sessionId": "test-stream"},
        )
    assert resp.status_code == 200
    events = parse_sse_events(resp.text)
    token_events = [e for e in events if e.get("event") == "token"]
    assert len(token_events) >= 1
    data = json.loads(token_events[0]["data"])
    assert data["type"] == "token"
    assert data["content"] == "Hola"


async def test_chat_streams_tool_call_events(app_with_mock_agent: FastAPI) -> None:
    """POST /chat streams tool_call events."""
    async with httpx.AsyncClient(
        transport=ASGITransport(app=app_with_mock_agent), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/chat",
            json={"message": "¿Qué funciones hay?", "sessionId": "test-tools"},
        )
    events = parse_sse_events(resp.text)
    tool_events = [e for e in events if e.get("event") == "tool_call"]
    assert len(tool_events) >= 1
    data = json.loads(tool_events[0]["data"])
    assert data["type"] == "tool_call"
    assert data["tool"] == "search_showtimes"


async def test_chat_streams_done_event(app_with_mock_agent: FastAPI) -> None:
    """POST /chat always ends with a done event."""
    async with httpx.AsyncClient(
        transport=ASGITransport(app=app_with_mock_agent), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/chat",
            json={"message": "hola", "sessionId": "test-done"},
        )
    events = parse_sse_events(resp.text)
    done_events = [e for e in events if e.get("event") == "done"]
    assert len(done_events) == 1
    data = json.loads(done_events[0]["data"])
    assert data["type"] == "done"
    assert "sessionQueriesUsed" in data
    assert "sessionQueryCap" in data


# ---------------------------------------------------------------------------
# Tests: recommendation parsing
# ---------------------------------------------------------------------------


def test_parse_recommendation_from_dict() -> None:
    """_parse_recommendation handles dict output."""
    from cinepais_agent.sse import parse_recommendation as _parse_recommendation

    payload = {
        "type": "recommendation",
        "outcome": "recommended",
        "showtimeId": "st-1",
        "filmId": "film-01",
        "seatIds": ["1_4_7", "1_4_8"],
        "requestedN": 2,
        "siteName": "CinePaís Test",
        "city": "Bogotá",
        "businessDate": "2026-08-08",
        "time": "22:45",
        "formats": ["IMAX"],
        "priceFrom": 32000,
        "qualityTier": "optimal",
        "reasoning": "Encontré 2 sillas juntas.",
        "alternatives": [],
    }
    result = _parse_recommendation(payload)
    assert result is not None
    assert result.outcome == "recommended"
    assert result.seatIds == ["1_4_7", "1_4_8"]


def test_parse_recommendation_from_json_string() -> None:
    """_parse_recommendation handles JSON string output."""
    from cinepais_agent.sse import parse_recommendation as _parse_recommendation

    payload = {
        "type": "recommendation",
        "outcome": "no_availability",
        "showtimeId": None,
        "filmId": None,
        "seatIds": [],
        "requestedN": 2,
        "siteName": None,
        "city": None,
        "businessDate": None,
        "time": None,
        "formats": [],
        "priceFrom": None,
        "qualityTier": None,
        "reasoning": "No hay funciones.",
        "alternatives": [],
    }
    result = _parse_recommendation(json.dumps(payload))
    assert result is not None
    assert result.outcome == "no_availability"


def test_parse_recommendation_invalid_returns_none() -> None:
    """_parse_recommendation returns None for invalid output."""
    from cinepais_agent.sse import parse_recommendation as _parse_recommendation

    result = _parse_recommendation({"not": "a recommendation"})
    assert result is None


# ---------------------------------------------------------------------------
# Tests: CORS
# ---------------------------------------------------------------------------


async def test_empty_message_error_event_no_llm_call(app_with_mock_agent: FastAPI) -> None:
    """Whitespace-only message returns empty_message error event without invoking agent."""
    import cinepais_agent.main as main_module

    called: list[bool] = []

    async def _recording_astream_events(
        input_data: object, config: object = None, version: str = "v2"
    ) -> object:
        called.append(True)
        yield {
            "event": "on_chat_model_stream",
            "data": {"chunk": MagicMock(content="should not appear")},
        }

    main_module._agent.astream_events = _recording_astream_events

    async with httpx.AsyncClient(
        transport=ASGITransport(app=app_with_mock_agent), base_url="http://test"
    ) as client:
        resp = await client.post("/chat", json={"message": "   ", "sessionId": "test-empty"})

    assert resp.status_code == 200
    events = parse_sse_events(resp.text)
    error_events = [e for e in events if e.get("event") == "error"]
    assert len(error_events) >= 1
    data = json.loads(error_events[0]["data"])
    assert data["code"] == "empty_message"
    assert not called, "Agent must not be invoked for empty messages"


async def test_cors_allowed_origin(app_with_mock_agent: FastAPI) -> None:
    """Requests from allowed origin get CORS headers."""
    from cinepais_agent.config import settings

    async with httpx.AsyncClient(
        transport=ASGITransport(app=app_with_mock_agent), base_url="http://test"
    ) as client:
        resp = await client.options(
            "/chat",
            headers={
                "Origin": settings.cors_origins[0],
                "Access-Control-Request-Method": "POST",
            },
        )
    assert resp.status_code in (200, 204)
