import { describe, test, expect } from "vitest";
import { wouldLeaveOrphan } from "../src/lib/business/orphan";
import type { SeatStatus } from "../src/lib/business/orphan";

// rowAvailability: array of SeatStatus for each col (0-indexed)
// selection: array of 0-indexed col numbers to select
// aisleCols: set of col indexes that are aisles (treated as walls)

describe("wouldLeaveOrphan", () => {
  test("row _A_S_ _ _ — selecting col 1 (A) is NOT orphan (S is already sold, not isolated)", () => {
    // Row: [Available, Available, Sold, Available, Available, Available]
    // Selecting col 1: col 0 becomes isolated between left edge and col 1 selection
    const row: SeatStatus[] = ["Available", "Available", "Sold", "Available", "Available", "Available"];
    // Selecting col 1: col 0 becomes isolated between left edge and selection
    expect(wouldLeaveOrphan(row, [1], new Set())).toBe(true);
  });

  test("selecting col 3 in row [Avail, Avail, Sold, Avail, Avail, Avail] — NOT orphan (col 4 and 5 are together)", () => {
    const row: SeatStatus[] = ["Available", "Available", "Sold", "Available", "Available", "Available"];
    // After selecting col 3: row becomes [Avail, Avail, Sold, Sold, Avail, Avail]
    // col 4 and 5 are together — not orphan
    expect(wouldLeaveOrphan(row, [3], new Set())).toBe(false);
  });

  test("row ends ..._ _ A — selecting second-to-last creates orphan against right edge", () => {
    // Row: [Sold, Sold, Available, Available, Available]
    // Selecting col 3 (second-to-last): col 4 becomes isolated between col 3 selection and right edge
    const row: SeatStatus[] = ["Sold", "Sold", "Available", "Available", "Available"];
    expect(wouldLeaveOrphan(row, [3], new Set())).toBe(true);
  });

  test("row starts A _ _ ... — selecting col 1 creates orphan against left edge", () => {
    // Row: [Available, Available, Available, Sold, Sold]
    // Selecting col 1: col 0 becomes isolated between left edge and col 1 selection
    const row: SeatStatus[] = ["Available", "Available", "Available", "Sold", "Sold"];
    expect(wouldLeaveOrphan(row, [1], new Set())).toBe(true);
  });

  test("row with aisle at col 4 — selecting col 6 creates orphan against aisle", () => {
    // Row: [Avail, Avail, Avail, Avail, AISLE, Avail, Avail, Avail]
    // aisleCols = {4}
    // Selecting col 6: col 5 becomes isolated between aisle(4) and col 6 selection
    const row: SeatStatus[] = ["Available", "Available", "Available", "Available", "Available", "Available", "Available", "Available"];
    const aisleCols = new Set([4]);
    expect(wouldLeaveOrphan(row, [6], aisleCols)).toBe(true);
  });

  test("single seat selection with all Available neighbors — NOT orphan", () => {
    // Row: [Available, Available, Available, Available, Available]
    // Selecting col 2 (middle): cols 0-1 are together, cols 3-4 are together — not orphan
    const row: SeatStatus[] = ["Available", "Available", "Available", "Available", "Available"];
    expect(wouldLeaveOrphan(row, [2], new Set())).toBe(false);
  });

  test("selection of 4 contiguous with Sold on both sides — NOT orphan", () => {
    // Row: [Sold, Available, Available, Available, Available, Sold]
    // Selecting cols 1-4: all available seats selected, no orphan
    const row: SeatStatus[] = ["Sold", "Available", "Available", "Available", "Available", "Sold"];
    expect(wouldLeaveOrphan(row, [1, 2, 3, 4], new Set())).toBe(false);
  });
});
