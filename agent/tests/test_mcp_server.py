import httpx
import respx

from cinepais_agent.mcp_server import (
    adjacent_seats,
    mcp,
    recommend_best,
    search_showtimes,
    seat_availability,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

FILMS_PAYLOAD = [
    {
        "id": "film-01",
        "title": "La Odisea",
        "posterUrl": "https://placehold.co/300x450?text=Film+01",
        "durationMin": 165,
        "rating": "PG-13",
        "genres": ["Aventura", "Drama"],
    }
]

SHOWTIMES_PAYLOAD = [
    {
        "id": "st-site-bog-3-imax-4-2245",
        "filmId": "film-01",
        "siteId": "site-bog-3",
        "siteName": "CinePaís Bogotá Norte",
        "city": "Bogotá",
        "businessDate": "2026-08-08",
        "time": "22:45",
        "room": "imax",
        "formats": ["IMAX"],
        "priceFrom": 32000,
    }
]

# 4 consecutive available seats in IMAX block (6-15), cols 6-9.
# Selecting any edge pair (6+7 or 8+9) leaves a group of 2 remaining → no orphans.
SEATS_PAYLOAD = {
    "showtime": SHOWTIMES_PAYLOAD[0],
    "seats": [
        {
            "seatId": "2_4_6",
            "row": 4,
            "col": 6,
            "area": 2,
            "status": "Available",
            "areaCategory": "general",
            "qualityTier": "optimal",
            "price": 32000,
        },
        {
            "seatId": "2_4_7",
            "row": 4,
            "col": 7,
            "area": 2,
            "status": "Available",
            "areaCategory": "general",
            "qualityTier": "optimal",
            "price": 32000,
        },
        {
            "seatId": "2_4_8",
            "row": 4,
            "col": 8,
            "area": 2,
            "status": "Available",
            "areaCategory": "general",
            "qualityTier": "optimal",
            "price": 32000,
        },
        {
            "seatId": "2_4_9",
            "row": 4,
            "col": 9,
            "area": 2,
            "status": "Available",
            "areaCategory": "general",
            "qualityTier": "optimal",
            "price": 32000,
        },
    ],
    "summary": {
        "totalCount": 260,
        "availableCount": 4,
        "byArea": {
            "general": {"total": 156, "available": 4},
            "premium": {"total": 100, "available": 0},
            "wheelchair": {"total": 2, "available": 0},
            "preferential": {"total": 2, "available": 0},
        },
        "priceTable": {
            "general": 32000,
            "preferential": 37000,
            "premium": 43000,
            "wheelchair": 32000,
        },
    },
}

# Single available seat at col 7 — no orphan risk (it's the only seat in the block).
SEATS_PAYLOAD_SINGLE = {
    "showtime": SHOWTIMES_PAYLOAD[0],
    "seats": [
        {
            "seatId": "2_4_7",
            "row": 4,
            "col": 7,
            "area": 2,
            "status": "Available",
            "areaCategory": "general",
            "qualityTier": "optimal",
            "price": 32000,
        },
    ],
    "summary": {
        "totalCount": 260,
        "availableCount": 1,
        "byArea": {
            "general": {"total": 156, "available": 1},
            "premium": {"total": 100, "available": 0},
            "wheelchair": {"total": 2, "available": 0},
            "preferential": {"total": 2, "available": 0},
        },
        "priceTable": {
            "general": 32000,
            "preferential": 37000,
            "premium": 43000,
            "wheelchair": 32000,
        },
    },
}


# ---------------------------------------------------------------------------
# Tests: search_showtimes
# ---------------------------------------------------------------------------


@respx.mock
async def test_search_showtimes_basic():
    """Basic search with no filters returns showtimes list."""
    respx.get("http://localhost:3000/api/showtimes").mock(
        return_value=httpx.Response(200, json=SHOWTIMES_PAYLOAD)
    )
    result = await search_showtimes()
    assert "showtimes" in result
    assert len(result["showtimes"]) == 1
    assert result["showtimes"][0]["id"] == "st-site-bog-3-imax-4-2245"


@respx.mock
async def test_search_showtimes_film_exists_no_showtimes():
    """Film exists globally but no showtimes in city → returns hint dict."""
    respx.get("http://localhost:3000/api/films", params={"city": "Medellín"}).mock(
        return_value=httpx.Response(200, json=[])
    )
    respx.get("http://localhost:3000/api/films").mock(
        return_value=httpx.Response(200, json=FILMS_PAYLOAD)
    )
    respx.get("http://localhost:3000/api/showtimes").mock(return_value=httpx.Response(200, json=[]))
    result = await search_showtimes(film_query="Odisea", city="Medellín")
    assert "hint" in result
    assert "no showtimes in Medellín" in result["hint"]
    assert result["showtimes"] == []


# ---------------------------------------------------------------------------
# Tests: seat_availability
# ---------------------------------------------------------------------------


@respx.mock
async def test_seat_availability_basic():
    """Returns summary with quality tier histogram."""
    respx.get("http://localhost:3000/api/showtimes/st-1/seats").mock(
        return_value=httpx.Response(200, json=SEATS_PAYLOAD)
    )
    result = await seat_availability("st-1")
    assert result["availableCount"] == 4
    assert "qualityTierHistogram" in result
    assert result["qualityTierHistogram"]["optimal"] == 4


@respx.mock
async def test_seat_availability_not_found():
    """404 from API returns error dict instead of raising."""
    respx.get("http://localhost:3000/api/showtimes/bad-id/seats").mock(
        return_value=httpx.Response(404, json={"error": "not_found"})
    )
    result = await seat_availability("bad-id")
    assert result["error"] == "not_found"


# ---------------------------------------------------------------------------
# Tests: adjacent_seats
# ---------------------------------------------------------------------------


async def test_adjacent_seats_n_too_large():
    """n > 4 returns max_seats_exceeded immediately — no HTTP call made."""
    result = await adjacent_seats("st-1", 6)
    assert result["error"] == "max_seats_exceeded"
    assert result["max"] == 4


@respx.mock
async def test_adjacent_seats_finds_groups():
    """n=2 finds orphan-safe adjacent groups."""
    respx.get("http://localhost:3000/api/showtimes/st-1/seats").mock(
        return_value=httpx.Response(200, json=SEATS_PAYLOAD)
    )
    result = await adjacent_seats("st-1", 2)
    assert "groups" in result
    assert len(result["groups"]) >= 1
    assert len(result["groups"][0]["seatIds"]) == 2


@respx.mock
async def test_adjacent_seats_not_found():
    """404 from API returns error dict instead of raising."""
    respx.get("http://localhost:3000/api/showtimes/bad-id/seats").mock(
        return_value=httpx.Response(404, json={"error": "not_found"})
    )
    result = await adjacent_seats("bad-id", 2)
    assert result["error"] == "not_found"


# ---------------------------------------------------------------------------
# Tests: recommend_best
# ---------------------------------------------------------------------------


async def test_recommend_best_n_too_large():
    """n > 4 returns max_seats_exceeded immediately — no HTTP call made."""
    result = await recommend_best(n=6)
    assert result["error"] == "max_seats_exceeded"
    assert result["max"] == 4


@respx.mock
async def test_recommend_best_n_none_defaults_to_1():
    """n=None uses effective_n=1 — requestedN in result equals 1."""
    respx.get("http://localhost:3000/api/showtimes").mock(
        return_value=httpx.Response(200, json=SHOWTIMES_PAYLOAD)
    )
    respx.get("http://localhost:3000/api/showtimes/st-site-bog-3-imax-4-2245/seats").mock(
        return_value=httpx.Response(200, json=SEATS_PAYLOAD_SINGLE)
    )
    result = await recommend_best(n=None)
    assert "outcome" in result
    assert result["requestedN"] == 1


@respx.mock
async def test_recommend_best_returns_recommendation():
    """Returns a valid RecommendationEvent dict with seatIds for n=2."""
    respx.get("http://localhost:3000/api/showtimes").mock(
        return_value=httpx.Response(200, json=SHOWTIMES_PAYLOAD)
    )
    respx.get("http://localhost:3000/api/showtimes/st-site-bog-3-imax-4-2245/seats").mock(
        return_value=httpx.Response(200, json=SEATS_PAYLOAD)
    )
    result = await recommend_best(n=2)
    assert result["outcome"] in ("recommended", "degraded", "no_availability")
    assert "seatIds" in result


# ---------------------------------------------------------------------------
# Tests: date_range grammar / too_broad / zero-match hint / parallel seats
# ---------------------------------------------------------------------------


@respx.mock
async def test_finde_resolves_within_seeded_window():
    """'finde' resolves to the nearest Sat+Sun within the seeded showtime window."""
    from datetime import date, timedelta

    today = date.today()
    # Always jump to NEXT Monday so the window is strictly future regardless of today's weekday.
    days_to_next_mon = (7 - today.weekday()) % 7 or 7
    next_mon = today + timedelta(days=days_to_next_mon)

    # 7-day Mon→Sun window guarantees exactly one Sat (index 5) and one Sun (index 6).
    window_dates = [next_mon + timedelta(days=i) for i in range(7)]
    sat = window_dates[5]
    sun = window_dates[6]

    window_showtimes = [
        {
            "id": f"st-wk-{d.isoformat()}",
            "filmId": "film-01",
            "siteId": "site-bog-3",
            "siteName": "CinePaís Bogotá Norte",
            "city": "Bogotá",
            "businessDate": d.isoformat(),
            "time": "20:00",
            "room": "regular",
            "formats": ["2D"],
            "priceFrom": 25000,
        }
        for d in window_dates
    ]

    respx.get("http://localhost:3000/api/films", params={"city": "Bogotá"}).mock(
        return_value=httpx.Response(200, json=FILMS_PAYLOAD)
    )
    # One mock covers the window-discovery call (no params) and the filtered main call —
    # respx matches on URL prefix when no params constraint is given.
    respx.get("http://localhost:3000/api/showtimes").mock(
        return_value=httpx.Response(200, json=window_showtimes)
    )
    # Only Sat and Sun survive the client-side date filter, so only two seat mocks needed.
    respx.get(f"http://localhost:3000/api/showtimes/st-wk-{sat.isoformat()}/seats").mock(
        return_value=httpx.Response(200, json=SEATS_PAYLOAD_SINGLE)
    )
    respx.get(f"http://localhost:3000/api/showtimes/st-wk-{sun.isoformat()}/seats").mock(
        return_value=httpx.Response(200, json=SEATS_PAYLOAD_SINGLE)
    )

    result = await recommend_best(film_query="Odisea", city="Bogotá", date_range="finde")

    assert result["outcome"] in ("recommended", "degraded", "no_availability")

    bd: str | None = result.get("businessDate")  # type: ignore[assignment]
    if bd:
        chosen = date.fromisoformat(bd)
        assert chosen.weekday() in (5, 6), (
            f"Expected Sat/Sun, got {bd} (weekday {chosen.weekday()})"
        )

    seat_calls = [c for c in respx.calls if "/seats" in str(c.request.url)]
    seat_urls = " ".join(str(c.request.url) for c in seat_calls)
    assert sat.isoformat() in seat_urls, "Sat seat fetch missing"
    assert sun.isoformat() in seat_urls, "Sun seat fetch missing"


@respx.mock
async def test_date_range_too_broad_no_seat_calls():
    """date_range='semana' with no film/city returns too_broad — zero seat fetches."""
    from datetime import date, timedelta

    today = date.today()
    multi_date_showtimes = [
        {
            "id": f"st-broad-{i}",
            "filmId": "film-01",
            "siteId": "site-bog-3",
            "siteName": "CinePaís Bogotá Norte",
            "city": "Bogotá",
            "businessDate": (today + timedelta(days=i + 1)).isoformat(),
            "time": "20:00",
            "room": "regular",
            "formats": ["2D"],
            "priceFrom": 25000,
        }
        for i in range(3)
    ]

    respx.get("http://localhost:3000/api/showtimes").mock(
        return_value=httpx.Response(200, json=multi_date_showtimes)
    )

    result = await recommend_best(date_range="semana")

    assert result["error"] == "too_broad"
    assert "hint" in result

    seat_calls = [c for c in respx.calls if "/seats" in str(c.request.url)]
    assert len(seat_calls) == 0, f"Expected 0 seat calls, got {len(seat_calls)}"


async def test_bad_date_range():
    """Unrecognised date_range string returns bad_date_range — no HTTP call needed."""
    result = await recommend_best(date_range="invalid-date-format")
    assert result["error"] == "bad_date_range"
    assert "hint" in result
    assert "YYYY-MM-DD" in result["hint"]  # type: ignore[operator]


@respx.mock
async def test_zero_match_hint():
    """search_showtimes returns a structured hint when no film matches the query."""
    respx.get("http://localhost:3000/api/films").mock(
        return_value=httpx.Response(200, json=FILMS_PAYLOAD)
    )
    result = await search_showtimes(film_query="NonExistentFilm")
    assert result == {
        "films_matched": [],
        "showtimes": [],
        "hint": "no matching films found",
    }


@respx.mock
async def test_parallel_seat_fetch_deterministic():
    """Two identical recommend_best calls produce the same result.

    Verifies asyncio.gather ordering + deterministic scoring yields stable output.
    """
    date_str: str = SHOWTIMES_PAYLOAD[0]["businessDate"]  # type: ignore[assignment]

    respx.get("http://localhost:3000/api/films", params={"city": "Bogotá"}).mock(
        return_value=httpx.Response(200, json=FILMS_PAYLOAD)
    )
    respx.get("http://localhost:3000/api/showtimes").mock(
        return_value=httpx.Response(200, json=SHOWTIMES_PAYLOAD)
    )
    respx.get("http://localhost:3000/api/showtimes/st-site-bog-3-imax-4-2245/seats").mock(
        return_value=httpx.Response(200, json=SEATS_PAYLOAD)
    )

    result1 = await recommend_best(film_query="Odisea", city="Bogotá", date_range=date_str)
    result2 = await recommend_best(film_query="Odisea", city="Bogotá", date_range=date_str)

    assert result1 == result2
    assert result1["outcome"] in ("recommended", "degraded", "no_availability")


# ---------------------------------------------------------------------------
# Test: tool list
# ---------------------------------------------------------------------------


async def test_mcp_tool_list():
    """MCP server exposes exactly 4 tools with the correct names."""
    tools = await mcp.list_tools()
    tool_names = [t.name for t in tools]
    assert set(tool_names) == {
        "search_showtimes",
        "seat_availability",
        "adjacent_seats",
        "recommend_best",
    }
    assert len(tool_names) == 4
