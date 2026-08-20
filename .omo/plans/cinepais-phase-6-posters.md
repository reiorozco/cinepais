# Plan — CinePaís Fase G / Fase 6: portadas generadas y coherencia del catálogo

**Slug:** `cinepais-phase-6-posters`
**Intent:** clear · **review_required:** false
**Draft / decision record:** `.omo/drafts/cinepais-phase-6-posters.md`
**Base branch:** `main` (pushed, public) · **Working branch:** `phase-6-posters`
**Planner:** Prometheus. **Executor:** a separate `/start-work` session.

---

## Goal

Fase F made the product good. Two things it did not cover, both found by the user browsing the live
site and both named in the project's own design reference (`02-catalog.png`: *"Grid de pósters, tabs,
filtros"*):

1. **`/films` is incoherent.** Its Pronto and Preventa tabs are hardcoded `EmptyState`s, so two films
   are invisible in every tab and two more leak into Cartelera.
2. **Every poster is an external placeholder** reading "Film 06" beside a title that says
   *Cielo Vacío* — the image actively contradicts real content that already exists.

Fix both, then update the demo script.

## Non-negotiable conventions (AGENTS.md)

- Code, identifiers, filenames, comments → **English**. UI copy → **Spanish**.
- Fictional brand **CinePaís**. Never CineColombia's name, logo or endpoints. Mock data only.
- **No attribution lines anywhere** ("Generated with…", "Co-Authored-By…").
- Commits only where this plan says. **Each wave close is a hard stop** enforced as a criterion.

---

## Preconditions (run FIRST; if any fails, STOP and report)

```bash
cd /Users/reiorozco/Dev/cinepais
git branch --show-current                      # expect: main
git status --porcelain                         # see below
git log --oneline origin/main..main | wc -l    # expect: 0 (nothing unpushed)
curl -s -o /dev/null -w '%{http_code}' https://cinepais.vercel.app          # expect: 200
curl -s -o /dev/null -w '%{http_code}' https://cinepais-agent.fly.dev/health # expect: 200
```

**`git status --porcelain` is expected to show exactly the two planning artifacts this session wrote:**
`.omo/plans/cinepais-phase-6-posters.md` and `.omo/drafts/cinepais-phase-6-posters.md`.
Anything beyond those two is an unexpected dirty tree → STOP and report. Verify the exact paths, not
the count. Todo 1 stages both.

### Tool availability and authentication

```bash
for t in git node pnpm npx python3 uv gh vercel; do
  command -v "$t" >/dev/null 2>&1 && echo "OK   $t" || echo "MISSING $t"
done
cd web && vercel whoami          # expect the account, not a login prompt
gh auth status                   # expect logged in
```

Binaries existing is not the same as being authenticated. Wave 2 deploys; an expired token would fail
*after* the production re-seed has already run.

## Verified baselines (re-confirm before gating)

| Surface | Command | Expected |
|---|---|---|
| agent lint | `cd agent && uv run ruff check .` | exit 0 |
| agent types | `cd agent && uv run basedpyright` | exit 0, 0 errors |
| agent tests | `cd agent && uv run pytest tests/ -m "not evals" -q --timeout=120` | exit 0 |
| web gate | `pnpm lint` · `npx tsc --noEmit` · `pnpm test` · `pnpm build` | all exit 0 |

Record the **web test count** before changing anything. Fase F's closing baseline was **136 tests
across 11 files**, minus whatever Fase F's Todo 26 retired — do not assume, measure and quote it.

---

## 🔴 THE FOURTH RULE — carried over from Fase F, still binding

**There is exactly ONE Neon database. Dev *is* production.** Verified by SHA-256 in Fase E and
re-confirmed in Fase F (`.omo/handoff-fase-e-final.md` §9): `DATABASE_URL_UNPOOLED` prod vs dev →
`ec264e7be82e` / `ec264e7be82e`, **identical**. One project, one endpoint, one database.

1. **There is no "local" database.** Any todo that seeds, migrates, or runs `pnpm test` touches the
   live demo, whatever wave it is in.
2. **`pnpm test` wipes the live catalogue.** `web/tests/seed-determinism.test.ts` re-seeds three times
   with a hardcoded **`SEED_NOW = "2026-08-01"`** — a past date — so the 7-day window lands in history
   and `GET /api/showtimes` correctly returns `[]`. Measured in Fase E: **57 → 0 → 672**.
3. **Every gate that runs `pnpm test` MUST end with `bash web/scripts/reseed.sh`** and verify a
   non-empty catalogue. Repeated as a literal criterion inside both wave-close todos below.
4. **Never run `pnpm build` between the test run and the re-seed.** `web/src/app/page.tsx` is a Server
   Component with no `dynamic`/`revalidate` export, so `next build` **statically prerenders it against
   the database**. Building on a wiped catalogue bakes an empty homepage into the output. Order is
   always: `pnpm test` → **re-seed** → `pnpm build`.
5. **`prisma migrate dev` stays BANNED.** This phase adds no migration; if one ever seems necessary,
   STOP and report rather than reaching for it.

The user accepted this downtime in Fase F (personal project, unannounced). Acceptance is not the same
as ignoring it — **the demo must be left working at the end of every wave.**

### THE GATE — the exact sequence every wave-close todo runs

Referenced below as **"the standard gate"**, and written out again inside each wave-close todo,
because a rule that lives only in a global section is the rule Fase E lost.

```
(a) cd agent && uv run ruff check . && uv run basedpyright && uv run pytest tests/ -m "not evals" -q
(b) cd web && pnpm lint
(c) npx tsc --noEmit
(d) detached pnpm test                     # ⚠️ WIPES THE LIVE CATALOGUE
(e) bash web/scripts/reseed.sh             # 🔴 MANDATORY — restores it. Never skip. Never reorder.
(f) curl -s "http://localhost:3000/api/showtimes?filmId=film-01" | head -c 200   → non-empty
    (in Wave 2, curl the deployed URL instead)
(g) pnpm build                             # only now — see rule 4
```

Steps (d)→(e)→(f) are a unit. **§Three rules item 3 applies to both (d) and (e).**

### Three rules that protect the shared database

1. `pnpm test` takes **5–12 minutes**, dominated by `seed-determinism.test.ts`. Launch **detached with
   an exit-code file**, never under a short shell timeout:
   ```bash
   mkdir -p /tmp/omo-p6 && nohup zsh -c 'cd web && pnpm test > /tmp/omo-p6/test.log 2>&1; echo $? > /tmp/omo-p6/test.exit' &
   ```
2. **Never overlap `pnpm test` with `pnpm build`**, and never run two `pnpm test` concurrently.
3. **🔴 ONE ATTEMPT. NEVER RETRY A HUNG SEED OR TEST RUN BLINDLY.** Fase E lost **10+ hours** looping on
   a re-seed that stalled; the retries were themselves the cause. If a seed or `pnpm test` exceeds
   **15 minutes**, STOP and walk this ladder, recording each rung: (1) connectivity probe against Neon
   — failure means infrastructure, stop and report; (2) standalone seed, timed — a clean run (~73 s
   measured) means the seed is healthy and the hang was contention; (3) **one** clean full `pnpm test`,
   nothing else running. Only if rung 2 or 3 reproduces is there a real defect.
   **⚠️ `reseed.sh:131` prints "re-run this script" on failure. IGNORE IT.** It was written for a
   disposable local database and following it is the exact behaviour that cost Fase E those hours.

### The seed rule (never hardcode a date)

```bash
cd /Users/reiorozco/Dev/cinepais/web
bash scripts/reseed.sh    # recomputes SEED_NOW = tomorrow, never a literal
```

A **connection refusal is not a stale seed** — check the server first.

---

## Locked decisions (from the approval gate — do not relitigate)

| # | Topic | Decision |
|---|---|---|
| E1 | Scope | **One phase, both problems.** The seed must change for the posters anyway; splitting would pay the destructive re-seed twice. |
| E2 | Poster direction | **Typographic minimal, genre-driven palette.** Dark cinematic field, title in the lower third, grain + vignette. Not generative-abstract shapes. |
| E3 | Delivery | **Static SVG files** at `web/public/posters/film-XX.svg`; `posterUrl` = `/posters/film-01.svg`. All five consumers stay unchanged, it is CDN-cacheable with zero function invocations, it lets `remotePatterns` be deleted, and the agent's `str` stays valid. |
| E4 | Provenance | **A deterministic generator script produces the art; the output is committed.** Reproducible *and* reviewable — someone can open the SVG in the repo. |
| E5 | LLM budget | **ZERO live `POST /chat` calls.** This phase does not touch agent logic. |

## Scope OUT / Must-NOT-Have

- ❌ **No new runtime dependency** in `web/package.json` **`dependencies`**. The generator must use
  Node's standard library and the existing toolchain — no SVG library, no image library, no font
  library. `devDependencies` remain permitted where a test genuinely needs them (the Fase F precedent),
  but this phase is not expected to need any new one; if it does, justify it in the evidence.
- ❌ **No `dangerouslySetInnerHTML`**, and no change to the copilot's Markdown renderer.
- ❌ **Do not change any of the five poster consumers.** If a component edit seems necessary, the
  delivery decision (E3) was implemented wrong — STOP and report.
- ❌ **Do not touch agent logic.** The only permitted agent change is test fixture strings.
- ❌ **Do not run `agent/tests/evals`** — it spends real money.
- ❌ **Zero live `POST /chat` calls.**
- ❌ **Do not change `Film.status` semantics, the schedule rules, or the occupancy generator.** Fase F
  settled them; this phase consumes them.
- ❌ **No visual redesign** beyond the posters and the `/films` tab wiring — no new component library,
  no brand change, no layout rework.
- ❌ **Do not hardcode** any date, `businessDate`, or seed-derived showtime id.
- ❌ **Do not delete or rewrite** `main`'s history, or any phase branch.
- ❌ **No CineColombia** references. **No attribution lines.**

## Evidence convention

Each todo writes `.omo/evidence/task-<N>-cinepais-phase-6-posters.txt` (or `.md`/`.png`).
`.gitignore` ignores `.omo/evidence/`, so auditing needs `git status --porcelain --ignored`.
**`.omo/evidence/`, `run-continuation/`, `notepads/`, `start-work/` and `boulder.json` must never
reach `main`** — the curation established in Fase E stands.

## Test strategy

**Tests-after**, plus agent-executed QA per todo (happy + failure path, exact command, evidence path).
New tests are authored for the poster generator's determinism and completeness (Todo 5) and the
`/films` status partition (Todo 9). Existing fixtures that embed the old placeholder URL are updated,
never deleted.

## LLM budget

**Ceiling: ZERO live `POST /chat` calls.** If any todo appears to need one, the plan is wrong — STOP
and report rather than spending. The `.omo/evidence/llm-spend-cinepais-phase-6-posters.txt` file
should end the phase containing the single line `0 calls — none required`.

## Wave boundaries are gates, not suggestions

1. **Closing side.** A wave's final todo completes only when
   `.omo/evidence/wave-<N>-closed-cinepais-phase-6-posters.txt` exists with that wave's exit codes.
2. **Opening side.** The FIRST todo of the following wave asserts the previous receipt exists and STOPs
   if it does not.
3. **Ownership.** Starting the next wave is the orchestrator's/user's action, never the executor's.
4. **🔴 Every wave close ENDS BY PRINTING A PASTE-READY CONTINUATION BLOCK to the user**, in a fenced
   code block, with real measured values — never placeholders:
   ```
   Fase G — Ola <N> CERRADA.

   Estado: <one line: what shipped>
   Gate: agent ✅ · lint ✅ · tsc ✅ · test ✅ · re-seed ✅ · catálogo no vacío ✅ · build ✅
   Commit: <sha> <subject>
   Demo: <the non-empty catalogue check's actual output>
   Gasto LLM: 0 /chat (presupuesto de la fase: 0)
   Desviaciones: <none | list>

   Siguiente: Ola <N+1>, Todos <a>–<b>. Pegar en un chat NUEVO:
       /start-work cinepais-phase-6-posters
   Leer primero: .omo/handoff-fase-g-wave-<N>.md
   ```
5. **Every wave writes `.omo/handoff-fase-g-wave-<N>.md` and stages it into that wave's own commit.**
   Repeated as a literal criterion inside every wave-close todo below. Redundancy is the point.

**Honest residual risk:** nothing can technically force a process to terminate. If a boundary is
crossed anyway, F1 must report it as a deviation rather than absorb it.

---

## Todos

### Wave 1 — Build: the poster generator, the art, and `/films` coherence

- [x] 1. `git`: cut `phase-6-posters` from `main` and record the quality baselines
  - **Do:** `git checkout main && git pull` (confirm clean), then `git checkout -b phase-6-posters`. **Stage the two planning artifacts** so downstream clean-tree criteria are reachable: `git add .omo/plans/cinepais-phase-6-posters.md .omo/drafts/cinepais-phase-6-posters.md` (committed in Todo 10, not separately). Capture verbatim: the three agent gates plus web `pnpm lint` and `npx tsc --noEmit`. **Record the current web test count** — do not trust the 136 figure from Fase F, measure it. **Do not** run `pnpm test`/`pnpm build` here.
  - **Accept:** `git branch --show-current` → `phase-6-posters` · `git rev-parse phase-6-posters main` prints the same sha twice · `git status --porcelain | grep -c '^??'` → `0` (positive control: `git status --porcelain | grep -cE '^(A|M)'` → `2`) · all captured commands exit 0 · the test-count baseline is written down.
  - **QA (failure path):** confirm `git remote -v` shows `origin` and that nothing is pushed from this branch — `git ls-remote --heads origin phase-6-posters | wc -l` → `0`.
  - **Evidence:** `task-1-…txt` with each command, output and exit code.

- [x] 2. `web/prisma/seed.ts`: export the film table so one source of truth feeds both the seed and the generator
  - **Why:** the generator needs each film's `id`, `title` and `genres`. Those live in the `FILMS` array inside `seed.ts`. Duplicating them into the generator would create exactly the drift this phase exists to remove — a poster that says one thing and a database that says another.
  - **Do:** export the existing film table (and its element type) from `seed.ts` without changing a single film's data. If `seed.ts`'s shape makes a clean export awkward, extract the array to `web/prisma/films-data.ts` and import it back into `seed.ts` — but **the data itself must be byte-identical**, only its location may move.
  - **Accept:** `npx tsc --noEmit` and `pnpm lint` exit 0 · `git diff main -- web/prisma/` shows **no change to any title, genre, synopsis, director, cast, rating or duration** — prove it by diffing and quoting the diff in full; it must contain only export/import/move lines.
  - **QA:** (happy) a one-off script imports the exported table and prints all 10 ids and titles — quote the output; (failure) confirm the seed still runs to completion afterwards. **⚠️ That re-seed is a live re-seed** — §Three rules item 3 applies.
  - **Evidence:** `task-2-…txt` with the diff and the 10 titles.

- [x] 3. `web/scripts/generate-posters.ts`: a deterministic typographic poster generator (E2, E4)
  - **Do:** write a Node script, run with the project's existing `tsx`, that reads the exported film table and writes one SVG per film to `web/public/posters/<film.id>.svg`. **No new runtime dependency** (§Scope OUT) — Node stdlib and string templating only.
  - **🔴 THE FONT TRAP — read this before writing any `<text>`.** An SVG referenced from `<img>` or `next/image` renders in an **isolated document**: the page's CSS and web fonts do **not** apply inside it. Only fonts installed on the viewer's machine, or fonts embedded in the file itself, resolve. A naive `font-family="Inter"` will silently fall back to a serif on most machines and the layout will differ per OS.
    **Therefore:** (a) use a **system stack** — `font-family="'Helvetica Neue', Helvetica, Arial, sans-serif"` — never a web font name alone; (b) constrain every text run with **`textLength` + `lengthAdjust="spacingAndGlyphs"`** so the line occupies the same width regardless of the substituted font's metrics. Do **not** embed a base64 font: it would multiply each file's size for a portfolio asset. Do **not** convert text to paths in this phase — it defeats E4's "reviewable in the repo" goal.
  - **Composition — pin these, do not improvise:**
    - **Canvas** `viewBox="0 0 600 900"` — 2:3, matching the `aspect-[2/3]` wrappers all five consumers already use.
    - **Field:** a dark vertical `linearGradient` from the genre palette below.
    - **Vignette:** a `radialGradient` overlay darkening the edges.
    - **Grain:** an `feTurbulence` + `feColorMatrix` filter at low opacity. **This is what stops the result reading as "a div with a gradient"** — a flat colour field looks like a placeholder; texture looks like design.
    - **Mark:** one restrained geometric shape in the upper half, derived deterministically from the film id. Subordinate to the title, never competing with it.
    - **Title:** in the **lower third**, large, tight tracking, wrapped to a **maximum of two lines** (longest real title is *El Corazón del Bosque*). Wrapping is computed by the script, not by the renderer — SVG does not wrap text.
    - **Metadata line:** primary genre · duration, in micro-type beneath the title.
  - **Palette keyed on the FIRST genre**, with an explicit fallback for anything unlisted:

    | Primary genre | Direction |
    |---|---|
    | Terror | near-black with deep red |
    | Ciencia ficción | cold blues, toward cyan |
    | Familiar | warm ambers and peach |
    | Drama | desaturated sepia |
    | Acción | graphite with an electric accent |
    | Suspenso | dark greens, toward teal |
    | Aventura | ochre, sunset |
    | *(fallback)* | neutral graphite — must exist, must be exercised by a test |

    The live data uses exactly these seven as first genres; the fallback exists so a future film cannot produce a blank poster.
  - **Determinism is a hard requirement:** running the script twice must produce **byte-identical** files. No `Date`, no `Math.random`, no locale-dependent formatting, no object-key iteration that could reorder.
  - **Accept:** the script exits 0 · **`find web/public/posters -name '*.svg' | wc -l` → `10`** (⚠️ `find` with a **quoted** pattern, not `ls web/public/posters/*.svg` — the shell here is **zsh**, which aborts with `no matches found` on an unmatched glob instead of returning empty, so the criterion would error rather than fail informatively the first time it is run) · every file is non-empty · `pnpm lint` and `npx tsc --noEmit` exit 0 · `git diff main -- web/package.json` shows **no addition under `dependencies`**.
  - **QA:** (happy) run the script twice into two temp directories and `diff -r` them — must report no differences; quote the command and its empty output; (failure) temporarily feed the generator a film with an unlisted genre and confirm it produces a valid poster using the fallback palette rather than throwing or emitting an empty gradient — then revert the temporary input.
  - **Evidence:** `task-3-…txt` with the double-run diff, plus the raw SVG source of one poster quoted in full.

- [x] 4. Commit the generated art and look at it — the first point where the design can be judged
  - **Do:** run the generator for real and commit the 10 SVGs under `web/public/posters/`. Then **actually view them**: open each at ~200 px wide (grid size) and at ~400 px (detail size) in a browser and screenshot the set.
  - **🔴 Judge at grid size first.** These are seen as small tiles in a six-across grid far more often than large. A poster that is elegant at 600 px and illegible at 180 px has failed. If the title is not readable at grid size, go back to Todo 3 and increase its size or reduce the wrap width — that is a design iteration, not a defect.
  - **Accept:** 10 files tracked by git — `git ls-files web/public/posters/ | wc -l` → `10` · total directory size is recorded and is **under 200 KB** for all ten combined (these are vector files; anything larger means the grain filter is being rasterised or something is embedded that should not be).
  - **QA:** (happy) a contact-sheet screenshot of all ten at grid size and a single poster at detail size; (failure) confirm each poster's title is legible at grid size and that no title overflows its box or collides with the metadata line — name any film whose title needed a wrap adjustment.
  - **Evidence:** `task-4-…png` (contact sheet + one detail) + `task-4-…txt` with the file list and sizes.

- [x] 5. `web/tests/`: lock the art against silent drift
  - **Why:** the SVG embeds the film's title. A future title edit without regenerating would ship a poster that lies about the film beneath it — §Risks item 3. A convention will not prevent that; a failing test will.
  - **Do:** add a test that regenerates all ten posters into a temp directory and asserts each is **byte-identical** to the committed file. Add a second test asserting **every film in the exported table has a corresponding committed SVG** — `posterUrl` is `NOT NULL` in Prisma (`schema.prisma:66`), so a missing poster is a seed crash, not a cosmetic gap.
  - **Accept:** both tests pass · they live in `web/tests/` and are picked up by the existing vitest `include` (confirm which pattern matches, and if the file must be `.ts` rather than `.tsx`, make it so — this test needs no DOM).
  - **QA:** (happy) both pass on a clean tree; (**failure — the one that matters**) temporarily change one film's title in the exported table **without** regenerating, confirm the byte-identity test **FAILS** with a message naming the offending film, then revert. Quote both runs. A guard that has never been seen to fail is not a guard.
  - **Evidence:** `task-5-…txt` with the deliberate-fail run and the passing run.

- [x] 6. `web/prisma/seed.ts` + `web/next.config.ts`: point at the local art and drop the external allowlist
  - **Do:** (a) rewrite `posterUrlFor()` (`seed.ts:171-175`) to return `/posters/${id}.svg` — a root-relative path, which `next/image` accepts for local assets without any `remotePatterns` entry; (b) delete the `placehold.co` entry from `web/next.config.ts` `images.remotePatterns`. **Leave `dangerouslyAllowSVG: true` and its CSP (`default-src 'self'; script-src 'none'; sandbox;`) exactly as they are** — that CSP is what makes serving SVG safe, and it is already correct.
  - **🔴 Before deleting the allowlist, prove nothing else needs it:** `grep -rn "placehold" web/src web/prisma web/next.config.ts` must return only the lines this todo is changing (positive control: `grep -rn "remotePatterns" web/next.config.ts | wc -l` → ≥ 1 before the edit). If any other consumer appears, STOP and report.
  - **Accept:** `grep -rn "placehold" web/src web/prisma web/next.config.ts` → **nothing** afterwards · `grep -c "dangerouslyAllowSVG" web/next.config.ts` → `1` (it must survive) · `pnpm lint`, `npx tsc --noEmit` exit 0.
  - **QA:** (happy) re-seed and confirm `curl -s "http://localhost:3000/api/films" | head -c 300` shows `"posterUrl":"/posters/film-..."`; (**failure — the empirical one**) open the site and confirm a poster **actually renders** in the browser, not merely that the URL returns 200. `next/image` with a local SVG and `dangerouslyAllowSVG` is the exact combination §Risks item 5 flags as needing proof; if images are broken, try `unoptimized` on the poster consumers **only as a diagnostic**, and if it turns out to be required, STOP and report — that would contradict §Scope OUT's "do not change the five consumers".
  - **⚠️ Timing:** this runs a full live re-seed. §Three rules item 3 is binding.
  - **Evidence:** `task-6-…png` (a rendered card in the browser) + `task-6-…txt`.

- [x] 7. Extract the tab configuration so `/films` and the home page cannot drift apart
  - **Why:** `page.tsx:23-45` defines `FILM_TABS` (status + label + per-status empty copy) and `/films` is about to need the identical thing. Copying it would recreate the two-sources-of-truth defect that caused this whole phase — the home page and `/films` disagreeing about what a status means.
  - **Do:** move `FILM_TABS` into a shared module (alongside or near `STATUS_BADGE` in `web/src/components/films/film-card.tsx:32-39`, which is already exported for exactly this reason) and have **both** pages import it. Keep the typing total — a `Record` keyed on the status enum, so adding an enum value breaks the build rather than silently rendering nothing.
  - **Accept:** **`grep -rl "FILM_TABS" web/src | wc -l` → ≥ `3`** — count the **files** that mention it (definition module + `page.tsx` + `films/page.tsx`). ⚠️ Do **not** use `grep -rn … | wc -l`: that counts *lines*, and `page.tsx` alone already contains **4** of them today, so the check would pass before any work was done. Today this file count is **1**; it must become 3. (Positive control: `grep -rl "STATUS_BADGE" web/src | wc -l` → ≥ 1.) · the home page's rendered output is unchanged — confirm by screenshotting all three home tabs before and after and comparing · `pnpm lint`, `npx tsc --noEmit` exit 0.
  - **QA:** (happy) all three home tabs still show the same films as before the extraction; (failure) temporarily add a fourth value to the status enum and confirm `npx tsc --noEmit` **fails** at the tab config, then revert — proving the totality guard is real.
  - **Evidence:** `task-7-…png` (home tabs before/after) + `task-7-…txt`.

- [x] 8. `web/src/app/films/page.tsx`: wire the three tabs to `film.status` (G1, G2)
  - **Why:** lines 155-167 render `<EmptyState/>` **unconditionally** for Pronto and Preventa, and the Cartelera tab never filters by status at all. Net effect measured against live data: the two `pronto` films (*Espejo Roto*, *Vientos del Sur*) are **invisible in every tab**, and the two `preventa` films (*El Guardián de Nubes*, *Marea Alta*) leak into Cartelera.
  - **Do:** replace the three hardcoded `<TabsContent>` blocks with a `.map()` over the shared `FILM_TABS`, partitioning with `filteredFilms.filter((film) => film.status === tab.status)` — the same expression `page.tsx:97-98` already uses. Render `<EmptyState>` with that tab's own copy when a partition is empty, and `<FilmGridClient>` when it is not. **Apply the status partition after the existing format filter** (`films/page.tsx:76-78`), not before — the format filter is correct and must keep working.
  - **⚠️ Do not "fix" the format filter's interaction with status.** A `pronto` film has no showtimes, so applying a format legitimately excludes it. That behaviour is correct; it only *looked* broken because the tabs were dead. Changing it is out of scope.
  - **Accept:** `grep -c "film.status" web/src/app/films/page.tsx` → **≥ 1** (positive control: `grep -c "FILM_TABS" web/src/app/films/page.tsx` → ≥ 1) · no `<EmptyState>` remains outside a `tabFilms.length === 0` branch — quote the new JSX in full · `pnpm lint`, `npx tsc --noEmit`, `pnpm build` exit 0.
  - **QA (browser, dev server up):** (happy) screenshot all three `/films` tabs and confirm each shows a **non-empty, disjoint** set, that *Espejo Roto* and *Vientos del Sur* now appear under **Pronto**, and that *El Guardián de Nubes* and *Marea Alta* appear under **Preventa** and **not** under Cartelera; (failure) confirm no film appears under two tabs, and that switching city or format never puts a film under the wrong status.
  - **Evidence:** `task-8-…png` ×3 + `task-8-…txt` naming which films landed in which tab.

- [x] 9. `FilmGridClient`: stop telling the visitor the wrong reason a grid is empty
  - **Why:** `films/page.tsx:151` passes a single hardcoded `emptyMessage` — *"No hay funciones con esos filtros — prueba otro formato"* — which `FilmGridClient` shows whenever its city filter empties the list (`film-grid-client.tsx:48-59`). Once the tabs are status-partitioned, that sentence is often simply false: the real reason may be "no hay estrenos próximos en tu ciudad", which has nothing to do with the format filter.
  - **Do:** pass a per-tab empty message from the shared `FILM_TABS` config, and distinguish the two genuine cases in Spanish: **no films of this status at all**, versus **films of this status but none in the selected city**. Keep the format-filter wording only where a format is actually applied.
  - **Accept:** `grep -c "prueba otro formato" web/src/app/films/page.tsx` → `0` unless it sits inside a branch that is genuinely format-conditional — quote the branch · `pnpm lint`, `npx tsc --noEmit` exit 0.
  - **QA:** (happy) with a city selected that has no `preventa` showtimes, the Preventa tab explains *that*, not a format problem — screenshot; (failure) with a format applied that matches nothing, the message does mention the format. Both messages are Spanish and neither mentions a cause that is not true.
  - **Evidence:** `task-9-…png` ×2 + `task-9-…txt` with both message strings quoted.

- [x] 10. Update every fixture that embeds the old placeholder URL
  - **Do:** update the poster URL in `web/tests/schemas.test.ts:23,36,149`, `agent/tests/test_mcp_server.py:20`, and `agent/tests/test_api_client.py:19,29` to the new `/posters/film-01.svg` form. **This is the only agent change permitted in this phase** (§Scope OUT) — fixture strings only, no logic, no model change. `agent/src/cinepais_agent/models.py:22` keeps `posterUrl: str`; a root-relative path is still a valid `str` and the agent never reads the field.
  - **Accept:** `grep -rn "placehold" web/ agent/ --include='*.ts' --include='*.py' --include='*.md'` → **nothing** (positive control: `grep -rn "posterUrl" agent/tests | wc -l` → ≥ 3) · the three agent gates exit 0 · `git diff main -- agent/src/` is **empty**.
  - **QA:** (happy) `cd agent && uv run pytest tests/ -m "not evals" -q` exits 0; (failure) confirm no agent **source** file changed — an empty `git diff` on `agent/src/` is the proof.
  - **Evidence:** `task-10-…txt` with the empty `agent/src/` diff.

- [x] 11. **Wave 1 close — HARD GATE. Do not start Todo 12 in this session.**
  - **Do:** run **the standard gate** (§The fourth rule) in order, never overlapping — (a) agent trio, (b) `pnpm lint`, (c) `npx tsc --noEmit`, (d) detached `pnpm test`, **(e) `bash web/scripts/reseed.sh`**, (f) non-empty catalogue check, (g) `pnpm build`. Write `.omo/handoff-fase-g-wave-1.md` and **stage it into this commit**.
  - **🔴 Step (e) is not optional.** `pnpm test` re-seeds the shared live database three times with a past date and leaves `GET /api/showtimes` returning `[]`. Re-seed, verify, then build — building on a wiped catalogue prerenders an empty homepage into the output.
  - **Commit:** `feat(web): generated film posters and a status-driven catalogue`
  - **Accept:** every command exits 0 · **the re-seed ran after `pnpm test` and the catalogue check returned a non-empty array — quote it** · `git log --oneline main..HEAD --invert-grep --grep='^chore(omo)' | wc -l` → `1` · `git status --porcelain` empty · `git ls-files .omo/handoff-fase-g-wave-1.md | wc -l` → **`1`** · `git ls-remote --heads origin phase-6-posters | wc -l` → `0` (nothing pushed yet) · `git ls-files web/public/posters/ | wc -l` → `10`.
  - **STOP CONDITION:** complete only when `.omo/evidence/wave-1-closed-cinepais-phase-6-posters.txt` exists containing those exit codes, **and the paste-ready continuation block (§Wave boundaries rule 4) has been printed to the user with real values**, naming Wave 2, Todos 12–16. **End the session.** Todo 12 begins in a fresh chat.

---

### Wave 2 — Ship: production data, deploy, live proof, and the docs

- [x] 12. Merge to `main` and push — in that order
  - **Precondition:** assert `test -f .omo/evidence/wave-1-closed-cinepais-phase-6-posters.txt` — STOP if absent.
  - **Do (step 1 — merge):** merge `phase-6-posters` into `main` (keep the branch as a local backup; never delete it).
  - **🔴 Accept (step 1) — verify the merge did not undo the publication curation, BEFORE anything irreversible:** `git log --oneline main -- '.omo/evidence/*' '.omo/run-continuation/*' '.omo/notepads/*' '.omo/start-work/*' '.omo/boulder.json' | wc -l` → **`0`** (positive control: `git log --oneline main -- '.omo/plans/*' | wc -l` → non-zero). Caught here it is free to fix; caught at Todo 16 it sits behind a destructive re-seed.
  - **Do (step 2 — push):** `git push origin main`.
  - **⚠️ Unlike Fase F, there is no migration to sequence against** — this phase adds no schema change, so pushing is safe as soon as the merge is clean. If a pending migration is discovered here, STOP: something upstream is not what this plan assumed.
  - **⚠️ State explicitly:** if Vercel's git integration is enabled, this push may auto-deploy immediately, serving the new `/posters/*.svg` paths against a database whose `posterUrl` still holds the old `placehold.co` values until Todo 13 re-seeds. **Posters will appear broken in that window.** That is expected and short-lived; record whether an automatic deployment fired so Todo 14's deployment is correctly described as a re-trigger rather than the first.
  - **Accept:** `git log --oneline origin/main..main | wc -l` → `0` · the curation check returned `0` · `git ls-files web/public/posters/ | wc -l` → `10` on `main`.
  - **Evidence:** `task-12-…txt`.

- [x] 13. Re-seed production so `posterUrl` points at the committed art
  - **⚠️ This is the riskiest operation in the phase.** `web/prisma/seed.ts:349-356` **deletes** the whole catalogue before reinserting across ~24 unbatched `createMany` calls with **no transaction**. A run killed halfway leaves production **empty, not stale**. This is the operation that stalled at ~seat 110,000 in Fase E.
  - **Do:** announce to the user before running. Run `bash web/scripts/reseed.sh` **once**, timed, with nothing else touching the database. Because there is one database (§The fourth rule), no environment juggling is needed — `.env.local` already points at production. **Do not** create `.env.production.local`; Fase F had to delete it precisely because `next build` loads it at highest precedence.
  - **§Three rules item 3 is binding:** if it exceeds 15 minutes, **STOP and walk the diagnostic ladder — do not relaunch.** Healthy baseline ≈ 73 s. **`reseed.sh:131`'s own failure message tells you to re-run it — ignore that message.**
  - **Accept:** the script exits 0 and prints a `businessDate` range starting tomorrow · `curl -s "https://cinepais.vercel.app/api/films" | head -c 300` shows `"posterUrl":"/posters/film-...` for every film — **zero** occurrences of `placehold`.
  - **🔴 QA (failure) — do NOT relaunch.** An empty production catalogue here is the primary symptom of the stall that cost Fase E 10+ hours, on this exact operation. Walk the §Three rules ladder (connectivity probe → timed standalone seed → one clean run), recording each rung. A second blind attempt can make a live outage permanent.
  - **QA (happy):** confirm the showtime count and window match what the script reports, and that occupancy is still varied — this phase must not have disturbed Fase F's occupancy work.
  - **Evidence:** `task-13-…txt` with the timing and the API excerpt.

- [x] 14. Redeploy and prove the posters actually render in production
  - **Do:** trigger a production Vercel deployment from `main`. The agent is **not** redeployed — no agent source changed (Todo 10 asserted an empty `agent/src/` diff), so `fly deploy` is out of scope. Confirm the agent is still healthy anyway.
  - **Accept:** the Vercel deployment is READY and the build log shows `prisma generate` (positive control: it also shows `next build`) · `curl -s -o /dev/null -w '%{http_code}' https://cinepais.vercel.app` → `200` · `curl -s -o /dev/null -w '%{http_code}' https://cinepais.vercel.app/posters/film-01.svg` → `200` · `curl -s https://cinepais-agent.fly.dev/health` → `{"status":"ok"}`.
  - **🔴 QA — a 200 is not a rendered image.** Open the deployed site in a browser and screenshot: the home grid, `/films` with all three tabs, a film detail page (both the blurred backdrop and the ficha poster), and a showtime page sidebar — **five distinct poster consumers, all five verified visually**. `next/image` + local SVG + `dangerouslyAllowSVG` is the combination §Risks item 5 flags; this is where it is proven or disproven. Capture at a **mobile viewport too** — that is how LinkedIn traffic arrives.
  - **QA (failure):** confirm no broken-image placeholder appears anywhere, and that `/films`' three tabs are populated and disjoint against **production** data.
  - **Rollback:** `cd web && vercel rollback` to the previous READY deployment, then report.
  - **Evidence:** `task-14-…png` ×6 (five consumers + mobile) + `task-14-…txt`.

- [x] 15. Make the documentation and the demo script tell the truth
  - **Do:** re-read each file, then update: `web/README.md` — the `GET /api/films` and `GET /api/films/:id` examples at **lines 94 and 117**, which still show `https://placehold.co/300x450?text=Film+01`; add a short subsection describing the generated posters and how to regenerate them (`web/scripts/generate-posters.ts`). Root `README.md` — mention the generated art in the "What's inside" section, and **remove any claim that implies external image hosting**. `agent/docs/sse-contract.md` — check whether `posterUrl` appears; if it does not, change nothing there (verified: it does not, so this is a confirm-and-record step, not an edit).
    Finally, update `specs/003-demo-script.md` so the walkthrough reflects real posters and a working `/films` with three live tabs.
  - **Accept:** `grep -rn "placehold" README.md web/README.md agent/README.md specs/` → **nothing** (positive control: `grep -c "posterUrl" web/README.md` → ≥ 2) · `grep -c "posters" web/README.md` → ≥ 1 · `grep -rn "<WEB_URL>\|<AGENT_URL>" README.md specs/` → nothing.
  - **QA:** for each edited file, quote in the evidence the line that made the stale claim and the line replacing it — do not paraphrase. Then **execute every command in the READMEs' local-run and regeneration sections verbatim** and record the exit codes; an instruction that does not run is a FAIL.
  - **Evidence:** `task-15-…txt`.

- [x] 16. **Wave 2 close + phase handoff — HARD GATE**
  - **🔴 Step 0:** confirm no stray environment override is in play — `env | grep -c DATABASE_URL_UNPOOLED` → **`0`** and `test -f web/.env.production.local` → **false**. Fase F's O-B5 was a production wipe caused by exactly such a leftover export surviving into a gate that runs `pnpm test`.
  - **Do:** run **the standard gate** in order, including **`bash web/scripts/reseed.sh` after `pnpm test`** and a **non-empty catalogue check against the deployed URL** before `pnpm build`. Commit, push `main`, then write `.omo/handoff-fase-g-final.md`: what shipped, every measurement (poster file sizes, which films landed in which tab, timings), every deviation, and the literal next step.
  - **Commit:** `docs: poster generation, catalogue tabs, and the refreshed demo script`
  - **Accept:** all gates exit 0 · `git status --porcelain` empty · `git log --oneline origin/main..main | wc -l` → `0` · both live URLs return 200 · **the LLM spend file records `0 calls`** · `git ls-files .omo/handoff-fase-g-final.md | wc -l` → `1` · **the phase's last check:** `curl -s "https://cinepais.vercel.app/api/films"` shows every film with a `/posters/` URL and the catalogue is non-empty.
  - **Also verify the publication curation still holds:** `git log --oneline main -- '.omo/evidence/*' '.omo/run-continuation/*' '.omo/notepads/*' '.omo/start-work/*' | wc -l` → `0` (positive control: `git log --oneline main -- '.omo/plans/*' | wc -l` → non-zero).
  - **STOP CONDITION:** complete only when `.omo/evidence/wave-2-closed-cinepais-phase-6-posters.txt` exists, the handoff is committed, **and the paste-ready continuation block has been printed** — naming the verification wave F1–F5 and ending with the remaining human step: **record the demo video**. **End the session**, then run the final verification wave.

---

## Final verification wave

Run by the orchestrator after Todo 16. **Shared-state rules:** no lane switches branches, no lane
re-seeds while another runs, only one lane drives a browser, and **no lane spends an LLM call.**
All five must APPROVE.

- [ ] F1. Plan compliance audit — re-run every acceptance criterion in Todos 1–16 from a clean shell, pairing each negative-result grep with a positive control. Report the exact count that pass, fail, or could not be re-run, and why. **Explicitly check that both wave handoff notes exist and are tracked** (`git ls-files .omo/handoff-fase-g-wave-*.md | wc -l` → `2`) and that both wave-close receipts exist.
- [ ] F2. Code quality review — sweep `git diff main@{before-merge}..main` for dead code, `any`, and leftovers. Confirm **no runtime dependency was added**: `git diff … -- web/package.json` shows no `dependencies` change. Confirm `agent/src/` is untouched. Confirm **`grep -rn "placehold" web/src web/prisma web/tests agent/src agent/tests README.md web/README.md agent/README.md specs/`** returns nothing — scope it to real source rather than `.` , which would trawl `.git`, `node_modules` and `.next` and drown the signal (positive control: `grep -rn "posterUrl" web/src | wc -l` → ≥ 5). Confirm the poster generator is deterministic by running it once more and diffing against the committed files.
- [ ] F3. Security review — confirm `dangerouslyAllowSVG` still carries its CSP (`script-src 'none'; sandbox`), and that **the generated SVGs contain no `<script>`, no event handler, and no external reference** — **`grep -rlE '<script|on[a-z]+=|xlink:href|href="http' web/public/posters/ | wc -l` → `0`** (recursive over the *directory*, not a bare glob — zsh aborts on unmatched globs; positive control: `grep -rl "<svg" web/public/posters/ | wc -l` → `10`). This matters more than usual here: `dangerouslyAllowSVG` is enabled repo-wide, so any SVG this project serves is a potential script vector — the CSP is the mitigation and these files must not test it. Confirm no `.env` or key pattern is tracked on `main`. Confirm no `dangerouslySetInnerHTML` anywhere in `web/src`.
- [ ] F4. Hands-on QA against the **deployed** site, browsing only — walk the full purchase flow; confirm all five poster surfaces render real art at both mobile and desktop viewports; confirm `/films`' three tabs are populated and disjoint and that the two `pronto` films are visible under Pronto; confirm the format filter still narrows the Cartelera grid. **Do not send a chat message** — zero spend.
- [ ] F5. Scope fidelity — confirm every Must-NOT-Have held: no runtime dependency, no poster-consumer component changed, no agent source changed, no evals run, **zero `/chat` calls**, no `Film.status` or occupancy semantics changed, no redesign beyond the posters and tabs, no hardcoded dates, phase branches intact, no attribution lines, no CineColombia reference. Enumerate and classify every changed file.

---

## Commit strategy

| Wave | Subject |
|---|---|
| 1 | `feat(web): generated film posters and a status-driven catalogue` |
| 2 | `docs: poster generation, catalogue tabs, and the refreshed demo script` |

Executor wave commits are counted with `--invert-grep --grep='^chore(omo)'`. Orchestrator bookkeeping
commits are expected; **never rewrite history to make a count match.**

## Dependency matrix

| Todo | Depends on | Why |
|---|---|---|
| 2 | 1 | branch must exist |
| 3 | 2 | the generator reads the exported film table |
| 4 | 3 | cannot commit art that does not exist |
| 5 | 4 | the byte-identity guard compares against committed files |
| 6 | 4 | `posterUrl` may only point at art that exists |
| 7 | 1 | independent of the poster work |
| 8 | 7 | `/films` imports the shared tab config |
| 9 | 8 | the per-tab message needs the partition |
| 10 | 6 | fixtures follow the new URL shape |
| 11 | 2–10 | wave gate |
| 12 | 11 | fresh session; merges everything |
| 13 | 12 | production data follows the merged seed |
| 14 | 13 | deploy against re-seeded data |
| 15 | 14 | documents measured truth |
| 16 | 12–15 | wave gate |
| F1–F5 | 16 | post-implementation |

## Risks the executor must surface rather than silently absorb

1. **SVG text does not inherit page fonts.** Todo 3 pins a system stack plus `textLength`. If posters
   look different across machines anyway, report it — do not silently embed a font (file size) or
   convert text to paths (defeats reviewability).
2. **The production re-seed is destructive and un-transactioned.** It stalled once already. One
   attempt, 15-minute ceiling, diagnostic ladder. An empty production catalogue is a live outage.
   **`reseed.sh` will tell you to re-run it. Do not.**
3. **`pnpm test` wipes the live demo at every gate.** Accepted by the user, but only because each gate
   re-seeds afterwards. Skipping step (e) leaves the site dark between sessions.
4. **Title/art desync** — Todo 5's byte-identity test is the only thing standing between a title edit
   and a poster that lies. If that test is ever weakened to make a change pass, say so loudly.
5. **`posterUrl` is `NOT NULL`.** A film without a generated poster is a seed crash, not a blank card.
   Todo 5's completeness test exists for this.
6. **`next/image` + local SVG must be proven visually, not by status code.** Todos 6 and 14 both
   require a rendered screenshot. A 200 on the `.svg` path proves the file is served, not that the
   image element displays it.
7. **The demo video is downstream of all of this.** Recording before Todo 15 captures placeholder
   posters and two dead tabs.

---

## Review record — planner self-check

No external review was requested for this phase (it is small, adds no migration, and spends nothing).
The planner ran the defect classes that the Fase F high-accuracy review taught, against this plan:

| Check | Result |
|---|---|
| **Vacuous criteria** (a check that already passes before any work) | **1 found and fixed.** Todo 7 originally asserted `grep -rn "FILM_TABS" web/src \| wc -l` → ≥ 3. Verified against the repo: `page.tsx` alone already contains **4** matching lines, so it could never fail. Changed to `grep -rl … \| wc -l` — a *file* count, which is `1` today and must become `3`. |
| **Unquoted zsh globs** (zsh aborts on no-match rather than returning empty) | **3 found and fixed** — Todo 3's `ls …/*.svg` became `find … -name '*.svg'`; F3's two globs became recursive directory greps. |
| **Over-broad greps** | **1 found and fixed.** F2's `grep -rn "placehold" .` would have trawled `.git`, `node_modules` and `.next`; scoped to real source with a positive control. |
| **Negative greps without a positive control** | none outstanding — every one below is paired. |
| **Stale titles contradicting corrected bodies** (the Fase F Todo 2 defect) | none: no decision was revised mid-plan here. |
| **Claims inherited from a subagent without verification** | the poster consumer map and the `/films` gap list were produced by explorers and then **spot-checked by the planner** against `films/page.tsx`, `next.config.ts`, the live `/api/films`, and the design reference screenshot. The one explorer claim that proved **wrong** — that `pronto` films would appear under Cartelera — was caught and corrected: they are dropped client-side by `FilmGridClient` and are invisible in *every* tab, while the `preventa` pair is what actually leaks. |

**Why this phase exists at all, recorded honestly:** `/films` was never in Fase F's Todo 17, which named
`web/src/app/page.tsx` explicitly. F1 audited against the plan's criteria and passed correctly. Momus
did raise `films/page.tsx` during the high-accuracy review and the planner folded it into an unrelated
finding and never landed it. **A gap in the plan is invisible to every check downstream of it, and a
review finding that is not written into a todo is a finding that did not happen.**

