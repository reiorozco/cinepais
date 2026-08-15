"""Abuse control tests — no LLM required.

Tests rate limiting, input cap, session cap, and CORS rejection
using ASGI transport against the FastAPI app.
"""

from __future__ import annotations

import json
from unittest.mock import MagicMock

import httpx
import pytest
from httpx import ASGITransport


async def _fake_astream_events(input_data, config=None, version="v2"):
    """Minimal fake agent for abuse control tests."""
    yield {"event": "on_chat_model_stream", "data": {"chunk": MagicMock(content="ok")}}


@pytest.fixture
def app_with_mock_agent():
    """FastAPI app with mocked agent."""
    import cinepais_agent.main as main_module

    mock_agent = MagicMock()
    mock_agent.astream_events = _fake_astream_events
    main_module._agent = mock_agent
    main_module._session_queries.clear()
    yield main_module.app
    main_module._agent = None
    main_module._session_queries.clear()


async def test_input_cap_returns_error_event(app_with_mock_agent):
    """Message > MAX_INPUT_CHARS returns input_too_long error event."""
    from cinepais_agent.config import settings

    long_msg = "x" * (settings.max_input_chars + 1)
    async with httpx.AsyncClient(
        transport=ASGITransport(app=app_with_mock_agent), base_url="http://test"
    ) as client:
        resp = await client.post("/chat", json={"message": long_msg, "sessionId": "abuse-1"})

    assert resp.status_code == 200
    events = [
        json.loads(line[len("data:") :].strip())
        for line in resp.text.splitlines()
        if line.startswith("data:")
    ]
    error_events = [e for e in events if e.get("type") == "error"]
    assert error_events, f"No error events in: {events}"
    assert error_events[0]["code"] == "input_too_long"


async def test_session_cap_returns_error_event(app_with_mock_agent):
    """After SESSION_QUERY_CAP queries, returns session_cap_exceeded error."""
    import cinepais_agent.main as main_module
    from cinepais_agent.config import settings

    main_module._session_queries["cap-abuse"] = settings.session_query_cap

    async with httpx.AsyncClient(
        transport=ASGITransport(app=app_with_mock_agent), base_url="http://test"
    ) as client:
        resp = await client.post("/chat", json={"message": "hola", "sessionId": "cap-abuse"})

    assert resp.status_code == 200
    events = [
        json.loads(line[len("data:") :].strip())
        for line in resp.text.splitlines()
        if line.startswith("data:")
    ]
    error_events = [e for e in events if e.get("type") == "error"]
    assert error_events, f"No error events in: {events}"
    assert error_events[0]["code"] == "session_cap_exceeded"


async def test_cors_rejects_evil_origin(app_with_mock_agent):
    """CORS rejects requests from non-allowed origins."""
    async with httpx.AsyncClient(
        transport=ASGITransport(app=app_with_mock_agent), base_url="http://test"
    ) as client:
        resp = await client.options(
            "/chat",
            headers={
                "Origin": "https://evil.example.com",
                "Access-Control-Request-Method": "POST",
            },
        )
    # CORS should not include the evil origin in allow-origin
    allow_origin = resp.headers.get("access-control-allow-origin", "")
    assert "evil.example.com" not in allow_origin, f"Evil origin allowed: {allow_origin}"


async def test_health_always_returns_ok(app_with_mock_agent):
    """GET /health always returns 200 {status: ok}."""
    async with httpx.AsyncClient(
        transport=ASGITransport(app=app_with_mock_agent), base_url="http://test"
    ) as client:
        resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


async def test_session_cap_ttl_reset():
    """TTLCache evicts entries after TTL — counter resets and new queries are allowed."""
    from typing import cast

    import cachetools

    cache = cast(cachetools.TTLCache[str, int, float], cachetools.TTLCache(maxsize=100, ttl=0.1))
    cache["sess"] = 20
    assert cache.get("sess", 0) == 20

    import time

    time.sleep(0.15)

    assert cache.get("sess", 0) == 0, "Entry should have been evicted after TTL"

    cache["sess"] = 1
    assert cache.get("sess", 0) == 1


async def test_session_id_length_422(app_with_mock_agent):
    """sessionId='' or len>128 triggers Pydantic 422; valid sessionId passes."""
    async with httpx.AsyncClient(
        transport=ASGITransport(app=app_with_mock_agent), base_url="http://test"
    ) as client:
        resp_empty = await client.post("/chat", json={"message": "hola", "sessionId": ""})
        resp_long = await client.post("/chat", json={"message": "hola", "sessionId": "x" * 129})
        resp_ok = await client.post("/chat", json={"message": "hola", "sessionId": "valid"})

    assert resp_empty.status_code == 422, (
        f"Expected 422 for empty sessionId, got {resp_empty.status_code}"
    )  # noqa: E501
    assert resp_long.status_code == 422, (
        f"Expected 422 for long sessionId, got {resp_long.status_code}"
    )  # noqa: E501
    assert resp_ok.status_code == 200, (
        f"Expected 200 for valid sessionId, got {resp_ok.status_code}"
    )  # noqa: E501


async def test_rate_limit_429_after_burst():
    """11th request in a minute from same IP returns 429."""
    import cinepais_agent.main as main_module
    from cinepais_agent.main import app

    mock_agent = MagicMock()
    mock_agent.astream_events = _fake_astream_events
    main_module._agent = mock_agent
    main_module._session_queries.clear()

    try:
        async with httpx.AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            responses = []
            for i in range(12):
                resp = await client.post(
                    "/chat",
                    json={"message": "hola", "sessionId": f"rate-{i}"},
                    headers={"X-Forwarded-For": "1.2.3.4"},
                )
                responses.append(resp.status_code)

            # At least one 429 should appear after the limit
            assert 429 in responses, f"Expected 429 in responses after burst, got: {responses}"
    finally:
        main_module._agent = None
        main_module._session_queries.clear()
