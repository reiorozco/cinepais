"""Seating domain logic — faithful Python port of the TypeScript business rules.

Port targets:
- web/src/lib/business/layout.ts  → ROOM_LAYOUTS, normalize_room
- web/src/lib/business/orphan.ts  → would_leave_orphan
- web/src/lib/business/selection.ts (block-scoped logic) → find_adjacent

NOTE on quality tiers: this module does not compute them. `qualityTier` arrives on
every seat over the read API wire (models.Seat.qualityTier) and originates in
web/prisma/seed.ts's `getSeatMeta()`, which uses FIXED cutoffs regardless of room
size — row ≤ 3 "low", rows 4-8 "optimal", row ≥ 9 "high". There is no proportional
formula anywhere in the shipped product.
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
# Ranking helpers (centrality)
# ---------------------------------------------------------------------------


def _room_centre_col(layout_key: str) -> float:
    """Horizontal centre of the whole room: ``(1 + cols) / 2``.

    Columns are 1-based, so a room of `cols` columns is centred on the midpoint
    between column 1 and column `cols`. Read from ROOM_LAYOUTS — never hardcoded,
    since the three rooms differ: imax 20 cols → 10.5, 2d 15 cols → 8.0,
    premium 10 cols → 5.5.

    Deliberately the centre of the ROOM, not the centre of a seat block. Scoring
    each group against its own block's centre would rank a pair hugging a side
    wall above a pair inside the true centre block (imax row 6: cols 1-2 sit 1.5
    from their block centre but 9.0 from the room centre, while cols 6-7 sit 4.0
    from both) — which is the front/side-corner defect this ranking exists to fix.
    """
    layout = ROOM_LAYOUTS[layout_key]
    cols: int = layout["cols"]  # type: ignore[assignment]
    return (1 + cols) / 2


def _band_centre_rows(seats: list[SeatForAdjacency]) -> dict[str, float]:
    """Vertical centre of each quality band: ``(min_row + max_row) / 2`` per tier.

    Bounds are derived from the rows actually present per `qualityTier` in the
    given seats. Callers always pass EVERY seat of the showtime — sold and
    available alike — so the bounds are a property of the room layout and do not
    drift with occupancy. Deriving them from available seats only would move each
    band's centre from one showtime to the next.

    This is also why the bounds are read from the data rather than recomputed:
    `qualityTier` is written by web/prisma/seed.ts `getSeatMeta()`, which uses
    FIXED cutoffs regardless of room size (row ≤ 3 low, rows 4-8 optimal, row ≥ 9
    high), and the "high" band is open-ended upwards, so its centre cannot be
    derived from the cutoffs alone anyway.
    """
    bounds: dict[str, tuple[int, int]] = {}
    for seat in seats:
        min_row, max_row = bounds.get(seat.qualityTier, (seat.row, seat.row))
        bounds[seat.qualityTier] = (min(min_row, seat.row), max(max_row, seat.row))
    return {tier: (min_row + max_row) / 2 for tier, (min_row, max_row) in bounds.items()}


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

    Returns groups ordered lexicographically by
    (tier_preference desc, horizontal_distance asc, vertical_distance asc, row asc, col asc).
    - tier_preference: optimal=3, high=2, low=1
    - horizontal_distance: |group midpoint col - room centre col| (see _room_centre_col)
    - vertical_distance: |row - centre of the group's quality band| (see _band_centre_rows)

    Horizontal dominates vertical because sitting in the wrong block is the worse
    defect; (row, col) is the final tiebreak so the order stays reproducible.
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

    room_centre_col = _room_centre_col(layout_key)
    band_centre_rows = _band_centre_rows(seats)

    def _sort_key(group: list[SeatForAdjacency]) -> tuple[int, float, float, int, int]:
        row = group[0].row
        first_col = group[0].col
        last_col = group[-1].col
        tier = group[0].qualityTier

        # Midpoint of the run; lands between seats for even n (cols 10-11 → 10.5).
        # Compared as floats — never rounded.
        group_centre_col = (first_col + last_col) / 2
        horizontal_distance = abs(group_centre_col - room_centre_col)
        vertical_distance = abs(row - band_centre_rows.get(tier, float(row)))

        return (
            -_TIER_PREF.get(tier, 0),
            horizontal_distance,
            vertical_distance,
            row,
            first_col,
        )

    return sorted(groups, key=_sort_key)
