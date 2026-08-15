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

      // scenario-soldout: find the soldout showtime and verify all seats are Sold
      const soldoutShowtime = await prisma.showtime.findFirst({
        where: {
          siteId: "site-med-1",
          room: "imax",
          film: { title: "Sombras del Puente" },
        },
        orderBy: { businessDate: "asc" },
      });
      expect(soldoutShowtime).not.toBeNull();
      if (soldoutShowtime) {
        const availableSeats = await prisma.seat.count({
          where: { showtimeId: soldoutShowtime.id, status: "Available" },
        });
        expect(availableSeats).toBe(0);
      }

      // scenario-front-only: ID encodes day 1 directly; second slot (slotIdx=1)
      // IDs: st-site-med-2-imax-1-{HHmm} — ordering by id asc = chronological order
      const frontOnlyShowtime = await prisma.showtime.findFirst({
        where: { id: { startsWith: "st-site-med-2-imax-1-" } },
        orderBy: { id: "asc" },
        skip: 1, // slotIdx=1 = the front-only scenario
      });
      if (frontOnlyShowtime) {
        const frontRowAvailable = await prisma.seat.count({
          where: { showtimeId: frontOnlyShowtime.id, row: { lte: 2 }, status: "Available" },
        });
        expect(frontRowAvailable).toBeGreaterThan(0);
        const backRowSold = await prisma.seat.count({
          where: { showtimeId: frontOnlyShowtime.id, row: { gte: 3 }, status: "Sold" },
        });
        expect(backRowSold).toBeGreaterThan(0);
      }

      await prisma.$disconnect();
    }
  );
});
