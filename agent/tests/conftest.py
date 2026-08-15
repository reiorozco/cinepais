"""Shared pytest fixtures for cinepais-agent tests."""

import pytest


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    yield
    try:
        from cinepais_agent.main import limiter

        limiter._storage.reset()
    except Exception:
        pass


@pytest.fixture(autouse=True)
def _reset_session_queries():
    yield
    try:
        from cinepais_agent.main import _session_queries

        _session_queries.clear()
    except Exception:
        pass
