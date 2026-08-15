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


@pytest.fixture(autouse=True)
def _reset_daily_requests():
    """Keep the process-wide daily request budget from leaking across tests.

    The counter is a module-level cache, so without this every /chat any test makes eats into
    the same 40-request allowance and a late test would fail with daily_cap_exceeded.
    """
    yield
    try:
        from cinepais_agent.main import _daily_requests

        _daily_requests.clear()
    except Exception:
        pass
