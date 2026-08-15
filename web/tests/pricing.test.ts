import { describe, test, expect } from "vitest";
import { dominantFormat, isWednesday, seatPrice } from "../src/lib/business/pricing";
import { formatCOP } from "../src/lib/format";

// formatCOP: confirmed via node probe — es-CO emits "$" + U+00A0 (NBSP) + "18.000"
describe("formatCOP", () => {
  test("formats 18000 as COP with NBSP separator (byte-level)", () => {
    const s = formatCOP(18000);
    // char at index 1 must be U+00A0 (NBSP), not a plain space
    expect(s.charCodeAt(1)).toBe(0x00a0);
  });

  test("formats 18000 as '$\\u00a018.000' (frozen literal — NBSP is the only separator)", () => {
    expect(formatCOP(18000)).toBe("$\u00a018.000");
  });

  test("formats 32000 correctly", () => {
    const s = formatCOP(32000);
    expect(s.charCodeAt(1)).toBe(0x00a0);
    expect(s).toBe("$\u00a032.000");
  });
});

describe("isWednesday", () => {
  test("2026-08-05 is Wednesday (UTC day 3)", () => {
    expect(isWednesday("2026-08-05")).toBe(true);
  });

  test("2026-08-04 is Tuesday, not Wednesday", () => {
    expect(isWednesday("2026-08-04")).toBe(false);
  });

  test("2026-08-06 is Thursday, not Wednesday", () => {
    expect(isWednesday("2026-08-06")).toBe(false);
  });
});

describe("dominantFormat", () => {
  test("single IMAX → IMAX", () => {
    expect(dominantFormat(["IMAX"])).toBe("IMAX");
  });

  test("single 2D → 2D", () => {
    expect(dominantFormat(["2D"])).toBe("2D");
  });

  test("single Premium → Premium", () => {
    expect(dominantFormat(["Premium"])).toBe("Premium");
  });

  // speculative: seed emits single-format showtimes today; kept to lock precedence logic
  test("IMAX beats Subtitulada when both present", () => {
    // speculative: seed emits single-format showtimes today
    expect(dominantFormat(["IMAX", "Subtitulada"])).toBe("IMAX");
  });
});

describe("seatPrice", () => {
  // Locked expected literals — if formula changes, fix the formula, not these numbers

  test("IMAX general non-wednesday → 32000", () => {
    // 32000 × 1.0 = 32000 → round(32000/500)*500 = 32000
    expect(seatPrice(["IMAX"], "general", "2026-08-04")).toBe(32000);
  });

  test("IMAX premium non-wednesday → 43000", () => {
    // 32000 × 1.35 = 43200 → round(43200/500)*500 = 86×500 = 43000
    expect(seatPrice(["IMAX"], "premium", "2026-08-04")).toBe(43000);
  });

  test("IMAX preferential non-wednesday → 37000", () => {
    // 32000 × 1.15 = 36800 → round(36800/500)*500 = 74×500 = 37000
    expect(seatPrice(["IMAX"], "preferential", "2026-08-04")).toBe(37000);
  });

  test("2D general on wednesday → 11000 (discount applies)", () => {
    // 18000 × 0.6 = 10800 → round(10800/500)*500 = 22×500 = 11000; 2026-08-05 is Wed
    expect(seatPrice(["2D"], "general", "2026-08-05")).toBe(11000);
  });

  test("2D preferential non-wednesday → 20500", () => {
    // 18000 × 1.15 = 20700 → round(20700/500)*500 = 41×500 = 20500
    expect(seatPrice(["2D"], "preferential", "2026-08-04")).toBe(20500);
  });

  test("2D wheelchair non-wednesday → 18000 (same multiplier as general)", () => {
    // 18000 × 1.0 = 18000 → round(18000/500)*500 = 18000
    expect(seatPrice(["2D"], "wheelchair", "2026-08-04")).toBe(18000);
  });

  test("Premium (room) premium (zone) non-wednesday → 32500 (axes compound)", () => {
    // 24000 × 1.35 = 32400 → round(32400/500)*500 = 65×500 = 32500
    expect(seatPrice(["Premium"], "premium", "2026-08-04")).toBe(32500);
  });

  test("2D general non-wednesday is NOT discounted", () => {
    // baseline check: no wednesday discount on a Tuesday
    expect(seatPrice(["2D"], "general", "2026-08-04")).toBe(18000);
  });

  test("IMAX general on wednesday → 19000 (wednesday discount applies)", () => {
    // 32000 × 0.6 = 19200 → round(19200/500)*500 = round(38.4)*500 = 38×500 = 19000
    expect(seatPrice(["IMAX"], "general", "2026-08-05")).toBe(19000);
  });
});
