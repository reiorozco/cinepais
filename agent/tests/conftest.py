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


@pytest.fixture(autouse=True)
def _catalogue_probe_healthy():
    """Pre-seed the catalogue probe as healthy so no test reaches for the network.

    `/chat` refuses early when the read API serves no purchasable showtimes. Nothing is listening
    on `WEB_API_BASE_URL` during tests, so without this the probe would fail-open on a connection
    error — the right production behaviour, but it would make every `/chat` test depend on the
    timing of a refused socket. Priming the cache keeps them hermetic; tests that exercise the
    empty or unreachable catalogue clear it themselves.
    """
    try:
        from cinepais_agent.main import _catalogue_ok

        _catalogue_ok["live"] = True
    except Exception:
        pass
    yield
    try:
        from cinepais_agent.main import _catalogue_ok

        _catalogue_ok.clear()
    except Exception:
        pass
