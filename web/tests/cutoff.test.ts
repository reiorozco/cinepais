import { describe, test, expect } from "vitest";
import { isPurchasable } from "../src/lib/business/cutoff";

describe("isPurchasable", () => {
  test("showtime starting 14 min from now — filtered out (< 15 min cutoff)", () => {
    const now = new Date("2026-08-01T19:00:00-05:00");
    const start = new Date("2026-08-01T19:14:00-05:00");
    expect(isPurchasable(start, now)).toBe(false);
  });

  test("showtime starting 16 min from now — kept (> 15 min cutoff)", () => {
    const now = new Date("2026-08-01T19:00:00-05:00");
    const start = new Date("2026-08-01T19:16:00-05:00");
    expect(isPurchasable(start, now)).toBe(true);
  });

  test("showtime starting 5h from now — kept", () => {
    const now = new Date("2026-08-01T14:00:00-05:00");
    const start = new Date("2026-08-01T19:00:00-05:00");
    expect(isPurchasable(start, now)).toBe(true);
  });

  test("showtime that already started — filtered out", () => {
    const now = new Date("2026-08-01T20:00:00-05:00");
    const start = new Date("2026-08-01T19:30:00-05:00");
    expect(isPurchasable(start, now)).toBe(false);
  });
});
