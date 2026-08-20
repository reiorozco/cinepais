import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ROOM_BLOCKS, SCENARIO_ANCHORS, layoutKeyFor } from "../prisma/seed";
import { selectionReducer, type SeatForSelection } from "@/lib/business/selection";
import type { SeatStatus } from "@/lib/business/orphan";

const OPTIMAL_ROWS = new Set([4, 5, 6, 7, 8]);

const SCENARIO_IDS = new Set(
  SCENARIO_ANCHORS.filter((a) => a.scenario !== null).map(
    (a) => `st-${a.siteId}-${a.roomName}-${a.day}-${a.time.replace(":", "")}`
  )
);

type SeatRow = {
  showtimeId: string;
  room: string;
  seatId: string;
  row: number;
  col: number;
  status: SeatStatus;
  areaCategory: string;
  qualityTier: string;
};

// Runs the SHIPPED reducer from web/src/lib/business/selection.ts, so the max-4
// rule, the per-block orphan rule and the wheelchair exemption are enforced by
// exactly the code the purchase flow uses. A COUNT of available optimal seats
// cannot answer "is there a recommendable pair" — 8 scattered singles clear a
// 15% count floor and yield zero pairs.
function firstRecommendablePair(
  room: string,
  seats: SeatRow[]
): { row: number; seatIds: string[] } | null {
  const blocks = ROOM_BLOCKS[layoutKeyFor(room)];
  const byRow = new Map<number, SeatForSelection[]>();
  for (const s of seats) {
    const list = byRow.get(s.row) ?? [];
    list.push({
      seatId: s.seatId,
      row: s.row,
      col: s.col,
      status: s.status,
      areaCategory: s.areaCategory,
    });
    byRow.set(s.row, list);
  }

  for (const row of [...byRow.keys()].sort((a, b) => a - b)) {
    if (!OPTIMAL_ROWS.has(row)) continue;
    const rowSeats = byRow.get(row)!.sort((a, b) => a.col - b.col);
    const byCol = new Map(rowSeats.map((s) => [s.col, s]));

    for (const [start, end] of blocks) {
      for (let col = start; col < end; col++) {
        const left = byCol.get(col);
        const right = byCol.get(col + 1);
        if (left === undefined || right === undefined) continue;
        if (left.status !== "Available" || right.status !== "Available") continue;
        if (left.areaCategory !== "general" || right.areaCategory !== "general") continue;

        let state = selectionReducer(
          { showtimeId: null, selectedSeatIds: new Set<string>(), error: null },
          { type: "toggle", showtimeId: "check", seat: left, rowSeats, blocks }
        );
        if (state.error !== null) continue;
        state = selectionReducer(state, {
          type: "toggle",
          showtimeId: "check",
          seat: right,
          rowSeats,
          blocks,
        });
        if (state.error === null && state.selectedSeatIds.size === 2) {
          return { row, seatIds: [left.seatId, right.seatId] };
        }
      }
    }
  }
  return null;
}

async function run() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL_UNPOOLED! }),
  });

  const showtimes = await prisma.showtime.findMany({
    select: { id: true, room: true },
    orderBy: { id: "asc" },
  });

  const failures: string[] = [];
  let checked = 0;
  const examples: string[] = [];

  for (const st of showtimes) {
    if (SCENARIO_IDS.has(st.id)) continue;
    const seats = await prisma.$queryRaw<SeatRow[]>`
      SELECT "showtimeId", ${st.room} AS room, "seatId", "row", "col",
             "status"::text AS status, "areaCategory"::text AS "areaCategory",
             "qualityTier"::text AS "qualityTier"
      FROM "Seat" WHERE "showtimeId" = ${st.id} AND "row" BETWEEN 4 AND 8
    `;
    const pair = firstRecommendablePair(st.room, seats);
    checked++;
    if (pair === null) failures.push(st.id);
    else if (examples.length < 8) examples.push(`${st.id} -> ${pair.seatIds.join(",")}`);
  }

  console.log("=== ORPHAN-SAFE ADJACENT GENERAL PAIR IN THE OPTIMAL BAND ===");
  console.log("(verified by running web/src/lib/business/selection.ts selectionReducer");
  console.log(" against the seats actually stored in the database)");
  console.log(`  normal showtimes checked : ${checked}`);
  console.log(`  showtimes WITHOUT a pair : ${failures.length}`);
  if (failures.length > 0) console.log(`  FAILURES: ${failures.slice(0, 20).join(", ")}`);
  console.log("  sample accepted pairs:");
  for (const e of examples) console.log(`    ${e}`);

  await prisma.$disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
