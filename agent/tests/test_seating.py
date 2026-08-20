"""Comprehensive tests for cinepais_agent.seating domain logic."""

from __future__ import annotations

from collections.abc import Callable
from random import Random
from typing import cast

from cinepais_agent.seating import (
    MAX_SEATS,
    ROOM_LAYOUTS,
    SeatForAdjacency,
    find_adjacent,
    normalize_room,
    would_leave_orphan,
)

# ---------------------------------------------------------------------------
# Fixture helpers — tiers come from the PRODUCTION rule, never the proportional one
# ---------------------------------------------------------------------------


def _fixed_cutoff_tier(row: int) -> str:
    """Assign a quality tier the way PRODUCTION does: fixed cutoffs, room size ignored.

    This mirrors web/prisma/seed.ts `getSeatMeta()`, which is what actually writes
    `qualityTier` into the database. Those values reach `find_adjacent` on the wire
    (read API → models.Seat.qualityTier), so a fixture that invents tiers by any other
    rule is testing a room the product never serves.

    Deliberately NOT `seating.row_to_tier`, the proportional port of the dead
    web/src/lib/business/quality.ts rule (zero production call sites). The two rules
    disagree on real rows — IMAX row 3 is `optimal` proportionally (3/13 = 0.2308 > 0.23)
    but `low` in production — which moves the optimal band from rows 3-8 (centre 5.5) to
    rows 4-8 (centre 6.0). Ranking is scored against that band centre, so a fixture built
    on the dead rule would let the ranking be tuned to a band production does not have.
    """
    if row <= 3:
        return "low"
    if row >= 9:
        return "high"
    return "optimal"


def _room_field(room_key: str, field: str) -> int:
    return cast(int, ROOM_LAYOUTS[room_key][field])


def _room_blocks(room_key: str) -> list[tuple[int, int]]:
    return cast("list[tuple[int, int]]", ROOM_LAYOUTS[room_key]["blocks"])


def _expected_room_centre(room_key: str) -> float:
    # Re-derived per room, never a literal: imax 20 cols → 10.5, 2d 15 → 8.0,
    # premium 10 → 5.5. Copying IMAX's value into a Premium test asserts nothing.
    return (1 + _room_field(room_key, "cols")) / 2


def _area_of(room_key: str, col: int) -> int:
    for index, (start, end) in enumerate(_room_blocks(room_key), start=1):
        if start <= col <= end:
            return index
    raise AssertionError(f"col {col} is outside every block of room {room_key}")


def _make_room(
    room_key: str,
    is_available: Callable[[int, int], bool] = lambda row, col: True,
    area_category: str = "general",
) -> list[SeatForAdjacency]:
    """Build EVERY seat of a room — sold and available alike — with production tiers.

    Dimensions and blocks come from ROOM_LAYOUTS; `seatId` uses production's
    `area_row_col` shape; tiers come from `_fixed_cutoff_tier`.

    The full grid matters: `find_adjacent` derives each quality band's centre from the
    rows present in the list it is given, and all three production callers hand it every
    seat of the showtime. Passing only the available seats would make the band centres
    drift with occupancy and the expected ranking un-reproducible.
    """
    seats: list[SeatForAdjacency] = []
    for row in range(1, _room_field(room_key, "rows") + 1):
        tier = _fixed_cutoff_tier(row)
        for col in range(1, _room_field(room_key, "cols") + 1):
            area = _area_of(room_key, col)
            status = "Available" if is_available(row, col) else "Sold"
            seats.append(
                SeatForAdjacency(
                    f"{area}_{row}_{col}",
                    row,
                    col,
                    area,
                    status,  # type: ignore[arg-type]
                    area_category,
                    tier,
                )
            )
    return seats


def _band_rows(seats: list[SeatForAdjacency], tier: str) -> tuple[int, int]:
    rows = [s.row for s in seats if s.qualityTier == tier]
    return min(rows), max(rows)


def _cols(group: list[SeatForAdjacency]) -> list[int]:
    return [s.col for s in group]


def _midpoint(group: list[SeatForAdjacency]) -> float:
    cols = _cols(group)
    return (cols[0] + cols[-1]) / 2


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
# Quality tiers — REQUIRED named test
#
# RETIRED: `test_tier_boundaries_match_proportional_code`, which asserted
# `row_to_tier`'s proportional rule room by room (including the explicit
# `assert row_to_tier(3, 13) == "optimal"`). That rule has ZERO production call
# sites — `grep -rn "row_to_tier" agent/` found only its own definition and that
# test — and its TypeScript original, web/src/lib/business/quality.ts, is dead
# too. It asserted behaviour the product does not have, and disagreed with the
# tiers the read API actually serves. Replaced below by the production rule.
# `row_to_tier` itself is deleted in Todo 26; this only stops testing it.
# ---------------------------------------------------------------------------


def test_fixed_cutoff_tiers_match_production_seed() -> None:
    """Pins the tier rule fixtures must use: the FIXED cutoffs, in every room size.

    Fixed cutoffs are what web/prisma/seed.ts `getSeatMeta()` writes and therefore
    what `qualityTier` holds by the time `find_adjacent` sees a seat. Room height is
    irrelevant to them, which is exactly where the retired proportional rule diverged.
    """
    for room_key in ("imax", "2d", "premium"):
        rows = _room_field(room_key, "rows")
        for row in range(1, min(3, rows) + 1):
            assert _fixed_cutoff_tier(row) == "low", f"{room_key} row {row}"
        for row in range(4, min(8, rows) + 1):
            assert _fixed_cutoff_tier(row) == "optimal", f"{room_key} row {row}"
        for row in range(9, rows + 1):
            assert _fixed_cutoff_tier(row) == "high", f"{room_key} row {row}"

    # The two rows where the retired proportional rule disagreed with production.
    # imax row 3: 3/13 = 0.2308 > 0.23 gave "optimal"; production says "low".
    assert _fixed_cutoff_tier(3) == "low"
    # premium rows 6-8: 6/9 = 0.667 > 0.62 gave "high"; production says "optimal",
    # leaving row 9 alone in premium's "high" band.
    for row in range(6, 9):
        assert _fixed_cutoff_tier(row) == "optimal"


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
    # Premium room: 9 rows × 10 cols, single block [(1,10)]
    seats = _make_room("premium", is_available=lambda row, col: (row + col) % 2 == 0)
    groups = find_adjacent(seats, 2, "premium")
    assert groups == [], f"Expected no adjacent pairs in checkerboard, got {len(groups)}"


# ---------------------------------------------------------------------------
# find_adjacent — full imax room
# ---------------------------------------------------------------------------


def _make_imax_all_available() -> list[SeatForAdjacency]:
    """Build a full 13×20 imax grid where every seat is Available."""
    return _make_room("imax")


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
# find_adjacent — centrality ranking
#
# The defect these lock down: in a fully empty room the copilot recommended the
# front-row side corner (cols 1-2) because ranking stopped at the quality tier and
# then fell through to (row, col), which sorts col 1 first.
# ---------------------------------------------------------------------------


def test_empty_imax_pair_lands_in_centre_block_not_side_wall() -> None:
    """THE REGRESSION. A fully empty IMAX room is the condition that exposed the bug.

    Asserts the block rather than exact seat ids so the test survives future
    tie-break tweaks — landing in the centre block is the property that matters.
    """
    seats = _make_room("imax")
    groups = find_adjacent(seats, 2, "imax")
    assert groups, "an empty room must offer pairs"

    centre = _expected_room_centre("imax")
    centre_block = next((s, e) for s, e in _room_blocks("imax") if s <= centre <= e)

    cols = _cols(groups[0])
    assert all(centre_block[0] <= c <= centre_block[1] for c in cols), (
        f"chosen cols {cols} are outside the centre block {centre_block}"
    )
    assert cols != [1, 2], "chose the side-wall corner — the original defect"


def test_chosen_pair_midpoint_is_near_room_centre() -> None:
    """Horizontal: the pair straddles the room's centre line, within one seat."""
    seats = _make_room("imax")
    groups = find_adjacent(seats, 2, "imax")

    centre = _expected_room_centre("imax")
    assert abs(_midpoint(groups[0]) - centre) <= 1, (
        f"cols {_cols(groups[0])} are not centred on {centre}"
    )


def test_room_centre_beats_block_centre_when_centre_block_is_nearly_sold_out() -> None:
    """THE DISCRIMINATING TEST — an empty room cannot tell the two formulas apart.

    In an empty room the room-centre metric and the rejected block-centre metric
    both pick the same pair, so the regression test above passes under either. This
    is the case that separates them: the centre block is sold out except its
    leftmost pair (cols 6-7) and the left side block is entirely free, everything in
    one optimal-band row so tiers tie and only the horizontal metric decides.

        cols 6-7  → 4.0 from the room centre (10.5), 4.0 from its block centre (10.5)
        cols 1-2  → 9.0 from the room centre,  but only 1.5 from its block centre (3.0)

    Room-centre ranks 6-7 first. Block-centre inverts it and ranks the side wall
    first — so under the rejected formula this test FAILS, which is the point of it.
    """
    seats = _make_room(
        "imax",
        is_available=lambda row, col: row == 6 and (col <= 5 or col in (6, 7)),
    )
    groups = find_adjacent(seats, 2, "imax")

    assert _cols(groups[0]) == [6, 7], f"expected the centre block pair, got {_cols(groups[0])}"
    assert _cols(groups[0]) != [1, 2], "ranked by block centre, not room centre"

    # The orphan rule already dropped cols 2-3 and 3-4 (both strand a single seat).
    assert [_cols(g) for g in groups] == [[6, 7], [4, 5], [1, 2]]


def test_chosen_row_is_near_the_optimal_band_centre_not_its_first_row() -> None:
    """Vertical: within the winning tier, rank toward the middle of that band."""
    seats = _make_room("imax")
    groups = find_adjacent(seats, 2, "imax")

    band_first, band_last = _band_rows(seats, "optimal")
    band_centre = (band_first + band_last) / 2
    row = groups[0][0].row

    assert groups[0][0].qualityTier == "optimal"
    assert row != band_first, f"row {row} is the band's front edge, not its middle"
    assert abs(row - band_centre) < abs(row - band_first)
    assert abs(row - band_centre) < abs(row - band_last)


def test_tier_dominates_centrality() -> None:
    """Quality outranks centrality: a dead-centre `low` pair loses to an `optimal` one.

    Centrality is a tie-break inside a tier, never a way to climb out of one.
    """
    seats = _make_room(
        "imax",
        is_available=lambda row, col: (
            (row == 2 and col in (10, 11)) or (row == 6 and col in (1, 2))
        ),
    )
    groups = find_adjacent(seats, 2, "imax")

    assert len(groups) == 2
    assert groups[0][0].qualityTier == "optimal"
    assert _cols(groups[0]) == [1, 2], "the optimal pair must win despite hugging the wall"
    assert groups[1][0].qualityTier == "low"
    assert _cols(groups[1]) == [10, 11], "the low pair is dead centre and still loses"


def test_returns_edge_seats_rather_than_nothing() -> None:
    """Never discourages the sale: bad seats still beat no answer.

    Only the front-row side corner survives — the worst pair in the house, and the
    one the ranking is built to avoid. It must still be offered.
    """
    seats = _make_room("imax", is_available=lambda row, col: row == 1 and col in (1, 2))
    groups = find_adjacent(seats, 2, "imax")

    assert groups, "refused to offer the only remaining pair"
    assert [_cols(g) for g in groups] == [[1, 2]]
    assert groups[0][0].row == 1


def test_ranking_is_deterministic() -> None:
    """Same seats, same order out — including when the input arrives shuffled.

    The sort key ends in (row, first_col), which is unique per group, so the
    ordering is total and cannot depend on the order seats were read in.
    """
    seats = _make_room("imax")

    def ranked(source: list[SeatForAdjacency]) -> list[list[str]]:
        return [[s.seatId for s in g] for g in find_adjacent(source, 2, "imax")]

    expected = ranked(seats)
    assert ranked(seats) == expected

    shuffled = list(seats)
    Random(20260819).shuffle(shuffled)
    assert sorted(s.seatId for s in shuffled) == sorted(s.seatId for s in seats)
    assert ranked(shuffled) == expected, "ranking depends on the order seats arrived in"


def test_centring_holds_in_premium_room() -> None:
    """Premium is 9×10 with ONE block, so "in the centre block" is vacuously true.

    Room centre is the only meaningful assertion here. Premium is also where the
    retired proportional rule diverges hardest: it marked rows 6-9 `high`, while
    production leaves row 9 alone in that band — which moves the optimal band centre
    from 4.0 to 6.0 and would pick a different row.
    """
    seats = _make_room("premium")
    assert len(_room_blocks("premium")) == 1
    assert _band_rows(seats, "high") == (9, 9), "the dead proportional rule leaked in"

    groups = find_adjacent(seats, 2, "premium")
    centre = _expected_room_centre("premium")
    band_first, band_last = _band_rows(seats, "optimal")

    assert abs(_midpoint(groups[0]) - centre) <= 1, (
        f"cols {_cols(groups[0])} are not centred on {centre}"
    )
    assert groups[0][0].qualityTier == "optimal"
    assert abs(groups[0][0].row - (band_first + band_last) / 2) < 1


def test_centring_holds_in_2d_room() -> None:
    """2D is 12×15, so its centre (8.0) is a whole column — an off-by-one trap.

    A pair can never sit exactly on it (two seats midpoint at a half column), so
    the best achievable distance is 0.5, not 0.
    """
    seats = _make_room("2d")
    groups = find_adjacent(seats, 2, "2d")

    centre = _expected_room_centre("2d")
    centre_block = next((s, e) for s, e in _room_blocks("2d") if s <= centre <= e)
    cols = _cols(groups[0])

    assert abs(_midpoint(groups[0]) - centre) <= 1, f"cols {cols} are not centred on {centre}"
    assert all(centre_block[0] <= c <= centre_block[1] for c in cols)
    assert groups[0][0].qualityTier == "optimal"


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
