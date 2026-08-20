import { config } from "dotenv";
config({ path: ".env.local" });

import { buildSchedule, mulberry32 } from "../prisma/seed";

const SEED = Number(process.env.SEED ?? "20260801");
const SEED_NOW = process.env.SEED_NOW ?? "2026-08-20";

type Counter = { draws: number };

function countingRand(seed: number, counter: Counter): () => number {
  const rand = mulberry32(seed);
  return () => {
    counter.draws++;
    return rand();
  };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function run() {
  const counter: Counter = { draws: 0 };
  const { showtimeRows } = buildSchedule(
    new Date(`${SEED_NOW}T00:00:00Z`),
    countingRand(SEED, counter)
  );

  console.log(`SEED=${SEED}  SEED_NOW=${SEED_NOW}`);
  console.log(`showtimes built: ${showtimeRows.length}`);
  console.log(`rand() draws consumed by buildSchedule(): ${counter.draws}`);
  console.log("");

  const dates = [...new Set(showtimeRows.map((s) => isoDate(s.businessDate)))].sort();
  console.log(`window: ${dates[0]} -> ${dates[dates.length - 1]}  (${dates.length} days)`);
  console.log(`last two days of the window: ${dates.slice(-2).join(", ")}`);
  console.log("");

  console.log("=== PER-FILM SCHEDULE (in memory, no database) ===");
  console.log("  film      showtimes  dates");
  const filmIds = [...new Set(showtimeRows.map((s) => s.filmId))].sort();
  for (let i = 1; i <= 10; i++) {
    const id = `film-${String(i).padStart(2, "0")}`;
    const own = showtimeRows.filter((s) => s.filmId === id);
    const ownDates = [...new Set(own.map((s) => isoDate(s.businessDate)))].sort();
    console.log(
      `  ${id}  ${String(own.length).padStart(9)}  ${ownDates.join(" ") || "(none)"}`
    );
  }
  console.log("");
  console.log(`distinct films actually scheduled: ${filmIds.length} -> ${filmIds.join(", ")}`);
}

run();
