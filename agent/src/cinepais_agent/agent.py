"""LangGraph agent factory with MCP tool wiring.

Uses langchain 1.x create_agent (verified available).
Falls back to langgraph.prebuilt.create_react_agent if absent.

MCP CLIENT LIFECYCLE (langchain-mcp-adapters 0.3.2):
- MultiServerMCPClient is NOT a context manager (changed in 0.1.0).
- Instantiate once, call await client.get_tools() directly.
- No __aenter__/__aexit__ — the client manages sessions per tool call.
- On startup: probe tool count, FAIL FAST if != 4.
- close_agent() is a no-op (client has no explicit close in this version).
"""

from __future__ import annotations

import asyncio
import logging
import sys
from collections.abc import Callable
from typing import Any

from langchain_core.tools import BaseTool
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.checkpoint.memory import MemorySaver

from .llm import get_llm
from .prompts import SYSTEM_PROMPT

logger = logging.getLogger(__name__)

# Record which agent API was used (for evidence)
try:
    from langchain.agents import create_agent as _create_agent_fn

    _AGENT_API = "langchain.agents.create_agent (langchain 1.x)"
    logger.info("Using %s", _AGENT_API)
except ImportError:
    from langgraph.prebuilt import (
        create_react_agent as _create_agent_fn,  # type: ignore[assignment]
    )

    _AGENT_API = "langgraph.prebuilt.create_react_agent (fallback)"
    logger.info("Using %s", _AGENT_API)

AGENT_API_USED = _AGENT_API

_MCP_TOOL_COUNT = 4

# Per-tool timeouts (seconds). recommend_best runs a multi-step query pipeline
# and needs extra headroom; all other tools are simple read API calls.
_TOOL_TIMEOUTS: dict[str, float] = {"recommend_best": 45.0}
_DEFAULT_TOOL_TIMEOUT: float = 10.0


def _tool_base_name(name: str) -> str:
    """Strip MCP server namespace prefix.

    Examples:
        'cinepais__recommend_best' → 'recommend_best'
        'recommend_best'           → 'recommend_best'
    """
    return name.split("__", 1)[-1] if "__" in name else name


def _wrap_tool_with_timeout(tool: BaseTool) -> BaseTool:
    """Wrap a tool's ainvoke with asyncio.wait_for timeout.

    When the tool exceeds its budget, asyncio.TimeoutError is raised.
    In Python 3.11+ asyncio.TimeoutError is a subclass of TimeoutError,
    so sse.py's existing ``except TimeoutError:`` branch catches it.
    """
    base_name = _tool_base_name(tool.name)
    timeout = _TOOL_TIMEOUTS.get(base_name, _DEFAULT_TOOL_TIMEOUT)
    original_ainvoke: Callable[..., Any] = tool.ainvoke

    async def _timed_ainvoke(*args: Any, **kwargs: Any) -> Any:
        return await asyncio.wait_for(original_ainvoke(*args, **kwargs), timeout=timeout)

    object.__setattr__(tool, "ainvoke", _timed_ainvoke)
    return tool


def _get_mcp_client() -> MultiServerMCPClient:
    """Create a MultiServerMCPClient for the cinepais MCP server.

    Uses plain `python` (not `uv run`) because the parent already runs inside
    the uv venv. Using `uv run` would add latency and contend on .venv/ locks.
    """
    return MultiServerMCPClient(
        connections={
            "cinepais": {
                "transport": "stdio",
                "command": sys.executable,
                "args": ["-m", "cinepais_agent.mcp_server"],
            }
        }
    )


async def build_agent() -> tuple[Any, MultiServerMCPClient]:
    """Build the agent and MCP client.

    Returns:
        (compiled_agent, mcp_client) — caller owns the lifecycle.

    Raises:
        RuntimeError: If MCP server doesn't expose exactly 4 tools.
        RuntimeError: If GOOGLE_API_KEY is not set.
    """
    mcp_client = _get_mcp_client()

    # Probe tool count — FAIL FAST if wrong
    tools = await mcp_client.get_tools()
    if len(tools) != _MCP_TOOL_COUNT:
        raise RuntimeError(
            f"MCP server exposed {len(tools)} tools, expected {_MCP_TOOL_COUNT}. "
            f"Tool names: {[t.name for t in tools]}"
        )
    logger.info("MCP tools verified: %s", [t.name for t in tools])

    # Wrap each tool with per-tool asyncio timeout
    tools = [_wrap_tool_with_timeout(t) for t in tools]

    llm = get_llm()
    checkpointer = MemorySaver()

    # Use the verified API
    agent = _create_agent_fn(
        llm,
        tools,
        system_prompt=SYSTEM_PROMPT,
        checkpointer=checkpointer,
    )

    return agent, mcp_client


async def close_agent(mcp_client: MultiServerMCPClient) -> None:
    """Close the MCP client cleanly."""
    logger.info("MCP client closed")
