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
} from "../src/generated/prisma/enums";

// ---------------------------------------------------------------------------
// PRNG (deterministic; do NOT use Math.random)
// ---------------------------------------------------------------------------
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashCode(s: string): number {
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
// Seat metadata (row/col -> area/areaCategory/qualityTier)
// ---------------------------------------------------------------------------
function getSeatMeta(
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
// Slot picker: pick 4 of 5 slots via PRNG (which 4 varies, count stays fixed)
// ---------------------------------------------------------------------------
function pickFourSlots(rand: () => number): string[] {
  const dropIdx = Math.floor(rand() * ALL_SLOTS.length);
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

function scenarioFor(
  siteId: string,
  roomName: string,
  day: number,
  slotIdx: number
): Scenario {
  if (siteId === "site-med-1" && roomName === "imax" && day === 0 && slotIdx === 0) {
    return "soldout";
  }
  if (siteId === "site-med-2" && roomName === "imax" && day === 1 && slotIdx === 1) {
    return "front-only";
  }
  if (siteId === "site-med-2" && roomName === "imax" && day === 2 && slotIdx === 0) {
    return "optimal";
  }
  if (siteId === "site-bog-1" && roomName === "2d-1" && day === 3 && slotIdx === 0) {
    return "no-adjacent";
  }
  return null;
}

// Forced film assignments to guarantee planted scenarios exist
function forcedFilmFor(
  siteId: string,
  roomName: string,
  day: number,
  slotIdx: number
): string | null {
  // scenario-soldout: film-02 at site-med-1 / imax / day 0 / slot 0
  if (siteId === "site-med-1" && roomName === "imax" && day === 0 && slotIdx === 0) {
    return "film-02";
  }
  // scenario-front-only: film-01 at site-med-2 / imax / day 1 / slot 1 (second showtime)
  // Also plant slot 0 with film-01 so "second Odisea showtime" is well-defined.
  if (siteId === "site-med-2" && roomName === "imax" && day === 1) {
    if (slotIdx === 0 || slotIdx === 1) return "film-01";
  }
  // scenario-optimal: film-01 at site-med-2 / imax / day 2 / slot 0
  if (siteId === "site-med-2" && roomName === "imax" && day === 2 && slotIdx === 0) {
    return "film-01";
  }
  return null;
}

function computeSeatStatus(
  scenario: Scenario,
  row: number,
  col: number,
  rand: () => number
): SeatStatus {
  if (scenario === "soldout") return SeatStatus.Sold;
  if (scenario === "front-only") {
    return row <= 2 ? SeatStatus.Available : SeatStatus.Sold;
  }
  if (scenario === "optimal") {
    // ~30% sold overall; rows 4–8 kept wide open (10% sold), rest ~40%
    if (row >= 4 && row <= 8) {
      return rand() < 0.1 ? SeatStatus.Sold : SeatStatus.Available;
    }
    return rand() < 0.4 ? SeatStatus.Sold : SeatStatus.Available;
  }
  if (scenario === "no-adjacent") {
    // even col => Sold, odd col => Available (checkerboard, no adjacent pair)
    return col % 2 === 0 ? SeatStatus.Sold : SeatStatus.Available;
  }
  return SeatStatus.Available;
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
    type ShowtimeRow = {
      id: string;
      filmId: string;
      siteId: string;
      businessDate: Date;
      time: string;
      room: string;
    };
    const showtimeRows: ShowtimeRow[] = [];
    const showtimeFormatRows: { showtimeId: string; format: Format }[] = [];
    // Track per-showtime room + scenario for seat generation
    const showtimeRoomMap = new Map<string, { rows: number; cols: number }>();
    const showtimeScenarioMap = new Map<string, Scenario>();

    for (const site of SITES) {
      for (const room of ROOMS) {
        for (let day = 0; day < 7; day++) {
          const businessDate = new Date(seedNowDate);
          businessDate.setUTCDate(businessDate.getUTCDate() + day);
          const slots = pickFourSlots(rand);
          for (let slotIdx = 0; slotIdx < slots.length; slotIdx++) {
            const time = slots[slotIdx];
            const forced = forcedFilmFor(site.id, room.name, day, slotIdx);
            const filmId =
              forced ?? `film-${String(Math.floor(rand() * FILMS.length) + 1).padStart(2, "0")}`;
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
            showtimeRoomMap.set(stId, { rows: room.rows, cols: room.cols });
            showtimeScenarioMap.set(stId, scenarioFor(site.id, room.name, day, slotIdx));
          }
        }
      }
    }

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
      // safe: showtimeRoomMap is populated for every st.id in the loop above
      const room = showtimeRoomMap.get(st.id)!;
      const scenario = showtimeScenarioMap.get(st.id) ?? null;
      // Per-showtime deterministic PRNG so results are stable regardless of
      // where in the outer loop we are.
      const seatRand = mulberry32((seedNum ^ hashCode(st.id)) | 0);

      for (let row = 1; row <= room.rows; row++) {
        for (let col = 1; col <= room.cols; col++) {
          const meta = getSeatMeta(row, col, room.rows, room.cols);
          const status = computeSeatStatus(scenario, row, col, seatRand);
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
