import { config } from "dotenv";
config({ path: ".env.local" });

import crypto from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { SCENARIO_ANCHORS, layoutKeyFor } from "../prisma/seed";

type Row = {
  id: string;
  room: string;
  time: string;
  businessDate: Date;
  avail: number;
  total: number;
  optAvail: number;
  optTotal: number;
};

const SCENARIO_IDS = new Map(
  SCENARIO_ANCHORS.filter((a) => a.scenario !== null).map((a) => [
    `st-${a.siteId}-${a.roomName}-${a.day}-${a.time.replace(":", "")}`,
    a.scenario as string,
  ])
);

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

async function run() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL_UNPOOLED! }),
  });

  const rows = await prisma.$queryRaw<Row[]>`
    SELECT s."showtimeId"                                                          AS id,
           st."room"                                                               AS room,
           st."time"                                                               AS time,
           st."businessDate"                                                       AS "businessDate",
           COUNT(*) FILTER (WHERE s."status" = 'Available')::int                    AS avail,
           COUNT(*)::int                                                           AS total,
           COUNT(*) FILTER (WHERE s."qualityTier" = 'optimal'
                              AND s."status" = 'Available')::int                    AS "optAvail",
           COUNT(*) FILTER (WHERE s."qualityTier" = 'optimal')::int                 AS "optTotal"
    FROM "Seat" s
    JOIN "Showtime" st ON st."id" = s."showtimeId"
    GROUP BY 1, 2, 3, 4
    ORDER BY 1
  `;

  const totals = await prisma.$queryRaw<{ status: string; n: number }[]>`
    SELECT "status"::text AS status, COUNT(*)::int AS n FROM "Seat" GROUP BY 1 ORDER BY 1
  `;

  const digest = crypto
    .createHash("sha256")
    .update(rows.map((r) => `${r.id}:${r.avail}/${r.total}`).join("|"))
    .digest("hex")
    .slice(0, 16);

  const normal = rows.filter((r) => !SCENARIO_IDS.has(r.id));
  const fractions = normal.map((r) => r.avail / r.total);

  console.log(`showtimes=${rows.length} normal=${normal.length}`);
  console.log(`seat status totals: ${totals.map((t) => `${t.status}=${t.n}`).join("  ")}`);
  console.log(`per-showtime availability DIGEST (sha256/16) = ${digest}`);
  console.log("");

  console.log("=== SCENARIO SHOWTIMES PRESENT IN THE DATABASE ===");
  for (const [id, scenario] of SCENARIO_IDS) {
    const r = rows.find((x) => x.id === id);
    console.log(
      `  ${scenario.padEnd(11)}\t${id}\tfound=${r !== undefined}\t` +
        `avail=${r?.avail ?? "-"}/${r?.total ?? "-"}`
    );
  }
  console.log(`  ALL FOUR PRESENT: ${[...SCENARIO_IDS.keys()].every((id) => rows.some((r) => r.id === id))}`);
  console.log("");

  console.log("=== OCCUPANCY SPREAD — availableCount/totalCount, all normal showtimes ===");
  console.log(`  min    = ${pct(Math.min(...fractions))}`);
  console.log(`  median = ${pct(median(fractions))}`);
  console.log(`  max    = ${pct(Math.max(...fractions))}`);
  console.log(`  distinct values = ${new Set(fractions.map((f) => f.toFixed(4))).size}`);
  console.log("");

  console.log("=== SAMPLE OF 24 NORMAL SHOWTIMES (every 27th) ===");
  console.log("  id\tavail/total\tavail%\toptimal avail/total");
  for (let i = 0; i < normal.length && i / 27 < 24; i += 27) {
    const r = normal[i];
    console.log(
      `  ${r.id}\t${r.avail}/${r.total}\t${pct(r.avail / r.total)}\t` +
        `${r.optAvail}/${r.optTotal} (${pct(r.optAvail / r.optTotal)})`
    );
  }
  console.log("");

  console.log("=== FLOORS ===");
  const bandViolations = normal.filter((r) => r.optAvail / r.optTotal < 0.15);
  console.log(`  optimal-band <15% available : ${bandViolations.length}`);
  console.log(`  100% sold                   : ${normal.filter((r) => r.avail === 0).length}`);
  console.log(`  100% empty                  : ${normal.filter((r) => r.avail === r.total).length}`);
  console.log("");

  console.log("=== BUSIEST NORMAL SHOWTIME PER ROOM TYPE (the 15% floor's hardest case) ===");
  for (const key of ["premium", "2d", "imax"] as const) {
    const pool = normal.filter((r) => layoutKeyFor(r.room) === key);
    const busiest = pool.reduce((a, b) => (a.avail / a.total <= b.avail / b.total ? a : b));
    console.log(
      `  ${key.padEnd(8)}\t${busiest.id}\tsold=${pct(1 - busiest.avail / busiest.total)}\t` +
        `optimal available=${busiest.optAvail}/${busiest.optTotal} ` +
        `(${pct(busiest.optAvail / busiest.optTotal)})\t>=15%: ${busiest.optAvail / busiest.optTotal >= 0.15}`
    );
  }

  await prisma.$disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
