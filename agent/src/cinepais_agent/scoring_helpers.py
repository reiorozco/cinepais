"""Helper functions extracted from scoring.py to keep each module ≤250 LOC."""

from __future__ import annotations

from .models import Seat, Showtime
from .seating import SeatForAdjacency, find_adjacent

_TIER_PREF: dict[str, int] = {"optimal": 3, "high": 2, "low": 1}


def _seats_to_adjacency(seats: list[Seat]) -> list[SeatForAdjacency]:
    """Convert API Seat models to SeatForAdjacency dataclasses."""
    return [
        SeatForAdjacency(
            seatId=s.seatId,
            row=s.row,
            col=s.col,
            area=s.area,
            status=s.status,
            areaCategory=s.areaCategory,
            qualityTier=s.qualityTier,
        )
        for s in seats
    ]


def _score(showtime: Showtime, seats: list[Seat], n: int) -> tuple[float, list[SeatForAdjacency]]:
    """Compute score for a showtime candidate.

    Returns (score, best_group) where best_group may be empty if no adjacent group found.
    """
    adj_seats = _seats_to_adjacency(seats)
    groups = find_adjacent(adj_seats, n, showtime.room)

    available = sum(1 for s in seats if s.status == "Available")
    total = len(seats)
    availability_ratio = available / total if total > 0 else 0.0

    if groups:
        best_group = groups[0]  # already sorted by tier_pref desc, row asc, col asc
        group_tier = best_group[0].qualityTier
        tier_score = _TIER_PREF.get(group_tier, 0)
        score = 100.0 + 10 * tier_score + 5 * availability_ratio
        return score, best_group
    else:
        score = 0.0 + 5 * availability_ratio
        return score, []


def _sort_key(candidate: tuple[Showtime, list[Seat]]) -> tuple[str, str, str]:
    """Tie-break sort key: (businessDate asc, time asc, showtimeId asc)."""
    showtime, _ = candidate
    return (showtime.businessDate, showtime.time, showtime.id)


def _make_alternative(
    cand_showtime: Showtime,
    cand_seats: list[Seat],
    group: list[SeatForAdjacency],
    primary_tier: int,
    primary_price: float,
) -> tuple[str, str]:
    """Determine alternative reason and quality tier.

    Returns (reason, quality_tier).
    """
    cand_tier_str = group[0].qualityTier if group else "low"
    cand_tier = _TIER_PREF.get(cand_tier_str, 0)

    if cand_tier > primary_tier:
        reason = "mejor calidad de silla"
    elif cand_showtime.priceFrom < primary_price:
        reason = "más económica"
    else:
        reason = "horario alternativo"

    available_seats = [s for s in cand_seats if s.status == "Available"]
    quality_tier: str = "low"
    if available_seats:
        tiers = [s.qualityTier for s in available_seats]
        if "optimal" in tiers:
            quality_tier = "optimal"
        elif "high" in tiers:
            quality_tier = "high"

    return reason, quality_tier


def _build_reasoning_recommended(showtime: Showtime, group: list[SeatForAdjacency]) -> str:
    tier = group[0].qualityTier
    tier_es = {"optimal": "zona óptima", "high": "zona alta", "low": "zona baja"}.get(tier, tier)
    row = group[0].row
    return (
        f"Encontré {len(group)} sillas juntas en fila {row} ({tier_es}) "
        f"en {showtime.siteName} a las {showtime.time}."
    )


def _build_reasoning_degraded(showtime: Showtime, requested: int, found: int) -> str:
    return (
        f"No encontré {requested} sillas juntas disponibles. "
        f"Te ofrezco {found} silla{'s' if found > 1 else ''} en {showtime.siteName} "
        f"a las {showtime.time}. Puedes completar tu grupo en sillas cercanas."
    )
