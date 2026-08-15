"""Seating domain logic — faithful Python port of the TypeScript business rules.

Port targets:
- web/src/lib/business/layout.ts  → ROOM_LAYOUTS, normalize_room
- web/src/lib/business/quality.ts → row_to_tier
- web/src/lib/business/orphan.ts  → would_leave_orphan
- web/src/lib/business/selection.ts (block-scoped logic) → find_adjacent

NOTE on tier boundaries: web/README.md prose says "rows 1-3 low, 4-8 optimal" for a
13-row room, but the CODE uses a proportional formula (pct = row / max_row). The CODE
is canonical. row 3/13 ≈ 0.2308 > 0.23, so row 3 is "optimal", not "low".
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Literal

# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

SeatStatus = Literal["Available", "Sold"]
QualityTier = Literal["low", "optimal", "high"]
RoomKey = Literal["imax", "2d", "premium"]

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAX_SEATS = 4

# Blocks are 1-based inclusive (col_start, col_end) ranges.
ROOM_LAYOUTS: dict[str, dict[str, object]] = {
    "imax": {"rows": 13, "cols": 20, "blocks": [(1, 5), (6, 15), (16, 20)]},
    "2d": {"rows": 12, "cols": 15, "blocks": [(1, 4), (5, 11), (12, 15)]},
    "premium": {"rows": 9, "cols": 10, "blocks": [(1, 10)]},
}

_TIER_PREF: dict[str, int] = {"optimal": 3, "high": 2, "low": 1}


# ---------------------------------------------------------------------------
# Layout helpers
# ---------------------------------------------------------------------------


def normalize_room(room: str) -> str:
    """Port of normalizeRoom from layout.ts.

    "imax" → "imax", starts-with "2d" → "2d", anything else → "premium".
    """
    if room == "imax":
        return "imax"
    if room.startswith("2d"):
        return "2d"
    return "premium"


# ---------------------------------------------------------------------------
# Quality tier
# ---------------------------------------------------------------------------


def row_to_tier(row: int, max_row: int) -> QualityTier:
    """Port of rowToTier from quality.ts.

    Uses proportional formula: pct = row / max_row.
    - pct ≤ 0.23  → "low"
    - pct ≤ 0.62  → "optimal"
    - pct > 0.62  → "high"

    NOTE: README prose differs from this formula; the formula is canonical.
    """
    pct = row / max_row
    if pct <= 0.23:
        return "low"
    if pct <= 0.62:
        return "optimal"
    return "high"


# ---------------------------------------------------------------------------
# Orphan rule
# ---------------------------------------------------------------------------


def would_leave_orphan(
    row_availability: list[SeatStatus],
    selection: list[int],
    aisle_cols: set[int],
) -> bool:
    """Port of wouldLeaveOrphan from orphan.ts.

    Returns True iff the proposed selection leaves exactly one Available seat
    isolated between Sold/selected/aisle/edge on both sides.

    NOTE: aisle_cols exists only for API parity with the TS signature.
    In this codebase callers always pass set() because blocks are the walls
    (web/src/lib/business/selection.ts:138 passes empty aisles per block slice).

    Wheelchair seats are treated as Sold in the check (exemption): callers set
    wheelchair seats to "Sold" in row_availability before calling.
    """
    sel_set = set(selection)
    n = len(row_availability)

    post_state: list[SeatStatus] = [
        "Sold" if i in sel_set else row_availability[i] for i in range(n)
    ]

    i = 0
    while i < n:
        if post_state[i] == "Available" and i not in aisle_cols:
            group_end = i
            while (
                group_end + 1 < n
                and post_state[group_end + 1] == "Available"
                and (group_end + 1) not in aisle_cols
            ):
                group_end += 1
            if group_end - i + 1 == 1:
                return True
            i = group_end + 1
        else:
            i += 1
    return False


# ---------------------------------------------------------------------------
# Seat dataclass for adjacency search
# ---------------------------------------------------------------------------


@dataclass
class SeatForAdjacency:
    seatId: str
    row: int
    col: int
    area: int
    status: SeatStatus
    areaCategory: str
    qualityTier: str


# ---------------------------------------------------------------------------
# Adjacent group finder
# ---------------------------------------------------------------------------


def find_adjacent(
    seats: list[SeatForAdjacency],
    n: int,
    room: str,
) -> list[list[SeatForAdjacency]]:
    """Find groups of exactly n contiguous available seats in the same row and block.

    Block boundaries act as walls — there are NO aisle columns in this data model.
    Wheelchair/preferential seats are excluded from default groups.
    Groups are filtered to be orphan-safe.

    Returns groups ordered by (tier_preference desc, row asc, col asc).
    - tier_preference: optimal=3, high=2, low=1
    """
    layout_key = normalize_room(room)
    layout = ROOM_LAYOUTS[layout_key]
    blocks: list[tuple[int, int]] = layout["blocks"]  # type: ignore[assignment]

    by_row: dict[int, list[SeatForAdjacency]] = defaultdict(list)
    for seat in seats:
        by_row[seat.row].append(seat)

    groups: list[list[SeatForAdjacency]] = []

    for row_num, row_seats in by_row.items():
        row_seats_sorted = sorted(row_seats, key=lambda s: s.col)

        for block_start, block_end in blocks:
            block_seats = [s for s in row_seats_sorted if block_start <= s.col <= block_end]

            # Build availability map for orphan check (0-based within block).
            # Seats absent from data are Sold; wheelchair treated as Sold.
            block_len = block_end - block_start + 1
            row_avail: list[SeatStatus] = ["Sold"] * block_len
            for s in block_seats:
                local_idx = s.col - block_start
                if s.areaCategory == "wheelchair":
                    row_avail[local_idx] = "Sold"
                else:
                    row_avail[local_idx] = s.status

            candidates = [
                s
                for s in block_seats
                if s.status == "Available" and s.areaCategory not in ("wheelchair", "preferential")
            ]

            for i in range(len(candidates) - n + 1):
                group = candidates[i : i + n]
                cols = [s.col for s in group]
                if cols != list(range(cols[0], cols[0] + n)):
                    continue

                local_selection = [s.col - block_start for s in group]
                if would_leave_orphan(row_avail, local_selection, set()):
                    continue

                groups.append(group)

    def _sort_key(group: list[SeatForAdjacency]) -> tuple[int, int, int]:
        return (-_TIER_PREF.get(group[0].qualityTier, 0), group[0].row, group[0].col)

    return sorted(groups, key=_sort_key)
