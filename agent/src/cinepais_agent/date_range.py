"""Date-range resolution helpers for the CinePaís MCP server.

Translates natural-language or ISO date inputs into a concrete list of
YYYY-MM-DD strings that the MCP tools can use for showtime queries.
"""

from __future__ import annotations

import re
from datetime import date as _Date
from datetime import timedelta

from cinepais_agent.api_client import CinepaisApiClient

_DATE_RANGE_HINT = "YYYY-MM-DD, YYYY-MM-DD..YYYY-MM-DD, hoy|mañana|finde|semana"
_BAD_DATE_RANGE: dict[str, object] = {"error": "bad_date_range", "hint": _DATE_RANGE_HINT}
_TOO_BROAD: dict[str, object] = {
    "error": "too_broad",
    "hint": "Especifica una película o ciudad para buscar en un rango de fechas",
}

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_DATE_RANGE_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$")


async def _resolve_date_range(
    date_range: str | None,
    client: CinepaisApiClient,
) -> list[str] | dict[str, object]:
    """Resolve date_range to a concrete list of YYYY-MM-DD dates, or an error dict.

    None          → treated as "semana" (whole discoverable window).
    YYYY-MM-DD    → [date].
    A..B          → inclusive expansion of YYYY-MM-DD..YYYY-MM-DD, max 7 days.
    hoy           → [today] if today is within the window, else bad_date_range.
    mañana        → [tomorrow] if within the window, else bad_date_range.
    finde         → nearest Sat+Sun within the window; latest day(s) if none ahead.
    semana        → all dates in the window.
    anything else → bad_date_range error dict.
    """
    effective = date_range if date_range is not None else "semana"

    # Single YYYY-MM-DD
    if _DATE_RE.match(effective):
        return [effective]

    # Explicit range: YYYY-MM-DD..YYYY-MM-DD
    range_match = _DATE_RANGE_RE.match(effective)
    if range_match:
        try:
            start = _Date.fromisoformat(range_match.group(1))
            end = _Date.fromisoformat(range_match.group(2))
        except ValueError:
            return _BAD_DATE_RANGE
        if end < start:
            return _BAD_DATE_RANGE
        days = (end - start).days + 1
        if days > 7:
            return _BAD_DATE_RANGE
        return [(start + timedelta(days=i)).isoformat() for i in range(days)]

    # Keywords — need window discovery via un-dated showtimes fetch
    if effective in ("hoy", "mañana", "finde", "semana"):
        window_sts = await client.get_showtimes()
        window_dates = sorted({_Date.fromisoformat(st.businessDate) for st in window_sts})

        if not window_dates:
            return _BAD_DATE_RANGE

        win_min, win_max = window_dates[0], window_dates[-1]
        today = _Date.today()

        if effective == "hoy":
            return [today.isoformat()] if win_min <= today <= win_max else _BAD_DATE_RANGE

        if effective == "mañana":
            tmrw = today + timedelta(days=1)
            return [tmrw.isoformat()] if win_min <= tmrw <= win_max else _BAD_DATE_RANGE

        if effective == "semana":
            return [d.isoformat() for d in window_dates]

        # "finde": nearest Sat+Sun within the window from today/win_min onwards.
        # (5 - weekday) % 7 → days until next Saturday (0 if already Saturday).
        start_search = max(today, win_min)
        days_to_sat = (5 - start_search.weekday()) % 7
        first_sat = start_search + timedelta(days=days_to_sat)

        finde_dates: list[_Date] = []
        if first_sat <= win_max:
            finde_dates.append(first_sat)
            first_sun = first_sat + timedelta(days=1)
            if first_sun <= win_max:
                finde_dates.append(first_sun)

        if not finde_dates:
            # No Saturday reachable from start_search — try nearest Sunday
            days_to_sun = (6 - start_search.weekday()) % 7
            first_sun_only = start_search + timedelta(days=days_to_sun)
            if first_sun_only <= win_max:
                finde_dates.append(first_sun_only)

        if not finde_dates:
            # Spec fallback: latest weekend day(s) anywhere within the window
            candidate = win_max
            while candidate >= win_min and len(finde_dates) < 2:
                if candidate.weekday() in (5, 6):
                    finde_dates.insert(0, candidate)
                candidate -= timedelta(days=1)

        if not finde_dates:
            return _BAD_DATE_RANGE

        return [d.isoformat() for d in sorted(set(finde_dates))]

    return _BAD_DATE_RANGE
