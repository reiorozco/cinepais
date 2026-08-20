# Handoff — Fase G / Fase 6: `cinepais-phase-6-posters` (FINAL, both waves)

**Status:** phase complete. Todos 1–16 done. `main` pushed. Demo live and non-empty.
**Date:** 2026-08-20 · **Branch:** `main` · **Backup branch:** `phase-6-posters` (kept, `97eb10c`)
**Plan:** `.omo/plans/cinepais-phase-6-posters.md` · **Wave 1 handoff:** `.omo/handoff-fase-g-wave-1.md`
**LLM spend:** **0 `/chat` calls** across the entire phase (budget was 0). `.omo/evidence/llm-spend-cinepais-phase-6-posters.txt`

---

## 1. What the phase set out to fix, and whether it did

Fase F left two defects that a visitor could see on the live site, both named in the project's own
design reference (`02-catalog.png`):

| # | Defect | Status |
|---|---|---|
| 1 | `/films`' Pronto and Preventa tabs were hardcoded `EmptyState`s — two films invisible in **every** tab, two more leaking into Cartelera | **FIXED** — all three tabs are now a pure projection of `film.status` |
| 2 | Every `posterUrl` was an external placeholder reading "Film 06" beside a title saying *Cielo Vacío* | **FIXED** — 10 committed, generated, deterministic SVGs; no external image host anywhere |

Both verified against **production**, not just locally.

---

## 2. What shipped

### Wave 1 — build (Todos 1–11), commits `af824c4` + `bf372f5`

- **`web/scripts/generate-posters.ts`** (332 LOC) — a deterministic typographic poster generator.
  Node stdlib + string templating only; **zero new runtime dependencies**. Reads the film table
  exported from `web/prisma/seed.ts`, so the art and the database cannot drift apart.
- **`web/public/posters/film-01…10.svg`** — 10 committed SVGs, 2:3 (`viewBox="0 0 600 900"`),
  genre-keyed colour field + vignette + `feTurbulence` grain + one geometric mark + typeset title +
  genre·runtime caption.
- **`web/tests/poster-generation.test.ts`** (91 LOC, ~400 ms) — the drift guard. Regenerates all ten
  into a temp dir via a `tsx` **subprocess** (never an import — the generator calls `main()` at module
  scope) and asserts byte-identity, plus a completeness test that every film has a poster
  (`posterUrl` is `NOT NULL` in Prisma, so a gap is a seed crash, not a blank card).
- **`web/src/components/films/film-tabs.ts`** (78 LOC) — `FILM_TABS`, **derived** from a total
  `Record<Film["status"], FilmTabCopy>` rather than written as a second array, so adding a status
  breaks the build instead of silently dropping a tab. Imported by both `page.tsx` and `films/page.tsx`.
- **`web/src/app/films/page.tsx`** — three tabs (panels *and* triggers) wired to `film.status`.
- **`web/src/components/films/film-grid-client.tsx`** — per-tab and city-empty copy, plus the
  one-line visibility fix described in §5, deviation D8.
- **`web/prisma/seed.ts`** — `posterUrlFor()` now returns `/posters/${id}.svg`; `FilmSeed`/`FILMS` exported.
- **`web/next.config.ts`** — the whole `images.remotePatterns` key removed. `dangerouslyAllowSVG: true`
  and its CSP (`default-src 'self'; script-src 'none'; sandbox;`) deliberately **kept** — that CSP is
  the actual control, and `next/image` passes SVG through byte-for-byte rather than rasterising it.
- **6 test fixtures** updated (`web/tests/schemas.test.ts` ×3, `agent/tests/test_mcp_server.py` ×1,
  `agent/tests/test_api_client.py` ×2). **`agent/src/` untouched** — proved by an empty `git diff`.

### Wave 2 — ship (Todos 12–16)

- **Todo 12** — merged to `main` (fast-forward `688198b`→`97eb10c`), pushed. Publication curation
  re-verified **before** the push. Required an unplanned Vercel infra fix (§5, D15).
- **Todo 13** — production re-seed **verified, not re-run** (§5, D19). Live DB confirmed: 10 films,
  6 sites, 672 showtimes, 119,280 seats, `businessDate 2026-08-21 → 2026-08-27`, `placehold=0`.
- **Todo 14** — production deployment verified: build log shows `prisma generate` *running*
  (`✔ Generated Prisma Client (7.9.1) … in 78ms`) and `next build`; all **5 poster consumers**
  verified visually at desktop **and** 390 px mobile; **33 `<img>` elements across 8 views, 0 broken**.
- **Todo 15** — documentation truth pass: `web/README.md` lines 94/117 fixed, a `## Posters` section
  added with the exact regeneration command, root `README.md` given a "Generated poster art" bullet
  and its stale refresh date corrected. `specs/003-demo-script.md` needed **zero edits**.
- **Todo 16** (this commit) — the full standard gate, this handoff, push, receipts.

---

## 3. Every measurement

### Poster art — 22,413 bytes total (21.89 KiB), **10.9 % of the 200 KB ceiling**

| File | Bytes | | File | Bytes |
|---|---|---|---|---|
| film-01.svg | 2,066 | | film-06.svg | 2,106 |
| film-02.svg | 2,319 | | film-07.svg | 2,247 |
| film-03.svg | 2,268 | | film-08.svg | 2,387 |
| film-04.svg | 2,395 | | film-09.svg | 2,286 |
| film-05.svg | 2,291 | | film-10.svg | 2,048 |

`git ls-files web/public/posters/ | wc -l` → **10**. Served weight is ~2.0–2.4 KB regardless of
viewport, because `next/image` passes SVG through unchanged (`content-type=image/svg+xml size=2066`
at `w=256`, `w=1920` and `w=3840` alike).
⚠️ `du -sh` reports `40K` for this directory — that is 10 × 4 KiB of block allocation, not content.
Quote the `ls -l` byte sum.

### Which films landed in which tab — measured live against production, 2026-08-20

| Tab | n | Films |
|---|---|---|
| **Cartelera** | 6 | Cielo Vacío · Códigos Rotos · El Corazón del Bosque · La Odisea · La Última Estrella · Sombras del Puente |
| **Pronto** | 2 | **Espejo Roto** · **Vientos del Sur** ← invisible in every tab before this phase |
| **Preventa** | 2 | **El Guardián de Nubes** · **Marea Alta** ← leaked into Cartelera before this phase |

6 + 2 + 2 = 10 = the full catalogue ⇒ a genuine **partition**, disjoint and exhaustive. Every card's
`STATUS_BADGE` agrees with its tab. Structural proof of disjointness: the tab panel *swaps* the DOM,
so `document.querySelectorAll('img').length` goes 6 → 2 → 2 as you click through — a film physically
cannot be in two tabs at once.

### Timings

| Operation | Measurements this phase |
|---|---|
| `bash web/scripts/reseed.sh` | **88 s** (T2) · **40 s** (T6) · **91 s** (T11) · **47 s** (T16) — plus a ~73 s historical baseline. **Healthy band: 40–91 s.** 91 s is not a stall. |
| `pnpm test` | **244 s wall / 174.24 s reported** (T11) · **175 s wall / 168.62 s reported** (T16). Well under the 5–12 min estimate and the 15-min ceiling. |
| `pnpm build` | 6 s (T11) · **5 s** (T16) — Turbopack, warm `.next/`. |
| agent trio | 10.73 s (T11) · **10.83 s** (T16). |

### Test counts

- **web: 178 tests across 14 files** (real runner). Todo 1's static grep baseline of **162** was an
  undercount — `test.each` registers one case per row, so any grep-based count reads low.
  **Quote the runner, never the grep.**
- **agent: 158 passed, 1 skipped, 15 deselected.** The 15 deselected are the `evals` suite
  (real LLM calls / real money) — correctly never run.

### Todo 16's gate — every step, in order, one attempt each

| Step | Command | Exit | Result |
|---|---|---|---|
| 0 | `env \| grep -c DATABASE_URL_UNPOOLED` | — | **0** ✅ |
| 0 | `test -f web/.env.production.local` | — | **absent** ✅ |
| (a) | `uv run ruff check .` | **0** | `All checks passed!` |
| (a) | `uv run basedpyright` | **0** | `0 errors, 0 warnings, 0 notes` |
| (a) | `uv run pytest tests/ -m "not evals" -q` | **0** | `158 passed, 1 skipped, 15 deselected in 10.83s` |
| (b) | `pnpm lint` | **0** | clean |
| (c) | `npx tsc --noEmit` | **0** | zero bytes of output |
| (d) | `pnpm test` (detached) | **0** | `Test Files 14 passed (14)` · `Tests 178 passed (178)` · 168.62 s |
| (e) | `bash scripts/reseed.sh` | **0** | 47 s · `businessDate 2026-08-21 -> 2026-08-27` · 672 showtimes · 119,280 seats |
| (f) | `curl …vercel.app/api/showtimes?filmId=film-01` | — | **non-empty**, 87 showtimes, 19,315 bytes |
| (g) | `pnpm build` | **0** | 5 s |

**The wipe was proved, not assumed.** Between (d) and (e) the deployed API returned literally `[]` —
direct evidence that step (e) is load-bearing rather than ceremonial.

**Rule-4 proof (the check that matters more than step (f)):** step (f) proves the *database* is
populated; it does not prove the *build output* is. `/` is `○ (Static)`, so `next build` bakes it.
Asserted against the artefact directly:

```
.next/server/app/index.html   103,262 bytes
distinct /films/film-NN links        10   (expect 10)
distinct poster refs                 16
'No hay' empty-state strings          0   (expect 0)
'placehold.co'                        0   (expect 0)
```

### Production, verified at close

```
https://cinepais.vercel.app                      -> 200
https://cinepais-agent.fly.dev/health            -> 200  {"status":"ok"}
https://cinepais.vercel.app/posters/film-01.svg  -> 200  content-type=image/svg+xml  size=2066
https://cinepais.vercel.app/api/films            -> 10 films, 10 /posters/ URLs, 0 placehold.co
```

---

## 4. Scope discipline — every Must-NOT-Have held

| Constraint | Held? | Evidence |
|---|---|---|
| No new runtime dependency | ✅ | `git diff` on `web/package.json` shows no `dependencies` change |
| No poster-consumer component changed | ✅ | `unoptimized` was **not** needed; all five consumers untouched |
| No agent source changed | ✅ | `git diff main -- agent/src/` empty; only 2 test fixture files |
| No evals run | ✅ | 15 deselected every run |
| **Zero `/chat` calls** | ✅ | 0 across all 16 todos |
| No `Film.status` / occupancy semantics changed | ✅ | occupancy re-verified at T13: 31.83 % global, 219 distinct values, day gradient intact |
| No redesign beyond posters + tabs | ✅ | — |
| No hardcoded dates | ✅ | `reseed.sh` recomputes `SEED_NOW` as tomorrow every run |
| Phase branches intact | ✅ | `phase-6-posters` = `97eb10c`, kept |
| No attribution lines · no CineColombia | ✅ | — |

---

## 5. Every deviation, disclosed

Ordered by todo. **None of these were absorbed silently.**

**D1 · Todo 2 — in-place export, not extraction.** `FILMS` had an inline type literal, so naming it
`FilmSeed` and exporting both changed 2 declaration lines and **zero** data lines. The plan offered
extraction to `films-data.ts` only as a fallback "if seed.ts's shape makes a clean export awkward".
It did not.

**D2 · Todo 2 — the diff carries a 4-line doc comment.** The plan said the diff should contain "only
export/import/move lines". The comment explains why the export exists, changes no data and no
behaviour, and matches the file's existing rationale-comment convention (`FILM_STATUS`, `pickFourSlots`,
`ROOM_BLOCKS`).

**D3 · Todo 5 — a near-miss that briefly destroyed Todo 2's work.** The prescribed revert
`git checkout -- web/prisma/seed.ts` restores from the **index**; `seed.ts` was ` M` (never staged), so
the checkout wiped Todo 2's entire export change rather than the one-line test mutation. Recovered only
because the diff had been captured to `/tmp` first. **Rule for any future "mutate then revert" QA:
capture `git diff` + `shasum` first, prefer inverting the edit over any git verb, and verify the revert.**

**D4 · Todo 5 — `web/tests/` is EXCLUDED from the tsconfig program** (`web/tsconfig.json:33`). A
project-wide `npx tsc --noEmit` exit 0 says **nothing** about any of the 14 test files — proved by
appending a deliberate type error and getting exit 0. Left unfixed on purpose: adding `tests` to the
program would drag 13 pre-existing files into strict checking. **Open decision for a future phase.**

**D5 · Todos 6/10/15/F2 — `grep -rn "placehold"` is unsatisfiable as written.** The English word
*placeholder* contains the substring *placehold*. Used `grep -rn "placehold\.co"` (escaped dot,
`.co` anchor) throughout. See D11 for the full blast radius.

**D6 · Todo 6 — removed the whole `remotePatterns` key**, not just the `placehold.co` entry. Deleting
the only entry would have left `remotePatterns: []` — dead config, identical in behaviour to absent.

**D7 · Todo 6 — line-number drift.** The plan cites `posterUrlFor()` at `seed.ts:171-175`; it was at
**178-182** because Todo 2's export added 7 lines above. Expect ±7 on any `seed.ts` line citation.

**D8 · Todo 8 — 🔴 the plan's Todo 8 could not pass its own QA as written, and the fix touched a file
the todo never mentions.** The "Do" step says feed the Pronto partition to `<FilmGridClient>`; the QA
step demands *Espejo Roto* and *Vientos del Sur* appear under Pronto. Mutually exclusive, because
`film-grid-client.tsx:53` did `if (!cities || cities.length === 0) return false;` — `filmCityMap` is
built from showtimes, a `pronto` film has **zero showtimes by construction**, so it was never a key and
the city filter deleted it. Verified empirically *before* touching anything (first QA pass returned
`{ active: "Pronto", films: [] }`). **Fix: `return false` → `return true` for the no-entry case** — a
film with no showtimes anywhere is an announcement, not a listing, and no city can claim or exclude it.
Provably safe: within `/films` a missing key is unambiguous, so the branch can only ever fire for
`pronto` titles; Cartelera (6) and Preventa (2) memberships are byte-identical before and after.
This is the same trap `app/page.tsx:15-19` already documents — the home page dodges it server-side,
`/films` walked into it client-side.

**D9 · Todo 8 — also mapped the `TabsList` triggers.** The todo names only the `<TabsContent>` blocks,
but the triggers were separately hardcoded, which would have left two lists of statuses in one file —
the exact drift `FILM_TABS` exists to prevent.

**D10 · Todo 10 — the `--include='*.md'` clause is unsatisfiable at Todo 10 time.** Todo 15 (plan line
363) names `web/README.md:94,117` as its own work. The README was left untouched deliberately: editing
it at Todo 10 would have turned Todo 15 into a no-op with a pre-satisfied criterion, destroying that
todo's signal rather than saving work.

**D11 · Todo 10 — the over-broad-grep gotcha is far worse than "~7 hits".** The plan's literal command
returns **585 lines**, because it excludes no vendor directory: `web/node_modules/` (111 files) **and**
`agent/.venv/lib/python3.12/site-packages/` (~110 files — langsmith, google-genai, pygments, click,
`_pytest`, typing_extensions, langchain) are full of the ordinary English word *placeholder*. Only **2**
of the 585 were the real image host. Note the `.venv` half: `--exclude-dir=node_modules` alone is not
enough on the agent side. **F2 will hit this same trap — use the scoped form.** Scoped to first-party
source the count is exactly 7, all `placehold**er**`, all in `web/src`.

**D12 · Todo 11 — the executor commit count was 2, not the criterion's `1`.** Todo 4 legitimately
commits the art on its own (the plan's own Todo 4 instructs "commit the 10 SVGs"), so
`--invert-grep --grep='^chore(omo)'` read **2** at the Wave 1 close, and **3** across the phase after
Todo 12's `.gitignore` commit (D17). **History was NOT rewritten to make the number match** — the plan
explicitly forbids that.

**D13 · Todo 11 — 🔴 the one-database rule has a consequence nobody wrote down, and the plan describes
the resulting window exactly backwards.** The mandatory gate re-seed runs `seed.ts` *from the working
tree*, so it **ships the branch's seed to production**. At the Wave 1 close the live database began
reporting `/posters/film-XX.svg` while the deployed build was still `main`, which had no poster files:

```
https://cinepais.vercel.app/api/films            -> "posterUrl":"/posters/film-06.svg"
https://cinepais.vercel.app/posters/film-01.svg  -> 404
```

The plan's Todo 12 expects the opposite (new asset paths against an old database). **The breakage
started at the wave close, not at the push, and the push was the FIX.** Generalisable: on a
one-database setup, a gate that re-seeds makes the database track the BRANCH while the deployed build
tracks MAIN, so any seed-visible change goes live a full wave before its code does.
Knock-on: Todo 13's accept criterion (zero `placehold` in the live API) was **pre-satisfied and
therefore carried no signal** — the `businessDate` range was verified instead.

**D14 · Todo 11 — the static test-count baseline was an undercount.** 162 (grep) vs 178 (runner). Not a
regression; `test.each` is the reason.

**D15 · Todo 12 — 🔴 an unplanned Vercel infra fix, outside plan scope but necessary to unblock
deployment.** `vercel project inspect cinepais` showed **`Root Directory: .`** — it had silently drifted
from `web`, unrelated to any plan work. The Next.js app lives in `web/`, so builds found no `next` in
the root `package.json` and failed instantly with `NEXT_NO_VERSION`. This broke **both** of the
session's production pushes (`688198b` and `97eb10c`, both `state: ERROR`). Confirmed via deployment
`meta`: successful pre-session deployments carried `"gitRootDirectory": "web"`; both failed ones lacked
the field entirely, so the *setting* changed, not a per-deploy override.
**Fix:** `vercel project update cinepais --root-directory web --json` → `{"changed":true}`.

**D16 · Todo 12 — CLI deploy gotcha.** `vercel --prod` run from **inside** `web/` fails differently
("The specified Root Directory 'web' does not exist") because the CLI uploads a tree already scoped to
`web/` and Vercel then looks for `web/` inside it. Run it from the **repo root**.

**D17 · Todo 12 — an unplanned commit.** `vercel link` auto-appended `.vercel` and `.env*` to the root
`.gitignore`. Folded into `4f575fd chore: ignore .vercel/ and .env* at repo root` rather than left
dangling as a mystery diff.

**D18 · Todo 12 — a vision-based screenshot judgment produced a false alarm.** A multimodal read of the
deliberately-minimalist geometric art (thin circle/diamond/triangle outlines on dark fields — literally
Todo 3's four mark variants, exactly as designed) reported "broken placeholder images". Disproved by the
DOM: `naturalWidth > 0 && complete` on all 8 home-page `<img>`s, correct per-film `alt` text.
**Always cross-check a vision judgment on generated art against the DOM.**

**D19 · Todo 13 — 🔴 the production re-seed was NOT run. The todo was satisfied by verification.**
`reseed.sh` is shaped by exactly two inputs: `SEED` (default `20260801`) and `SEED_NOW` (recomputed as
today+1). Wave 1's gate re-seed ran on 2026-08-20 — provable from its window `2026-08-21 → 2026-08-27`,
since `first == today+1`. Todo 13 also fell on 2026-08-20. **Same SEED, same SEED_NOW ⇒ byte-identical
output.** Re-running would have changed nothing while carrying 100 % of the documented catastrophic
downside (un-transactioned, deletes-then-reinserts, one database that *is* production, historically
stalled at ~seat 110,000 in Fase E). **Generalisable rule: before running `reseed.sh`, check whether
`MIN(businessDate) == CURRENT_DATE + 1`. If it already does and `SEED` is unchanged, the re-seed is a
provable no-op — verify instead.**

**D20 · Todo 13 — side finding, deferred not fixed.** Root `README.md`'s "Last refreshed: 2026-08-15"
was stale (actual: 2026-08-20). Left for Todo 15, since Todo 13 forbids commits. Todo 15 corrected it.

**D21 · Todo 14 — no redeploy was triggered.** `dpl_tQEE57Z3ChnxiNSpmeGJfjnvm9CV` was already READY,
target `production`, commit `a867f68` — byte-identical to local `main` HEAD. Redeploying would have
rebuilt the same tree, so the full verification was run against the live site instead. A free bonus
confirmation fell out of the build log: the script paths read `/vercel/path0/web`, proving D15's Root
Directory fix is holding.

**D22 · Todo 14 — side finding, NOT fixed (out of scope).** At a 390 px viewport the fixed copilot FAB
overlaps the right edge of the second grid card, clipping the "CÓDIGOS ROTOS" wordmark **inside the
poster artwork** (the card's own text label below is unaffected). Pre-existing z-index / safe-area
interaction between the FAB and the grid — **not** a poster defect: that image reports
`complete=true, naturalWidth=457, BROKEN=false`. **Worth a UI todo in a future phase.**

**D23 · Todo 14 — a pre-existing LCP warning, left alone deliberately.** `/films/film-01` logs
`Image with src "/posters/film-01.svg" was detected as the Largest Contentful Paint … add loading="eager"`.
It is a missing `priority` prop on a **poster consumer**, and §Scope OUT forbids editing those. It
predates this phase (the same component lacked it under the old URL). Not a poster defect.

**D24 · Todo 15 — `specs/003-demo-script.md` needed zero edits.** Already accurate: no "Film 06"-style
placeholder text, tabs described as working, §9 states no known blockers. Confirmed by a **full read**,
not by grep, because the todo's own text warned it might be stale.

**D25 · Todo 15 — a new over-broad-grep false positive, this time in prose.** `web/README.md`'s intro
said "read API + **placeholder** UI" — referring to the UI's maturity, not to images — which trips the
literal accept criterion. Reworded to "read API + UI". **Grep the literal accept command yourself
before declaring done, not just the strings you edited.**

**D26 · Todo 15 — the READMEs' long-running commands were not executed verbatim.** The todo's QA says
"execute every command in the READMEs' local-run and regeneration sections verbatim". `pnpm dev`
(long-running server), `pnpm build`, `pnpm test`, `prisma migrate deploy` and the seed were **not** run
at Todo 15 — the test/build/DB operations are explicitly forbidden outside a gate, and all of them ran
under Todo 16's gate anyway. The reasoning was documented per command in the evidence file rather than
silently skipped. **The regeneration command *was* run for real**, and `git status --porcelain --
public/posters/` came back empty — the documented instruction genuinely reproduces the committed files
byte-for-byte.

**D27 · Todo 16 — 🔴 a plan-internal naming conflict that F1 will trip on.** §Wave boundaries rule 5
says every wave writes `.omo/handoff-fase-g-wave-<N>.md`, and **F1 asserts
`git ls-files .omo/handoff-fase-g-wave-*.md | wc -l` → `2`**. But Todo 16's own text and its own accept
criterion name **`.omo/handoff-fase-g-final.md`** (`git ls-files … | wc -l` → `1`). Those cannot both be
satisfied by one file. **I wrote the file Todo 16 names and did NOT duplicate it under a second name** —
maintaining the same 250-line document under two paths is precisely the two-sources-of-truth defect this
phase exists to kill. **Consequence for F1: that check will read `1`, not `2`. This document IS Wave 2's
handoff.** Recommendation: treat the criterion as satisfied by `handoff-fase-g-wave-1.md` +
`handoff-fase-g-final.md`, or amend the plan.

**D28 · phase-wide — poster screenshots can never be byte-identical.** `feTurbulence` is rasterised
**non-deterministically across page loads** by Chromium. Two captures of the *same* page with the *same*
code differed by 41,639 px — **more** than a real before/after pair differed (28,669 px). A SHA-256
mismatch on any screenshot containing a poster is therefore **not** evidence of a render change. Prove
"unchanged" with a text fingerprint, a poster-masked pixel diff (expect literally 0 differing pixels),
and a same-code control instead.

---

## 6. Traps worth carrying into the next phase

- **`pnpm test` wipes the live catalogue.** One database; dev *is* production. Every gate that runs it
  MUST end with `bash web/scripts/reseed.sh`, and **never** run `pnpm build` in between — `/` is
  statically prerendered against the database, so building on a wiped catalogue bakes an empty homepage
  into the artefact.
- **ONE ATTEMPT on any seed or test run.** 15-minute ceiling, then the diagnostic ladder. `reseed.sh:131`
  prints "re-run this script" on failure — **ignore that message**; following it is what cost Fase E 10+ hours.
- **zsh, not bash.** `${PIPESTATUS[0]}` expands to **empty** here (zsh spells it `$pipestatus`, indexed
  from 1). Redirect to a file and `echo $?` on the very next line, or you will report a passing gate you
  never measured. Unquoted globs abort with `no matches found` rather than returning empty — use
  `find … -name '*.svg'` or a recursive directory grep.
- **A green gate is worthless until you have seen it go red.** This caught the `tests/`-excluded-from-tsconfig
  hole (D4) and validated the drift guard.
- **`tsc --noEmit --listFiles` lies when `incremental: true`** (it is). Use a deliberate type error as the
  positive control instead.
- **"Still loading" ≠ "broken".** The definitive broken-image signal is `complete === true && naturalWidth === 0`.
  Counting `complete === false` as broken produced two false alarms this phase, both off-screen lazy-loaded
  carousel slides.
- **`psql` is not installed**, and Prisma 7 generates a TypeScript client behind `PrismaPg`. To query
  production read-only, copy `reseed.sh`'s own read-back block (`dotenv` + `pg`, run from `web/`) into a
  **file** — inline `node -e` mangles SQL string literals.
- **PIL 11.3.0 is available; ImageMagick is not.**

---

## 7. Repo state at close

```
branch:            main
git status:        clean
origin/main..main: 0
HEAD:              <this commit> docs: poster generation, catalogue tabs, and the refreshed demo script
backup branch:     phase-6-posters @ 97eb10c (kept, never deleted)
```

Executor wave commits (`--invert-grep --grep='^chore(omo)'`, `688198b..HEAD`), see D12/D17:

```
af824c4  feat(web): generated film poster art (10 SVGs)
bf372f5  feat(web): generated film posters and a status-driven catalogue
4f575fd  chore: ignore .vercel/ and .env* at repo root
<this>   docs: poster generation, catalogue tabs, and the refreshed demo script
```

**Publication curation holds:** `git log --oneline main -- '.omo/evidence/*' '.omo/run-continuation/*'
'.omo/notepads/*' '.omo/start-work/*'` → **0** · `'.omo/boulder.json'` → **0** ·
positive control `'.omo/plans/*'` → **23**.

---

## 8. The literal next step

1. **Run the Final Verification Wave, F1–F5** (`.omo/plans/cinepais-phase-6-posters.md` §Final
   verification wave) — orchestrator's job, not the executor's. Shared-state rules bind: no lane
   switches branches, no lane re-seeds while another runs, only one lane drives a browser, and **no lane
   spends an LLM call**. All five must APPROVE.
   - **F1** must read D27 before evaluating the handoff-count criterion.
   - **F2** must use the *scoped* `placehold` grep — the plan's literal command returns 585 lines (D11).
   - **F3**'s SVG sweep is a real control, not paranoia: `dangerouslyAllowSVG` is enabled repo-wide and
     `next/image` passes SVG through as a *document*, so the CSP is the only thing between a served
     poster and script execution.
   - **F4** browses only. **Zero `/chat` calls.**
2. **Then the one remaining human-only step: record the demo video/GIF.** It was deliberately left until
   last — §Risks item 7: recording before Todo 15 would have captured placeholder posters and two dead
   tabs. Both are now fixed and verified in production, so the site is finally in a recordable state.

**Known non-blocking follow-ups, none owned by this phase:** the 390 px FAB/grid-card overlap (D22), the
missing `priority` prop on the film-detail poster (D23), and the `web/tests/`-excluded-from-tsconfig
decision (D4).
