"""FastMCP stdio server exposing 4 read-only cinema tools for the CinePaís AI copilot."""

from __future__ import annotations

import asyncio
from collections import Counter
from typing import cast

from mcp.server.fastmcp import FastMCP

from cinepais_agent.api_client import CinepaisApiClient, NotFoundError
from cinepais_agent.config import settings
from cinepais_agent.date_range import _TOO_BROAD, _resolve_date_range
from cinepais_agent.mcp_widening import _SearchCtx, apply_widening
from cinepais_agent.models import Seat, Showtime
from cinepais_agent.scoring import ShowtimeWithSeats
from cinepais_agent.scoring import recommend_best as _recommend_best
from cinepais_agent.seating import SeatForAdjacency, find_adjacent

mcp: FastMCP = FastMCP("cinepais")

_MAX_SEATS = 4
_MAX_SEATS_ERR: dict[str, object] = {"error": "max_seats_exceeded", "max": _MAX_SEATS}

# Bounded semaphore: worst-case film+city+finde ≈ 6 showtimes → 1 batch well within limit
_SEAT_FETCH_SEM: asyncio.Semaphore = asyncio.Semaphore(8)


def _seat_to_adj(seat: Seat) -> SeatForAdjacency:
    return SeatForAdjacency(
        seatId=seat.seatId,
        row=seat.row,
        col=seat.col,
        area=seat.area,
        status=seat.status,
        areaCategory=seat.areaCategory,
        qualityTier=seat.qualityTier,
    )


async def _find_film(
    client: CinepaisApiClient,
    film_query: str,
    city: str | None,
) -> tuple[str | None, str, bool]:
    """Resolve film_query to (filmId, title, found_in_city_scope).

    City-scoped search first; falls back to unscoped on miss.
    Returns (None, film_query, False) when not found anywhere.
    """
    if city:
        city_films = await client.get_films(city=city)
        for film in city_films:
            if film_query.lower() in film.title.lower():
                return film.id, film.title, True

    all_films = await client.get_films()
    for film in all_films:
        if film_query.lower() in film.title.lower():
            return film.id, film.title, False
    return None, film_query, False


async def _fetch_seats_bounded(
    client: CinepaisApiClient,
    showtime: Showtime,
) -> ShowtimeWithSeats:
    """Fetch seats for one showtime under the shared concurrency semaphore."""
    async with _SEAT_FETCH_SEM:
        sr = await client.get_seats(showtime.id)
        return ShowtimeWithSeats(showtime=showtime, seats=sr.seats)


@mcp.tool()
async def search_showtimes(
    film_query: str | None = None,
    city: str | None = None,
    date: str | None = None,
    format: str | None = None,
) -> list[dict[str, object]] | dict[str, object]:
    """Search showtimes by film title (case-insensitive partial match), city,
    date (YYYY-MM-DD), and format (IMAX, 2D, Onyx, Doblada, Subtitulada, Premium).

    Film resolution is city-scoped: when city is given, searches /api/films?city=<city>
    first; falls back to unscoped /api/films on no match.

    Returns a list of showtime objects including priceFrom, or a hint dict when the
    film exists globally but has no showtimes in the requested city so the agent can
    narrate an honest alternative.
    """
    async with CinepaisApiClient(base_url=settings.web_api_base_url) as client:
        film_id: str | None = None
        film_title: str = film_query or ""
        found_in_city = True

        if film_query:
            film_id, film_title, found_in_city = await _find_film(client, film_query, city)
            if film_id is None:
                return {"films_matched": [], "showtimes": [], "hint": "no matching films found"}

        showtimes = await client.get_showtimes(film_id=film_id, city=city, date=date, format=format)

        if film_query and city and film_id and not found_in_city and not showtimes:
            return {
                "films_matched": [{"id": film_id, "title": film_title}],
                "showtimes": [],
                "hint": f"film exists but has no showtimes in {city}",
            }

        return {"showtimes": [st.model_dump() for st in showtimes]}


@mcp.tool()
async def seat_availability(showtime_id: str) -> dict[str, object]:
    """Return seat availability summary for a showtime.

    Includes:
    - availableCount: total available seats
    - byArea: breakdown by area (general/premium/wheelchair/preferential)
    - priceTable: price per area category
    - qualityTierHistogram: count of low/optimal/high available seats
    """
    async with CinepaisApiClient(base_url=settings.web_api_base_url) as client:
        try:
            response = await client.get_seats(showtime_id)
        except NotFoundError:
            return {"error": "not_found", "showtime_id": showtime_id}

    tier_counts: Counter[str] = Counter(
        s.qualityTier for s in response.seats if s.status == "Available"
    )
    return {
        "availableCount": response.summary.availableCount,
        "byArea": response.summary.byArea.model_dump(),
        "priceTable": response.summary.priceTable.model_dump(),
        "qualityTierHistogram": {
            "low": tier_counts.get("low", 0),
            "optimal": tier_counts.get("optimal", 0),
            "high": tier_counts.get("high", 0),
        },
    }


@mcp.tool()
async def adjacent_seats(showtime_id: str, n: int) -> dict[str, object]:
    """Find orphan-safe groups of exactly n adjacent available seats.

    Business rules enforced:
    - Max 4 seats per purchase; returns error dict for n > 4 (never raises)
    - Wheelchair/preferential excluded from default results
    - Orphan-safe: no selection leaves exactly one isolated available seat

    Returns {"groups": [{seatIds, qualityTier, totalPrice}, ...]} on success,
    {"error": "max_seats_exceeded", "max": 4} when n > 4, or
    {"groups": [], "note": "..."} when only accessibility seats offer n adjacent.
    """
    if n > _MAX_SEATS:
        return _MAX_SEATS_ERR

    async with CinepaisApiClient(base_url=settings.web_api_base_url) as client:
        try:
            response = await client.get_seats(showtime_id)
        except NotFoundError:
            return {"error": "not_found", "showtime_id": showtime_id}

    adj_seats = [_seat_to_adj(s) for s in response.seats]
    groups = find_adjacent(adj_seats, n, response.showtime.room)

    if not groups:
        acc_available = sum(
            1
            for s in response.seats
            if s.status == "Available" and s.areaCategory in ("wheelchair", "preferential")
        )
        note: str | None = None
        if acc_available >= n:
            note = f"only accessibility/preferential seats offer {n} adjacent — ask explicitly"
        return {"groups": [], "note": note}

    price_lookup = {s.seatId: s.price for s in response.seats}
    result: list[dict[str, object]] = [
        {
            "seatIds": [s.seatId for s in group],
            "qualityTier": group[0].qualityTier,
            "totalPrice": sum(price_lookup.get(s.seatId, 0) for s in group),
        }
        for group in groups
    ]
    return {"groups": result}


@mcp.tool()
async def recommend_best(
    film_query: str | None = None,
    city: str | None = None,
    date_range: str | None = None,
    n: int | None = None,
    format: str | None = None,
) -> dict[str, object]:
    """Recommend the best showtime and seats for n people.

    n defaults to 1 (max 4). date_range accepts: a single YYYY-MM-DD, an inclusive
    YYYY-MM-DD..YYYY-MM-DD range (≤7 days), or keywords hoy|mañana|finde|semana.
    None defaults to semana (whole discoverable window).
    Never discourages: always returns the best available real option.
    Returns a RecommendationEvent dict with outcome, seatIds, and alternatives.
    """
    if n is not None and n > _MAX_SEATS:
        return _MAX_SEATS_ERR

    effective_n = n if n is not None else 1

    async with CinepaisApiClient(base_url=settings.web_api_base_url) as client:
        # Resolve date range to a concrete list of dates (or an error dict)
        date_result = await _resolve_date_range(date_range, client)
        if isinstance(date_result, dict):
            return date_result

        date_list: list[str] = date_result

        # Too-broad guard: wide range with no film or city → refuse before any seat fetch
        if len(date_list) > 1 and film_query is None and city is None:
            return _TOO_BROAD

        # Film resolution
        film_id: str | None = None
        if film_query:
            film_id, _, _ = await _find_film(client, film_query, city)

        # Fetch all showtimes (no date filter) then narrow client-side to resolved dates
        showtimes_all = await client.get_showtimes(film_id=film_id, city=city, format=format)
        date_set = set(date_list)
        showtimes = [st for st in showtimes_all if st.businessDate in date_set]

        # Parallel seat fetches bounded by the module-level semaphore
        candidates = cast(
            list[ShowtimeWithSeats],
            await asyncio.gather(*(_fetch_seats_bounded(client, st) for st in showtimes)),
        )

        result = _recommend_best(candidates, effective_n)
        ctx = _SearchCtx(film_id, city, format, date_set, effective_n)
        widened = await apply_widening(result, candidates, client, ctx, _fetch_seats_bounded)
        return widened.model_dump()


if __name__ == "__main__":
    mcp.run()
