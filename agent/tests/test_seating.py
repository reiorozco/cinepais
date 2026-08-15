"""Comprehensive tests for cinepais_agent.seating domain logic."""

from __future__ import annotations

from cinepais_agent.seating import (
    MAX_SEATS,
    ROOM_LAYOUTS,
    SeatForAdjacency,
    find_adjacent,
    normalize_room,
    row_to_tier,
    would_leave_orphan,
)

# ---------------------------------------------------------------------------
# normalize_room
# ---------------------------------------------------------------------------


def test_normalize_room() -> None:
    assert normalize_room("imax") == "imax"
    assert normalize_room("2d") == "2d"
    assert normalize_room("2d-1") == "2d"
    assert normalize_room("2d-standard") == "2d"
    assert normalize_room("premium") == "premium"
    assert normalize_room("premium-1") == "premium"
    assert normalize_room("vip") == "premium"
    assert normalize_room("unknown") == "premium"


# ---------------------------------------------------------------------------
# row_to_tier — REQUIRED named test
# ---------------------------------------------------------------------------


def test_tier_boundaries_match_proportional_code() -> None:
    """
    Asserts exact tier triplets derived from the proportional formula (pct = row/max_row),
    NOT from README prose. The formula is canonical.

    13-row imax:   rows 1-2 → low, rows 3-8 → optimal, rows 9-13 → high
    12-row 2d:     rows 1-2 → low, rows 3-7 → optimal, rows 8-12 → high
    9-row premium: rows 1-2 → low, rows 3-5 → optimal, rows 6-9  → high
    """
    # 13-row imax
    for row in range(1, 3):  # 1, 2
        assert row_to_tier(row, 13) == "low", f"imax row {row} expected low"
    for row in range(3, 9):  # 3, 4, 5, 6, 7, 8
        assert row_to_tier(row, 13) == "optimal", f"imax row {row} expected optimal"
    for row in range(9, 14):  # 9-13
        assert row_to_tier(row, 13) == "high", f"imax row {row} expected high"

    # row 3 in imax: 3/13 ≈ 0.2308 > 0.23 → optimal (NOT low; README prose is wrong)
    assert row_to_tier(3, 13) == "optimal"

    # 12-row 2d
    for row in range(1, 3):  # 1, 2
        assert row_to_tier(row, 12) == "low", f"2d row {row} expected low"
    for row in range(3, 8):  # 3-7
        assert row_to_tier(row, 12) == "optimal", f"2d row {row} expected optimal"
    for row in range(8, 13):  # 8-12
        assert row_to_tier(row, 12) == "high", f"2d row {row} expected high"

    # 9-row premium
    for row in range(1, 3):  # 1, 2
        assert row_to_tier(row, 9) == "low", f"premium row {row} expected low"
    for row in range(3, 6):  # 3-5
        assert row_to_tier(row, 9) == "optimal", f"premium row {row} expected optimal"
    for row in range(6, 10):  # 6-9
        assert row_to_tier(row, 9) == "high", f"premium row {row} expected high"


# ---------------------------------------------------------------------------
# would_leave_orphan — basic
# ---------------------------------------------------------------------------


def test_would_leave_orphan_basic() -> None:
    # [A, A, A] select middle → leaves A on each side → group of 1 → orphan
    avail: list = ["Available", "Available", "Available"]
    assert would_leave_orphan(avail, [1], set()) is True


def test_would_leave_orphan_no_orphan() -> None:
    # [A, A, S] select [0, 1] → all remaining are Sold → no orphan
    avail: list = ["Available", "Available", "Sold"]
    assert would_leave_orphan(avail, [0, 1], set()) is False


def test_would_leave_orphan_edge_selection() -> None:
    # [A, A, A, A] select [0, 1] → remaining [2,3] is group of 2 → no orphan
    avail: list = ["Available", "Available", "Available", "Available"]
    assert would_leave_orphan(avail, [0, 1], set()) is False


def test_would_leave_orphan_creates_single_isolated() -> None:
    # [S, A, A, A, S] select [1, 3] → pos 2 is isolated between Sold and Sold
    avail: list = ["Sold", "Available", "Available", "Available", "Sold"]
    assert would_leave_orphan(avail, [1, 3], set()) is True


def test_would_leave_orphan_full_block_selected() -> None:
    # All selected → no remaining Available → no orphan
    avail: list = ["Available", "Available", "Available"]
    assert would_leave_orphan(avail, [0, 1, 2], set()) is False


# ---------------------------------------------------------------------------
# Wheelchair exemption — REQUIRED named test
# ---------------------------------------------------------------------------


def test_orphan_wheelchair_exemption() -> None:
    """
    Wheelchair seats are treated as Sold in the orphan check.
    Selecting seats adjacent to a wheelchair seat must NOT trigger the orphan rule
    because the wheelchair seat is already Sold in row_avail (callers set it).
    """
    # Row: [WC(Sold), A, A, A, A]  — wheelchair at idx 0 is already Sold in row_avail
    # Selecting [1, 2] leaves [3, 4] as a group of 2 → no orphan
    row_avail: list = ["Sold", "Available", "Available", "Available", "Available"]
    assert would_leave_orphan(row_avail, [1, 2], set()) is False

    # Selecting [2, 3] leaves A at idx 1 (isolated between Sold@0 and Sold@2→selected)
    # and A at idx 4 (edge, group of 1 between Sold@3→selected and edge) → orphan
    assert would_leave_orphan(row_avail, [2, 3], set()) is True

    # Selecting [3, 4] leaves A at [1,2], group of 2 adjacent, no orphan
    assert would_leave_orphan(row_avail, [3, 4], set()) is False

    # Via find_adjacent: a wheelchair seat in a block should NOT appear in default groups
    seats = [
        SeatForAdjacency("wc_r1c1", 1, 1, 1, "Available", "wheelchair", "low"),
        SeatForAdjacency("r1c2", 1, 2, 1, "Available", "standard", "low"),
        SeatForAdjacency("r1c3", 1, 3, 1, "Available", "standard", "low"),
        SeatForAdjacency("r1c4", 1, 4, 1, "Available", "standard", "low"),
    ]
    groups = find_adjacent(seats, 2, "2d")
    # wc seat must never appear in any group
    for g in groups:
        for s in g:
            assert s.areaCategory != "wheelchair", "wheelchair seat appeared in group"


# ---------------------------------------------------------------------------
# Block boundary — REQUIRED named test
# ---------------------------------------------------------------------------


def test_group_stays_within_block() -> None:
    """
    find_adjacent must never return a group spanning two blocks.
    imax block 1 ends at col 5, block 2 starts at col 6.
    A group [col5, col6] must not be returned.
    """
    # Place available seats at cols 4,5,6,7 in row 1 of an imax room.
    seats = [
        SeatForAdjacency(f"r1c{c}", 1, c, 1, "Available", "standard", "optimal")
        for c in [4, 5, 6, 7]
    ]
    groups = find_adjacent(seats, 2, "imax")
    for group in groups:
        cols = [s.col for s in group]
        assert not (5 in cols and 6 in cols), f"Group spans block boundary: cols={cols}"


# ---------------------------------------------------------------------------
# Checkerboard — REQUIRED named test
# ---------------------------------------------------------------------------


def test_checkerboard_has_no_adjacent_pairs() -> None:
    """
    A checkerboard pattern (alternating Available/Sold) has no two adjacent
    Available seats, so find_adjacent with n=2 must return [].
    """
    seats = []
    # Premium room: 9 rows × 10 cols, single block [(1,10)]
    max_row = 9
    for row in range(1, max_row + 1):
        for col in range(1, 11):
            status: str = "Available" if (row + col) % 2 == 0 else "Sold"
            tier = row_to_tier(row, max_row)
            seats.append(
                SeatForAdjacency(
                    f"r{row}c{col}",
                    row,
                    col,
                    1,
                    status,  # type: ignore[arg-type]
                    "standard",
                    tier,
                )
            )
    groups = find_adjacent(seats, 2, "premium")
    assert groups == [], f"Expected no adjacent pairs in checkerboard, got {len(groups)}"


# ---------------------------------------------------------------------------
# find_adjacent — full imax room
# ---------------------------------------------------------------------------


def _make_imax_all_available() -> list[SeatForAdjacency]:
    """Build a full 13×20 imax grid where all seats are Available (standard)."""
    seats = []
    max_row = 13
    for row in range(1, max_row + 1):
        tier = row_to_tier(row, max_row)
        for col in range(1, 21):
            seats.append(
                SeatForAdjacency(f"r{row}c{col}", row, col, 1, "Available", "standard", tier)
            )
    return seats


def test_find_adjacent_full_imax_room() -> None:
    """In a fully available imax room, find_adjacent(n=2) should return many groups."""
    seats = _make_imax_all_available()
    groups = find_adjacent(seats, 2, "imax")
    # imax blocks: (1-5)=5 cols, (6-15)=10 cols, (16-20)=5 cols; 13 rows
    # Block of 5: pairs at (1,2),(2,3),(3,4),(4,5) = 4 pairs
    # Block of 10: pairs at (1-9) = 9 pairs  (but orphan-safe subset may differ)
    # We just verify we get a non-empty result and all groups are within blocks.
    assert len(groups) > 0
    imax_blocks = ROOM_LAYOUTS["imax"]["blocks"]
    for group in groups:
        cols = [s.col for s in group]
        in_any_block = any(
            all(bs <= c <= be for c in cols)
            for bs, be in imax_blocks  # type: ignore[misc]
        )
        assert in_any_block, f"Group cols {cols} span block boundary"


def test_find_adjacent_returns_empty_when_no_available() -> None:
    seats = [
        SeatForAdjacency("r1c1", 1, 1, 1, "Sold", "standard", "low"),
        SeatForAdjacency("r1c2", 1, 2, 1, "Sold", "standard", "low"),
    ]
    assert find_adjacent(seats, 2, "2d") == []


def test_find_adjacent_excludes_preferential() -> None:
    seats = [
        SeatForAdjacency("r1c5", 1, 5, 1, "Available", "preferential", "optimal"),
        SeatForAdjacency("r1c6", 1, 6, 1, "Available", "standard", "optimal"),
        SeatForAdjacency("r1c7", 1, 7, 1, "Available", "standard", "optimal"),
    ]
    groups = find_adjacent(seats, 2, "imax")
    for group in groups:
        for s in group:
            assert s.areaCategory != "preferential"


# ---------------------------------------------------------------------------
# find_adjacent — ordering
# ---------------------------------------------------------------------------


def test_find_adjacent_ordering() -> None:
    """Optimal tier groups must be sorted before low-tier groups."""
    seats = [
        # Row 9 (high tier in 13-row imax): cols 6,7 (block 2)
        SeatForAdjacency("r9c6", 9, 6, 1, "Available", "standard", "high"),
        SeatForAdjacency("r9c7", 9, 7, 1, "Available", "standard", "high"),
        # Row 1 (low tier): cols 6,7 (block 2)
        SeatForAdjacency("r1c6", 1, 6, 1, "Available", "standard", "low"),
        SeatForAdjacency("r1c7", 1, 7, 1, "Available", "standard", "low"),
        # Row 5 (optimal tier): cols 6,7 (block 2)
        SeatForAdjacency("r5c6", 5, 6, 1, "Available", "standard", "optimal"),
        SeatForAdjacency("r5c7", 5, 7, 1, "Available", "standard", "optimal"),
    ]
    groups = find_adjacent(seats, 2, "imax")
    assert len(groups) == 3
    tiers = [g[0].qualityTier for g in groups]
    assert tiers[0] == "optimal", f"First group should be optimal, got {tiers}"
    assert tiers[1] == "high", f"Second group should be high, got {tiers}"
    assert tiers[2] == "low", f"Third group should be low, got {tiers}"


# ---------------------------------------------------------------------------
# MAX_SEATS constant
# ---------------------------------------------------------------------------


def test_max_seats_constant() -> None:
    assert MAX_SEATS == 4


# ---------------------------------------------------------------------------
# ROOM_LAYOUTS structure
# ---------------------------------------------------------------------------


def test_room_layouts_keys() -> None:
    assert set(ROOM_LAYOUTS.keys()) == {"imax", "2d", "premium"}
    assert ROOM_LAYOUTS["imax"]["rows"] == 13
    assert ROOM_LAYOUTS["2d"]["rows"] == 12
    assert ROOM_LAYOUTS["premium"]["rows"] == 9
