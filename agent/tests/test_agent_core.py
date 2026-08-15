"""Tests for agent core — llm.py, agent.py, prompts.py.

Non-eval tests run without GOOGLE_API_KEY.
Eval tests (marked @pytest.mark.evals) require GOOGLE_API_KEY.
"""

import asyncio
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Tests: prompts.py
# ---------------------------------------------------------------------------


def test_system_prompt_contains_sentinels():
    """System prompt contains all 3 sentinel phrases."""
    from cinepais_agent.prompts import SENTINEL_1, SENTINEL_2, SENTINEL_3, SYSTEM_PROMPT

    assert SENTINEL_1 in SYSTEM_PROMPT
    assert SENTINEL_2 in SYSTEM_PROMPT
    assert SENTINEL_3 in SYSTEM_PROMPT


def test_system_prompt_is_spanish():
    """System prompt is in Spanish (contains Spanish characters)."""
    from cinepais_agent.prompts import SYSTEM_PROMPT

    spanish_indicators = ["ú", "é", "á", "ó", "ñ", "¿", "¡"]
    assert any(c in SYSTEM_PROMPT for c in spanish_indicators)


def test_system_prompt_mentions_max_seats():
    """System prompt mentions the 4-seat maximum."""
    from cinepais_agent.prompts import SYSTEM_PROMPT

    assert "4" in SYSTEM_PROMPT


def test_system_prompt_mentions_accessibility():
    """System prompt mentions accessibility seats."""
    from cinepais_agent.prompts import SYSTEM_PROMPT

    assert "accesibilidad" in SYSTEM_PROMPT.lower() or "ruedas" in SYSTEM_PROMPT.lower()


# ---------------------------------------------------------------------------
# Tests: llm.py
# ---------------------------------------------------------------------------


def test_get_llm_raises_without_api_key():
    """get_llm() raises RuntimeError with clear message when GOOGLE_API_KEY is unset."""
    from cinepais_agent import llm as llm_module

    original_settings = llm_module.settings

    mock_settings = MagicMock()
    mock_settings.google_api_key = ""
    mock_settings.agent_model_override = ""

    llm_module.settings = mock_settings
    try:
        with pytest.raises(RuntimeError) as exc_info:
            llm_module.get_llm()
        assert "GOOGLE_API_KEY" in str(exc_info.value)
    finally:
        llm_module.settings = original_settings


def test_get_llm_uses_override():
    """get_llm() uses AGENT_MODEL_OVERRIDE when set."""
    from cinepais_agent import llm as llm_module

    original_settings = llm_module.settings
    original_chosen = llm_module._chosen_model

    mock_settings = MagicMock()
    mock_settings.google_api_key = "test-key"
    mock_settings.agent_model_override = "gemini-2.5-flash"
    mock_settings.max_output_tokens = 1024

    llm_module.settings = mock_settings
    llm_module._chosen_model = None
    try:
        with patch("cinepais_agent.llm.init_chat_model") as mock_init:
            mock_init.return_value = MagicMock()
            llm_module.get_llm()
            call_args = mock_init.call_args[0][0]
            assert "gemini-2.5-flash" in call_args
    finally:
        llm_module.settings = original_settings
        llm_module._chosen_model = original_chosen


# ---------------------------------------------------------------------------
# Tests: agent.py
# ---------------------------------------------------------------------------


def test_agent_api_used_is_recorded():
    """AGENT_API_USED records which API was used."""
    from cinepais_agent.agent import AGENT_API_USED

    assert AGENT_API_USED  # non-empty string
    assert "create_agent" in AGENT_API_USED or "create_react_agent" in AGENT_API_USED


@pytest.mark.asyncio
async def test_build_agent_fails_fast_on_wrong_tool_count():
    """build_agent() raises RuntimeError if MCP server exposes wrong number of tools."""
    from cinepais_agent.agent import build_agent

    mock_tool = MagicMock()
    mock_tool.name = "fake_tool"

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    mock_client.get_tools = AsyncMock(return_value=[mock_tool])  # Only 1 tool, not 4

    with patch("cinepais_agent.agent._get_mcp_client", return_value=mock_client):
        with pytest.raises(RuntimeError) as exc_info:
            await build_agent()
        assert "4" in str(exc_info.value)


@pytest.mark.asyncio
async def test_close_agent_handles_errors_gracefully():
    """close_agent() doesn't raise even if MCP client errors."""
    from cinepais_agent.agent import close_agent

    mock_client = AsyncMock()
    mock_client.__aexit__ = AsyncMock(side_effect=Exception("connection error"))

    # Should not raise
    await close_agent(mock_client)


def test_timeout_base_name_stripping():
    """_tool_base_name strips MCP server namespace prefix correctly."""
    from cinepais_agent.agent import (
        _DEFAULT_TOOL_TIMEOUT,
        _TOOL_TIMEOUTS,
        _tool_base_name,
        _wrap_tool_with_timeout,
    )

    assert _tool_base_name("cinepais__recommend_best") == "recommend_best"
    assert _tool_base_name("recommend_best") == "recommend_best"
    assert _tool_base_name("cinepais__search_showtimes") == "search_showtimes"

    # A namespaced recommend_best tool must use the 45s bucket, not the default
    mock_tool = MagicMock()
    mock_tool.name = "cinepais__recommend_best"
    original_ainvoke = AsyncMock(return_value="ok")
    mock_tool.ainvoke = original_ainvoke

    wrapped = _wrap_tool_with_timeout(mock_tool)
    # The timeout applied should be 45s (from _TOOL_TIMEOUTS), not _DEFAULT_TOOL_TIMEOUT
    assert _TOOL_TIMEOUTS.get("recommend_best") == 45.0
    assert _DEFAULT_TOOL_TIMEOUT == 10.0
    assert _TOOL_TIMEOUTS.get("recommend_best") != _DEFAULT_TOOL_TIMEOUT
    # Verify the tool was wrapped (ainvoke was replaced)
    assert wrapped.ainvoke is not original_ainvoke


@pytest.mark.timeout(17)  # _DEFAULT_TOOL_TIMEOUT + 5 + some headroom
@pytest.mark.asyncio
async def test_tool_timeout_enforced():
    """Wrapped tool raises TimeoutError when it exceeds its time budget."""
    from cinepais_agent.agent import _DEFAULT_TOOL_TIMEOUT, _wrap_tool_with_timeout

    sleep_duration = _DEFAULT_TOOL_TIMEOUT + 1  # just over the budget

    async def _slow_ainvoke(input: object, **kwargs: object) -> str:  # noqa: A002
        await asyncio.sleep(sleep_duration)
        return "should not reach here"

    mock_tool = MagicMock()
    mock_tool.name = "slow_tool"  # no namespace prefix → uses _DEFAULT_TOOL_TIMEOUT
    mock_tool.ainvoke = _slow_ainvoke

    wrapped = _wrap_tool_with_timeout(mock_tool)

    with pytest.raises((asyncio.TimeoutError, TimeoutError)):
        await wrapped.ainvoke({})


# ---------------------------------------------------------------------------
# Eval tests (require GOOGLE_API_KEY)
# ---------------------------------------------------------------------------


@pytest.mark.evals
@pytest.mark.asyncio
async def test_agent_invocation_with_real_llm():
    """Stub-model agent invocation triggers a tool call round-trip.

    Requires GOOGLE_API_KEY and web server on :3000.
    """
    google_api_key = os.environ.get("GOOGLE_API_KEY")
    if not google_api_key:
        pytest.skip("GOOGLE_API_KEY not set")

    from cinepais_agent.agent import AGENT_API_USED, build_agent, close_agent

    agent, mcp_client = await build_agent()
    try:
        result = await agent.ainvoke(
            {"messages": [{"role": "user", "content": "¿Qué ciudades tienen cines?"}]},
            config={"configurable": {"thread_id": "test-eval-1"}},
        )

        assert result
        messages = result.get("messages", [])
        assert len(messages) > 0

        print(f"\nAgent API used: {AGENT_API_USED}")

    finally:
        await close_agent(mcp_client)
