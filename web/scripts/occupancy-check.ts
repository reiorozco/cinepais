import { config } from "dotenv";
config({ path: ".env.local" });

import {
  ROOM_BLOCKS,
  SCENARIO_ANCHORS,
  buildSchedule,
  buildSeatStatusMap,
  getSeatMeta,
  hashCode,
  layoutKeyFor,
  mulberry32,
  seatKey,
  type SeatContext,
} from "../prisma/seed";
import { selectionReducer, type SeatForSelection } from "@/lib/business/selection";
import type { SeatStatus } from "@/lib/business/orphan";

const SEED = Number(process.env.SEED ?? "20260801");
const SEED_NOW = process.env.SEED_NOW ?? "2026-08-20";
const OPTIMAL_ROWS = [4, 5, 6, 7, 8];

type Report = {
  id: string;
  room: string;
  time: string;
  weekday: number;
  scenario: string;
  total: number;
  available: number;
  optimalTotal: number;
  optimalAvailable: number;
  pair: string | null;
};

function rowSeatsFor(
  ctx: SeatContext,
  row: number,
  statuses: Map<string, SeatStatus>
): SeatForSelection[] {
  const seats: SeatForSelection[] = [];
  for (let col = 1; col <= ctx.cols; col++) {
    const meta = getSeatMeta(row, col, ctx.rows, ctx.cols);
    seats.push({
      seatId: `${meta.area}_${row}_${col}`,
      row,
      col,
      status: statuses.get(seatKey(row, col)) as SeatStatus,
      areaCategory: meta.areaCategory,
    });
  }
  return seats;
}

// Runs the SHIPPED product reducer (web/src/lib/business/selection.ts), which
// enforces max-4, the per-block orphan rule and the wheelchair exemption via the
// real wouldLeaveOrphan. A COUNT of available seats cannot answer this question.
function findRecommendablePair(
  ctx: SeatContext,
  statuses: Map<string, SeatStatus>
): string | null {
  const blocks = ROOM_BLOCKS[layoutKeyFor(ctx.roomName)];
  for (const row of OPTIMAL_ROWS) {
    if (row > ctx.rows) continue;
    const rowSeats = rowSeatsFor(ctx, row, statuses);
    for (const [start, end] of blocks) {
      for (let col = start; col < end; col++) {
        const left = rowSeats[col - 1];
        const right = rowSeats[col];
        if (left.status !== "Available" || right.status !== "Available") continue;
        if (left.areaCategory !== "general" || right.areaCategory !== "general") continue;

        let state = selectionReducer(
          { showtimeId: null, selectedSeatIds: new Set<string>(), error: null },
          { type: "toggle", showtimeId: ctx.time, seat: left, rowSeats, blocks }
        );
        if (state.error !== null) continue;
        state = selectionReducer(state, {
          type: "toggle",
          showtimeId: ctx.time,
          seat: right,
          rowSeats,
          blocks,
        });
        if (state.error === null && state.selectedSeatIds.size === 2) {
          return `${left.seatId}+${right.seatId}`;
        }
      }
    }
  }
  return null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

const seedNowDate = new Date(`${SEED_NOW}T00:00:00Z`);
const rand = mulberry32(SEED);
const { showtimeRows, seatContextMap } = buildSchedule(seedNowDate, rand);

const reports: Report[] = [];
for (const st of showtimeRows) {
  const ctx = seatContextMap.get(st.id)!;
  const seatRand = mulberry32((SEED ^ hashCode(st.id)) | 0);
  const statuses = buildSeatStatusMap(
    ctx.scenario,
    ctx.roomName,
    ctx.rows,
    ctx.cols,
    ctx.weekday,
    ctx.time,
    seatRand
  );

  let total = 0;
  let available = 0;
  let optimalTotal = 0;
  let optimalAvailable = 0;
  for (let row = 1; row <= ctx.rows; row++) {
    for (let col = 1; col <= ctx.cols; col++) {
      const meta = getSeatMeta(row, col, ctx.rows, ctx.cols);
      const free = statuses.get(seatKey(row, col)) === "Available";
      total++;
      if (free) available++;
      if (meta.qualityTier === "optimal") {
        optimalTotal++;
        if (free) optimalAvailable++;
      }
    }
  }

  reports.push({
    id: st.id,
    room: ctx.roomName,
    time: ctx.time,
    weekday: ctx.weekday,
    scenario: ctx.scenario ?? "normal",
    total,
    available,
    optimalTotal,
    optimalAvailable,
    pair: ctx.scenario === null ? findRecommendablePair(ctx, statuses) : null,
  });
}

const normal = reports.filter((r) => r.scenario === "normal");
const fractions = normal.map((r) => r.available / r.total);

console.log(`SEED=${SEED} SEED_NOW=${SEED_NOW}`);
console.log(`showtimes=${reports.length} normal=${normal.length}`);
console.log("");

console.log("=== SCENARIO SURVIVAL (in-memory) ===");
const ids = new Set(showtimeRows.map((s) => s.id));
for (const a of SCENARIO_ANCHORS) {
  const id = `st-${a.siteId}-${a.roomName}-${a.day}-${a.time.replace(":", "")}`;
  const row = showtimeRows.find((s) => s.id === id);
  const rep = reports.find((r) => r.id === id);
  console.log(
    `  ${(a.scenario ?? "film-pin").padEnd(11)}\t${id}\texists=${ids.has(id)}\t` +
      `film=${row?.filmId ?? "-"}\tavail=${rep?.available}/${rep?.total}`
  );
}
console.log("");

console.log("=== OCCUPANCY SPREAD (all normal showtimes, availableCount/totalCount) ===");
console.log(`  min    = ${pct(Math.min(...fractions))}`);
console.log(`  median = ${pct(median(fractions))}`);
console.log(`  max    = ${pct(Math.max(...fractions))}`);
console.log(`  distinct values = ${new Set(fractions.map((f) => f.toFixed(4))).size}`);
console.log("");

console.log("=== SAMPLE (every 30th normal showtime) ===");
console.log("  id\tavail/total\tavail%\toptimal avail/total\tpair");
for (let i = 0; i < normal.length; i += 30) {
  const r = normal[i];
  console.log(
    `  ${r.id}\t${r.available}/${r.total}\t${pct(r.available / r.total)}\t` +
      `${r.optimalAvailable}/${r.optimalTotal} (${pct(r.optimalAvailable / r.optimalTotal)})\t${r.pair}`
  );
}
console.log("");

console.log("=== FLOORS ===");
const bandViolations = normal.filter((r) => r.optimalAvailable / r.optimalTotal < 0.15);
const pairViolations = normal.filter((r) => r.pair === null);
const fullySold = normal.filter((r) => r.available === 0);
const fullyEmpty = normal.filter((r) => r.available === r.total);
console.log(`  optimal-band <15% available : ${bandViolations.length}`);
console.log(`  no recommendable pair       : ${pairViolations.length}`);
console.log(`  100% sold                   : ${fullySold.length}`);
console.log(`  100% empty                  : ${fullyEmpty.length}`);
for (const r of [...bandViolations, ...pairViolations].slice(0, 10)) {
  console.log(`    VIOLATION ${r.id} optimal=${r.optimalAvailable}/${r.optimalTotal} pair=${r.pair}`);
}
console.log("");

console.log("=== MEAN SOLD FRACTION BY DAY BAND x SLOT (proves the time/weekday dependence) ===");
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const bandOf = (w: number) => (w === 5 || w === 6 ? "weekend" : w === 0 ? "sunday" : "weeknight");
const slots = ["14:00", "17:00", "19:30", "21:00", "22:45"];
console.log(`  band\t\t${slots.join("\t")}`);
for (const band of ["weeknight", "sunday", "weekend"]) {
  const cells = slots.map((slot) => {
    const pool = normal.filter((r) => bandOf(r.weekday) === band && r.time === slot);
    if (pool.length === 0) return "-";
    return pct(pool.reduce((s, r) => s + (1 - r.available / r.total), 0) / pool.length);
  });
  console.log(`  ${band.padEnd(10)}\t${cells.join("\t")}`);
}
console.log(
  `  weekdays present: ${[...new Set(normal.map((r) => r.weekday))].sort().map((w) => DAY_NAMES[w]).join(" ")}`
);
console.log("");

console.log("=== BUSIEST PER ROOM TYPE (lowest available fraction) ===");
for (const key of ["imax", "2d", "premium"] as const) {
  const pool = normal.filter((r) => layoutKeyFor(r.room) === key);
  const busiest = pool.reduce((a, b) => (a.available / a.total <= b.available / b.total ? a : b));
  console.log(
    `  ${key}\t${busiest.id}\tsold=${pct(1 - busiest.available / busiest.total)}\t` +
      `optimal avail=${busiest.optimalAvailable}/${busiest.optimalTotal} ` +
      `(${pct(busiest.optimalAvailable / busiest.optimalTotal)})\tpair=${busiest.pair}`
  );
}
