import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { buildSchedule, mulberry32 } from "../prisma/seed";

const PREVENTA_WINDOW_DAYS = 2;
const SEED = Number(process.env.SEED ?? "20260801");

type FilmRow = { id: string; title: string; status: string | null };
type ShowtimeRow = { id: string; filmId: string; businessDate: string };

const failures: string[] = [];

function check(label: string, ok: boolean, detail: string): void {
  if (!ok) failures.push(label);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label} — ${detail}`);
}

async function run() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL_UNPOOLED! }),
  });

  const films = await prisma.$queryRaw<FilmRow[]>`
    SELECT "id", "title", "status"::text AS status FROM "Film" ORDER BY "id"
  `;
  const showtimes = await prisma.$queryRaw<ShowtimeRow[]>`
    SELECT "id", "filmId", to_char("businessDate", 'YYYY-MM-DD') AS "businessDate"
    FROM "Showtime" ORDER BY "id"
  `;
  await prisma.$disconnect();

  const dates = [...new Set(showtimes.map((s) => s.businessDate))].sort();
  const lastDays = dates.slice(-PREVENTA_WINDOW_DAYS);
  const statusOf = new Map(films.map((f) => [f.id, f.status]));
  const showtimesOf = (filmId: string) => showtimes.filter((s) => s.filmId === filmId);

  console.log(`films=${films.length}  showtimes=${showtimes.length}`);
  console.log(`window: ${dates[0]} -> ${dates[dates.length - 1]}  (${dates.length} days)`);
  console.log(`last ${PREVENTA_WINDOW_DAYS} days (the preventa window): ${lastDays.join(", ")}`);
  console.log("");

  console.log("=== FILM STATUS, AS STORED ===");
  console.log("  film      status     showtimes  dates");
  for (const f of films) {
    const own = showtimesOf(f.id);
    const ownDates = [...new Set(own.map((s) => s.businessDate))].sort();
    console.log(
      `  ${f.id}  ${String(f.status).padEnd(9)}  ${String(own.length).padStart(9)}  ` +
        `${ownDates.join(" ") || "(none)"}`
    );
  }
  console.log("");

  const byStatus = new Map<string, string[]>();
  for (const f of films) byStatus.set(String(f.status), [...(byStatus.get(String(f.status)) ?? []), f.id]);
  console.log("=== COUNT PER FilmStatus ===");
  for (const [status, ids] of [...byStatus].sort()) {
    console.log(`  ${status.padEnd(10)} ${String(ids.length).padStart(2)}   ${ids.join(", ")}`);
  }
  console.log("");

  console.log("=== ASSERTIONS ===");

  const nullStatus = films.filter((f) => f.status === null || f.status === undefined);
  check(
    "every film has a non-null status",
    nullStatus.length === 0,
    `${films.length - nullStatus.length}/${films.length} non-null`
  );

  for (const value of ["cartelera", "pronto", "preventa"]) {
    const ids = byStatus.get(value) ?? [];
    check(`FilmStatus '${value}' appears at least once`, ids.length >= 1, `${ids.length} film(s)`);
  }

  for (const id of ["film-01", "film-02"]) {
    check(
      `${id} is cartelera (pinned by SCENARIO_ANCHORS)`,
      statusOf.get(id) === "cartelera",
      `status=${statusOf.get(id)}, showtimes=${showtimesOf(id).length}`
    );
  }

  const pronto = films.filter((f) => f.status === "pronto");
  const prontoWithShowtimes = pronto.filter((f) => showtimesOf(f.id).length > 0);
  check(
    "no pronto film has any showtime",
    prontoWithShowtimes.length === 0,
    prontoWithShowtimes.length === 0
      ? `${pronto.map((f) => f.id).join(", ")} all at 0 showtimes`
      : prontoWithShowtimes.map((f) => `${f.id}=${showtimesOf(f.id).length}`).join(", ")
  );

  const preventa = films.filter((f) => f.status === "preventa");
  const outside = preventa.flatMap((f) =>
    showtimesOf(f.id).filter((s) => !lastDays.includes(s.businessDate))
  );
  check(
    `every preventa showtime falls in the last ${PREVENTA_WINDOW_DAYS} days`,
    outside.length === 0,
    outside.length === 0
      ? `${preventa.flatMap((f) => showtimesOf(f.id)).length} preventa showtimes, all within ${lastDays.join("/")}`
      : `${outside.length} outside, e.g. ${outside[0].id} on ${outside[0].businessDate}`
  );

  const emptyPreventa = preventa.filter((f) => showtimesOf(f.id).length === 0);
  check(
    "every preventa film actually has showtimes to pre-sell",
    emptyPreventa.length === 0,
    preventa.map((f) => `${f.id}=${showtimesOf(f.id).length}`).join(", ")
  );

  // Structural proof for Todo 13: rebuilding the schedule from the same SEED and
  // the window the database actually holds must reproduce the identical showtime
  // id set. Ids depend only on (site, room, day, time), so a match proves the
  // film-pool change did not move PRNG consumption in pickFourSlots().
  const { showtimeRows } = buildSchedule(new Date(`${dates[0]}T00:00:00Z`), mulberry32(SEED));
  const dbIds = new Set(showtimes.map((s) => s.id));
  const memIds = new Set(showtimeRows.map((s) => s.id));
  const sameIds = dbIds.size === memIds.size && [...dbIds].every((id) => memIds.has(id));
  check(
    "showtime id set matches a fresh in-memory buildSchedule()",
    sameIds,
    `db=${dbIds.size} memory=${memIds.size}`
  );

  const filmMismatch = showtimeRows.filter(
    (s) => showtimes.find((db) => db.id === s.id)?.filmId !== s.filmId
  );
  check(
    "every showtime's stored film matches the rebuilt schedule",
    filmMismatch.length === 0,
    filmMismatch.length === 0
      ? "672/672 identical"
      : `${filmMismatch.length} differ, e.g. ${filmMismatch[0].id}`
  );

  console.log("");
  console.log(
    `STATUS ASSIGNMENT: ${films.map((f) => `${f.id}=${f.status}`).join(" ")}`
  );
  console.log(
    `SHOWTIMES PER FILM: ${films.map((f) => `${f.id}=${showtimesOf(f.id).length}`).join(" ")}`
  );
  console.log("");
  console.log(failures.length === 0 ? "RESULT: ALL CHECKS PASSED" : `RESULT: ${failures.length} FAILED — ${failures.join(" | ")}`);
  process.exitCode = failures.length === 0 ? 0 : 1;
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
