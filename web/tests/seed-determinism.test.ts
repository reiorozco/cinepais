import { describe, test, expect } from "vitest";
import { config } from "dotenv";
import path from "node:path";

// Load .env.local for Neon connection
config({ path: path.resolve(__dirname, "../.env.local") });

import { main } from "../prisma/seed";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function makeClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter });
}

/**
 * DO NOT replace these literals with a query. Both scenarios used to be found
 * indirectly and both resolved to the wrong row: the front-only lookup
 * (`orderBy id asc, skip: 1`) landed on the NORMAL showtime
 * st-site-med-2-imax-1-1930, which satisfies every front-only assertion — the
 * suite passed while testing nothing. The title lookup matches 3 showtimes and
 * survives only on `orderBy businessDate asc` ordering luck.
 *
 * Ids are `st-${siteId}-${roomName}-${dayIndex}-${HHmm}` over SCENARIO_ANCHORS,
 * so they hold across SEED_NOW — but the weekday a day-index lands on does not.
 * Never assert a weekday here.
 */
const SCENARIO_IDS = {
  soldout: "st-site-med-1-imax-0-1930",
  frontOnly: "st-site-med-2-imax-1-2100",
  optimal: "st-site-med-2-imax-2-1700",
  noAdjacent: "st-site-bog-1-2d-1-3-2100",
} as const;

describe("seed determinism", () => {
  test(
    "seed is deterministic — same counts on two runs",
    { timeout: 480_000 },
    async () => {
      // Run seed twice with same opts
      await main({ SEED: "20260801", SEED_NOW: "2026-08-01" });
      const prisma1 = makeClient();
      const counts1 = {
        sites: await prisma1.site.count(),
        films: await prisma1.film.count(),
        showtimes: await prisma1.showtime.count(),
        seats: await prisma1.seat.count(),
      };
      await prisma1.$disconnect();

      await main({ SEED: "20260801", SEED_NOW: "2026-08-01" });
      const prisma2 = makeClient();
      const counts2 = {
        sites: await prisma2.site.count(),
        films: await prisma2.film.count(),
        showtimes: await prisma2.showtime.count(),
        seats: await prisma2.seat.count(),
      };
      await prisma2.$disconnect();

      expect(counts1).toEqual(counts2);
      expect(counts1.sites).toBe(6);
      expect(counts1.films).toBe(10);
      expect(counts1.showtimes).toBe(672);
      expect(counts1.seats).toBe(119280);
    }
  );

  test(
    "sampled seats are identical across two runs",
    { timeout: 480_000 },
    async () => {
      await main({ SEED: "20260801", SEED_NOW: "2026-08-01" });
      const prisma1 = makeClient();
      const sample1 = await prisma1.seat.findMany({
        take: 10,
        orderBy: [{ showtimeId: "asc" }, { seatId: "asc" }],
      });
      await prisma1.$disconnect();

      await main({ SEED: "20260801", SEED_NOW: "2026-08-01" });
      const prisma2 = makeClient();
      const sample2 = await prisma2.seat.findMany({
        take: 10,
        orderBy: [{ showtimeId: "asc" }, { seatId: "asc" }],
      });
      await prisma2.$disconnect();

      expect(JSON.stringify(sample1)).toBe(JSON.stringify(sample2));
    }
  );

  test(
    "planted scenarios are present",
    { timeout: 480_000 },
    async () => {
      await main({ SEED: "20260801", SEED_NOW: "2026-08-01" });
      const prisma = makeClient();

      // Every scenario must EXIST. A missing row fails here rather than
      // skipping its assertions, which is how the old `if (showtime)` guard
      // turned an absent scenario into a pass.
      for (const id of Object.values(SCENARIO_IDS)) {
        expect(await prisma.showtime.findUnique({ where: { id } })).not.toBeNull();
      }

      const countSeats = (id: string, where: Record<string, unknown> = {}) =>
        prisma.seat.count({ where: { showtimeId: id, ...where } });

      expect(await countSeats(SCENARIO_IDS.soldout)).toBe(260);
      expect(await countSeats(SCENARIO_IDS.soldout, { status: "Available" })).toBe(0);

      // The first two front-only assertions are the original ones, kept — but
      // they are TRUE OF A NORMAL SHOWTIME TOO (the row this test used to land
      // on scored 31 and 174). The three after them are what discriminate.
      expect(
        await countSeats(SCENARIO_IDS.frontOnly, { row: { lte: 2 }, status: "Available" })
      ).toBeGreaterThan(0);
      expect(
        await countSeats(SCENARIO_IDS.frontOnly, { row: { gte: 3 }, status: "Sold" })
      ).toBeGreaterThan(0);
      expect(await countSeats(SCENARIO_IDS.frontOnly, { status: "Available" })).toBe(40);
      expect(
        await countSeats(SCENARIO_IDS.frontOnly, { row: { gte: 3 }, status: "Available" })
      ).toBe(0);
      expect(
        await countSeats(SCENARIO_IDS.frontOnly, {
          status: "Available",
          qualityTier: { not: "low" },
        })
      ).toBe(0);

      // optimal: the whole optimal band free. Asserted as the band, not as a
      // total: the band is unconditional in the seed and so holds for any
      // SEED/SEED_NOW, while the total (191/260 here) comes from per-seat PRNG
      // draws in the outer rows and moves with the occupancy weekday bands.
      expect(await countSeats(SCENARIO_IDS.optimal, { qualityTier: "optimal" })).toBe(100);
      expect(
        await countSeats(SCENARIO_IDS.optimal, { qualityTier: "optimal", status: "Available" })
      ).toBe(100);

      const noAdjacentAvailable = await prisma.seat.findMany({
        where: { showtimeId: SCENARIO_IDS.noAdjacent, status: "Available" },
        select: { area: true, row: true, col: true },
      });
      // The count guards a vacuous truth: "no two are adjacent" holds for free
      // on an empty set, so a fully-sold room would satisfy the scan below.
      expect(noAdjacentAvailable.length).toBe(96);
      const occupied = new Set(noAdjacentAvailable.map((s) => `${s.area}_${s.row}_${s.col}`));
      const adjacentPairs = noAdjacentAvailable.filter((s) =>
        occupied.has(`${s.area}_${s.row}_${s.col + 1}`)
      );
      expect(adjacentPairs).toEqual([]);

      await prisma.$disconnect();
    }
  );
});
