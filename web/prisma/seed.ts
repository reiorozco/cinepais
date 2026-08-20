import { config } from "dotenv";
config({ path: ".env.local" });
config(); // fallback to .env if present

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  Format,
  SeatStatus,
  AreaCategory,
  QualityTier,
  FilmStatus,
} from "../src/generated/prisma/enums";

// ---------------------------------------------------------------------------
// PRNG (deterministic; do NOT use Math.random)
// ---------------------------------------------------------------------------
export function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h;
}

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------
type RoomDef = { name: string; rows: number; cols: number; format: Format };

const ROOMS: RoomDef[] = [
  { name: "imax", rows: 13, cols: 20, format: Format.IMAX },
  { name: "2d-1", rows: 12, cols: 15, format: Format.TwoD },
  { name: "2d-2", rows: 12, cols: 15, format: Format.TwoD },
  { name: "premium", rows: 9, cols: 10, format: Format.Premium },
];

const SITES = [
  { id: "site-med-1", name: "CinePaís El Poblado", city: "Medellín", lat: 6.208, lng: -75.567 },
  { id: "site-med-2", name: "CinePaís Laureles", city: "Medellín", lat: 6.245, lng: -75.591 },
  { id: "site-med-3", name: "CinePaís Envigado", city: "Medellín", lat: 6.170, lng: -75.585 },
  { id: "site-bog-1", name: "CinePaís Zona T", city: "Bogotá", lat: 4.667, lng: -74.055 },
  { id: "site-bog-2", name: "CinePaís Salitre", city: "Bogotá", lat: 4.658, lng: -74.106 },
  { id: "site-bog-3", name: "CinePaís Titán Plaza", city: "Bogotá", lat: 4.696, lng: -74.093 },
];

const ALL_SLOTS = ["14:00", "17:00", "19:30", "21:00", "22:45"] as const;

const FILMS: {
  id: string;
  title: string;
  synopsis: string;
  durationMin: number;
  rating: string;
  director: string;
  cast: string[];
  genres: string[];
}[] = [
  {
    id: "film-01",
    title: "La Odisea",
    synopsis: "Un viaje épico por los siete mares en busca del hogar.",
    durationMin: 165,
    rating: "PG-13",
    director: "Sofía Restrepo",
    cast: ["Ana María López", "Camilo Ríos", "Pedro Herrera"],
    genres: ["Aventura", "Drama"],
  },
  {
    id: "film-02",
    title: "Sombras del Puente",
    synopsis: "Un detective descubre un secreto oscuro bajo el viejo puente.",
    durationMin: 118,
    rating: "R",
    director: "Ricardo Vargas",
    cast: ["Valentina Ochoa", "Andrés Palacio"],
    genres: ["Suspenso", "Misterio"],
  },
  {
    id: "film-03",
    title: "El Corazón del Bosque",
    synopsis: "Una niña encuentra un guardián mágico en el bosque encantado.",
    durationMin: 108,
    rating: "PG",
    director: "Marta Alzate",
    cast: ["Voz de Laura Torres", "Voz de Julián Muñoz"],
    genres: ["Familiar", "Animación"],
  },
  {
    id: "film-04",
    title: "Códigos Rotos",
    synopsis: "Una hacker debe detener un ciberataque global antes del amanecer.",
    durationMin: 135,
    rating: "PG-13",
    director: "Daniel Sánchez",
    cast: ["Mariana Gómez", "Sebastián Ruiz"],
    genres: ["Acción", "Tecno-thriller"],
  },
  {
    id: "film-05",
    title: "La Última Estrella",
    synopsis: "Un astrónomo persigue una señal que podría cambiarlo todo.",
    durationMin: 142,
    rating: "PG-13",
    director: "Isabel Cárdenas",
    cast: ["Andrea Peña", "Miguel Ángel Suárez"],
    genres: ["Ciencia ficción"],
  },
  {
    id: "film-06",
    title: "Cielo Vacío",
    synopsis: "Un piloto retirado enfrenta el silencio del cielo que dejó atrás.",
    durationMin: 122,
    rating: "R",
    director: "Julio Estévez",
    cast: ["Camila Bernal", "Óscar Restrepo"],
    genres: ["Drama"],
  },
  {
    id: "film-07",
    title: "Vientos del Sur",
    synopsis: "Una familia rural sobrevive a los vientos del cambio en los Andes.",
    durationMin: 130,
    rating: "PG-13",
    director: "Lucía Mora",
    cast: ["Diego Marín", "Sofía Bedoya"],
    genres: ["Drama", "Histórico"],
  },
  {
    id: "film-08",
    title: "Espejo Roto",
    synopsis: "Una restauradora comienza a ver visiones en un espejo antiguo.",
    durationMin: 110,
    rating: "R",
    director: "Pablo Cortés",
    cast: ["Nataly Franco", "Jorge Andrade"],
    genres: ["Terror", "Psicológico"],
  },
  {
    id: "film-09",
    title: "El Guardián de Nubes",
    synopsis: "Un niño descubre que las nubes tienen guardianes invisibles.",
    durationMin: 98,
    rating: "G",
    director: "Marina Pineda",
    cast: ["Luna Escobar", "Tomás Villegas"],
    genres: ["Familiar", "Fantasía"],
  },
  {
    id: "film-10",
    title: "Marea Alta",
    synopsis: "Un capitán y su tripulación enfrentan una tormenta legendaria.",
    durationMin: 125,
    rating: "PG-13",
    director: "Fernando Salazar",
    cast: ["Alejandra Marín", "Kevin Osorio"],
    genres: ["Aventura"],
  },
];

function posterUrlFor(id: string): string {
  // id is "film-01".."film-10"; produce "Film+01" etc.
  const num = id.replace("film-", "");
  return `https://placehold.co/300x450?text=Film+${num}`;
}

// ---------------------------------------------------------------------------
// Film status — a FIXED table, deliberately NOT the PRNG
// ---------------------------------------------------------------------------
/**
 * Marketing status per film id. Hardcoded on purpose: `rand` is shared by
 * pickFourSlots() and the film draw, so a single extra rand() call would shift
 * every downstream showtime -> film assignment and silently reschedule the
 * whole catalogue. A table consumes no randomness.
 *
 * film-01 and film-02 MUST stay `cartelera`. SCENARIO_ANCHORS pins them onto
 * four of the five anchored showtimes (days 0-2), and a film that is not in
 * cartelera yet still sells tickets tonight is exactly the incoherence this
 * table exists to remove.
 */
const FILM_STATUS: Record<string, FilmStatus> = {
  "film-01": FilmStatus.cartelera, // pinned by SCENARIO_ANCHORS — never change
  "film-02": FilmStatus.cartelera, // pinned by SCENARIO_ANCHORS — never change
  "film-03": FilmStatus.cartelera,
  "film-04": FilmStatus.cartelera,
  "film-05": FilmStatus.cartelera,
  "film-06": FilmStatus.cartelera,
  "film-07": FilmStatus.pronto,
  "film-08": FilmStatus.pronto,
  "film-09": FilmStatus.preventa,
  "film-10": FilmStatus.preventa,
};

/** Throws rather than falling back to the column's `cartelera` default. */
function statusFor(filmId: string): FilmStatus {
  const status = FILM_STATUS[filmId];
  if (!status) throw new Error(`No FilmStatus for ${filmId}; add it to FILM_STATUS`);
  return status;
}

const SCHEDULE_DAYS = 7;
const PREVENTA_WINDOW_DAYS = 2;

const CARTELERA_FILM_IDS = FILMS.filter(
  (f) => statusFor(f.id) === FilmStatus.cartelera
).map((f) => f.id);

const RELEASED_FILM_IDS = FILMS.filter((f) => statusFor(f.id) !== FilmStatus.pronto).map(
  (f) => f.id
);

/**
 * The films the schedule may draw from on `day` — this is what stops the badge
 * from lying. `pronto` is absent from both pools, so it never gets a showtime.
 */
function eligibleFilmIds(day: number): string[] {
  return day >= SCHEDULE_DAYS - PREVENTA_WINDOW_DAYS ? RELEASED_FILM_IDS : CARTELERA_FILM_IDS;
}

// ---------------------------------------------------------------------------
// Seat metadata (row/col -> area/areaCategory/qualityTier)
// ---------------------------------------------------------------------------
export function getSeatMeta(
  row: number,
  col: number,
  _maxRow: number,
  maxCol: number
): { area: number; areaCategory: AreaCategory; qualityTier: QualityTier } {
  // Rows 1–3: general/low
  if (row <= 3) {
    return { area: 1, areaCategory: AreaCategory.general, qualityTier: QualityTier.low };
  }
  // Rows 9+: premium/high
  if (row >= 9) {
    return { area: 1, areaCategory: AreaCategory.premium, qualityTier: QualityTier.high };
  }
  // Rows 4–8 base: general/optimal
  // Row 5, cols 1–2: preferential/optimal (overrides general)
  if (row === 5 && (col === 1 || col === 2)) {
    return {
      area: 1,
      areaCategory: AreaCategory.preferential,
      qualityTier: QualityTier.optimal,
    };
  }
  // Row 6 accessibility: cols (maxCol-1, maxCol) => wheelchair/optimal (area 2)
  if (row === 6 && (col === maxCol - 1 || col === maxCol)) {
    return {
      area: 2,
      areaCategory: AreaCategory.wheelchair,
      qualityTier: QualityTier.optimal,
    };
  }
  // Companion seats: row 6, cols (maxCol-3, maxCol-2) => general/optimal
  // (same as default in rows 4–8, kept explicit for clarity)
  return { area: 1, areaCategory: AreaCategory.general, qualityTier: QualityTier.optimal };
}

// ---------------------------------------------------------------------------
// Seat blocks — mirrors web/src/lib/business/layout.ts (ROOM_LAYOUTS.blocks).
// Blocks are 1-based inclusive column ranges and act as WALLS: adjacency never
// straddles them, and the orphan rule is evaluated one block at a time. The
// seed cannot import from src/ (it runs standalone under `prisma db seed`), so
// the table is duplicated here; layout.ts stays the source of truth.
// ---------------------------------------------------------------------------
export const ROOM_BLOCKS: Record<string, [number, number][]> = {
  imax: [
    [1, 5],
    [6, 15],
    [16, 20],
  ],
  "2d": [
    [1, 4],
    [5, 11],
    [12, 15],
  ],
  premium: [[1, 10]],
};

/** Port of normalizeRoom() from web/src/lib/business/layout.ts. */
export function layoutKeyFor(roomName: string): "imax" | "2d" | "premium" {
  if (roomName === "imax") return "imax";
  if (roomName.startsWith("2d")) return "2d";
  return "premium";
}

// ---------------------------------------------------------------------------
// Slot picker: pick 4 of 5 slots via PRNG (which 4 varies, count stays fixed)
// ---------------------------------------------------------------------------
/**
 * Drop exactly one of the five slots, never one a scenario is anchored to.
 *
 * `protectedTimes` is the SURVIVAL GUARANTEE for the planted scenarios. An
 * anchor pinned to a literal time would otherwise have a 1-in-5 chance of being
 * the dropped slot on any given seed; across four anchors that is
 * 1 - (4/5)^4 ≈ 59% chance at least one scenario silently vanishes. Redirecting
 * the drop makes the anchored times unconditionally present.
 *
 * Exactly ONE rand() draw is consumed regardless of how many times are
 * protected — the PRNG stream must not depend on the anchor table, or adding an
 * anchor would shift every downstream film assignment.
 */
function pickFourSlots(rand: () => number, protectedTimes: readonly string[] = []): string[] {
  const draw = Math.floor(rand() * ALL_SLOTS.length);
  let dropIdx = draw;
  // At most 2 of the 5 slots are ever protected, so an unprotected slot always
  // exists and this walk always terminates on one.
  for (let i = 0; i < ALL_SLOTS.length; i++) {
    if (!protectedTimes.includes(ALL_SLOTS[dropIdx])) break;
    dropIdx = (dropIdx + 1) % ALL_SLOTS.length;
  }
  const chosen = ALL_SLOTS.filter((_, i) => i !== dropIdx);
  // ALL_SLOTS is chronologically sorted; keep as-is
  return chosen as unknown as string[];
}

function timeToId(t: string): string {
  return t.replace(":", "");
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------
type Scenario = "soldout" | "front-only" | "optimal" | "no-adjacent" | null;

export type ScenarioAnchor = {
  siteId: string;
  roomName: string;
  day: number;
  time: string;
  scenario: Scenario;
  filmId: string | null;
};

/**
 * The planted scenarios, anchored to a literal (site, room, day, TIME).
 *
 * Previously both scenarioFor() and forcedFilmFor() keyed on `slotIdx` — an
 * index into the slot list AFTER pickFourSlots() has dropped one of five. A
 * scenario therefore landed on whichever time happened to occupy that index and
 * drifted with SEED.
 *
 * ONE table now feeds BOTH lookups, so the scenario and the film it needs can
 * never desynchronise — the failure mode of re-keying only one of them.
 * pickFourSlots() reads the same table (protectedTimesFor) and refuses to drop
 * an anchored time, which is what guarantees all four scenarios exist.
 */
export const SCENARIO_ANCHORS: ScenarioAnchor[] = [
  {
    siteId: "site-med-1",
    roomName: "imax",
    day: 0,
    time: "19:30",
    scenario: "soldout",
    filmId: "film-02",
  },
  // Day 1 plants TWO "La Odisea" showtimes at site-med-2/imax so the demo's
  // "second Odisea showtime" is well-defined; the later one carries front-only.
  {
    siteId: "site-med-2",
    roomName: "imax",
    day: 1,
    time: "19:30",
    scenario: null,
    filmId: "film-01",
  },
  {
    siteId: "site-med-2",
    roomName: "imax",
    day: 1,
    time: "21:00",
    scenario: "front-only",
    filmId: "film-01",
  },
  {
    siteId: "site-med-2",
    roomName: "imax",
    day: 2,
    time: "17:00",
    scenario: "optimal",
    filmId: "film-01",
  },
  {
    siteId: "site-bog-1",
    roomName: "2d-1",
    day: 3,
    time: "21:00",
    scenario: "no-adjacent",
    filmId: null,
  },
];

function anchorFor(
  siteId: string,
  roomName: string,
  day: number,
  time: string
): ScenarioAnchor | undefined {
  return SCENARIO_ANCHORS.find(
    (a) => a.siteId === siteId && a.roomName === roomName && a.day === day && a.time === time
  );
}

function scenarioFor(siteId: string, roomName: string, day: number, time: string): Scenario {
  return anchorFor(siteId, roomName, day, time)?.scenario ?? null;
}

function forcedFilmFor(
  siteId: string,
  roomName: string,
  day: number,
  time: string
): string | null {
  return anchorFor(siteId, roomName, day, time)?.filmId ?? null;
}

function protectedTimesFor(siteId: string, roomName: string, day: number): string[] {
  return SCENARIO_ANCHORS.filter(
    (a) => a.siteId === siteId && a.roomName === roomName && a.day === day
  ).map((a) => a.time);
}

/** Sold fraction of the rows OUTSIDE the optimal band in the `optimal` scenario. */
const OPTIMAL_SCENARIO_OUTER_SOLD = 0.4;

/**
 * Seat status for a PLANTED showtime; normal ones go through
 * buildNormalOccupancy(). Each branch names the property that keeps it
 * distinguishable from a normal showtime of the same slot, and which cap in the
 * generator below stops a normal showtime from reproducing it.
 */
function computeSeatStatus(
  scenario: Scenario,
  row: number,
  col: number,
  rows: number,
  cols: number,
  rand: () => number
): SeatStatus {
  // DISTINGUISHER: availableCount == 0. No normal showtime reaches it —
  // MAX_SOLD_FRACTION caps them well short of a full house.
  if (scenario === "soldout") return SeatStatus.Sold;

  // DISTINGUISHER: every available seat is `low` tier. No normal showtime
  // reaches it — OPTIMAL_BAND_SOLD_CAP keeps >=15% of the optimal band free.
  if (scenario === "front-only") {
    return row <= 2 ? SeatStatus.Available : SeatStatus.Sold;
  }

  if (scenario === "optimal") {
    // One draw per seat, row-major, whichever branch consumes it, so the crowd
    // in the outer rows does not shift if the band bounds ever move.
    const draw = rand();

    // DISTINGUISHER: the optimal band is ENTIRELY free. At the old 10% sold it
    // reached 92.0% of the band available while the most open normal room
    // reached 94.0% — the scenario was the tighter of the two. A full band is
    // unreachable for a normal showtime instead of merely wider: the generator
    // sells best-tier-first and MIN_SOLD_FRACTION makes it always sell
    // something, so rows 4-8 always lose seats there.
    // Read off getSeatMeta() so the band is the same rule that writes
    // `qualityTier` to the database, never a row literal that could drift.
    if (getSeatMeta(row, col, rows, cols).qualityTier === QualityTier.optimal) {
      return SeatStatus.Available;
    }
    return draw < OPTIMAL_SCENARIO_OUTER_SOLD ? SeatStatus.Sold : SeatStatus.Available;
  }

  // DISTINGUISHER: not one adjacent available pair anywhere. Odd columns are
  // never neighbours, so the room offers seats but never two together. No
  // normal showtime reaches it — Todo 10's reserved run plus the lone-seat
  // repair leave an orphan-safe pair on every one of them.
  if (scenario === "no-adjacent") {
    // even col => Sold, odd col => Available (checkerboard, no adjacent pair)
    return col % 2 === 0 ? SeatStatus.Sold : SeatStatus.Available;
  }

  return SeatStatus.Available;
}

// ---------------------------------------------------------------------------
// Normal (un-planted) occupancy — varies by time of day and day of week
// ---------------------------------------------------------------------------
type DayBand = "weeknight" | "sunday" | "weekend";

/** Sold fractions, never available fractions. Fri/Sat prime 0.70, weeknight late 0.10. */
const BASE_SOLD_FRACTION: Record<DayBand, Record<string, number>> = {
  weeknight: { "14:00": 0.12, "17:00": 0.2, "19:30": 0.32, "21:00": 0.28, "22:45": 0.1 },
  sunday: { "14:00": 0.3, "17:00": 0.38, "19:30": 0.5, "21:00": 0.45, "22:45": 0.25 },
  weekend: { "14:00": 0.38, "17:00": 0.5, "19:30": 0.7, "21:00": 0.65, "22:45": 0.45 },
};

const OCCUPANCY_JITTER = 0.05;
const MIN_SOLD_FRACTION = 0.06;
const MAX_SOLD_FRACTION = 0.72;

/**
 * At most 85% of the `optimal` band (rows 4-8) may be sold on a normal
 * showtime, so ≥15% always stays available. Best-first clustering would
 * otherwise empty the band entirely on a busy small room and make it
 * indistinguishable from the planted `front-only` scenario.
 *
 * Effective per-room ceilings (optimal band = rows 4-8 × every column):
 *   imax    13×20=260 seats · band 100 → ≤85 sold, ≥15 available (15.0%)
 *   2d      12×15=180 seats · band  75 → ≤63 sold, ≥12 available (16.0%)
 *   premium  9×10= 90 seats · band  50 → ≤42 sold, ≥ 8 available (16.0%)
 * Whole-room ceiling is MAX_SOLD_FRACTION of the sellable seats, so no normal
 * showtime is ever 100% sold and none is ever 100% empty.
 */
const OPTIMAL_BAND_SOLD_CAP = 0.85;

/**
 * A seat count alone is not enough: 15% of Premium's band is 8 seats, and 4 of
 * the band's seats (row 5 cols 1-2 preferential, row 6 cols 9-10 wheelchair) are
 * structurally excluded from adjacency. Eight scattered singles satisfy "≥15%
 * available" and yield ZERO recommendable pairs.
 *
 * So a run of 4 contiguous general seats in the optimal band is reserved and
 * never sold. Any maximal available run of length L ≥ 4 contains an orphan-safe
 * pair — selecting its two leftmost seats leaves L-2 ≥ 2, never a lone seat —
 * and the repair pass below removes every other lone seat from that block, which
 * is the other half of what orphan.ts requires (it scans the WHOLE block, so one
 * stranded seat anywhere disqualifies every pair in the row).
 *
 * Rows 5 and 6 are excluded as anchors precisely because of the preferential and
 * wheelchair seats they carry.
 */
const PROTECTED_RUN_LENGTH = 4;
const PROTECTED_ROW_CANDIDATES = [4, 7, 8];

const TIER_ATTRACTIVENESS: Record<QualityTier, number> = {
  [QualityTier.optimal]: 1.0,
  [QualityTier.high]: 0.62,
  [QualityTier.low]: 0.28,
};
const CENTRALITY_WEIGHT = 0.4;
const NOISE_AMPLITUDE = 0.45;

function dayBandFor(weekday: number): DayBand {
  if (weekday === 5 || weekday === 6) return "weekend";
  if (weekday === 0) return "sunday";
  return "weeknight";
}

export function seatKey(row: number, col: number): string {
  return `${row}_${col}`;
}

/** Window of `runLength` columns inside `block` whose midpoint sits nearest the room centre. */
function protectedRunStart(
  block: [number, number],
  centreCol: number,
  runLength: number
): number {
  const [blockStart, blockEnd] = block;
  let best = blockStart;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let start = blockStart; start + runLength - 1 <= blockEnd; start++) {
    const distance = Math.abs(start + (runLength - 1) / 2 - centreCol);
    if (distance < bestDistance - 1e-9) {
      bestDistance = distance;
      best = start;
    }
  }
  return best;
}

type OptimalBandBudget = { available: number; minAvailable: number };

/**
 * Remove every lone available seat from one row of one block.
 *
 * Default is to SELL it — a lone seat is one a solo moviegoer took, and selling
 * it cannot strand another seat because its neighbours are already sold, which
 * is what makes it lone. Inside the optimal band that would eventually breach
 * the ≥15% floor, so once the budget is spent the lone seat is instead merged
 * into a run by freeing a neighbour. Both moves strictly reduce the number of
 * lone seats and neither can create a new one, so the loop terminates.
 */
function repairRowBlock(
  statuses: Map<string, SeatStatus>,
  row: number,
  block: [number, number],
  isWheelchair: (row: number, col: number) => boolean,
  centreCol: number,
  isOptimalRow: boolean,
  budget: OptimalBandBudget
): void {
  const [blockStart, blockEnd] = block;
  const isFree = (col: number) =>
    statuses.get(seatKey(row, col)) === SeatStatus.Available && !isWheelchair(row, col);

  for (let pass = 0; pass <= blockEnd - blockStart; pass++) {
    let lone = -1;
    let col = blockStart;
    while (col <= blockEnd) {
      if (!isFree(col)) {
        col++;
        continue;
      }
      let end = col;
      while (end + 1 <= blockEnd && isFree(end + 1)) end++;
      if (end === col) {
        lone = col;
        break;
      }
      col = end + 1;
    }
    if (lone < 0) return;

    if (!isOptimalRow || budget.available - 1 >= budget.minAvailable) {
      statuses.set(seatKey(row, lone), SeatStatus.Sold);
      if (isOptimalRow) budget.available--;
      continue;
    }

    const neighbours = [lone - 1, lone + 1].filter(
      (c) =>
        c >= blockStart &&
        c <= blockEnd &&
        !isWheelchair(row, c) &&
        statuses.get(seatKey(row, c)) === SeatStatus.Sold
    );
    if (neighbours.length === 0) return;

    neighbours.sort(
      (a, b) => Math.abs(a - centreCol) - Math.abs(b - centreCol) || a - b
    );
    statuses.set(seatKey(row, neighbours[0]), SeatStatus.Available);
    if (isOptimalRow) budget.available++;
  }
}

/**
 * Occupancy for a showtime with no planted scenario.
 *
 * Sold seats cluster the way a real room fills — best tier first, then closest
 * to the room centre — with PRNG noise so the pattern reads as organic rather
 * than as a solid block. Every draw comes from the per-showtime seeded PRNG in a
 * fixed order (jitter, protected row, then one draw per seat row-major), so the
 * same SEED reproduces the same database.
 */
function buildNormalOccupancy(
  roomName: string,
  rows: number,
  cols: number,
  weekday: number,
  time: string,
  rand: () => number
): Map<string, SeatStatus> {
  const layoutKey = layoutKeyFor(roomName);
  const blocks = ROOM_BLOCKS[layoutKey];
  const centreCol = (1 + cols) / 2;

  const base = BASE_SOLD_FRACTION[dayBandFor(weekday)][time] ?? 0.25;
  const jittered = base + (rand() - 0.5) * 2 * OCCUPANCY_JITTER;
  const target = Math.min(MAX_SOLD_FRACTION, Math.max(MIN_SOLD_FRACTION, jittered));

  const protectedRow =
    PROTECTED_ROW_CANDIDATES[Math.floor(rand() * PROTECTED_ROW_CANDIDATES.length)];
  const centreBlock = blocks[Math.floor(blocks.length / 2)];
  const runStart = protectedRunStart(centreBlock, centreCol, PROTECTED_RUN_LENGTH);
  const runEnd = runStart + PROTECTED_RUN_LENGTH - 1;

  type Cell = { row: number; col: number; score: number; isOptimal: boolean };
  const sellable: Cell[] = [];
  const wheelchairCols = new Map<number, Set<number>>();
  let optimalTotal = 0;

  for (let row = 1; row <= rows; row++) {
    for (let col = 1; col <= cols; col++) {
      const meta = getSeatMeta(row, col, rows, cols);
      const noise = rand();

      const isOptimal = meta.qualityTier === QualityTier.optimal;
      if (isOptimal) optimalTotal++;

      if (meta.areaCategory === AreaCategory.wheelchair) {
        const set = wheelchairCols.get(row) ?? new Set<number>();
        set.add(col);
        wheelchairCols.set(row, set);
        continue;
      }
      if (row === protectedRow && col >= runStart && col <= runEnd) continue;

      const centrality = 1 - Math.abs(col - centreCol) / ((cols - 1) / 2);
      const attractiveness =
        (1 - CENTRALITY_WEIGHT) * TIER_ATTRACTIVENESS[meta.qualityTier] +
        CENTRALITY_WEIGHT * centrality;
      sellable.push({
        row,
        col,
        score: attractiveness + (noise - 0.5) * NOISE_AMPLITUDE,
        isOptimal,
      });
    }
  }

  sellable.sort((a, b) => b.score - a.score || a.row - b.row || a.col - b.col);

  // Target is a fraction of EVERY seat in the room, so the figure the demo
  // reports is the same figure BASE_SOLD_FRACTION names.
  const soldTarget = Math.round(target * rows * cols);
  const optimalSoldCap = Math.floor(optimalTotal * OPTIMAL_BAND_SOLD_CAP);
  const isWheelchair = (row: number, col: number) => wheelchairCols.get(row)?.has(col) === true;

  function fillAndRepair(quota: number): { statuses: Map<string, SeatStatus>; sold: number } {
    const statuses = new Map<string, SeatStatus>();
    for (let row = 1; row <= rows; row++) {
      for (let col = 1; col <= cols; col++) {
        statuses.set(seatKey(row, col), SeatStatus.Available);
      }
    }

    let sold = 0;
    let optimalSold = 0;
    for (const cell of sellable) {
      if (sold >= quota) break;
      if (cell.isOptimal && optimalSold >= optimalSoldCap) continue;
      statuses.set(seatKey(cell.row, cell.col), SeatStatus.Sold);
      sold++;
      if (cell.isOptimal) optimalSold++;
    }

    const budget: OptimalBandBudget = {
      available: optimalTotal - optimalSold,
      minAvailable: optimalTotal - optimalSoldCap,
    };
    for (let row = 1; row <= rows; row++) {
      const isOptimalRow = getSeatMeta(row, 1, rows, cols).qualityTier === QualityTier.optimal;
      for (const block of blocks) {
        repairRowBlock(statuses, row, block, isWheelchair, centreCol, isOptimalRow, budget);
      }
    }

    let finalSold = 0;
    for (const status of statuses.values()) {
      if (status === SeatStatus.Sold) finalSold++;
    }
    return { statuses, sold: finalSold };
  }

  // The repair pass sells the lone seats the noisy fill leaves behind, so a
  // single pass lands several points above BASE_SOLD_FRACTION. Measure that
  // overshoot and re-run the (pure) fill with the quota corrected by it, so the
  // shipped occupancy matches the table rather than drifting past it.
  const firstPass = fillAndRepair(soldTarget);
  const overshoot = firstPass.sold - soldTarget;
  if (overshoot === 0) return firstPass.statuses;
  return fillAndRepair(Math.max(0, soldTarget - overshoot)).statuses;
}

export function buildSeatStatusMap(
  scenario: Scenario,
  roomName: string,
  rows: number,
  cols: number,
  weekday: number,
  time: string,
  rand: () => number
): Map<string, SeatStatus> {
  if (scenario === null) {
    return buildNormalOccupancy(roomName, rows, cols, weekday, time, rand);
  }
  const statuses = new Map<string, SeatStatus>();
  for (let row = 1; row <= rows; row++) {
    for (let col = 1; col <= cols; col++) {
      statuses.set(seatKey(row, col), computeSeatStatus(scenario, row, col, rows, cols, rand));
    }
  }
  return statuses;
}

// ---------------------------------------------------------------------------
// Schedule builder (pure — no database, so it can be verified in memory)
// ---------------------------------------------------------------------------
export type ShowtimeRow = {
  id: string;
  filmId: string;
  siteId: string;
  businessDate: Date;
  time: string;
  room: string;
};

export type SeatContext = {
  roomName: string;
  rows: number;
  cols: number;
  weekday: number;
  time: string;
  scenario: Scenario;
};

export function buildSchedule(
  seedNowDate: Date,
  rand: () => number
): {
  showtimeRows: ShowtimeRow[];
  showtimeFormatRows: { showtimeId: string; format: Format }[];
  seatContextMap: Map<string, SeatContext>;
} {
  const showtimeRows: ShowtimeRow[] = [];
  const showtimeFormatRows: { showtimeId: string; format: Format }[] = [];
  const seatContextMap = new Map<string, SeatContext>();

  for (const site of SITES) {
    for (const room of ROOMS) {
      for (let day = 0; day < SCHEDULE_DAYS; day++) {
        const businessDate = new Date(seedNowDate);
        businessDate.setUTCDate(businessDate.getUTCDate() + day);
        const slots = pickFourSlots(rand, protectedTimesFor(site.id, room.name, day));
        const pool = eligibleFilmIds(day);
        for (const time of slots) {
          // `??` short-circuits, so an anchored showtime still draws NOTHING —
          // changing that would shift every later film assignment.
          const forced = forcedFilmFor(site.id, room.name, day, time);
          const filmId = forced ?? pool[Math.floor(rand() * pool.length)];
          const stId = `st-${site.id}-${room.name}-${day}-${timeToId(time)}`;

          showtimeRows.push({
            id: stId,
            filmId,
            siteId: site.id,
            businessDate,
            time,
            room: room.name,
          });
          showtimeFormatRows.push({ showtimeId: stId, format: room.format });
          seatContextMap.set(stId, {
            roomName: room.name,
            rows: room.rows,
            cols: room.cols,
            weekday: businessDate.getUTCDay(),
            time,
            scenario: scenarioFor(site.id, room.name, day, time),
          });
        }
      }
    }
  }

  return { showtimeRows, showtimeFormatRows, seatContextMap };
}

// ---------------------------------------------------------------------------
// Chunked bulk insert helper (Postgres bind-parameter safety)
// ---------------------------------------------------------------------------
async function chunkedCreateMany<T>(
  insertFn: (data: T[]) => Promise<unknown>,
  data: T[],
  chunkSize: number,
  label: string
): Promise<void> {
  for (let i = 0; i < data.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, data.length);
    const chunk = data.slice(i, end);
    await insertFn(chunk);
    console.log(`  ${label}: ${end}/${data.length}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
export async function main(opts?: { SEED?: string; SEED_NOW?: string }): Promise<void> {
  const SEED = opts?.SEED ?? process.env.SEED ?? "42";
  const SEED_NOW = opts?.SEED_NOW ?? process.env.SEED_NOW ?? "2026-01-01";

  const seedNum = parseInt(SEED, 10);
  if (!Number.isFinite(seedNum)) throw new Error(`Invalid SEED: ${SEED}`);
  const seedNowDate = new Date(`${SEED_NOW}T00:00:00Z`);
  if (Number.isNaN(seedNowDate.getTime())) {
    throw new Error(`Invalid SEED_NOW: ${SEED_NOW} (expected YYYY-MM-DD)`);
  }

  const connectionString = process.env.DATABASE_URL_UNPOOLED;
  if (!connectionString) {
    throw new Error("DATABASE_URL_UNPOOLED not set; seed requires a direct (non-pooled) URL");
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });
  const rand = mulberry32(seedNum);

  try {
    console.log(`Seed start (SEED=${SEED}, SEED_NOW=${SEED_NOW})`);

    // Warmup: absorb Neon cold start before doing real work
    console.log("Warmup query...");
    await prisma.$queryRaw`SELECT 1`;

    // Wipe existing data — children before parents (idempotent reseed)
    console.log("Wiping existing data (children -> parents)...");
    await prisma.seat.deleteMany({});
    await prisma.showtimeFormat.deleteMany({});
    await prisma.showtime.deleteMany({});
    await prisma.siteFormat.deleteMany({});
    await prisma.site.deleteMany({});
    await prisma.film.deleteMany({});

    // Films
    console.log("Inserting films...");
    await prisma.film.createMany({
      data: FILMS.map((f) => ({
        id: f.id,
        title: f.title,
        posterUrl: posterUrlFor(f.id),
        synopsis: f.synopsis,
        durationMin: f.durationMin,
        rating: f.rating,
        director: f.director,
        cast: f.cast,
        genres: f.genres,
        status: statusFor(f.id),
      })),
    });

    // Sites
    console.log("Inserting sites...");
    await prisma.site.createMany({
      data: SITES.map((s) => ({
        id: s.id,
        name: s.name,
        city: s.city,
        lat: s.lat,
        lng: s.lng,
      })),
    });

    // SiteFormats: each site has IMAX, TwoD, Premium
    console.log("Inserting site formats...");
    const siteFormats: { siteId: string; format: Format }[] = [];
    for (const s of SITES) {
      siteFormats.push({ siteId: s.id, format: Format.IMAX });
      siteFormats.push({ siteId: s.id, format: Format.TwoD });
      siteFormats.push({ siteId: s.id, format: Format.Premium });
    }
    await prisma.siteFormat.createMany({ data: siteFormats });

    // Build showtime + format rows in memory
    console.log("Building schedule...");
    const { showtimeRows, showtimeFormatRows, seatContextMap } = buildSchedule(
      seedNowDate,
      rand
    );

    console.log(`Schedule built: ${showtimeRows.length} showtimes`);

    // Insert showtimes in chunks
    console.log("Inserting showtimes...");
    await chunkedCreateMany(
      (data) => prisma.showtime.createMany({ data }),
      showtimeRows,
      5000,
      "showtimes"
    );

    // Insert showtime formats
    console.log("Inserting showtime formats...");
    await chunkedCreateMany(
      (data) => prisma.showtimeFormat.createMany({ data }),
      showtimeFormatRows,
      5000,
      "showtimeFormats"
    );

    // Seats: stream through showtimes, flush at every SEAT_CHUNK rows
    console.log("Generating & inserting seats...");
    type SeatRow = {
      showtimeId: string;
      seatId: string;
      row: number;
      col: number;
      area: number;
      status: SeatStatus;
      areaCategory: AreaCategory;
      qualityTier: QualityTier;
    };
    const SEAT_CHUNK = 5000;
    let buffer: SeatRow[] = [];
    let seatsInserted = 0;

    async function flushSeats() {
      if (buffer.length === 0) return;
      await prisma.seat.createMany({ data: buffer });
      seatsInserted += buffer.length;
      console.log(`  seats: ${seatsInserted}`);
      buffer = [];
    }

    for (const st of showtimeRows) {
      // safe: seatContextMap is populated for every st.id in the loop above
      const ctx = seatContextMap.get(st.id)!;
      // Per-showtime deterministic PRNG so results are stable regardless of
      // where in the outer loop we are.
      const seatRand = mulberry32((seedNum ^ hashCode(st.id)) | 0);
      const statuses = buildSeatStatusMap(
        ctx.scenario,
        ctx.roomName,
        ctx.rows,
        ctx.cols,
        ctx.weekday,
        ctx.time,
        seatRand
      );

      for (let row = 1; row <= ctx.rows; row++) {
        for (let col = 1; col <= ctx.cols; col++) {
          const meta = getSeatMeta(row, col, ctx.rows, ctx.cols);
          const status = statuses.get(seatKey(row, col)) ?? SeatStatus.Available;
          buffer.push({
            showtimeId: st.id,
            seatId: `${meta.area}_${row}_${col}`,
            row,
            col,
            area: meta.area,
            status,
            areaCategory: meta.areaCategory,
            qualityTier: meta.qualityTier,
          });
          if (buffer.length >= SEAT_CHUNK) {
            await flushSeats();
          }
        }
      }
    }
    await flushSeats();

    console.log(`Seed complete: ${seatsInserted} seats across ${showtimeRows.length} showtimes`);
  } finally {
    await prisma.$disconnect();
  }
}

// ---------------------------------------------------------------------------
// Self-invocation guard (allows `pnpm prisma db seed` AND direct import)
// ---------------------------------------------------------------------------
const isMain =
  !!process.argv[1] &&
  (process.argv[1].endsWith("seed.ts") || process.argv[1].endsWith("seed.js"));
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
