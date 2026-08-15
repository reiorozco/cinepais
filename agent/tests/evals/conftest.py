"""Eval suite conftest — fail-fast infra checks before any eval runs."""

from __future__ import annotations

import os
from datetime import date, datetime
from zoneinfo import ZoneInfo

import httpx
import pytest

BOGOTA_TZ = ZoneInfo("America/Bogota")
WEB_BASE = "http://localhost:3000"


def _today_bogota() -> date:
    return datetime.now(BOGOTA_TZ).date()


def _load_api_key_from_env_file() -> None:
    """Read GOOGLE_API_KEY from agent/.env if not already set."""
    if os.environ.get("GOOGLE_API_KEY"):
        return
    env_file = os.path.join(os.path.dirname(__file__), "../../.env")
    if not os.path.exists(env_file):
        return
    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if line.startswith("GOOGLE_API_KEY="):
                os.environ["GOOGLE_API_KEY"] = line.split("=", 1)[1].strip()
                break


@pytest.fixture(scope="session", autouse=True)
def check_infra() -> None:
    """Fail fast if GOOGLE_API_KEY is absent, web server is down, or seed is stale."""
    _load_api_key_from_env_file()

    if not os.environ.get("GOOGLE_API_KEY"):
        pytest.skip("GOOGLE_API_KEY not set — skipping evals")

    # Check web server (with one retry for cold start)
    cities: list[dict] = []
    for attempt in range(2):
        try:
            resp = httpx.get(f"{WEB_BASE}/api/cities", timeout=15)
            resp.raise_for_status()
            cities = resp.json()
            break
        except Exception as exc:
            if attempt == 0:
                import time

                time.sleep(3)
            else:
                pytest.exit(
                    f"Web server not reachable at {WEB_BASE}/api/cities "
                    f"(cd web && pnpm dev)\nError: {exc}"
                )

    city_ids = {c["id"] for c in cities}
    assert "city-1" in city_ids and "city-2" in city_ids, (
        f"Seed not applied — expected city-1 and city-2, got: {city_ids}"
    )

    resp = httpx.get(f"{WEB_BASE}/api/showtimes", timeout=15)
    showtimes: list[dict] = resp.json()
    if not showtimes:
        tomorrow = (_today_bogota() + __import__("datetime").timedelta(days=1)).strftime("%Y-%m-%d")
        pytest.exit(f"No showtimes — reseed: SEED=20260801 SEED_NOW={tomorrow} pnpm prisma db seed")

    min_date = min(s["businessDate"] for s in showtimes)
    today_str = _today_bogota().strftime("%Y-%m-%d")
    if min_date <= today_str:
        tomorrow = (_today_bogota() + __import__("datetime").timedelta(days=1)).strftime("%Y-%m-%d")
        pytest.exit(
            f"Seed stale — min businessDate {min_date} ≤ today {today_str}. "
            f"Reseed: SEED=20260801 SEED_NOW={tomorrow} pnpm prisma db seed"
        )


@pytest.fixture(scope="session")
def web_showtimes() -> list[dict]:
    """All showtimes from the seeded web server."""
    resp = httpx.get(f"{WEB_BASE}/api/showtimes", timeout=15)
    return resp.json()


@pytest.fixture(scope="session")
def date_window(web_showtimes: list[dict]) -> list[str]:
    """Sorted list of unique business dates in the seeded window."""
    return sorted({s["businessDate"] for s in web_showtimes})


@pytest.fixture(scope="session")
def wednesday_date(date_window: list[str]) -> str:
    """First Wednesday in the seeded window, or skip."""
    for d in date_window:
        if datetime.strptime(d, "%Y-%m-%d").weekday() == 2:
            return d
    pytest.skip("No Wednesday in seeded window")
    return ""  # unreachable — satisfies type checker


@pytest.fixture(scope="session")
def weekend_dates(date_window: list[str]) -> list[str]:
    """Saturday/Sunday dates in the seeded window, or skip."""
    weekends = [d for d in date_window if datetime.strptime(d, "%Y-%m-%d").weekday() >= 5]
    if not weekends:
        pytest.skip("No weekend dates in seeded window")
    return weekends


@pytest.fixture(scope="session")
def agent_and_client():
    """Build the real LangGraph agent once per session."""
    import asyncio

    from cinepais_agent.agent import build_agent, close_agent

    loop = asyncio.new_event_loop()
    agent, mcp_client = loop.run_until_complete(build_agent())
    yield agent, loop
    loop.run_until_complete(close_agent(mcp_client))
    loop.close()
