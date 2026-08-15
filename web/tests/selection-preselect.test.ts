import { describe, test, expect } from "vitest";
import { selectionReducer } from "../src/lib/business/selection";
import type {
  SelectionAction,
  SelectionState,
  SeatForSelection,
} from "../src/lib/business/selection";
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

function indexById(seats: SeatForSelection[]): Map<string, SeatForSelection> {
  return new Map(seats.map((s) => [s.seatId, s]));
}

function indexByRow(seats: SeatForSelection[]): Map<number, SeatForSelection[]> {
  const byRow = new Map<number, SeatForSelection[]>();
  for (const seat of seats) {
    const existing = byRow.get(seat.row);
    if (existing) existing.push(seat);
    else byRow.set(seat.row, [seat]);
  }
  return byRow;
}

function preselect(
  seats: SeatForSelection[],
  seatIds: string[],
  blocks: [number, number][],
  showtimeId = ST,
): SelectionAction {
  return {
    type: "preselect",
    showtimeId,
    seatIds,
    rowSeatsByRow: indexByRow(seats),
    seatsById: indexById(seats),
    blocks,
  };
}

/** cols 1..10, single row, everything Available/general, one block. */
const TEN_COL_BLOCKS: [number, number][] = [[1, 10]];
const TEN_COLS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// ---------------------------------------------------------------------------
// 1. happy path
// ---------------------------------------------------------------------------

describe("selectionReducer — preselect happy path", () => {
  test("2 valid adjacent available seats are accepted with no error", () => {
    const row = makeRow(TEN_COLS);

    const result = selectionReducer(
      INITIAL,
      preselect(row, ["1_5", "1_6"], TEN_COL_BLOCKS),
    );

    expect(result.showtimeId).toBe(ST);
    expect(result.error).toBeNull();
    expect(result.selectedSeatIds.size).toBe(2);
    expect([...result.selectedSeatIds].sort()).toEqual(["1_5", "1_6"]);
  });
});

// ---------------------------------------------------------------------------
// 2. idempotency — the React 19 StrictMode lock (load-bearing)
// ---------------------------------------------------------------------------

describe("selectionReducer — preselect idempotency", () => {
  test("running the SAME preselect action twice yields an IDENTICAL selectedSeatIds", () => {
    const row = makeRow(TEN_COLS);
    const action = preselect(row, ["1_5", "1_6"], TEN_COL_BLOCKS);

    // First application, from an empty selection.
    const first = selectionReducer(INITIAL, action);

    // Second application, replayed onto the result of the first — this is
    // exactly what React 19 StrictMode does to an effect in dev. A toggle
    // loop would deselect everything here.
    const second = selectionReducer(first, action);

    expect([...second.selectedSeatIds].sort()).toEqual(
      [...first.selectedSeatIds].sort(),
    );
    expect(second.selectedSeatIds.size).toBe(2);
    expect(second.error).toBeNull();

    // Replaying from the original state must also be stable.
    const third = selectionReducer(INITIAL, action);
    expect([...third.selectedSeatIds].sort()).toEqual(
      [...first.selectedSeatIds].sort(),
    );
  });

  test("a duplicated seatId is deduped instead of toggling the seat back off", () => {
    const row = makeRow(TEN_COLS);

    const result = selectionReducer(
      INITIAL,
      preselect(row, ["1_5", "1_5", "1_6"], TEN_COL_BLOCKS),
    );

    expect(result.selectedSeatIds.has("1_5")).toBe(true);
    expect([...result.selectedSeatIds].sort()).toEqual(["1_5", "1_6"]);
    expect(result.error).toBeNull();
  });

  test("preselect does not mutate the incoming state's selectedSeatIds", () => {
    const row = makeRow(TEN_COLS);
    const previous = new Set(["1_1"]);
    const state: SelectionState = {
      showtimeId: ST,
      selectedSeatIds: previous,
      error: null,
    };

    const result = selectionReducer(
      state,
      preselect(row, ["1_5", "1_6"], TEN_COL_BLOCKS),
    );

    expect(previous.size).toBe(1);
    expect(previous.has("1_1")).toBe(true);
    expect(result.selectedSeatIds).not.toBe(previous);
  });
});

// ---------------------------------------------------------------------------
// 3. max-4 cap
// ---------------------------------------------------------------------------

describe("selectionReducer — preselect max-4 rule", () => {
  test("5 requested ids are capped to exactly 4 accepted with error 'max'", () => {
    const cols = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const blocks: [number, number][] = [[1, 12]];
    const row = makeRow(cols);

    const result = selectionReducer(
      INITIAL,
      preselect(row, ["1_5", "1_6", "1_7", "1_8", "1_9"], blocks),
    );

    expect(result.selectedSeatIds.size).toBe(4);
    expect(result.error).toBe("max");
    expect([...result.selectedSeatIds].sort()).toEqual([
      "1_5",
      "1_6",
      "1_7",
      "1_8",
    ]);
    expect(result.selectedSeatIds.has("1_9")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. unknown ids
// ---------------------------------------------------------------------------

describe("selectionReducer — preselect unknown ids", () => {
  test("an unknown seatId is dropped without throwing", () => {
    const row = makeRow(TEN_COLS);

    const run = () =>
      selectionReducer(
        INITIAL,
        preselect(row, ["1_5", "not_a_seat", "1_6"], TEN_COL_BLOCKS),
      );

    expect(run).not.toThrow();

    const result = run();
    expect(result.selectedSeatIds.size).toBe(2);
    expect([...result.selectedSeatIds].sort()).toEqual(["1_5", "1_6"]);
    expect(result.selectedSeatIds.has("not_a_seat")).toBe(false);
    // Unknown ids have no existing error code — must stay null.
    expect(result.error).toBeNull();
  });

  test("a seat whose row is missing from rowSeatsByRow is dropped without throwing", () => {
    const row = makeRow(TEN_COLS);
    const orphanRowSeat = makeSeat(3, 7); // row 7, absent from rowSeatsByRow
    const action: SelectionAction = {
      type: "preselect",
      showtimeId: ST,
      seatIds: ["7_3", "1_5", "1_6"],
      rowSeatsByRow: indexByRow(row), // row 7 deliberately not indexed
      seatsById: indexById([...row, orphanRowSeat]),
      blocks: TEN_COL_BLOCKS,
    };

    const result = selectionReducer(INITIAL, action);

    expect(result.selectedSeatIds.has("7_3")).toBe(false);
    expect([...result.selectedSeatIds].sort()).toEqual(["1_5", "1_6"]);
  });
});

// ---------------------------------------------------------------------------
// 5. sold seats
// ---------------------------------------------------------------------------

describe("selectionReducer — preselect status filter", () => {
  test("a Sold seat is dropped while the remaining valid seats are accepted", () => {
    const row = makeRow(TEN_COLS, 1, { 3: { status: "Sold" as SeatStatus } });

    const result = selectionReducer(
      INITIAL,
      preselect(row, ["1_3", "1_6", "1_7"], TEN_COL_BLOCKS),
    );

    expect(result.selectedSeatIds.has("1_3")).toBe(false);
    expect([...result.selectedSeatIds].sort()).toEqual(["1_6", "1_7"]);
    expect(result.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. wheelchair refusal
// ---------------------------------------------------------------------------

describe("selectionReducer — preselect wheelchair refusal", () => {
  test("an Available wheelchair seat is never auto-selected", () => {
    // col 1 is an Available wheelchair seat — it must be dropped, and it is
    // still treated as Sold by the orphan check (existing exemption).
    const row = makeRow(TEN_COLS, 1, { 1: { areaCategory: "wheelchair" } });

    const result = selectionReducer(
      INITIAL,
      preselect(row, ["1_1", "1_5", "1_6"], TEN_COL_BLOCKS),
    );

    expect(result.selectedSeatIds.has("1_1")).toBe(false);
    expect([...result.selectedSeatIds].sort()).toEqual(["1_5", "1_6"]);
    expect(result.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 7. orphan rule
// ---------------------------------------------------------------------------

describe("selectionReducer — preselect orphan rule", () => {
  test("a seat that would leave a per-block orphan is dropped, the valid ones stay", () => {
    const row = makeRow(TEN_COLS);

    // Order matters: 1_1 accepted; 1_3 would isolate col 2 → dropped;
    // 1_4 leaves cols 2-3 together → accepted.
    const result = selectionReducer(
      INITIAL,
      preselect(row, ["1_1", "1_3", "1_4"], TEN_COL_BLOCKS),
    );

    expect(result.selectedSeatIds.has("1_3")).toBe(false);
    expect([...result.selectedSeatIds].sort()).toEqual(["1_1", "1_4"]);
    expect(result.error).toBe("orphan");
  });

  test("orphan checks stay per-block — a block boundary is a wall, not an orphan", () => {
    // Block 1 = cols 1-5 with cols 1-4 Sold; selecting col 5 empties block 1.
    const blocks: [number, number][] = [
      [1, 5],
      [6, 10],
    ];
    const row = makeRow(TEN_COLS, 1, {
      1: { status: "Sold" as SeatStatus },
      2: { status: "Sold" as SeatStatus },
      3: { status: "Sold" as SeatStatus },
      4: { status: "Sold" as SeatStatus },
    });

    const result = selectionReducer(INITIAL, preselect(row, ["1_5"], blocks));

    expect(result.error).toBeNull();
    expect(result.selectedSeatIds.has("1_5")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8. showtime replacement
// ---------------------------------------------------------------------------

describe("selectionReducer — preselect showtime replacement", () => {
  test("a different showtimeId REPLACES the prior selection instead of merging", () => {
    const row = makeRow(TEN_COLS);
    const stale: SelectionState = {
      showtimeId: "st-other",
      selectedSeatIds: new Set(["9_1", "9_2"]),
      error: "orphan",
    };

    const result = selectionReducer(
      stale,
      preselect(row, ["1_5", "1_6"], TEN_COL_BLOCKS),
    );

    expect(result.showtimeId).toBe(ST);
    expect(result.selectedSeatIds.size).toBe(2);
    expect([...result.selectedSeatIds].sort()).toEqual(["1_5", "1_6"]);
    expect(result.selectedSeatIds.has("9_1")).toBe(false);
    expect(result.selectedSeatIds.has("9_2")).toBe(false);
    expect(result.error).toBeNull();
  });

  test("the SAME showtimeId also replaces rather than adds to the prior selection", () => {
    const row = makeRow(TEN_COLS);
    const previous: SelectionState = {
      showtimeId: ST,
      selectedSeatIds: new Set(["1_9", "1_10"]),
      error: null,
    };

    const result = selectionReducer(
      previous,
      preselect(row, ["1_5", "1_6"], TEN_COL_BLOCKS),
    );

    expect(result.selectedSeatIds.size).toBe(2);
    expect([...result.selectedSeatIds].sort()).toEqual(["1_5", "1_6"]);
  });
});
