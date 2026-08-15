"""Tests for sse.py: thinking filter, namespaced tool guard, empty_reply guard."""

from __future__ import annotations

import json
from collections.abc import AsyncGenerator
from unittest.mock import MagicMock

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


def _make_rec_output() -> dict:
    return {
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


async def _collect_stream(gen: AsyncGenerator[dict, None]) -> list[dict]:
    return [item async for item in gen]


# ---------------------------------------------------------------------------
# Unit: _matches_recommend_best
# ---------------------------------------------------------------------------


def test_tool_name_match_namespaced() -> None:
    """_matches_recommend_best handles bare and namespaced names correctly."""
    from cinepais_agent.sse import _matches_recommend_best

    assert _matches_recommend_best("recommend_best") is True
    assert _matches_recommend_best("cinepais__recommend_best") is True
    assert _matches_recommend_best("not_recommend_best") is False  # no __ prefix
    assert _matches_recommend_best("recommend_best_v2") is False  # no __ separator


# ---------------------------------------------------------------------------
# Streaming tests via stream_agent
# ---------------------------------------------------------------------------


async def _run_stream(fake_astream_events) -> list[dict]:  # type: ignore[type-arg]
    """Wire fake agent into stream_agent and collect raw SSE dicts."""
    from cinepais_agent.sse import stream_agent

    agent = MagicMock()
    agent.astream_events = fake_astream_events
    session_queries: dict[str, int] = {"s1": 0}

    items = []
    async for item in stream_agent("hola", "s1", agent, session_queries):
        items.append(item)
    return items


async def test_thinking_parts_filtered() -> None:
    """on_chat_model_stream with mixed thinking+text parts emits only text token."""

    async def _fake(input_data, config=None, version="v2"):  # type: ignore[misc]
        chunk = MagicMock()
        chunk.content = [
            {"type": "thinking", "text": "hmm"},
            {"type": "text", "text": "Hola"},
        ]
        yield {"event": "on_chat_model_stream", "data": {"chunk": chunk}}

    items = await _run_stream(_fake)
    token_items = [i for i in items if i["event"] == "token"]
    assert len(token_items) == 1
    data = json.loads(token_items[0]["data"])
    assert data["content"] == "Hola"
    # "hmm" must NOT appear anywhere
    full_text = " ".join(json.dumps(i) for i in items)
    assert "hmm" not in full_text


async def test_only_thinking_emits_empty_reply_error() -> None:
    """Turn with only thinking parts → zero tokens → empty_reply error before done."""

    async def _fake(input_data, config=None, version="v2"):  # type: ignore[misc]
        chunk = MagicMock()
        chunk.content = [{"type": "thinking", "text": "internal thought"}]
        yield {"event": "on_chat_model_stream", "data": {"chunk": chunk}}

    items = await _run_stream(_fake)

    token_items = [i for i in items if i["event"] == "token"]
    assert len(token_items) == 0

    error_items = [i for i in items if i["event"] == "error"]
    assert len(error_items) >= 1
    codes = [json.loads(e["data"])["code"] for e in error_items]
    assert "empty_reply" in codes

    # done must still be last
    assert items[-1]["event"] == "done"


async def test_recommendation_fires_with_namespaced_tool_name() -> None:
    """on_tool_end with cinepais__recommend_best emits recommendation event."""

    async def _fake(input_data, config=None, version="v2"):  # type: ignore[misc]
        yield {
            "event": "on_tool_end",
            "name": "cinepais__recommend_best",
            "data": {"output": _make_rec_output()},
        }

    items = await _run_stream(_fake)

    rec_items = [i for i in items if i["event"] == "recommendation"]
    assert len(rec_items) == 1
    data = json.loads(rec_items[0]["data"])
    assert data["outcome"] == "recommended"
    assert data["seatIds"] == ["1_4_7", "1_4_8"]
