"""LLM model discovery and initialization.

Priority chain for model selection:
1. AGENT_MODEL_OVERRIDE env var (for eval reproducibility)
2. google-genai models.list() — pick first available from priority chain
3. Fallback: init_chat_model invoke-per-candidate (short-circuits on first success)
"""

from __future__ import annotations

import logging

from langchain.chat_models import init_chat_model
from langchain_core.language_models import BaseChatModel

from .config import settings

logger = logging.getLogger(__name__)

# Priority chain — ordered by validated availability first, cost second.
# gemini-3.6-flash leads: it is the newest full Flash model and was validated end-to-end here
# (one live /chat run emitting a recommendation event with the soldout tradeoff —
# .omo/evidence/task-17-cinepais-phase-2-agent-fixes.md). Any future head-of-chain swap needs
# its own E2E proof, not just presence in models.list(); see the Lite failure modes below for
# why "the model exists" is not evidence that it calls tools.
# gemini-3.5-flash stays directly behind it as the previously proven fallback.
# gemini-2.x and gemini-2.5-flash are deprecated for new API keys.
# The 2.5 Lite variant is removed outright: it still appears in models.list() but every call
# 404s (.omo/evidence/task-9-cinepais-phase-2-agent.md:56), and _discover_model_via_list()
# would pick it and return before the per-candidate invoke probe could ever recover (line 108
# short-circuits on the first truthy result).
# gemini-3.5-flash-lite is cheaper on output tokens but broke tool-calling in round-5 evals
# (never called recommend_best, 2/2 reproducible), so it is demoted to a last-resort tail
# entry — reachable only if no full Flash model is available at all.
_MODEL_PRIORITY = [
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-1.5-flash",
    "gemini-3.5-flash-lite",
]

_chosen_model: str | None = None


def _normalize_model_id(name: str) -> str:
    """Strip 'models/' prefix if present."""
    return name.removeprefix("models/")


def _discover_model_via_list() -> str | None:
    """Try to discover available model via google-genai models.list()."""
    try:
        from google import genai  # type: ignore[import-untyped]

        client = genai.Client(api_key=settings.google_api_key)
        available = {
            _normalize_model_id(m.name) for m in client.models.list() if m.name is not None
        }
        logger.info("Available Gemini models: %s", sorted(available))

        for candidate in _MODEL_PRIORITY:
            if candidate in available:
                logger.info("Selected model via list: %s", candidate)
                return candidate

        logger.warning("None of the priority models found in list: %s", _MODEL_PRIORITY)
        return None
    except Exception as exc:
        logger.warning("models.list() failed: %s", exc)
        return None


def _discover_model_via_invoke() -> str | None:
    """Fallback: try each candidate via init_chat_model, short-circuit on first success."""
    for candidate in _MODEL_PRIORITY:
        try:
            model = init_chat_model(
                f"google_genai:{candidate}",
                max_tokens=10,
            )
            model.invoke("ping")
            logger.info("Selected model via invoke: %s", candidate)
            return candidate
        except Exception as exc:
            logger.debug("Model %s not available: %s", candidate, exc)
    return None


def get_llm() -> BaseChatModel:
    """Get the configured LLM, discovering the model if needed.

    Raises:
        RuntimeError: If GOOGLE_API_KEY is not set or no model is available.
    """
    global _chosen_model

    if not settings.google_api_key:
        raise RuntimeError(
            "GOOGLE_API_KEY is not set. Set it in agent/.env or as an environment variable."
        )

    import os

    os.environ.setdefault("GOOGLE_API_KEY", settings.google_api_key)

    # Use override if set (for eval reproducibility)
    if settings.agent_model_override:
        model_id = settings.agent_model_override
        logger.info("Using AGENT_MODEL_OVERRIDE: %s", model_id)
    elif _chosen_model:
        model_id = _chosen_model
    else:
        # Try models.list() first, then invoke fallback
        model_id = _discover_model_via_list() or _discover_model_via_invoke()
        if not model_id:
            raise RuntimeError(
                f"No available Gemini model found. Tried: {_MODEL_PRIORITY}. "
                "Check your GOOGLE_API_KEY and network access."
            )
        _chosen_model = model_id

    logger.info("Using model: %s", model_id)

    return init_chat_model(
        f"google_genai:{model_id}",
        max_tokens=settings.max_output_tokens,
    )
