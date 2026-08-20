# Handoff — Fase F (`cinepais-phase-5-refinement`), Ola 2 CERRADA

**Branch:** `phase-5-refinement` (cut from `main`, **not pushed**)
**Wave:** 2 of 5 — *Data layer: film status (D4), realistic occupancy (D3), scenario integrity* (⚠️ touched the live database throughout)
**Todos:** 7–14 complete. **Next: Wave 3, Todos 15–18 — in a FRESH chat.**
**Closed:** 2026-08-20 (UTC)
**Commit:** `feat(web): film status, realistic seeded occupancy, and scenario integrity`

---

## 1. What shipped

Everything in this wave lives in `web/` — **no agent code was touched.** Wave 1 was the mirror image.

### D4 — `Film.status` is a real column now, not an id-suffix hack (Todos 8 + 9 + 11)

`web/prisma/schema.prisma` gains an enum and a defaulted column:

```prisma
enum FilmStatus {
  cartelera
  pronto
  preventa
}

model Film {
  …
  status      FilmStatus @default(cartelera)
}
```

**The migration is live on the shared Neon database.** `prisma migrate dev` was never run (it is
BANNED — §The fourth rule item 5); the SQL was authored with `--create-only`, reviewed, then applied
with `migrate deploy`. `web/prisma/migrations/20260820041341_add_film_status/migration.sql`, verbatim
and entire:

```sql
-- CreateEnum
CREATE TYPE "FilmStatus" AS ENUM ('cartelera', 'pronto', 'preventa');

-- AlterTable
ALTER TABLE "Film" ADD COLUMN     "status" "FilmStatus" NOT NULL DEFAULT 'cartelera';
```

Purely additive — no `DROP`, no `RENAME`. **The `DEFAULT 'cartelera'` is load-bearing:** `Film` is a
populated table, and Postgres cannot add a `NOT NULL` column without one. Writing it was the fix; the
plan's original text only asked someone to *confirm* it.

`web/prisma/seed.ts` assigns status from a **fixed lookup table keyed by film id — never the PRNG.**
That is not a style preference: `rand` is shared with `pickFourSlots()` and the film draw, so one
extra `rand()` call would shift every downstream showtime→film assignment and silently rewrite the
whole schedule. A table consumes no randomness.

Distribution, verified live through `GET /api/films` after this wave's final re-seed:

| status | films | showtimes |
|---|---|---|
| `cartelera` | `film-01` … `film-06` (6) | 87 · 89 · 108 · 104 · 117 · 110 |
| `pronto` | `film-07`, `film-08` (2) | **0 each** — that is what `pronto` *means* |
| `preventa` | `film-09`, `film-10` (2) | 19 · 38, all inside the last two days of the window |

**`film-01` and `film-02` are pinned `cartelera` by `SCENARIO_ANCHORS` — never change them.** The four
planted scenarios hang off their showtimes; giving either one `pronto` would delete the scenarios.

The API exposes it end to end: `FilmStatusSchema = z.enum(["cartelera","pronto","preventa"])` in
`schemas.ts`, folded into `FilmSummarySchema` (and inherited by `FilmDetailSchema`), projected in both
`getFilms()` and `getFilmDetail()` in `queries.ts`, and documented in `web/README.md`.

⚠️ **The UI does not consume it yet.** `page.tsx` still renders `<EmptyState />` unconditionally for
Pronto/Preventa and `film-card.tsx:78-83` still derives its badge from `id.slice(-2)`. **That is
Todo 17's job, in Wave 3.** The data layer landing first is the plan's sequencing, not an oversight.

### D3 — occupancy that varies by timeslot and weekday (Todo 10)

Before this wave, `computeSeatStatus()` returned `Available` for **every** seat whenever no scenario
applied. Only 4 of 672 showtimes carry a scenario, so **99.4% of rooms were completely empty** — the
demo showed a cinema nobody had ever bought a ticket for, and the seat-centring fix Wave 1 shipped was
invisible because every seat was free.

Now normal showtimes are filled by the seeded PRNG as a function of **day of week × time of day**,
with sold seats clustering from the centre and mid-rows outward rather than scattering uniformly.
Measured on the fresh post-gate database (see §3 for why these numbers are re-measured, not reused):

```
showtimes=672  normal=668
seat status totals: Available=81317  Sold=37963
per-showtime availability DIGEST (sha256/16) = 82d624ac273850de

=== OCCUPANCY SPREAD — availableCount/totalCount, all normal showtimes ===
  min    = 25.0%
  median = 70.7%
  max    = 96.7%
  distinct values = 217
```

Read as **sold** fractions (the plan's convention): busiest room **75.0% sold**, median **29.3% sold**,
quietest **3.3% sold**, across **217 distinct** availability values in 668 rooms.

**Three floors hold, and they are what keep the demo answerable:**

```
=== FLOORS ===
  optimal-band <15% available : 0
  100% sold                   : 0
  100% empty                  : 0
```

The 15% optimal-band floor is tight by design, and the busiest room of every layout sits just above it:

| room type | busiest normal showtime | sold | optimal available |
|---|---|---|---|
| premium 9×10 | `st-site-med-1-premium-0-1930` | 74.4% | **8/50 (16.0%)** |
| 2D 12×15 | `st-site-bog-2-2d-1-0-1930` | 73.9% | **12/75 (16.0%)** |
| IMAX 13×20 | `st-site-med-2-imax-0-1930` | 75.0% | **16/100 (16.0%)** |

All three land on exactly 16.0% because the cap is applied to the optimal band explicitly. **If a
future change makes any of these dip below 15%, the copilot starts having nothing good to recommend on
a Friday night — tighten the generator, never weaken the check.**

### Scenario integrity — re-keyed, then recalibrated (Todos 10b + 12)

`scenarioFor()` used to key on `slotIdx`, an index into the array **after** `pickFourSlots()` drops one
of five slots off the shared PRNG. A planted scenario therefore landed on whichever time happened to
occupy that index and drifted with the seed. It is now keyed off `SCENARIO_ANCHORS` by
`(site, room, dayIndex, HHmm)`, so the ids are stable:

| scenario | showtime id | slot this run | calibrated value |
|---|---|---|---|
| `soldout` | `st-site-med-1-imax-0-1930` | Fri 19:30 | `availableCount = 0/260` |
| `front-only` | `st-site-med-2-imax-1-2100` | Sat 21:00 | `40/260`, available seats with `qualityTier != low` = **0** |
| `optimal` | `st-site-med-2-imax-2-1700` | Sun 17:00 | optimal band **100/100 (100.0%)** vs normal max 94.0% |
| `no-adjacent` | `st-site-bog-1-2d-1-3-2100` | Mon 21:00 | `96/180`, adjacent available pairs = **0** |

Recalibration was necessary because the scenarios were designed when every other room was empty — once
normal showtimes carry real occupancy, `optimal` stops standing out on its own. The `optimal` threshold
is now **derived at runtime** from the population rather than hardcoded, and `optimal` is checked
against the most open normal room in the whole database:

```
scenario  (imax, Sun 17:00)                              100.0%  100/100  st-site-med-2-imax-2-1700
best normal, same slot + same room type (imax)            36.0%   36/100  st-site-bog-3-imax-2-1700
best normal, same slot (Sun 17:00), any room              44.0%   22/50   st-site-bog-1-premium-2-1700
best normal, same time (17:00), any weekday               86.0%   43/50   st-site-bog-1-premium-6-1700
best normal, whole population                             94.0%   47/50   st-site-med-3-premium-5-2245
```

**The negative controls are the proof, not the positive checks.** All four checks were run against the
busiest room of each layout (the cases where high occupancy could accidentally *reproduce* `front-only`
or `no-adjacent`) and against the most-open normal room. Every cell must FAIL — and every cell did.
The full population sweep:

```
check "soldout"           normal showtimes that PASS it: 0/668
check "front-only"        normal showtimes that PASS it: 0/668
check "optimal"           normal showtimes that PASS it: 0/668
check "no-adjacent"       normal showtimes that PASS it: 0/668

RESULT: PASS — scenario checks failing: 0, negative controls wrongly passing: 0, population sweep offenders: 0
```

### Determinism tests — pinned to literal ids, and one silent pass removed (Todo 13)

`web/tests/seed-determinism.test.ts` found two scenarios **positionally**, and both resolved to the
wrong row. This is the important finding of Todo 13 and it is worth reading twice:

- The `front-only` lookup was `{ id: { startsWith: "st-site-med-2-imax-1-" }, orderBy: id asc, skip: 1 }`.
  It landed on the **NORMAL** showtime `st-site-med-2-imax-1-1930` — which satisfies every one of the
  old front-only assertions. **The suite passed while testing nothing.**
- The `soldout` lookup went through `film: { title: "Sombras del Puente" }`, which matches 3 showtimes
  and survived only on `orderBy businessDate asc` ordering luck.
- The old `if (showtime) { … }` guard turned an **absent** scenario into a pass. It is gone; existence
  is asserted first, for all four ids, before any per-scenario assertion runs.

Ids are now literal in a `SCENARIO_IDS` const with a comment explaining why they must not be replaced
by a query. Assertions were **strengthened, never deleted** — the two original front-only assertions
are kept (they are true of a normal showtime too) and three discriminating ones were added beneath
them. `no-adjacent` gained a count guard first, because "no two are adjacent" is **vacuously true of an
empty set** and a fully-sold room would otherwise satisfy the scan.

**Test count: 136 → 140 (+4), zero removed.** The 4 additions are Todo 11's `FilmStatusSchema` cases in
`web/tests/schemas.test.ts`. The plan budgeted for possible *decreases* and required each be named;
none occurred.

⚠️ **The five `SEED_NOW: "2026-08-01"` literals in that file are pre-existing and were deliberately
kept** — the determinism contract requires a fixed reference time. They are also the reason `pnpm test`
wipes the live catalogue. §Scope OUT's "no new hardcoded date" ban covers **introducing** one; this
wave introduced none. Recorded here so F5 does not report a false violation.

---

## 2. Files in this commit

| File | +/- | Todo |
|---|---|---|
| `web/prisma/seed.ts` | +615 / −90 | 9, 10, 12 |
| `web/prisma/schema.prisma` | +7 / −0 | 8 |
| `web/prisma/migrations/20260820041341_add_film_status/migration.sql` | **new**, 5 lines | 8 |
| `web/src/lib/api/schemas.ts` | +3 / −0 | 11 |
| `web/src/lib/api/queries.ts` | +2 / −0 | 11 |
| `web/tests/seed-determinism.test.ts` | +70 / −31 | 13 |
| `web/tests/schemas.test.ts` | +47 / −0 | 11 |
| `web/README.md` | +5 / −1 | 11 |
| `web/scripts/scenario-check.ts` | **new**, 493 lines | 12 |
| `web/scripts/occupancy-check.ts` | **new**, 232 lines | 10 |
| `web/scripts/film-status-db-check.ts` | **new**, 156 lines | 9 |
| `web/scripts/occupancy-db-check.ts` | **new**, 129 lines | 10 |
| `web/scripts/pair-floor-check.ts` | **new**, 129 lines | 10 |
| `web/scripts/film-status-check.ts` | **new**, 55 lines | 9 |
| `.omo/plans/cinepais-phase-5-refinement.md` | +8 / −8 (checkboxes 6–14) | 14 |
| `.omo/handoff-fase-f-wave-2.md` | this file | 14 |

**🔴 Keep the six `web/scripts/*-check.ts` files.** They are not scratch work — they are the reusable
verification tooling this wave's claims rest on, they are referenced by later todos, and they are the
only way to re-prove the occupancy floors and scenario distinguishability after any future re-seed.
`occupancy-check.ts` runs the generator **in memory with no database**; `occupancy-db-check.ts` reads
the **live** database. Use the in-memory one to test a change before you seed with it.

---

## 3. The gate — measured, in order, never overlapping

| # | Step | Exit | Measurement |
|---|---|---|---|
| a | `uv run ruff check .` | **0** | `All checks passed!` |
| a | `uv run basedpyright` | **0** | `0 errors, 0 warnings, 0 notes` |
| a | `uv run pytest tests/ -m "not evals" -q` | **0** | **159 passed, 15 deselected** in 11.39 s |
| b | `pnpm lint` | **0** | eslint, no findings |
| c | `npx tsc --noEmit` | **0** | no output |
| d | `pnpm test` (detached) | **0** | **11 files / 140 tests**, 236.22 s (238 s wall) ⚠️ *wiped the catalogue* |
| e | `bash web/scripts/reseed.sh` | **0** | **672 showtimes / 119 280 seats**, **49 s wall**, window `2026-08-21 → 2026-08-27` |
| f | `curl …/api/showtimes?filmId=film-01` | **0** | **non-empty**, 87 showtimes |
| g | `pnpm build` | **0** | 10/10 static pages, `○ /` prerendered **after** the re-seed |

Step (f) actual output, first 200 bytes:

```json
[{"id":"st-site-med-1-2d-2-0-1400","filmId":"film-01","siteId":"site-med-1","siteName":"CinePaís El Poblado","city":"Medellín","businessDate":"2026-08-21","time":"14:00","room":"2d-2","formats":["2D
```

Step (e) actual output, tail:

```
reseed: OK — demo data refreshed.
  businessDate range: 2026-08-21 -> 2026-08-27  (7 days)
  showtimes:          672
```

**The agent suite went from `158 passed, 1 skipped` (Wave 1) to `159 passed`. Nothing was added.**
`agent/tests/test_api_client.py:300` skips itself with `"Web server not reachable on localhost:3000"`.
Wave 1 ran its trio with the dev server down; this wave ran it with the server up, so the test
executed. Same 159 collected, strictly more coverage. Not a regression, and not a change to the suite.

**Why the occupancy numbers in §1 are re-measured rather than copied from Todo 10.** Todo 10 measured
`min 26.5% / median 70.0% / max 96.7%`, digest `733aba55f6c8f573`, 208 distinct — against
`SEED_NOW=2026-08-20`. This wave's closing re-seed used `SEED_NOW=2026-08-21`, because `reseed.sh`
recomputes it as **tomorrow** and never accepts a literal. Occupancy is a function of **day of week**,
so shifting the window by one day remaps every day-index to a different weekday and the whole spread
moves: `25.0% / 70.7% / 96.7%`, digest `82d624ac273850de`, 217 distinct. **This is not a determinism
failure** — determinism is `same SEED + same SEED_NOW ⇒ same database`, and the three re-seeds inside
`pnpm test` (all pinned to `SEED_NOW=2026-08-01`) passed. Anyone quoting an occupancy figure must say
which `SEED_NOW` produced it.

Concretely, `2026-08-21` is a **Friday**, so this run maps day 0=Fri, 1=Sat, 2=Sun, 3=Mon — which is
why `soldout` sits on Fri 19:30 above where Todo 10 recorded Thu 19:30. **Day indices are stable;
weekdays are not. Never assert a weekday.**

**The order is the whole point, and it mattered twice here.** `web/src/app/page.tsx` is a Server
Component with no `dynamic`/`revalidate`, so `next build` statically prerenders it against the
database — building between (d) and (e) bakes an empty homepage into the output. And because this wave
*changed the seed itself*, step (e) was also the first end-to-end proof that the new occupancy and
status logic survives a full clean run against real data. It did: all four scenarios present, all three
floors held, 6/2/2 status split intact.

Timings for the next worker: `pnpm test` **238 s** (Wave 1: 191 s; Todo 13: 298 s), re-seed **49 s**
(Wave 1: 35 s; Todo 12: 74 s). Nothing hung, nothing was retried, the diagnostic ladder was not
entered. A dev server was up on :3000 during (a)–(f) and stopped before (g); :8000 was free throughout.

---

## 4. LLM budget

**0 `/chat` calls this wave. Cumulative 0 of 4.** This wave is entirely data-layer work and never
needed the model. `.omo/evidence/llm-spend-cinepais-phase-5-refinement.txt` still does not exist —
correct, there is nothing to log. **The first spend is Todo 25, budgeted at 2 calls.**

---

## 5. Deviations

**None.** Every gate step ran in order, once, exit 0. No retry, no ladder, no wall-clock lost to
looping. Two things that could be *mistaken* for deviations are recorded above rather than left to be
discovered: the agent suite's `158 passed + 1 skipped → 159 passed` (§3, a dev-server-conditional skip
that did not fire), and the occupancy spread differing from Todo 10's (§3, a `SEED_NOW` shift, not a
determinism break).

The commit is a **single** commit by explicit plan mandate — Todo 14's Accept requires
`git log --oneline main..HEAD --invert-grep --grep='^chore(omo)' | wc -l` → `2` — which overrides the
default atomic-commit preference. Recorded here so it is a decision, not an oversight. The plan file's
checkbox updates ride in the same commit, matching Wave 1's precedent exactly.

---

## 6. Traps the next worker will hit

1. **🔴 There is still exactly ONE Neon database.** `DATABASE_URL_UNPOOLED` sha256 → `ec264e7be82e`
   for dev and prod alike. Dev **is** production. Wave 3 runs `pnpm test` again at its close, and it
   will wipe the catalogue again. (d)→(e)→(f) is one unit; never build between them.
2. **🔴 A running dev server does NOT pick up `prisma generate`.** After any `prisma migrate` or
   `prisma generate`, **restart the dev server before curling**, or you will spend an hour debugging a
   phantom data bug. Todo 11 hit exactly this: HTTP 500, 0 bytes, because the Prisma client had already
   been `require`d and cached in the running Node process. Wave 3 adds **dev dependencies** (D6), which
   also means a restart.
3. **🔴 Todo 15 must add a test harness before its QA can run.** `web/vitest.config.ts` is
   `environment: "node"` with `include: ["tests/**/*.test.ts"]` — no `.tsx`, no DOM, and there is no
   `jsdom`, `@testing-library/react` or `@vitejs/plugin-react`. D6 permits these three under
   **`devDependencies` only**. The Must-NOT-Have bans the **`dependencies`** block; check with
   `git diff main -- web/package.json` and confirm every addition sits under `devDependencies`.
4. **Todo 17 is the other half of D4 and this wave is useless without it.** `status` is in the database
   and in the API, but `page.tsx` still hardcodes `<EmptyState />` for Pronto/Preventa and
   `film-card.tsx:78-83` still runs `id.slice(-2)`. **Delete `badgeForFilmId()` entirely** — leaving it
   preserves the exact drift D4 exists to remove. Verify with
   `grep -rl "badgeForFilmId" web/src --exclude-dir=generated | wc -l` → `0` (use `-rl … | wc -l`,
   **never** `grep -rc` on a directory — that prints one count line per file and can never equal `0`).
   The tabs should come out 6 / 2 / 2 and disjoint.
5. **Scenario ids are literals on purpose. Do not "improve" them into queries.** Both previous indirect
   lookups resolved to the wrong row and one of them made the suite pass while testing nothing (§1).
   The four ids: `st-site-med-1-imax-0-1930` · `st-site-med-2-imax-1-2100` ·
   `st-site-med-2-imax-2-1700` · `st-site-bog-1-2d-1-3-2100`.
6. **Never assert a weekday in a test.** Anchors are day-**index** based; which weekday a day-index
   lands on depends on the date the seed ran. `SEED_NOW=2026-08-21` ⇒ day 0 = Friday.
7. **`film-01` and `film-02` are pinned `cartelera` by `SCENARIO_ANCHORS`.** Changing either deletes
   the planted scenarios.
8. **Never spend PRNG draws in `seed.ts` casually.** `rand` is shared between `pickFourSlots()` and the
   film draw; one extra `rand()` call shifts every downstream showtime→film assignment and rewrites the
   schedule silently. Status uses a fixed table for precisely this reason.
9. **`optimal`-band availability must stay ≥ 15% on every normal showtime.** The busiest room of each
   layout currently sits at exactly 16.0%. If a negative control ever *passes* when it should fail, the
   occupancy generator has swallowed a scenario — go back to Todo 10 and tighten the cap rather than
   weakening the scenario check.
10. **Quality tiers are FIXED cutoffs, not proportional** (`row ≤ 3 → low`, `row ≥ 9 → high`, else
    `optimal`), from `seed.ts` `getSeatMeta()`. `web/src/lib/business/quality.ts` `rowToTier()` is dead
    code with zero test coverage — **Todo 26 deletes it.** Premium is where the two diverge hardest.
11. **Wave 3 opens in a fresh session, so the dev server is gone.** Start it and poll before any curl
    or browser step; a connection refusal is **not** a stale seed:
    ```bash
    mkdir -p /tmp/omo-p5
    nohup zsh -c 'cd web && pnpm dev > /tmp/omo-p5/dev.log 2>&1' &
    until [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/cities)" = "200" ]; do sleep 2; done
    ```
12. **Todo 16 is a silent no-op if Wave 1's agent half is missing.** Pydantic v2 ignores unknown
    fields, so a `city` the agent does not declare is dropped with no error. Confirm first:
    `grep -c "city" agent/src/cinepais_agent/main.py` → ≥ 1. It is present on this branch.

---

## 7. Repo state at handoff

- Branch `phase-5-refinement`, **two** non-`chore(omo)` commits ahead of `main`.
- `git status --porcelain` → **empty**.
- Nothing pushed. Deliberate.
- Live demo **restored and verified**: 672 showtimes, window `2026-08-21 → 2026-08-27`, 10 films
  (6 cartelera / 2 pronto / 2 preventa), occupancy spread 25.0% – 96.7% available across 217 distinct
  values. **Refresh again before 2026-08-27 falls into the past.**
- Receipt: `.omo/evidence/wave-2-closed-cinepais-phase-5-refinement.txt` — Todo 15 asserts it exists
  and STOPs if it does not.

---

## 8. Literal next step

Open a **NEW chat** and paste:

```
/start-work cinepais-phase-5-refinement
```

Wave 3 = **Todos 15–18** — *Web: rendering, city awareness, and the tabs*. It is the first wave since
Wave 1 that is **local-only until its closing gate**: Todos 15–17 touch no database, and only Todo 18's
`pnpm test` goes near it. Read trap 3 before Todo 15 and trap 4 before Todo 17 — those two are where
this wave's work either becomes visible or stays stranded in the database.
