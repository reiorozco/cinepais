"""Pricing formula — faithful Python port of web/src/lib/business/pricing.ts."""

from __future__ import annotations

from typing import Literal

Format = Literal["IMAX", "Onyx", "2D", "Doblada", "Subtitulada", "Premium"]
AreaCategory = Literal["general", "premium", "wheelchair", "preferential"]

PRICING_BASE: dict[str, int] = {
    "IMAX": 32000,
    "Onyx": 28000,
    "Premium": 24000,
    "2D": 18000,
    "Doblada": 18000,
    "Subtitulada": 18000,
}

ZONE_MULTIPLIER: dict[str, float] = {
    "general": 1.0,
    "wheelchair": 1.0,
    "preferential": 1.15,
    "premium": 1.35,
}

WEDNESDAY_FACTOR = 0.6
ROUND_TO = 500

FORMAT_PRECEDENCE: list[str] = ["IMAX", "Onyx", "Premium", "2D", "Doblada", "Subtitulada"]


def dominant_format(formats: list[str]) -> str:
    """Return the highest-priority format from a list.

    Precedence: IMAX > Onyx > Premium > 2D > Doblada > Subtitulada.
    Port of dominantFormat from pricing.ts.
    """
    for candidate in FORMAT_PRECEDENCE:
        if candidate in formats:
            return candidate
    return formats[0] if formats else "2D"


def is_wednesday(business_date: str) -> bool:
    """Return True when business_date (YYYY-MM-DD) falls on a Wednesday (UTC).

    Parses strictly as UTC midnight to avoid timezone drift.
    Port of isWednesday from pricing.ts.
    """
    from datetime import UTC, datetime

    dt = datetime.strptime(business_date, "%Y-%m-%d").replace(tzinfo=UTC)
    return dt.weekday() == 2  # 0=Monday, 2=Wednesday


def seat_price(formats: list[str], area_category: str, business_date: str) -> int:
    """Compute the seat price for a showtime.

    Formula: base[dominant] × zoneMultiplier[area] × wednesdayFactor? → rounded to 500.
    Port of seatPrice from pricing.ts.
    """
    base = PRICING_BASE[dominant_format(formats)]
    zone = ZONE_MULTIPLIER[area_category]
    wed = WEDNESDAY_FACTOR if is_wednesday(business_date) else 1.0
    raw = base * zone * wed
    return round(raw / ROUND_TO) * ROUND_TO
