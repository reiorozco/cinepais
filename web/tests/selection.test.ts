import { describe, test, expect } from "vitest";
import { selectionReducer } from "../src/lib/business/selection";
import type { SelectionState, SeatForSelection } from "../src/lib/business/selection";
import type { SeatStatus } from "../src/lib/business/orphan";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ST = "st-test";

const INITIAL: SelectionState = {
  showtimeId: ST,
  selectedSeatIds: new Set<string>(),
  error: null,
};

function makeSeat(
  col: number,
  row = 1,
  status: SeatStatus = "Available",
  areaCategory = "general",
): SeatForSelection {
  return { seatId: `${row}_${col}`, col, row, status, areaCategory };
}

function makeRow(
  cols: number[],
  row = 1,
  overrides: Partial<Record<number, Partial<SeatForSelection>>> = {},
): SeatForSelection[] {
  return cols.map((col) => ({ ...makeSeat(col, row), ...overrides[col] }));
}

// ---------------------------------------------------------------------------
// 1. max-4 block
// ---------------------------------------------------------------------------

describe("selectionReducer — max-4 rule", () => {
  test("selecting a 5th seat returns state unchanged with error 'max'", () => {
    const blocks: [number, number][] = [[1, 10]];
    const row = makeRow([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    const stateWith4: SelectionState = {
      showtimeId: ST,
      selectedSeatIds: new Set(["1_1", "1_2", "1_3", "1_4"]),
      error: null,
    };

    const next = selectionReducer(stateWith4, {
      type: "toggle",
      showtimeId: ST,
      seat: row[4], // col 5
      rowSeats: row,
      blocks,
    });

    expect(next.error).toBe("max");
    expect(next.selectedSeatIds.size).toBe(4); // unchanged
    expect(next.selectedSeatIds.has(row[4].seatId)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. orphan via reducer
// ---------------------------------------------------------------------------

describe("selectionReducer — orphan rule", () => {
  test("cols c and c+2 selected → c+1 is orphaned → error 'orphan', state unchanged", () => {
    const blocks: [number, number][] = [[1, 5]];
    const row = makeRow([1, 2, 3, 4, 5]);

    // Select col 1 first (should succeed)
    const s1 = selectionReducer(INITIAL, {
      type: "toggle",
      showtimeId: ST,
      seat: row[0], // col 1
      rowSeats: row,
      blocks,
    });
    expect(s1.error).toBeNull();

    // Select col 3 → col 2 is isolated between col1(Sold) and col3(selecting)
    const s2 = selectionReducer(s1, {
      type: "toggle",
      showtimeId: ST,
      seat: row[2], // col 3
      rowSeats: row,
      blocks,
    });

    expect(s2.error).toBe("orphan");
    expect(s2.selectedSeatIds.size).toBe(1); // state unchanged
    expect(s2.selectedSeatIds.has(row[0].seatId)).toBe(true);
    expect(s2.selectedSeatIds.has(row[2].seatId)).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // 6. block-edge orphan
  // ---------------------------------------------------------------------------

  test("block-edge orphan: Sold at start+1, selecting start+2 leaves start orphan → error 'orphan'", () => {
    const blocks: [number, number][] = [[1, 8]];
    // col 1 = Available (block start), col 2 = Sold (start+1), col 3 = Available (to select, start+2)
    const row = makeRow([1, 2, 3, 4, 5, 6, 7, 8], 1, {
      2: { status: "Sold" as SeatStatus },
    });

    // Selecting col 3 leaves col 1 isolated: left-edge | col1(A) | col2(Sold) | col3(Sold/selected)
    const result = selectionReducer(INITIAL, {
      type: "toggle",
      showtimeId: ST,
      seat: row[2], // col 3
      rowSeats: row,
      blocks,
    });

    expect(result.error).toBe("orphan");
    expect(result.selectedSeatIds.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. deselect allowed  /  4. dedup
// ---------------------------------------------------------------------------

describe("selectionReducer — deselect and dedup", () => {
  test("toggling a selected seat removes it without error (deselect always allowed)", () => {
    const blocks: [number, number][] = [[1, 5]];
    const row = makeRow([1, 2, 3, 4, 5]);
    const seat = row[0]; // col 1

    const s1 = selectionReducer(INITIAL, {
      type: "toggle",
      showtimeId: ST,
      seat,
      rowSeats: row,
      blocks,
    });
    expect(s1.selectedSeatIds.has(seat.seatId)).toBe(true);

    const s2 = selectionReducer(s1, {
      type: "toggle",
      showtimeId: ST,
      seat,
      rowSeats: row,
      blocks,
    });
    expect(s2.selectedSeatIds.has(seat.seatId)).toBe(false);
    expect(s2.error).toBeNull();
    expect(s2.selectedSeatIds.size).toBe(0);
  });

  test("toggling same seat twice returns to empty selection (dedup)", () => {
    const blocks: [number, number][] = [[1, 5]];
    const row = makeRow([1, 2, 3, 4, 5]);
    const seat = row[2]; // col 3

    const s1 = selectionReducer(INITIAL, {
      type: "toggle",
      showtimeId: ST,
      seat,
      rowSeats: row,
      blocks,
    });
    expect(s1.selectedSeatIds.size).toBe(1);

    const s2 = selectionReducer(s1, {
      type: "toggle",
      showtimeId: ST,
      seat,
      rowSeats: row,
      blocks,
    });
    expect(s2.selectedSeatIds.size).toBe(0);
    expect(s2.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. per-block isolation
// ---------------------------------------------------------------------------

describe("selectionReducer — per-block isolation", () => {
  test("last col of block 1 selected + first col of block 2 available ≠ orphan (different blocks)", () => {
    // Block 1 = cols 1-5 (cols 1-4 Sold, col 5 the only Available in block 1)
    // Block 2 = cols 6-10 (all Available)
    // Selecting col 5 should NOT trigger orphan: block 1 has no Available left, block 2 untouched
    const blocks: [number, number][] = [[1, 5], [6, 10]];
    const row = makeRow([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 1, {
      1: { status: "Sold" as SeatStatus },
      2: { status: "Sold" as SeatStatus },
      3: { status: "Sold" as SeatStatus },
      4: { status: "Sold" as SeatStatus },
    });

    const seat = row[4]; // col 5 — last of block 1
    const result = selectionReducer(INITIAL, {
      type: "toggle",
      showtimeId: ST,
      seat,
      rowSeats: row,
      blocks,
    });

    // Block 1: [Sold,Sold,Sold,Sold,Sold] → no Available left → NOT orphan
    // Block 2: [A,A,A,A,A] → no selection → NOT orphan
    expect(result.error).toBeNull();
    expect(result.selectedSeatIds.has(seat.seatId)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. wheelchair exemption
// ---------------------------------------------------------------------------

describe("selectionReducer — wheelchair exemption", () => {
  test("available wheelchair seat adjacent to selection is treated as Sold → no orphan error", () => {
    const blocks: [number, number][] = [[1, 10]];
    // Without exemption: col4(wheelchair,Available) would be isolated → orphan
    // With exemption: col4 treated as Sold → no orphan (no remaining Available between sold)
    const row: SeatForSelection[] = [
      makeSeat(1, 1, "Sold"),
      makeSeat(2, 1, "Sold"),
      makeSeat(3, 1, "Sold"),
      makeSeat(4, 1, "Available", "wheelchair"), // treated as Sold in orphan check
      makeSeat(5, 1, "Available"),               // the seat being selected
      makeSeat(6, 1, "Sold"),
      makeSeat(7, 1, "Sold"),
      makeSeat(8, 1, "Sold"),
      makeSeat(9, 1, "Sold"),
      makeSeat(10, 1, "Sold"),
    ];

    const result = selectionReducer(INITIAL, {
      type: "toggle",
      showtimeId: ST,
      seat: row[4], // col 5
      rowSeats: row,
      blocks,
    });

    expect(result.error).toBeNull();
    expect(result.selectedSeatIds.has(row[4].seatId)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8. block-local index in range
// ---------------------------------------------------------------------------

describe("selectionReducer — block-local index guard", () => {
  test("selecting first and last col of each block stays within valid index range", () => {
    // IMAX blocks: [[1,5],[6,15],[16,20]] — test boundary cols (local idx 0 and end-start)
    const blocks: [number, number][] = [[1, 5], [6, 15], [16, 20]];
    const row = Array.from({ length: 20 }, (_, i) => makeSeat(i + 1, 1));

    // col 1 → local idx = 1-1 = 0, slice.length = 5  → valid (0 ≥ 0 && 0 < 5)
    const s1 = selectionReducer(INITIAL, {
      type: "toggle",
      showtimeId: ST,
      seat: row[0], // col 1
      rowSeats: row,
      blocks,
    });
    expect(s1.error).toBeNull();
    expect(s1.selectedSeatIds.has(row[0].seatId)).toBe(true);

    // col 20 → local idx = 20-16 = 4, slice.length = 5 → valid (4 ≥ 0 && 4 < 5)
    // After selecting col1 & col20: block1 has cols2-5 together (4 seats, not orphan)
    //                               block3 has cols16-19 together (4 seats, not orphan)
    const s2 = selectionReducer(s1, {
      type: "toggle",
      showtimeId: ST,
      seat: row[19], // col 20
      rowSeats: row,
      blocks,
    });
    expect(s2.error).toBeNull();
    expect(s2.selectedSeatIds.has(row[19].seatId)).toBe(true);
  });
});
