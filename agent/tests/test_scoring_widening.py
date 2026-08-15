from collections.abc import Awaitable, Callable
from typing import cast

import pytest

from cinepais_agent.api_client import CinepaisApiClient
from cinepais_agent.events import Alternative, RecommendationEvent
from cinepais_agent.mcp_widening import _SearchCtx, apply_widening
from cinepais_agent.models import Seat, Showtime
from cinepais_agent.scoring import ShowtimeWithSeats, recommend_best


def _make_showtime(id: str, date: str = "2026-08-08", time: str = "20:00") -> Showtime:
    return Showtime(
        id=id,
        filmId="film-1",
        siteId="site-1",
        siteName="CinePaís Test",
        city="Bogotá",
        room="imax",
        businessDate=date,
        time=time,
        formats=["2D"],  # type: ignore[list-item]
        priceFrom=15000,
    )


def _make_seat(seat_id: str, status: str = "Available", tier: str = "optimal") -> Seat:
    col = int(seat_id.split("_")[-1])
    area = 1 if col <= 5 else (2 if col <= 15 else 3)
    return Seat(
        seatId=seat_id,
        row=5,
        col=col,
        area=area,
        status=status,  # type: ignore[arg-type]
        areaCategory="general",
        qualityTier=tier,  # type: ignore[arg-type]
        price=15000,
    )


def _make_alternative(showtime_id: str, tier: str | None, reason: str) -> Alternative:
    """Build a pre-existing alternatives entry (simulates the recommend_best pool)."""
    return Alternative(
        showtimeId=showtime_id,
        filmId="film-1",
        siteName="CinePaís Test",
        businessDate="2026-08-08",
        time="20:00",
        formats=["2D"],  # type: ignore[list-item]
        priceFrom=15000,
        qualityTier=tier,  # type: ignore[arg-type]
        reason=reason,
    )


class _StubApiClient:
    """Minimal CinepaisApiClient stand-in — apply_widening only calls get_showtimes()."""

    def __init__(self, responses: list[list[Showtime]] | None = None) -> None:
        self._responses = responses or []
        self.calls: list[dict[str, str | None]] = []

    async def get_showtimes(
        self,
        film_id: str | None = None,
        city: str | None = None,
        date: str | None = None,
        format: str | None = None,
    ) -> list[Showtime]:
        self.calls.append({"film_id": film_id, "city": city, "date": date, "format": format})
        idx = len(self.calls) - 1
        return self._responses[idx] if idx < len(self._responses) else []


def _make_fetch_fn(
    seats_by_id: dict[str, list[Seat]],
) -> Callable[[CinepaisApiClient, Showtime], Awaitable[ShowtimeWithSeats]]:
    """Build a fetch_fn stub that resolves seats from a static map."""

    async def _fetch(_client: CinepaisApiClient, showtime: Showtime) -> ShowtimeWithSeats:
        return ShowtimeWithSeats(showtime=showtime, seats=seats_by_id.get(showtime.id, []))

    return _fetch


def _make_ctx(dates: set[str], n: int = 2) -> _SearchCtx:
    return _SearchCtx(
        film_id="film-1",
        city="Bogotá",
        format="IMAX",
        date_set=dates,
        effective_n=n,
    )


def test_alternative_nullable_quality() -> None:
    alt = Alternative(
        showtimeId="st-1",
        filmId="film-1",
        siteName="CinePaís Test",
        businessDate="2026-08-08",
        time="20:00",
        formats=["2D"],  # type: ignore[list-item]
        priceFrom=15000,
        qualityTier=None,
        reason="esta función está agotada",
    )
    assert alt.qualityTier is None


@pytest.mark.asyncio
async def test_empty_seats_candidate_not_classified_soldout() -> None:
    """t1: an empty seat list is a data gap, NOT a soldout showtime.

    Vacuous truth guard: `all(... for s in [])` is True, which used to surface a
    "esta función está agotada" tradeoff for a showtime we simply have no seat data for.
    """
    candidates = [
        ShowtimeWithSeats(
            showtime=_make_showtime("st-available", time="18:00"),
            seats=[_make_seat("2_5_7"), _make_seat("2_5_8")],
        ),
        ShowtimeWithSeats(
            showtime=_make_showtime("st-empty", time="20:00"),
            seats=[],
        ),
    ]

    result = recommend_best(candidates, 2)
    assert result.outcome == "recommended"
    assert result.showtimeId == "st-available"

    client = _StubApiClient()
    widened = await apply_widening(
        result,
        candidates,
        cast(CinepaisApiClient, client),
        _make_ctx({"2026-08-08"}),
        _make_fetch_fn({}),
    )

    soldout_entries = [alt for alt in widened.alternatives if "agotada" in alt.reason]
    assert soldout_entries == [], "empty seat list must never be reported as soldout"
    empty_entries = [alt for alt in widened.alternatives if alt.showtimeId == "st-empty"]
    assert all("agotada" not in alt.reason for alt in empty_entries)


@pytest.mark.asyncio
async def test_soldout_tradeoff_via_apply_widening_dedupes_same_id() -> None:
    """t2: the tradeoff entry is deterministic and replaces any same-id entry.

    Earliest soldout by (businessDate, time, id); every loser exercises one rank of the
    tie-break. The honest entry (qualityTier=None, "agotada") must be the ONLY one for that id.
    """
    soldout_seats = [
        _make_seat("2_5_9", status="Sold"),
        _make_seat("2_5_10", status="Sold"),
    ]
    candidates = [
        ShowtimeWithSeats(
            showtime=_make_showtime("st-available", time="18:00"),
            seats=[_make_seat("2_5_7"), _make_seat("2_5_8")],
        ),
        # winner: earliest (businessDate, time, id)
        ShowtimeWithSeats(
            showtime=_make_showtime("st-soldout-m", date="2026-08-08", time="20:00"),
            seats=list(soldout_seats),
        ),
        # loses on id (same date + time, later id)
        ShowtimeWithSeats(
            showtime=_make_showtime("st-soldout-z", date="2026-08-08", time="20:00"),
            seats=list(soldout_seats),
        ),
        # loses on time despite an earlier id
        ShowtimeWithSeats(
            showtime=_make_showtime("st-soldout-a", date="2026-08-08", time="22:00"),
            seats=list(soldout_seats),
        ),
        # loses on date despite an earlier time and id
        ShowtimeWithSeats(
            showtime=_make_showtime("st-soldout-aa", date="2026-08-09", time="08:00"),
            seats=list(soldout_seats),
        ),
    ]

    result = recommend_best(candidates, 2)
    assert result.outcome == "recommended"
    assert result.showtimeId == "st-available"

    # Stale same-id entry that the honest tradeoff must replace.
    result.alternatives.append(_make_alternative("st-soldout-m", "optimal", "horario alternativo"))
    assert len([a for a in result.alternatives if a.showtimeId == "st-soldout-m"]) >= 2

    client = _StubApiClient()
    widened = await apply_widening(
        result,
        candidates,
        cast(CinepaisApiClient, client),
        _make_ctx({"2026-08-08", "2026-08-09"}),
        _make_fetch_fn({}),
    )

    entries = [alt for alt in widened.alternatives if alt.showtimeId == "st-soldout-m"]
    assert len(entries) == 1, "the soldout tradeoff must replace, not duplicate, same-id entries"
    assert entries[0].qualityTier is None
    assert "agotada" in entries[0].reason
    tradeoff_ids = [alt.showtimeId for alt in widened.alternatives if "agotada" in alt.reason]
    assert tradeoff_ids == ["st-soldout-m"]


@pytest.mark.asyncio
async def test_widening_dedupes_against_original_pool() -> None:
    """t3: a widened showtime already known to the caller is never appended twice.

    Covers both dedupe gates: `seen_ids` (id already in the original candidates pool) and
    `existing_ids` (id already present in result.alternatives).
    """
    soldout_seats = [
        _make_seat("2_5_9", status="Sold"),
        _make_seat("2_5_10", status="Sold"),
    ]
    candidates = [
        ShowtimeWithSeats(
            showtime=_make_showtime("st-dup", time="18:00"),
            seats=list(soldout_seats),
        ),
        ShowtimeWithSeats(
            showtime=_make_showtime("st-x", time="19:00"),
            seats=list(soldout_seats),
        ),
    ]

    result = recommend_best(candidates, 2)
    assert result.outcome == "no_availability"
    assert result.alternatives == []

    result.alternatives.append(_make_alternative("st-dup", "optimal", "horario alternativo"))
    result.alternatives.append(_make_alternative("st-pre", "high", "más económica"))

    widened_pool = [
        _make_showtime("st-dup", time="18:00"),  # already in the candidates pool
        _make_showtime("st-pre", time="21:00"),  # already in result.alternatives
        _make_showtime("st-new", time="22:00"),  # genuinely new
    ]
    available_seats = [_make_seat("2_5_7"), _make_seat("2_5_8")]
    client = _StubApiClient(responses=[widened_pool])
    widened = await apply_widening(
        result,
        candidates,
        cast(CinepaisApiClient, client),
        _make_ctx({"2026-08-08"}),
        _make_fetch_fn(
            {
                "st-dup": list(available_seats),
                "st-pre": list(available_seats),
                "st-new": list(available_seats),
            }
        ),
    )

    assert client.calls, "widening must actually query the API"
    ids = [alt.showtimeId for alt in widened.alternatives]
    assert ids.count("st-dup") == 1
    assert ids.count("st-pre") == 1
    assert ids.count("st-new") == 1
    assert len(ids) == len(set(ids)), f"duplicate alternatives: {ids}"


@pytest.mark.asyncio
async def test_soldout_tradeoff_on_no_availability_branch() -> None:
    """t4: the honest "agotada" entry also surfaces when the outcome is no_availability.

    Pre-fix the tradeoff was gated on `outcome == "recommended"`, so this branch could never
    carry it and the E2E soldout invariant was decided by which trajectory the LLM happened to
    take. Widening runs first, so the informational entry never crowds out the actionable ones.
    """
    soldout_seats = [
        _make_seat("2_5_9", status="Sold"),
        _make_seat("2_5_10", status="Sold"),
    ]
    candidates = [
        ShowtimeWithSeats(
            showtime=_make_showtime("st-soldout", time="18:00"),
            seats=list(soldout_seats),
        ),
    ]

    result = RecommendationEvent(
        outcome="no_availability",
        showtimeId=None,
        filmId=None,
        seatIds=[],
        requestedN=2,
        siteName=None,
        city=None,
        businessDate=None,
        time=None,
        formats=[],
        priceFrom=None,
        qualityTier=None,
        reasoning="No hay sillas disponibles para las funciones solicitadas.",
        alternatives=[],
    )

    client = _StubApiClient(responses=[[_make_showtime("st-widened", time="21:00")]])
    widened = await apply_widening(
        result,
        candidates,
        cast(CinepaisApiClient, client),
        _make_ctx({"2026-08-08"}),
        _make_fetch_fn({"st-widened": [_make_seat("2_5_7"), _make_seat("2_5_8")]}),
    )

    assert client.calls, "widening must run before the tradeoff is appended"

    entries = [alt for alt in widened.alternatives if alt.showtimeId == "st-soldout"]
    assert len(entries) == 1, "the soldout tradeoff must appear exactly once"
    assert entries[0].qualityTier is None
    assert "agotada" in entries[0].reason

    actionable = [alt for alt in widened.alternatives if alt.showtimeId != "st-soldout"]
    assert len(actionable) >= 1, "the tradeoff must not crowd out actionable alternatives"
    assert [alt.showtimeId for alt in actionable] == ["st-widened"]
    assert actionable[0].reason == "otro formato disponible"
    assert all("agotada" not in alt.reason for alt in actionable)


def test_canaries_not_in_normal_reply() -> None:
    from cinepais_agent.prompts import SENTINEL_1, SENTINEL_2, SENTINEL_3

    normal_reply = "Encontré 2 sillas juntas en CinePaís El Poblado a las 20:00."
    assert SENTINEL_1 not in normal_reply
    assert SENTINEL_2 not in normal_reply
    assert SENTINEL_3 not in normal_reply
    assert "CANARY" in SENTINEL_1
    assert "CANARY" in SENTINEL_2
    assert "CANARY" in SENTINEL_3
