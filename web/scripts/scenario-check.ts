import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
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
} from "../prisma/seed";
import { selectionReducer, type SeatForSelection } from "@/lib/business/selection";
import type { SeatStatus } from "@/lib/business/orphan";

// ---------------------------------------------------------------------------
// Todo 12 — are the four planted scenarios still distinguishable from a normal
// showtime, now that normal showtimes carry realistic occupancy (Todo 10)?
//
// One machine check per scenario, every id resolved at runtime from
// SCENARIO_ANCHORS. The same four checks are then run against normal showtimes
// (the negative controls) and must FAIL there — a check that passes everywhere
// proves nothing.
//
//   npx tsx scripts/scenario-check.ts              reads the live database
//   npx tsx scripts/scenario-check.ts --in-memory  replays the seed, touches
//                                                  nothing — safe to run before
//                                                  spending a destructive re-seed
// ---------------------------------------------------------------------------

type SeatRow = {
  showtimeId: string;
  row: number;
  col: number;
  status: SeatStatus;
  areaCategory: string;
  qualityTier: string;
};

type ShowtimeRow = {
  id: string;
  room: string;
  time: string;
  businessDate: Date;
};

type CheckName = "soldout" | "front-only" | "optimal" | "no-adjacent";

const CHECKS: CheckName[] = ["soldout", "front-only", "optimal", "no-adjacent"];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The scenario each anchored showtime id is expected to carry. */
const SCENARIO_BY_ID = new Map<string, CheckName>(
  SCENARIO_ANCHORS.filter((a) => a.scenario !== null).map((a) => [
    `st-${a.siteId}-${a.roomName}-${a.day}-${a.time.replace(":", "")}`,
    a.scenario as CheckName,
  ])
);

type Metrics = {
  id: string;
  room: string;
  layout: string;
  time: string;
  weekday: string;
  slot: string;
  total: number;
  available: number;
  /** Available seats whose qualityTier is NOT `low` — front-only requires zero. */
  availableNonLow: number;
  bandTotal: number;
  bandAvailable: number;
  bandRatio: number;
  /** Adjacent available pairs under product semantics (wheelchair counts as Sold). */
  adjacentPairs: number;
  /** Adjacent available pairs counting every seat, whatever its category. */
  adjacentPairsRaw: number;
  /** First pair the SHIPPED selectionReducer actually accepts, anywhere in the room. */
  selectablePair: string[] | null;
};

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

/**
 * Adjacent available pairs, evaluated with the room's real block table.
 * Blocks act as walls, so a pair straddling a boundary is not a pair.
 */
function countAdjacentPairs(
  room: string,
  seats: SeatRow[],
  excludeWheelchair: boolean
): number {
  const blocks = ROOM_BLOCKS[layoutKeyFor(room)];
  const byRow = new Map<number, Map<number, SeatRow>>();
  for (const s of seats) {
    const row = byRow.get(s.row) ?? new Map<number, SeatRow>();
    row.set(s.col, s);
    byRow.set(s.row, row);
  }

  const isFree = (s: SeatRow | undefined) =>
    s !== undefined &&
    s.status === "Available" &&
    !(excludeWheelchair && s.areaCategory === "wheelchair");

  let pairs = 0;
  for (const row of byRow.values()) {
    for (const [start, end] of blocks) {
      for (let col = start; col < end; col++) {
        if (isFree(row.get(col)) && isFree(row.get(col + 1))) pairs++;
      }
    }
  }
  return pairs;
}

/**
 * First adjacent pair the product would actually let a person buy — the real
 * `selectionReducer`, so the max-4 rule, the per-block orphan rule and the
 * wheelchair-as-Sold exemption are enforced by the code the purchase flow uses.
 * Scans the WHOLE room, not just the optimal band: `no-adjacent` claims there is
 * no pair anywhere.
 */
function firstSelectablePair(room: string, seats: SeatRow[]): string[] | null {
  const blocks = ROOM_BLOCKS[layoutKeyFor(room)];
  const byRow = new Map<number, SeatForSelection[]>();
  for (const s of seats) {
    const list = byRow.get(s.row) ?? [];
    list.push({
      seatId: `${s.row}_${s.col}`,
      row: s.row,
      col: s.col,
      status: s.status,
      areaCategory: s.areaCategory,
    });
    byRow.set(s.row, list);
  }

  for (const row of [...byRow.keys()].sort((a, b) => a - b)) {
    const rowSeats = byRow.get(row)!.sort((a, b) => a.col - b.col);
    const byCol = new Map(rowSeats.map((s) => [s.col, s]));

    for (const [start, end] of blocks) {
      for (let col = start; col < end; col++) {
        const left = byCol.get(col);
        const right = byCol.get(col + 1);
        if (left === undefined || right === undefined) continue;
        if (left.status !== "Available" || right.status !== "Available") continue;

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
          return [left.seatId, right.seatId];
        }
      }
    }
  }
  return null;
}

function buildMetrics(st: ShowtimeRow, seats: SeatRow[]): Metrics {
  let available = 0;
  let availableNonLow = 0;
  let bandTotal = 0;
  let bandAvailable = 0;

  for (const s of seats) {
    const isAvailable = s.status === "Available";
    if (isAvailable) available++;
    if (isAvailable && s.qualityTier !== "low") availableNonLow++;
    if (s.qualityTier === "optimal") {
      bandTotal++;
      if (isAvailable) bandAvailable++;
    }
  }

  const weekday = WEEKDAYS[st.businessDate.getUTCDay()];
  return {
    id: st.id,
    room: st.room,
    layout: layoutKeyFor(st.room),
    time: st.time,
    weekday,
    slot: `${weekday} ${st.time}`,
    total: seats.length,
    available,
    availableNonLow,
    bandTotal,
    bandAvailable,
    bandRatio: bandTotal === 0 ? 0 : bandAvailable / bandTotal,
    adjacentPairs: countAdjacentPairs(st.room, seats, true),
    adjacentPairsRaw: countAdjacentPairs(st.room, seats, false),
    selectablePair: firstSelectablePair(st.room, seats),
  };
}

/**
 * The four checks, one per scenario.
 *
 * `optimal` is measured against the HIGHEST optimal-band availability any normal
 * showtime reaches, taken over the whole population including the showtime under
 * test. A normal showtime therefore can never satisfy it — its own ratio is at
 * most the maximum — which is what makes the negative control structural rather
 * than a margin that could erode on the next seed.
 */
function evaluate(
  check: CheckName,
  m: Metrics,
  normalBandMax: number
): { pass: boolean; detail: string } {
  switch (check) {
    case "soldout":
      return {
        pass: m.available === 0,
        detail: `availableCount=${m.available}/${m.total}`,
      };
    case "front-only":
      return {
        pass: m.available > 0 && m.availableNonLow === 0,
        detail:
          `availableCount=${m.available}/${m.total}, ` +
          `available seats with qualityTier != low = ${m.availableNonLow}`,
      };
    case "optimal":
      return {
        pass: m.bandRatio > normalBandMax,
        detail:
          `optimal band available=${m.bandAvailable}/${m.bandTotal} (${pct(m.bandRatio)}) ` +
          `vs normal max ${pct(normalBandMax)}`,
      };
    case "no-adjacent":
      return {
        pass: m.available > 0 && m.adjacentPairs === 0 && m.selectablePair === null,
        detail:
          `availableCount=${m.available}/${m.total}, adjacent available pairs=${m.adjacentPairs} ` +
          `(raw ${m.adjacentPairsRaw}), reducer-selectable pair=` +
          `${m.selectablePair ? m.selectablePair.join("+") : "none"}`,
      };
  }
}

function verdict(expected: boolean, pass: boolean): string {
  return pass === expected ? "OK" : "!! UNEXPECTED";
}

type Dataset = { showtimes: ShowtimeRow[]; seats: SeatRow[] };

async function loadFromDatabase(): Promise<Dataset> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL_UNPOOLED! }),
  });
  const showtimes = await prisma.$queryRaw<ShowtimeRow[]>`
    SELECT "id", "room", "time", "businessDate" FROM "Showtime" ORDER BY "id"
  `;
  const seats = await prisma.$queryRaw<SeatRow[]>`
    SELECT "showtimeId", "row", "col", "status"::text AS status,
           "areaCategory"::text AS "areaCategory", "qualityTier"::text AS "qualityTier"
    FROM "Seat" ORDER BY "showtimeId", "row", "col"
  `;
  await prisma.$disconnect();
  return { showtimes, seats };
}

/** Replays the seed exactly as `main()` does, so the checks can run before a re-seed. */
function loadInMemory(seed: number, seedNow: string): Dataset {
  const rand = mulberry32(seed);
  const { showtimeRows, seatContextMap } = buildSchedule(new Date(`${seedNow}T00:00:00Z`), rand);

  const showtimes: ShowtimeRow[] = [];
  const seats: SeatRow[] = [];
  for (const st of showtimeRows) {
    const ctx = seatContextMap.get(st.id)!;
    showtimes.push({ id: st.id, room: ctx.roomName, time: ctx.time, businessDate: st.businessDate });

    const statuses = buildSeatStatusMap(
      ctx.scenario,
      ctx.roomName,
      ctx.rows,
      ctx.cols,
      ctx.weekday,
      ctx.time,
      mulberry32((seed ^ hashCode(st.id)) | 0)
    );
    for (let row = 1; row <= ctx.rows; row++) {
      for (let col = 1; col <= ctx.cols; col++) {
        const meta = getSeatMeta(row, col, ctx.rows, ctx.cols);
        seats.push({
          showtimeId: st.id,
          row,
          col,
          status: statuses.get(seatKey(row, col)) ?? "Available",
          areaCategory: meta.areaCategory,
          qualityTier: meta.qualityTier,
        });
      }
    }
  }
  return { showtimes, seats };
}

async function run() {
  const inMemory = process.argv.includes("--in-memory");
  const seed = Number(process.env.SEED ?? "20260801");
  const seedNow = process.env.SEED_NOW ?? "2026-08-20";
  const { showtimes, seats } = inMemory
    ? loadInMemory(seed, seedNow)
    : await loadFromDatabase();

  const seatsByShowtime = new Map<string, SeatRow[]>();
  for (const s of seats) {
    const list = seatsByShowtime.get(s.showtimeId) ?? [];
    list.push(s);
    seatsByShowtime.set(s.showtimeId, list);
  }

  const metrics = new Map<string, Metrics>();
  for (const st of showtimes) {
    metrics.set(st.id, buildMetrics(st, seatsByShowtime.get(st.id) ?? []));
  }

  const all = [...metrics.values()];
  const normals = all.filter((m) => !SCENARIO_BY_ID.has(m.id));
  const normalBandMax = Math.max(...normals.map((m) => m.bandRatio));
  const normalBandMaxHolder = normals.find((m) => m.bandRatio === normalBandMax)!;

  console.log("================================================================");
  console.log("TODO 12 — SCENARIO DISTINGUISHABILITY AGAINST THE NEW BASELINE");
  console.log("================================================================");
  console.log(
    inMemory
      ? `source: IN-MEMORY replay of the seed (SEED=${seed} SEED_NOW=${seedNow}), no database read`
      : "source: the live database"
  );
  console.log(`showtimes=${all.length}  scenarios=${SCENARIO_BY_ID.size}  normal=${normals.length}`);
  console.log(`seats=${seats.length}`);
  console.log("");
  console.log("THRESHOLD used by the `optimal` check, derived at runtime:");
  console.log(
    `  highest optimal-band availability across ALL ${normals.length} normal showtimes = ` +
      `${pct(normalBandMax)}  (${normalBandMaxHolder.id}, ` +
      `room=${normalBandMaxHolder.layout}, slot=${normalBandMaxHolder.slot}, ` +
      `${normalBandMaxHolder.bandAvailable}/${normalBandMaxHolder.bandTotal})`
  );
  console.log("");

  // -------------------------------------------------------------------------
  // POSITIVE — the four planted scenarios
  // -------------------------------------------------------------------------
  console.log("=== POSITIVE CHECKS — the four planted scenarios (must PASS) ===");
  let positiveFailures = 0;
  for (const [id, scenario] of SCENARIO_BY_ID) {
    const m = metrics.get(id);
    if (m === undefined) {
      console.log(`  ${scenario.padEnd(11)} ${id}  !! MISSING FROM THE DATABASE`);
      positiveFailures++;
      continue;
    }
    const { pass, detail } = evaluate(scenario, m, normalBandMax);
    if (!pass) positiveFailures++;
    console.log(`  ${scenario.padEnd(11)} ${id}`);
    console.log(`    room=${m.layout} (${m.room})  slot=${m.slot}`);
    console.log(`    check "${scenario}" -> ${pass ? "PASS" : "FAIL"}  ${verdict(true, pass)}`);
    console.log(`    ${detail}`);
  }
  console.log("");

  // -------------------------------------------------------------------------
  // `optimal` — the side-by-side the plan asks for
  // -------------------------------------------------------------------------
  const optimalId = [...SCENARIO_BY_ID].find(([, s]) => s === "optimal")![0];
  const optimalM = metrics.get(optimalId);
  if (optimalM !== undefined) {
    console.log("=== `optimal` SIDE BY SIDE WITH NORMAL SHOWTIMES IN THE SAME SLOT ===");
    const sameTime = normals.filter((m) => m.time === optimalM.time);
    const sameSlot = sameTime.filter((m) => m.weekday === optimalM.weekday);
    const sameSlotRoom = sameSlot.filter((m) => m.layout === optimalM.layout);
    const best = (pool: Metrics[]) =>
      pool.length === 0 ? null : pool.reduce((a, b) => (a.bandRatio >= b.bandRatio ? a : b));

    const rows: [string, Metrics | null][] = [
      [`scenario  (${optimalM.layout}, ${optimalM.slot})`, optimalM],
      [`best normal, same slot + same room type (${optimalM.layout})`, best(sameSlotRoom)],
      [`best normal, same slot (${optimalM.slot}), any room`, best(sameSlot)],
      [`best normal, same time (${optimalM.time}), any weekday`, best(sameTime)],
      ["best normal, whole population", normalBandMaxHolder],
    ];
    for (const [label, m] of rows) {
      if (m === null) {
        console.log(`  ${label.padEnd(56)} (no such showtime)`);
        continue;
      }
      console.log(
        `  ${label.padEnd(56)} ${pct(m.bandRatio).padStart(6)}  ` +
          `${m.bandAvailable}/${m.bandTotal}  ${m.id}`
      );
    }
    console.log("");
  }

  // -------------------------------------------------------------------------
  // NEGATIVE CONTROLS — every check re-run against normal showtimes
  // -------------------------------------------------------------------------
  const busiest = (layout: string) => {
    const pool = normals.filter((m) => m.layout === layout);
    return pool.reduce((a, b) => (a.available / a.total <= b.available / b.total ? a : b));
  };

  const controls: [string, Metrics][] = [
    ["busiest PREMIUM 9x10 (the hardest case)", busiest("premium")],
    ["busiest 2D 12x15 (the hardest case)", busiest("2d")],
    ["busiest IMAX 13x20", busiest("imax")],
    ["most-open optimal band of any normal", normalBandMaxHolder],
  ];

  console.log("=== NEGATIVE CONTROLS — the same four checks on NORMAL showtimes ===");
  console.log("    (every cell must FAIL; a PASS means a normal room looks like a scenario)");
  let controlFailures = 0;
  for (const [label, m] of controls) {
    console.log(`  ${label}`);
    console.log(
      `    ${m.id}  room=${m.layout} (${m.room})  slot=${m.slot}  ` +
        `sold=${pct(1 - m.available / m.total)}  available=${m.available}/${m.total}`
    );
    for (const check of CHECKS) {
      const { pass, detail } = evaluate(check, m, normalBandMax);
      if (pass) controlFailures++;
      console.log(
        `      check "${check}"`.padEnd(30) +
          `-> ${pass ? "PASS" : "FAIL"}  ${verdict(false, pass)}   ${detail}`
      );
    }
  }
  console.log("");

  // -------------------------------------------------------------------------
  // POPULATION SWEEP — no normal showtime anywhere may satisfy any check
  // -------------------------------------------------------------------------
  console.log("=== POPULATION SWEEP — all normal showtimes vs all four checks ===");
  // The `optimal` scenario keeps its whole band free, so what makes that
  // unreachable for a normal showtime is that every normal showtime sells at
  // least one band seat. Reported rather than assumed.
  const leastBandSold = normals.reduce((a, b) =>
    a.bandTotal - a.bandAvailable <= b.bandTotal - b.bandAvailable ? a : b
  );
  console.log(
    `  fewest optimal-band seats SOLD by any normal showtime: ` +
      `${leastBandSold.bandTotal - leastBandSold.bandAvailable} ` +
      `(${leastBandSold.id}, room=${leastBandSold.layout}, slot=${leastBandSold.slot})`
  );
  let sweepFailures = 0;
  for (const check of CHECKS) {
    const offenders = normals.filter((m) => evaluate(check, m, normalBandMax).pass);
    sweepFailures += offenders.length;
    console.log(
      `  check "${check}"`.padEnd(28) +
        `normal showtimes that PASS it: ${offenders.length}/${normals.length}` +
        (offenders.length > 0 ? `  -> ${offenders.slice(0, 5).map((m) => m.id).join(", ")}` : "")
    );
  }
  console.log("");

  const ok = positiveFailures === 0 && controlFailures === 0 && sweepFailures === 0;
  console.log("================================================================");
  console.log(
    `RESULT: ${ok ? "PASS" : "FAIL"} — scenario checks failing: ${positiveFailures}, ` +
      `negative controls wrongly passing: ${controlFailures}, ` +
      `population sweep offenders: ${sweepFailures}`
  );
  console.log("================================================================");
  if (!ok) process.exitCode = 1;
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
