"""Deterministic recommendation scoring.

Never-discourage invariant: always returns the best real option available,
never a bare refusal. Outcome branches: recommended > degraded > no_availability.
"""

from __future__ import annotations

from dataclasses import dataclass

from .events import Alternative, RecommendationEvent
from .models import Seat, Showtime
from .scoring_helpers import (
    _TIER_PREF,
    _build_reasoning_degraded,
    _build_reasoning_recommended,
    _make_alternative,
    _score,
    _seats_to_adjacency,
    _sort_key,
)
from .seating import SeatForAdjacency, find_adjacent


@dataclass
class ShowtimeWithSeats:
    """A showtime paired with its seat data."""

    showtime: Showtime
    seats: list[Seat]


def _build_alternatives(
    scored: list[tuple[float, list[SeatForAdjacency], ShowtimeWithSeats]],
    primary: ShowtimeWithSeats,
    n: int,
    max_alts: int = 3,
) -> list[Alternative]:
    """Build up to max_alts alternatives with Spanish reasons."""
    alternatives: list[Alternative] = []
    seen_ids: set[str] = {primary.showtime.id}

    primary_tier = _TIER_PREF.get(primary.seats[0].qualityTier if primary.seats else "low", 0)

    for _, group, cand in scored:
        if cand.showtime.id in seen_ids:
            continue
        if len(alternatives) >= max_alts:
            break

        reason, quality_tier = _make_alternative(
            cand.showtime, cand.seats, group, primary_tier, primary.showtime.priceFrom
        )

        alternatives.append(
            Alternative(
                showtimeId=cand.showtime.id,
                filmId=cand.showtime.filmId,
                siteName=cand.showtime.siteName,
                businessDate=cand.showtime.businessDate,
                time=cand.showtime.time,
                formats=cand.showtime.formats,  # type: ignore[arg-type]
                priceFrom=cand.showtime.priceFrom,
                qualityTier=quality_tier,  # type: ignore[arg-type]
                reason=reason,
            )
        )
        seen_ids.add(cand.showtime.id)

    return alternatives


def recommend_best(candidates: list[ShowtimeWithSeats], n: int) -> RecommendationEvent:
    """Find the best showtime and seats for n people.

    Never-discourage invariant: always returns the best real option.

    Outcome branches:
    1. recommended — some candidate has n adjacent orphan-safe seats
    2. degraded — NO candidate has n adjacent, but seats exist
    3. no_availability — zero available seats across all candidates

    Args:
        candidates: List of showtimes with their seat data
        n: Number of seats requested (1-4)

    Returns:
        RecommendationEvent with outcome, seatIds, and alternatives
    """
    if not candidates:
        return RecommendationEvent(
            outcome="no_availability",
            showtimeId=None,
            filmId=None,
            seatIds=[],
            requestedN=n,
            siteName=None,
            city=None,
            businessDate=None,
            time=None,
            formats=[],
            priceFrom=None,
            qualityTier=None,
            reasoning="No hay funciones disponibles para los criterios solicitados.",
            alternatives=[],
        )

    # Sort candidates by tie-break for determinism
    sorted_candidates = sorted(candidates, key=lambda c: _sort_key((c.showtime, c.seats)))

    # Score all candidates
    scored: list[tuple[float, list[SeatForAdjacency], ShowtimeWithSeats]] = []
    for cand in sorted_candidates:
        score, group = _score(cand.showtime, cand.seats, n)
        scored.append((score, group, cand))

    # Sort by score desc (tie-break already baked into order via sorted_candidates)
    scored.sort(key=lambda x: -x[0])

    # Branch 1: recommended — best candidate has n adjacent seats
    best_score, best_group, best_cand = scored[0]

    if best_group:
        seat_ids = [s.seatId for s in best_group]
        group_tier = best_group[0].qualityTier
        alternatives = _build_alternatives(scored, best_cand, n)

        return RecommendationEvent(
            outcome="recommended",
            showtimeId=best_cand.showtime.id,
            filmId=best_cand.showtime.filmId,
            seatIds=seat_ids,
            requestedN=n,
            siteName=best_cand.showtime.siteName,
            city=best_cand.showtime.city,
            businessDate=best_cand.showtime.businessDate,
            time=best_cand.showtime.time,
            formats=best_cand.showtime.formats,  # type: ignore[arg-type]
            priceFrom=best_cand.showtime.priceFrom,
            qualityTier=group_tier,  # type: ignore[arg-type]
            reasoning=_build_reasoning_recommended(best_cand.showtime, best_group),
            alternatives=alternatives,
        )

    # Check if any seats are available at all
    total_available = sum(
        sum(1 for s in cand.seats if s.status == "Available") for cand in sorted_candidates
    )

    if total_available == 0:
        # Branch 3: no_availability
        return RecommendationEvent(
            outcome="no_availability",
            showtimeId=None,
            filmId=None,
            seatIds=[],
            requestedN=n,
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

    # Branch 2: degraded — no n adjacent, but seats exist
    # Try smaller adjacent groups first (orphan-safe), then any single seat as fallback
    best_degraded_cand: ShowtimeWithSeats | None = None
    best_degraded_seats: list[SeatForAdjacency] = []

    for _, _, cand in scored:
        available = [
            s
            for s in cand.seats
            if s.status == "Available" and s.areaCategory not in ("wheelchair", "preferential")
        ]
        if not available:
            continue
        adj_seats = _seats_to_adjacency(cand.seats)
        for smaller_n in range(n - 1, 0, -1):
            groups = find_adjacent(adj_seats, smaller_n, cand.showtime.room)
            if groups:
                best_degraded_cand = cand
                best_degraded_seats = groups[0]
                break
        if best_degraded_cand is not None:
            break

    if best_degraded_cand is None:
        # Fallback: pick any available non-accessibility seat (ignores orphan rule)
        for _, _, cand in scored:
            available = [
                s
                for s in cand.seats
                if s.status == "Available" and s.areaCategory not in ("wheelchair", "preferential")
            ]
            if available:
                best_degraded_cand = cand
                best_degraded_seats = [_seats_to_adjacency([available[0]])[0]]
                break

    if best_degraded_cand is None:
        # Only accessibility seats remain
        return RecommendationEvent(
            outcome="no_availability",
            showtimeId=None,
            filmId=None,
            seatIds=[],
            requestedN=n,
            siteName=None,
            city=None,
            businessDate=None,
            time=None,
            formats=[],
            priceFrom=None,
            qualityTier=None,
            reasoning=(
                "Solo hay sillas de accesibilidad disponibles. "
                "Puedo ayudarte a encontrar opciones si las necesitas."
            ),
            alternatives=[],
        )

    seat_ids = [s.seatId for s in best_degraded_seats]
    group_tier = best_degraded_seats[0].qualityTier if best_degraded_seats else "low"
    alternatives = _build_alternatives(scored, best_degraded_cand, n)

    return RecommendationEvent(
        outcome="degraded",
        showtimeId=best_degraded_cand.showtime.id,
        filmId=best_degraded_cand.showtime.filmId,
        seatIds=seat_ids,
        requestedN=n,
        siteName=best_degraded_cand.showtime.siteName,
        city=best_degraded_cand.showtime.city,
        businessDate=best_degraded_cand.showtime.businessDate,
        time=best_degraded_cand.showtime.time,
        formats=best_degraded_cand.showtime.formats,  # type: ignore[arg-type]
        priceFrom=best_degraded_cand.showtime.priceFrom,
        qualityTier=group_tier,  # type: ignore[arg-type]
        reasoning=_build_reasoning_degraded(best_degraded_cand.showtime, n, len(seat_ids)),
        alternatives=alternatives,
    )
