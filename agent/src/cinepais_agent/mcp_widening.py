"""Widening helpers for the recommend_best MCP tool."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import cast

from cinepais_agent.api_client import CinepaisApiClient
from cinepais_agent.events import Alternative, RecommendationEvent
from cinepais_agent.models import Showtime
from cinepais_agent.scoring import ShowtimeWithSeats


@dataclass
class _SearchCtx:
    """Original query parameters needed for widening."""

    film_id: str | None
    city: str | None
    format: str | None
    date_set: set[str]
    effective_n: int


def _build_soldout_tradeoff(
    candidates: list[ShowtimeWithSeats],
    result: RecommendationEvent,
) -> Alternative | None:
    """Return an Alternative for the earliest soldout showtime, or None."""
    # `c.seats` guard is load-bearing: `all(...)` over an empty list is vacuously True, so an
    # empty seat list (a data gap) would otherwise surface as "esta función está agotada".
    soldout_ids = {
        c.showtime.id
        for c in candidates
        if c.seats and all(s.status != "Available" for s in c.seats)
    }
    if not soldout_ids or result.showtimeId in soldout_ids:
        return None
    earliest = min(
        (c for c in candidates if c.showtime.id in soldout_ids),
        key=lambda c: (c.showtime.businessDate, c.showtime.time, c.showtime.id),
    )
    st = earliest.showtime
    return Alternative(
        showtimeId=st.id,
        filmId=st.filmId,
        siteName=st.siteName,
        businessDate=st.businessDate,
        time=st.time,
        formats=st.formats,  # type: ignore[arg-type]
        priceFrom=st.priceFrom,
        qualityTier=None,
        reason="esta función está agotada",
    )


async def apply_widening(
    result: RecommendationEvent,
    candidates: list[ShowtimeWithSeats],
    client: CinepaisApiClient,
    ctx: _SearchCtx,
    fetch_fn: Callable[[CinepaisApiClient, Showtime], Awaitable[ShowtimeWithSeats]],
) -> RecommendationEvent:
    """Apply availability widening and the soldout tradeoff to a RecommendationEvent."""
    if result.outcome in ("no_availability", "degraded") and len(result.alternatives) < 3:
        seen_ids = {c.showtime.id for c in candidates}
        steps: list[tuple[str, bool, bool]] = [
            ("otro formato disponible", True, False),
            ("disponible en otra ciudad", True, True),
            ("otra fecha disponible", True, True),
        ]
        for step_idx, (reason, drop_fmt, drop_city) in enumerate(steps):
            w_format = None if drop_fmt else ctx.format
            w_city = None if drop_city else ctx.city
            if step_idx < 2:
                w_sts_all = await client.get_showtimes(
                    film_id=ctx.film_id, city=w_city, format=w_format
                )
                w_sts = [st for st in w_sts_all if st.businessDate in ctx.date_set]
            else:
                w_sts = await client.get_showtimes(
                    film_id=ctx.film_id, city=w_city, format=w_format
                )
            new_sts = [st for st in w_sts if st.id not in seen_ids]
            if not new_sts:
                continue
            new_cands = cast(
                list[ShowtimeWithSeats],
                await asyncio.gather(*(fetch_fn(client, st) for st in new_sts)),
            )
            w_alts = [
                Alternative(
                    showtimeId=c.showtime.id,
                    filmId=c.showtime.filmId,
                    siteName=c.showtime.siteName,
                    businessDate=c.showtime.businessDate,
                    time=c.showtime.time,
                    formats=c.showtime.formats,  # type: ignore[arg-type]
                    priceFrom=c.showtime.priceFrom,
                    qualityTier=c.seats[0].qualityTier if c.seats else None,  # type: ignore[arg-type]
                    reason=reason,
                )
                for c in new_cands
                if any(s.status == "Available" for s in c.seats)
            ]
            if w_alts:
                existing_ids = {a.showtimeId for a in result.alternatives}
                for alt in w_alts:
                    if alt.showtimeId not in existing_ids and len(result.alternatives) < 3:
                        result.alternatives.append(alt)
                        existing_ids.add(alt.showtimeId)
                seen_ids.update(c.showtime.id for c in new_cands)
                # Stop at the first relaxation step that yields >=1 alternative. Per the plan's
                # binding reconciliation (draft §ROUND-4 RESULTS): "The stop-at->=1 early-break
                # is plan-as-written, NOT a bug - the doc drift is the real defect, fixed inline
                # in todo 14." Do not re-litigate; do not implement full w1->w2->w3 chaining.
                if len(result.alternatives) >= 1:
                    break

    # Outcome-agnostic by design (round-7 user decision A): `_build_soldout_tradeoff` holds the
    # only guards. Placed AFTER widening so `no_availability` keeps >=1 actionable non-soldout
    # option beside the informational entry — the one entry allowed past the widening cap of 3.
    tradeoff = _build_soldout_tradeoff(candidates, result)
    if tradeoff is not None:
        # Tradeoff wins: drop any earlier entry for the same showtime so the honest
        # qualityTier=None / "agotada" version is the only one the client ever sees.
        result.alternatives = [
            alt for alt in result.alternatives if alt.showtimeId != tradeoff.showtimeId
        ]
        result.alternatives.append(tradeoff)

    return result
