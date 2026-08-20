# Plan — CinePaís Fase F / Fase 5: calidad de recomendación, realismo de datos y pulido

**Slug:** `cinepais-phase-5-refinement`
**Intent:** clear · **review_required:** false
**Draft / decision record:** `.omo/drafts/cinepais-phase-5-refinement.md`
**Base branch:** `main` (pushed, public) · **Working branch:** `phase-5-refinement`
**Planner:** Prometheus. **Executor:** a separate `/start-work` session.

---

## Goal

Fase E shipped a correct product. This phase makes it a **good** one. The user's own hands-on QA of the
live site found six issues that 43 review findings could not, because every prior review verified
correctness and none verified experience. Fix the recommendation quality, the data realism, the
rendering, the city awareness, and the unimplemented tabs — then unblock the demo video.

## Non-negotiable conventions (AGENTS.md)

- Code, identifiers, filenames, comments → **English**. UI copy + agent replies → **Spanish**.
- Fictional brand **CinePaís**. Never CineColombia's name, logo or endpoints. Mock data only.
- **No attribution lines anywhere** ("Generated with…", "Co-Authored-By…").
- Commits only where this plan says. **Each wave close is a hard stop** enforced as a criterion.

---

## Preconditions (run FIRST; if any fails, STOP and report)

```bash
cd /Users/reiorozco/Dev/cinepais
git branch --show-current                      # expect: main
git status --porcelain                         # see below — NOT expected to be empty
git log --oneline origin/main..main | wc -l    # expect: 0 (nothing unpushed)
gh repo view reiorozco/cinepais --json visibility --jq .visibility   # expect: PUBLIC
curl -s -o /dev/null -w '%{http_code}' https://cinepais.vercel.app   # expect: 200
curl -s -o /dev/null -w '%{http_code}' https://cinepais-agent.fly.dev/health   # expect: 200
```

**`git status --porcelain` is expected to show the planning artifacts this planning session wrote or touched:**
`.omo/plans/cinepais-phase-5-refinement.md`, `.omo/drafts/cinepais-phase-5-refinement.md`, **and a modified
`.omo/plans/cinepais-phase-4-deploy.md`** (Fase E's plan, updated while writing this one). That is **three**
entries, not two — an earlier draft said two, and Todo 6's "`git status --porcelain` empty" criterion would
have been unreachable because the third file is never staged.

**Todo 1 stages all three.** Anything beyond them is an unexpected dirty tree → STOP and report. Verify the
exact set rather than the count: `git status --porcelain` must list only those three paths.

### Tool availability

```bash
for t in git node pnpm npx python3 uv docker fly gh vercel; do
  command -v "$t" >/dev/null 2>&1 && echo "OK   $t" || echo "MISSING $t"
done
```

**Binaries existing is not the same as being authenticated.** Wave 5 performs production-critical
operations through `vercel` and `fly`; an expired token would fail *after* the migration and re-seed
have already run. Confirm sessions now:

```bash
cd web && vercel whoami          # expect the account, not a login prompt
fly auth whoami                  # expect rfoc15@gmail.com
gh auth status                   # expect logged in
```

## Verified baselines (re-confirm before gating)

| Surface | Command | Expected |
|---|---|---|
| agent lint | `cd agent && uv run ruff check .` | exit 0 |
| agent types | `cd agent && uv run basedpyright` | exit 0, 0 errors |
| agent tests | `cd agent && uv run pytest tests/ -m "not evals" -q --timeout=120` | exit 0 |
| web gate | `pnpm lint` · `npx tsc --noEmit` · `pnpm test` · `pnpm build` | all exit 0 |

### Three rules that protect the shared database

1. `pnpm test` takes **5–12 minutes**, dominated by `seed-determinism.test.ts` re-seeding Neon three
   times. Launch **detached with an exit-code file**, never under a short shell timeout:
   ```bash
   mkdir -p /tmp/omo-p5 && nohup zsh -c 'cd web && pnpm test > /tmp/omo-p5/test.log 2>&1; echo $? > /tmp/omo-p5/test.exit' &
   ```
2. **Never overlap `pnpm test` with `pnpm build`**, and never run two `pnpm test` concurrently.
3. **🔴 ONE ATTEMPT. NEVER RETRY A HUNG SEED OR TEST RUN BLINDLY.** Fase E lost **10+ hours** looping on
   a re-seed that stalled at ~seat 110,000 of 119,280; the retries were themselves the cause
   (connection contention). If a seed or `pnpm test` exceeds **15 minutes**, STOP and walk this ladder,
   recording each rung: (1) connectivity probe against Neon — failure means infrastructure, stop and
   report; (2) standalone seed, timed — a clean run (~73 s measured) means the seed is healthy and the
   hang was contention; (3) **one** clean full `pnpm test`, nothing else running (~558 s measured).
   Only if rung 2 or 3 reproduces is there a real defect. **Wall-clock spent looping is a reportable
   deviation.**

### 🔴 The fourth rule: THERE IS ONLY ONE DATABASE, AND `pnpm test` DESTROYS IT

**This is settled fact, not an open question.** Fase E verified it three ways including SHA-256 of both
connection strings (`.omo/handoff-fase-e-final.md` §9): `DATABASE_URL` prod vs dev →
`79f09841e846` / `79f09841e846` **IDENTICAL**; `DATABASE_URL_UNPOOLED` → `ec264e7be82e` /
`ec264e7be82e` **IDENTICAL**. One project, one endpoint, one database. **Not a copy, not a branch.**

Consequences that govern every wave of this plan:

1. **There is no "local" database.** Any todo that seeds, migrates, or runs `pnpm test` is touching the
   live demo, whatever wave it is in. Section headings that say otherwise are wrong and have been fixed.
2. **`pnpm test` wipes the live catalogue.** `web/tests/seed-determinism.test.ts` re-seeds three times
   with a hardcoded **`SEED_NOW = "2026-08-01"`** — a date now in the past, so the 7-day window lands
   entirely in history and `GET /api/showtimes` correctly returns `[]`. Fase E measured it: **57
   showtimes before, 0 after, 672 after re-seeding.**
3. **Therefore every gate that runs `pnpm test` MUST end with `bash web/scripts/reseed.sh`**, and must
   verify a non-empty catalogue afterwards. This is repeated as a literal criterion inside Todos 6, 14,
   18, 21 and 27 — not stated once here and assumed. Fase E lost a handoff note to exactly that mistake.
4. **Never run `pnpm build` between the test run and the re-seed.** `web/src/app/page.tsx` is a Server
   Component with no `dynamic`/`revalidate` export, so `next build` **statically prerenders it against
   the database**. Building on a wiped catalogue bakes an empty homepage into the output. Order is
   always: `pnpm test` → **re-seed** → `pnpm build`.
5. **`prisma migrate dev` is BANNED in this plan.** It targets this same database, requires a shadow
   database, and on drift offers to **reset** — i.e. drop the live demo. Only `migrate deploy` has ever
   been run against this database. Todo 8 uses `--create-only` + `migrate deploy` instead.

**The user has explicitly accepted the resulting downtime** (D5): the project is personal and has not
been announced. Acceptance is not the same as ignoring it — the demo must be **left working at the end
of every wave**, which is what rule 3 buys.

#### THE GATE — the exact sequence every wave-close todo runs

Referenced below as **"the standard gate"**. It is also written out inside each wave-close todo, because
a rule that lives only in a global section is the rule Fase E lost.

```
(a) cd agent && uv run ruff check . && uv run basedpyright && uv run pytest tests/ -m "not evals" -q
(b) cd web && pnpm lint
(c) npx tsc --noEmit
(d) detached pnpm test                     # ⚠️ WIPES THE LIVE CATALOGUE
(e) bash web/scripts/reseed.sh             # 🔴 MANDATORY — restores it. Never skip. Never reorder.
(f) curl -s "http://localhost:3000/api/showtimes?filmId=film-01" | head -c 200   → non-empty
    (in Wave 5, curl the deployed URL instead)
(g) pnpm build                             # only now — see rule 4
```

Steps (d)→(e)→(f) are a unit. A wave that ends after (d) leaves the demo dead; a build run before (e)
bakes an empty catalogue into static output. **§Three rules item 3 applies to both (d) and (e)** — one
attempt, 15-minute ceiling, diagnostic ladder, never a blind retry.

### The seed rule (never hardcode a date)

```bash
cd /Users/reiorozco/Dev/cinepais/web
bash scripts/reseed.sh    # recomputes SEED_NOW = tomorrow, never a literal
```

Pre-flight before trusting any result: `curl -s "<BASE>/api/showtimes?filmId=film-01" | head -c 200`.
`[]` ⇒ stale seed. A **connection refusal is not a stale seed** — check the server first.

---

## Locked decisions (from the approval gate — do not relitigate)

| # | Topic | Decision |
|---|---|---|
| D1 | Markdown | **Constrained prompt + a hand-rolled minimal renderer.** Prompt restricts output to bold + bullets (no headings, tables, horizontal rules or emoji) and forbids repeating what the card already shows. A small renderer builds **React elements** for that subset. Zero new dependencies; XSS structurally impossible; streaming-safe. |
| D2 | "Best seats" | **Room centre + optimal-band centre.** After tier, distance to the **centre of the room** dominates — `(1 + cols) / 2`, so IMAX ≈ **10.5**, 2D **8.0**, Premium **5.5** — and within the optimal band prefer the middle row over the first. Respects aisles. **Correction of record:** this row previously said "block centre", which the high-accuracy review proved re-creates the front-left-corner bug (see Todo 2's worked example). The user's intent — the middle of the room — is unchanged; only the wrong formalisation of it was removed. |
| D3 | Seed occupancy | **Varied by timeslot and weekday** — weeknight late shows ~10% **sold**, Fri/Sat prime time ~70% **sold**, the rest in between (every figure in this plan is a *sold* fraction, never an available one). Must remain deterministic under the same `SEED`, and capped so the `optimal` band never empties on a normal showtime. Planted scenarios still win where they apply. |
| D5 | Shared database | **There is exactly ONE Neon database — dev *is* production** (Fase E proved it by SHA-256; `.omo/handoff-fase-e-final.md` §9). The user has **accepted the resulting outage**: the project is a personal one and has not been announced, so the demo may go dark during the phase. **Price of that acceptance:** every gate that runs `pnpm test` MUST be followed by a re-seed, stated at each of the five gates, not once globally. No Neon branch, no local Postgres, no new infrastructure. |
| D6 | Test dependencies | **Test-only devDependencies ARE permitted** (`jsdom`, `@testing-library/react`, `@vitejs/plugin-react`) and `vitest.config.ts`'s `include` extends to `.tsx`. The Must-NOT-Have bans **runtime** dependencies — the `dependencies` block of `web/package.json` — never devDependencies. Without this the Todo 15 XSS test cannot exist, and an unprovable security claim is worse than a dependency. |
| D4 | Preventa | **Real `status` field on `Film`** (`cartelera` / `pronto` / `preventa`), seeded, exposed by the API, all three tabs filtering on it. Removes the id-suffix hack. Requires a Prisma migration against production. |

## Scope OUT / Must-NOT-Have

- ❌ **No new runtime dependency** in `web/package.json` **`dependencies`**. D1 is explicitly a
  zero-dependency decision; adding `react-markdown`, `marked`, `dompurify` or similar violates it.
  **✅ `devDependencies` ARE allowed** (D6) — specifically `jsdom`, `@testing-library/react` and
  `@vitejs/plugin-react`, needed because `vitest.config.ts` runs in the `node` environment and its
  `include` matches only `.ts`, so no React component can be rendered in a test today. Every criterion
  in this plan that says "no dependency added" means the **`dependencies`** block only; check it with
  `git diff main -- web/package.json` and confirm the additions sit under `devDependencies`.
- ❌ **No `dangerouslySetInnerHTML`.** The renderer builds React elements. Never HTML strings.
- ❌ **No visual redesign** in the Impeccable pass — work within the existing design language, brand
  and component set.
- ❌ **Do not run `agent/tests/evals`** — it spends real money.
- ❌ **Do not exceed 4 live `POST /chat` calls** in this phase, and announce before each.
- ❌ **Do not record the demo video** until Wave 5 closes (see §Risks).
- ❌ **Do not delete or rewrite** `main`'s history, or any of the five phase branches.
- ❌ **Do not raise** `min_machines_running`, `soft_limit` or `hard_limit` on Fly — they are cost
  controls, proven by the measured `$0.01` invoice baseline.
- ❌ **Do not INTRODUCE** any new hardcoded date, `businessDate`, or seed-derived showtime id.
  **Qualifier, so F5 does not report a false violation:** `web/tests/seed-determinism.test.ts` already
  contains five pre-existing `SEED_NOW: "2026-08-01"` literals, and Todo 13 edits that file. They are the
  reason `pnpm test` wipes the catalogue (§The fourth rule). Leaving them is acceptable — the determinism
  contract depends on a fixed reference time — but the decision must be **stated** in Todo 13's evidence,
  not left for F5 to flag as a breach.
- ❌ **No CineColombia** references. **No attribution lines.**

## Evidence convention

Each todo writes `.omo/evidence/task-<N>-cinepais-phase-5-refinement.txt` (or `.md`/`.png`).
`.gitignore` ignores `.omo/evidence/`, so auditing needs `git status --porcelain --ignored`.
**`.omo/evidence/`, `run-continuation/`, `notepads/` and `boulder.json` must never reach `main`** —
the curation established in Fase E stands.

## Test strategy

**Tests-after**, plus agent-executed QA per todo (happy + failure path, exact command, evidence path).
New unit tests are authored for the ranking change (Todo 3), the Markdown renderer (Todo 14) and the
city plumbing (Todo 15). Determinism tests are updated, never deleted.

## LLM budget

**Ceiling: 4 live `POST /chat` calls for the whole phase.** Fase E spent 2 of 6. One `/chat` ≈ 3.5
Gemini calls (measured), so gate on the `/chat` count. Append one line per call to
`.omo/evidence/llm-spend-cinepais-phase-5-refinement.txt`. **Announce to the user before each.**

## Wave boundaries are gates, not suggestions

1. **Closing side.** A wave's final todo completes only when
   `.omo/evidence/wave-<N>-closed-cinepais-phase-5-refinement.txt` exists with that wave's exit codes.
2. **Opening side.** The FIRST todo of each following wave asserts the previous wave's receipt exists
   and STOPs if it does not.
3. **Ownership.** Starting the next wave is the orchestrator's/user's action, never the executor's.
4. **🔴 Every wave close ENDS BY PRINTING A PASTE-READY CONTINUATION BLOCK to the user.** The handoff note
   is written for a worker; this block is written for the **human**, who closes the session and opens a
   fresh chat. Without it the user has to reconstruct the next prompt by hand, which is how context gets
   dropped between sessions. Print it as the literal last output of the wave, in a fenced code block:

   ```
   Fase F — Ola <N> CERRADA.

   Estado: <one line: what shipped>
   Gate: agent ✅ · lint ✅ · tsc ✅ · test ✅ · re-seed ✅ · catálogo no vacío ✅ · build ✅
   Commit: <sha> <subject>
   Demo: <the non-empty catalogue check's actual output>
   Gasto LLM en esta ola: <N> /chat  (acumulado <M> de 4)
   Desviaciones: <none | list>

   Siguiente: Ola <N+1>, Todos <a>–<b>. Pegar en un chat NUEVO:
       /start-work cinepais-phase-5-refinement
   Leer primero: .omo/handoff-fase-f-wave-<N>.md
   ```

   Fill every field with real measured values — never a placeholder. "Deviations: none" must be a claim
   the evidence supports, not a default.
5. **Every wave writes `.omo/handoff-fase-f-wave-<N>.md` and stages it into that wave's own commit.**
   Fase E lost one of six because this rule lived only in a global section — so it is **also repeated
   as a literal criterion inside every wave-close todo below**. Redundancy is the point.

**Honest residual risk:** nothing can technically force a process to terminate. If a boundary is
crossed anyway, F1 must report it as a deviation rather than absorb it.

---

## Todos

### Wave 1 — Recommendation quality and prompt discipline (agent only, 100% local, zero spend)

- [x] 1. `git`: cut `phase-5-refinement` from `main` and record the quality baselines
  - **Do:** `git checkout main && git pull` (confirm clean), then `git checkout -b phase-5-refinement`. **Stage all three planning artifacts** so downstream clean-tree criteria are reachable: `git add .omo/plans/cinepais-phase-5-refinement.md .omo/drafts/cinepais-phase-5-refinement.md .omo/plans/cinepais-phase-4-deploy.md` (committed in Todo 6, not separately). Missing the third is what makes Todo 6's empty-tree criterion unreachable. Capture verbatim: the three agent gates plus web `pnpm lint` and `npx tsc --noEmit`. **Do not** run `pnpm test`/`pnpm build` here.
  - **Accept:** `git branch --show-current` → `phase-5-refinement` · `git rev-parse phase-5-refinement main` prints the same sha twice · `git status --porcelain | grep -c '^??'` → `0` (positive control: `git status --porcelain | grep -cE '^(A|M)'` → **`3`**, not 2 — the third is the modified Fase E plan) · all captured commands exit 0.
  - **QA (failure path):** confirm `git remote -v` shows `origin` and that **nothing is pushed from this branch** — `git ls-remote --heads origin phase-5-refinement | wc -l` → `0`.
  - **Evidence:** `task-1-…txt` with each command, output and exit code.

- [x] 2. `agent/src/cinepais_agent/seating.py`: rank by block centre and optimal-band centre (D2)
  - **Why:** `seating.py:212` currently returns `(-_TIER_PREF[...], group[0].row, group[0].col)` — tier DESC, **row ASC, col ASC**. With `blocks = [(1,5),(6,15),(16,20)]` for IMAX (`seating.py:36`), that returns block 1 columns 1–2: the front-left corner. There is no centrality anywhere in the repo.
  - **Do:** replace the sort key so that, after tier, ranking is driven by two new distances, both computed from the room's own layout — never hardcoded per room:
    1. **Horizontal: distance from the group's midpoint to the centre of the ROOM — `(1 + cols) / 2` — NOT to the centre of its own block.** Smaller is better.

       **🔴 The block-centre version was specified first and it re-creates the very bug this todo exists to fix. Do not implement it.** Giving every block its own zero point makes a pair hugging a side wall score better than a pair inside the true centre block. Worked example, IMAX row 6 (tier ties, so horizontal decides), `blocks = [(1,5),(6,15),(16,20)]`:

       | Candidate | cols | midpoint | block centre | distance to **block** centre | distance to **room** centre (10.5) |
       |---|---|---|---|---|---|
       | A — centre block, its left edge | 6,7 | 6.5 | 10.5 | **4.0** | 4.0 |
       | B — side block, its centre | 1,2 | 1.5 | 3.0 | **1.5** ← wins | 9.0 |

       Under block-centre the algorithm returns **columns 1–2** — the front-left corner, relocated from row 4 to row 6 — while Todo 25 simultaneously demands the seats be in the centre block. Room-centre ranks A above B and matches D2's actual intent.
       Groups must not straddle blocks — the existing block filter already guarantees this; confirm it by reading the filter, then note that with a room-centre metric straddling would not matter anyway.
       **⚠️ Read `ROOM_LAYOUTS` for `cols`; never hardcode.** The three rooms differ and one has a single block (`seating.py:36-38`): IMAX 13×20 `[(1,5),(6,15),(16,20)]` → centre **10.5**; 2D 12×15 `[(1,4),(5,11),(12,15)]` → centre **8.0**; **Premium 9×10 `[(1,10)]` — one block only** → centre **5.5**.
    2. **Vertical:** distance from the seat's row to the **centre of its quality band**, not the first row of it. Smaller is better.
       **⚠️ The `high` band is unbounded above (`row >= 9`), so it has no centre derivable from the cutoffs alone.** Pin one rule and use it for all three bands: derive each band's `[min_row, max_row]` from the rows **actually present in the `seats` argument** for that tier. This is safe and deterministic because `find_adjacent` receives **every** seat, sold and available alike — so the bounds do not move with occupancy. Deriving them from *available* seats only would make the band centre drift per showtime; do not do that.

  - **🔴 WHERE THE BAND BOUNDS COME FROM — read this before writing a line.** `web/src/lib/business/quality.ts` exports `rowToTier()` with a *proportional* rule (`pct = row/maxRow`). **That function is DEAD CODE** — `grep -rn "rowToTier" web/` returns exactly one hit, its own definition, and zero call sites. The `qualityTier` actually written to the database, returned by the API, and sorted on by `_TIER_PREF` comes from `web/prisma/seed.ts:179-213` `getSeatMeta()`, which uses **FIXED cutoffs regardless of room size** — note its `_maxRow` parameter is underscore-prefixed because it is deliberately unused:
    ```
    row <= 3          → low
    row >= 9          → high
    otherwise (4–8)   → optimal
    ```
    The two rules diverge badly for non-IMAX rooms. Premium is 9 rows: the fixed rule gives `high` to row 9 **only**, while the proportional rule would give it rows 6–9. **Derive the band bounds from the fixed cutoffs above (or, better, from the tier values actually present in the seat data you were given), never from `quality.ts`.** Optimizing distance-to-band-centre against bounds the data does not use would ship a subtly wrong recommendation for 2D and Premium rooms while an IMAX-only test suite reports success.

  - **🔴 HOW THE TWO DISTANCES COMBINE — pinned, not left to judgement.** Sort **lexicographically**, horizontal first:
    ```
    (-tier_pref, horizontal_distance, vertical_distance, row, col)
    ```
    Horizontal dominates because sitting in the wrong block is the defect being fixed; vertical breaks its ties; `(row, col)` is the final deterministic tiebreak so results stay reproducible. Do **not** invent a weighted sum — two executors would weight it differently and the ranking would not be reproducible.
  - **Even-sized groups:** the group midpoint for an `n`-seat run is the mean of its first and last column, which may fall between seats (e.g. cols 10–11 → 10.5). Compare distances as floats; do not round.
  - **Do not** change `_TIER_PREF` or the showtime-level score formula in `scoring_helpers.py:43` — this todo changes *which group inside a showtime* is chosen, nothing else. English identifiers and comments; document both centre formulas in a comment.
  - **Accept:** three agent gates exit 0 · **the behavioural proof in Todo 3 is what verifies this todo** — in particular test 2b, which fails under the rejected block-centre formula.
    **⚠️ Do not use `grep -c "block" seating.py` as a criterion.** It already returns **17** on the unmodified file, so it cannot fail and proves nothing. If a textual check is wanted, make it one that is false today: `grep -c "cols" agent/src/cinepais_agent/seating.py` must **increase** from its recorded baseline (record the baseline first), and the new sort key must be quoted verbatim in the evidence.
  - **QA:** see Todo 3 — the behavioural proof lives there.
  - **Evidence:** `task-2-…txt` with the old and new sort keys quoted side by side.

- [x] 3. `agent/tests/test_seating.py` + `test_scoring.py`: lock the new ranking with tests that would have caught the bug
  - **🔴 STOP — THE EXISTING FIXTURES ARE BUILT ON THE DEAD RULE. Read this before writing a test.** `agent/tests/test_seating.py:204-214` `_make_imax_all_available()` — the obvious helper to reuse — assigns each seat's tier with **`row_to_tier(row, max_row)`**, the *proportional* port of the dead `quality.ts` rule (`seating.py:66`; **zero production call sites** — `grep -rn "row_to_tier" agent/` shows only its definition and this test file). `test_checkerboard_has_no_adjacent_pairs` at `:183` does the same. Production tiers do **not** come from that function at all: they arrive on the wire as `seat.qualityTier` (`models.py:58` ← the read API ← `seed.ts` `getSeatMeta()`'s **fixed** cutoffs).
    **They disagree on real rows.** IMAX row 3: the fixture's proportional rule gives `3/13 = 0.2308 > 0.23` ⇒ **optimal**; production gives ⇒ **low**. So the optimal band is rows **3–8** in the fixture and rows **4–8** in production — different band centres (5.5 vs 6). A test suite built on these helpers would let the executor tune the band-centre maths to fixture data and ship a different ranking than production produces, with every test green.
    **Therefore:** (a) **do not use `row_to_tier` in any new or edited fixture**; (b) add a fixture helper that assigns tiers from the **fixed** cutoffs (`≤3 low`, `≥9 high`, else `optimal`) and build every test in this todo on it; (c) migrate `_make_imax_all_available()` and the checkerboard fixture to it as well, so the file has one tier rule rather than two; (d) `test_seating.py:47-70` currently **asserts the proportional rule is correct** — including the explicit `assert row_to_tier(3, 13) == "optimal"` at `:54`. Those assertions encode behaviour the product does not have. Retire them together with the function in Todo 26, and record the test-count change there rather than silently dropping them.
    Verify the divergence for yourself before starting: print both rules' output for IMAX rows 1–13 side by side and put the table in the evidence.
  - **Do:** author tests against a **fully empty IMAX room** (13×20, blocks `[(1,5),(6,15),(16,20)]`) — the exact condition that exposed the defect in production — using the **fixed-cutoff** fixture helper above.
  - **Accept:** `cd agent && uv run pytest tests/test_seating.py tests/test_scoring.py -q` exits 0, then the full non-eval suite exits 0.
  - **QA — each of these is a named test:**
    1. **(the regression)** empty IMAX, `n=2` → the chosen pair is in the **centre block** (both columns within 6–15), **not** columns 1–2. Assert the block, not exact seat ids, so the test survives future tie-break tweaks.
    2. **(horizontal)** the chosen pair's midpoint is within 1 seat of the **room** centre `(1+cols)/2` — for IMAX that is 10.5. Derive it from `ROOM_LAYOUTS`, do not write `10.5` as a literal.
    2b. **🔴 (THE TEST THAT DISCRIMINATES — an empty room cannot)** In a fully empty IMAX both the room-centre and the discarded block-centre metric pick the same pair, so tests 1 and 2 would pass even with the broken formula. Build the case that separates them: **the centre block sold out except its leftmost adjacent pair (cols 6–7), the left side block entirely free**, all in the optimal band so tier ties. Assert the winner is **cols 6–7** (room distance 4.0) and **not** cols 1–2 (room distance 9.0, but block distance only 1.5). Under the block-centre formula this test FAILS — which is exactly what makes it worth writing.
    3. **(vertical)** the chosen row is in the middle of the optimal band, not its first row — assert `row` is closer to the band centre than to either band edge.
    4. **(tier still dominates)** a room where the centre block's optimal seats are sold but a `low`-tier centre pair is free → an `optimal` pair elsewhere still wins over the `low` centre pair.
    5. **(failure path)** a room where only edge seats remain → it still returns them rather than refusing; degrading gracefully beats returning nothing (the spec's "never discourages the sale" rule).
    6. **(determinism)** the same input twice returns the identical group.
    7. **🔴 (non-IMAX rooms — the case an IMAX-only suite would miss)** repeat the centring assertion for **Premium** (9 rows × 10 cols) and **2D** (12 rows × 15 cols), with the fixed-cutoff fixture. In Premium the fixed rule marks **only row 9** `high` while the proportional rule marks rows 6–9 — so this test fails if the dead rule leaked in, and Todo 2 must then be corrected.
       **⚠️ Premium has exactly ONE block — `[(1, 10)]` (`seating.py:38`), not three.** A "the pair is in the centre block" assertion is vacuously true there and proves nothing. Assert against the **room** centre in every room: Premium **5.5**, 2D **8.0**, IMAX **10.5** — each derived from `ROOM_LAYOUTS`, never copied from IMAX.
    Prove each test is meaningful by temporarily inverting one assertion, observing a FAIL, and restoring it — record both runs.
  - **QA (do not break the fixtures):** `test_service.py` and `test_sse_stream.py` contain `["1_4_7","1_4_8"]`. **Confirm by reading them** that these are *parsing fixtures*, not algorithm assertions, and that they still pass. Report the verdict; do not assume.
  - **Evidence:** `task-3-…txt` with every test name, the deliberate-fail run and the passing run.

- [x] 4. `agent/src/cinepais_agent/prompts.py`: formatting discipline and no duplication of the card (D1, agent half)
  - **Why:** the current §"Estilo de respuesta" constrains content but says **nothing** about formatting, so the model free-styles Markdown headings, tables, rules and emoji. Worse, `recommendation-card.tsx:138-323` already renders siteName, city, businessDate, time, formats, qualityTier, seat count, priceFrom, reasoning **and** the alternatives list — so the model's Markdown table is duplicating the card.
  - **Do:** rewrite §"Estilo de respuesta" in Spanish to require: plain conversational prose; **only** `**bold**` and `- ` bullets permitted; **no** headings (`#`), tables, horizontal rules (`---`), code fences or emoji; and an explicit instruction **not to restate** the structured facts the card already shows — the prose should add judgement and tradeoff, not repeat data. Keep every existing behavioural rule (Spanish, scope refusal, never invent data, max 4 seats, never discourage the sale, accessibility seats) **byte-for-byte unchanged**.

    **🔴 ONE EXPLICIT EXCEPTION, or this todo cancels itself.** `prompts.py:41` currently **instructs the model to name the cinema, the time and the price** — precisely the facts `recommendation-card.tsx:138-323` already renders, and precisely the duplication this todo exists to remove. A careful executor reading "formatting only" plus "byte-for-byte unchanged" would preserve line 41 and ship a no-op. **Line 41 is in scope and must be rewritten**; so is line 44's instruction to lean on `reasoning`, which the card also renders. Quote both lines before and after in the evidence. Every *other* behavioural line stays byte-for-byte.
  - **Accept:** three agent gates exit 0 · the three prompt-injection sentinels still present: `grep -c "SENTINEL" agent/src/cinepais_agent/prompts.py` unchanged from baseline (record the baseline number first) · `grep -c "Máximo 4 sillas" agent/src/cinepais_agent/prompts.py` → `1`.
  - **QA:** (happy) an existing prompt/eval unit test that does not call the LLM still passes; (failure) diff the prompt and confirm in the evidence that **no behavioural line was altered** — quote the before/after of every changed line. Formatting-compliance itself is **not** assertable without spending money; it is verified live in Todo 25 and recorded as observation, never asserted.
  - **Evidence:** `task-4-…txt` with the full prompt diff.

- [x] 5. `agent/src/cinepais_agent/{main.py,prompts.py,mcp_server.py}`: accept and honour the user's city (F2, agent half)
  - **Why:** `main.py`'s `ChatRequest` accepts only `message` + `sessionId`, and Pydantic v2 **silently ignores** unknown fields — so a web-only change would be a no-op. The prompt never mentions location. Meanwhile `mcp_widening.py:69-73` already implements a deliberate ladder (`otro formato` → `disponible en otra ciudad` → `otra fecha`) that breaks at the first productive step. The architecture for "anchor locally, widen deliberately" exists; the anchor does not.
  - **🔴 "Thread it into the agent invocation" has NO mechanism as stated — here is the one to use.** `SYSTEM_PROMPT` is a module-level **f-string** (`prompts.py:10-45`) bound once into `_create_agent_fn(..., system_prompt=SYSTEM_PROMPT)` at startup (`agent.py:141-146`), and the agent is built in `lifespan` and shared by every request. There is **no per-request prompt hook**, and adding a `{city}` placeholder would break at import because the string is already an f-string containing sentinels. Instead: keep `SYSTEM_PROMPT` **static** with a new Spanish rule describing how to use *"la ciudad del usuario"* when present, and pass the value **per turn by prefixing a bracketed context line to the user content** inside `stream_agent` (`sse.py:47-51`) — e.g. `[contexto: ciudad seleccionada = Bogotá]`. Widen `stream_agent`'s signature accordingly.
  - **Do:** (a) add an optional `city: str | None = None` to `ChatRequest`; (b) thread it through `stream_agent` as the per-turn context prefix described above; (c) add a Spanish prompt rule: when a city is known and the user has not named one, **use it as the default anchor** for `search_showtimes`/`recommend_best`, and when results come from elsewhere, **say so explicitly** ("no encontré nada en tu ciudad, pero…"). **Do not** modify `mcp_widening.py` — the widening ladder is correct and already emits `"disponible en otra ciudad"`; it only needs the anchor. **Validate BEFORE prefixing — an unvalidated string spliced into the prompt is a prompt-injection channel (OWASP LLM01), which is the whole reason this is spelled out.** Accept only: length ≤ 64, and letters/spaces/accents only; anything else, drop the field silently. **Do not require a live `/api/cities` lookup** — that would add a network call per request; a well-formed but unknown city simply yields empty results from `search_showtimes`, which the widening ladder already handles.
  - **Accept:** three agent gates exit 0 · `grep -c "city" agent/src/cinepais_agent/main.py` → ≥ 1 (positive control: `grep -c "sessionId" agent/src/cinepais_agent/main.py` → ≥ 1) · `git diff --name-only -- agent/src/cinepais_agent/mcp_widening.py` is **empty**.
  - **QA:** (happy) a unit test posting `{message, sessionId, city:"Medellín"}` parses with `city == "Medellín"`; (backwards compatibility) a request **without** `city` still parses and behaves exactly as before — this matters because the deployed web app will not send it until Wave 3; (failure) an over-long or unknown city value is rejected or ignored, never forwarded raw.
  - **Evidence:** `task-5-…txt` with test names and the empty `mcp_widening.py` diff.

- [ ] 6. **Wave 1 close — HARD GATE. Do not start Todo 7 in this session.**
  - **Do:** run **the standard gate** (§The fourth rule) in order, never overlapping — (a) agent trio, (b) `pnpm lint`, (c) `npx tsc --noEmit`, (d) detached `pnpm test`, **(e) `bash web/scripts/reseed.sh`**, (f) non-empty catalogue check, (g) `pnpm build`. Write `.omo/handoff-fase-f-wave-1.md` and **stage it into this commit**.
  - **🔴 Step (e) is not optional and this todo is where the phase first kills the live demo.** Wave 1 changes no web code, so it is tempting to treat `pnpm test` as harmless — it is not: it re-seeds the shared database three times with a hardcoded past date and leaves `GET /api/showtimes` returning `[]`. Re-seed, then verify, then build.
  - **Commit:** `fix(agent): recommend centred seats, constrain response formatting, accept the user's city`
  - **Accept:** every command exits 0 · **the re-seed ran after `pnpm test` and the catalogue check returned a non-empty array — quote it** · `git log --oneline main..HEAD --invert-grep --grep='^chore(omo)' | wc -l` → `1` · `git status --porcelain` empty · `git ls-files .omo/handoff-fase-f-wave-1.md | wc -l` → **`1`** · `git ls-remote --heads origin phase-5-refinement | wc -l` → `0` (nothing pushed yet).
  - **STOP CONDITION:** complete only when `.omo/evidence/wave-1-closed-cinepais-phase-5-refinement.txt` exists containing those exit codes, **and the paste-ready continuation block (§Wave boundaries rule 4) has been printed to the user with real values** — naming Wave 2, Todos 7–14. **End the session.** Todo 7 begins in a fresh chat.

---

### Wave 2 — Data layer: film status, realistic occupancy, scenario integrity (⚠️ TOUCHES THE LIVE DATABASE — there is no local one; see §The fourth rule)

- [ ] 7. Open Wave 2 and prepare the local environment
  - **Do:** assert `test -f .omo/evidence/wave-1-closed-cinepais-phase-5-refinement.txt` — STOP if absent. Start the dev server in the background and **poll until it serves**, before any curl:
    ```bash
    mkdir -p /tmp/omo-p5
    nohup zsh -c 'cd web && pnpm dev > /tmp/omo-p5/dev.log 2>&1' &
    until [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/cities)" = "200" ]; do sleep 2; done
    ```
    **🔴 Do NOT re-open the shared-database question — it is answered.** Fase E proved by SHA-256 that dev and production are **one** Neon database (`.omo/handoff-fase-e-final.md` §9). Your job is a one-command re-confirmation, not an investigation, and **not** a question for the user:
    ```bash
    cd web && node -e 'require("dotenv").config({path:".env.local"});console.log(require("crypto").createHash("sha256").update(process.env.DATABASE_URL_UNPOOLED).digest("hex").slice(0,12))'
    ```
    Expect **`ec264e7be82e`**. If it matches, §The fourth rule is in force for every remaining todo: every seed and every `pnpm test` hits the live demo, and every gate must re-seed afterwards. If it does **not** match, the infrastructure changed since Fase E — STOP and report, because the whole plan's risk model was written against the matching case.
    Print only the 12-character hash. **Never print a connection string.**
  - **Accept:** the receipt exists · `/api/cities` returns 200 · the hash is recorded and compared against `ec264e7be82e` · the evidence states in one line that this wave writes to the live database.
  - **QA:** (failure) distinguish a connection refusal (server down → restart it) from `[]` (stale seed → re-seed). They are different problems with different fixes.
  - **Evidence:** `task-7-…txt`.

- [ ] 8. `web/prisma/schema.prisma` + migration: add `Film.status` (D4)
  - **🔴 TWO THINGS THE PLAN ORIGINALLY GOT WRONG HERE. Read both before touching the schema.**
    1. **`prisma migrate dev` is BANNED (§The fourth rule item 5).** There is no local database — it would target the live one, it needs a shadow database, and on drift it offers to **reset**, i.e. drop the demo. It also auto-runs the seed afterwards. Use `--create-only` to author the SQL, review it, then apply with `migrate deploy`.
    2. **The column MUST carry a default.** Postgres cannot add a `NOT NULL` column with no default to a populated table, and `Film` is populated. Without `@default(cartelera)` the migration fails outright — or, if it were ever generated against an empty database, it would emit bare `NOT NULL` and fail later against real rows. Todo 8's original QA only asked the executor to *"confirm"* a default exists; it must be **written**.
  - **Do:** add `enum FilmStatus { cartelera pronto preventa }` and a non-nullable **`status FilmStatus @default(cartelera)`** field on `Film`, following the file's existing enum conventions (`Format`, `SeatStatus`, `AreaCategory`, `QualityTier`). Then:
    ```bash
    cd web
    pnpm prisma migrate dev --create-only    # authors SQL, applies nothing
    # read the generated SQL in full, then:
    pnpm prisma migrate deploy
    pnpm prisma generate
    ```
  - **Accept:** the generated SQL contains **`DEFAULT 'cartelera'`** (positive control: it also contains `ALTER TABLE`) · `migrate deploy` exits 0 · a new directory exists under `web/prisma/migrations/` · `npx tsc --noEmit` exits 0 · `grep -c "FilmStatus" web/prisma/schema.prisma` → ≥ 2 (enum + field) · the shell transcript shows **no** bare `prisma migrate dev` without `--create-only`, and **no** reset prompt was accepted.
  - **⚠️ Because the database is shared, this migration reaches production the moment it is applied — in Wave 2, not Wave 5.** That is safe and expected: the column is additive with a default, and the deployed *old* code's Prisma client does not select it. Record that Todo 22's `migrate deploy` will therefore be a **no-op that reports "No pending migrations"**, and that this is the success case, not a failure.
  - **QA:** (happy) the generated SQL is quoted verbatim in the evidence and shown to be additive with a default; (failure) confirm the migration does **not** drop or rename any existing column — `grep -ciE 'DROP|RENAME' <migration.sql>` → `0` (positive control: `grep -ci 'ALTER TABLE' <migration.sql>` → ≥ 1); (**the live check**) immediately after `migrate deploy`, `curl -s "http://localhost:3000/api/films" | head -c 200` still returns films — the additive migration must not have disturbed the running site.
  - **Evidence:** `task-8-…txt` with the migration SQL verbatim.

- [ ] 9. `web/prisma/seed.ts`: assign a real status to every film, retiring the id-suffix hack
  - **Why:** `film-card.tsx:78-83` derives the badge from `id.slice(-2)`. That hack is the reason the badge and the tab disagree.
  - **Do:** assign `status` per film from a **fixed lookup table keyed by film id** — most `cartelera`, a few `pronto`, a couple `preventa`.
    **🔴 Use a fixed table, NOT the PRNG.** `rand` is shared by `pickFourSlots()` and the film draw (`seed.ts:417-422`); **one extra `rand()` call shifts every downstream showtime→film assignment** and silently changes the whole schedule. A table consumes no randomness.
    **🔴 `film-01` and `film-02` MUST be `cartelera`.** `forcedFilmFor()` pins them onto three of the four planted scenarios, and `seed-determinism.test.ts:83-90` locates the `soldout` showtime **by film title**. Giving either a non-`cartelera` status contradicts the scheduler and breaks that test.
    Do not change any other film field.
  - **🔴 Pin the schedule semantics too — otherwise the badge lies.** Nothing in the seed currently ties `status` to whether a film has showtimes (`seed.ts:422` draws from all 10), so a film badged *"Pronto"* would still sell tickets tonight, and the copilot cannot see the contradiction because `models.py:17-25` `FilmSummary` uses Pydantic's default `extra="ignore"` and silently drops `status`. Decide and implement: **`cartelera`** → showtimes as today; **`pronto`** → **no showtimes at all** (it is not released); **`preventa`** → showtimes only in the **last two days** of the 7-day window. Restrict the film draw at `seed.ts:422` to the films eligible for that date.
    **⚠️ This changes how many films the draw picks from, which changes PRNG consumption** — expected, but Todo 13 must be told, and the determinism expectations move with it.
  - **Accept:** re-seeding locally succeeds and `curl -s "http://localhost:3000/api/films" | head -c 400` shows a `status` on each film **after** Todo 11 exposes it (cross-reference there) · every `FilmStatus` value appears at least once: verify by counting each in the DB.
  - **QA:** (happy) two consecutive seeds with the same `SEED` produce identical statuses; (failure) confirm no film ends up with a null/absent status; (**coherence — the point of the todo**) assert no `pronto` film has any showtime, and every `preventa` film's showtimes fall inside the last two days of the window; (**regression**) `film-01` and `film-02` are both `cartelera`.
  - **Evidence:** `task-9-…txt`.

- [ ] 10. `web/prisma/seed.ts`: timeslot-varied occupancy, and fix the scenario slot anchor (D3 + F6.1)
  - **Why:** `computeSeatStatus()` returns `Available` for **every** seat when no scenario applies, and only **4 of 672** showtimes carry a scenario ⇒ **99.4% of rooms are completely empty** (verified in production: `st-site-med-3-imax-0-1930` → 260/260). Separately, `scenarioFor()` keys on `slotIdx`, an index into the array **after** `pickFourSlots()` drops one of five slots off the shared PRNG — so a planted scenario lands on whichever time occupies that index, and drifts with the seed.
  - **Do:** (a) give normal showtimes an occupancy that depends on **time of day and day of week** — weeknight late shows sparse (~10% sold), Friday/Saturday prime time busy (~70%), everything else in between. Sold seats must cluster the way a real room fills (centre and mid-rows first), not scatter uniformly — this is what makes the centring fix visible and the demo believable. All of it driven by the seeded PRNG so the same `SEED` reproduces the same database. (b) Re-key `scenarioFor()` off the fragile slot index — **but the naive fix silently deletes scenarios, so read this before writing it.**

    **🔴 Two coupled traps.** (i) `pickFourSlots()` drops **one of five** slots per `(site, room, day)`. Anchoring a scenario to a *literal time* therefore gives it a **1-in-5 chance of not existing at all** that day. Across the four planted scenarios that is `1 − (4/5)⁴ ≈ **59%** — more likely than not, at least one scenario silently vanishes on any given seed, and nothing in the plan would notice. (ii) `forcedFilmFor()` **also keys on `slotIdx`** and is evaluated before the film id is computed. Re-keying only `scenarioFor()` desynchronises the pair: a `front-only` room could be planted on a showtime whose forced film is not the one the demo script names.

    **Do:** re-key `scenarioFor()` **and** `forcedFilmFor()` **together, to the same key**, and guarantee the anchored slot survives — either by exempting the four anchored `(site, room, day)` combinations from the drop, or by choosing anchor times that `pickFourSlots()` can never drop. **Prove the guarantee, do not assume it:** after seeding, assert all four scenario showtimes exist by querying for them, and state which mechanism guarantees survival.

    **⚠️ Changing which slots are forced changes how many times the shared `rand()` is consumed, which shifts every downstream film assignment.** That is acceptable — this is a re-seed — but it means `seed-determinism.test.ts` expectations move, and Todo 13 must be told. Related: **`film-01` and `film-02` must stay `cartelera`** in Todo 9, because `forcedFilmFor()` pins them into the schedule and the determinism test locates the `soldout` showtime by film title.
  - **Accept:** `bash web/scripts/reseed.sh` exits 0 and prints the expected counts · a query proves the sold fraction varies across showtimes: report min, max and median `availableCount/totalCount` across a sample of at least 20 normal showtimes, and confirm the spread is genuinely wide (not all equal, none 0% and none 100%).
  - **🔴 Cap the busy end so the planted scenarios stay distinguishable (interacts with Todo 12).** Best-first clustering plus a high sold fraction can exhaust the non-`low` tiers entirely on a small room, which would make a **normal** showtime indistinguishable from the `front-only` scenario and break Todo 12's negative controls. Worked example: **Premium is 9 rows × 10 cols = 90 seats**, and under the fixed cutoffs (`≤3 low`, `≥9 high`, else optimal) `optimal + high` is only **60 seats (66.7%)**. A 70%-sold prime-time Premium room filling best-first would leave **zero** non-`low` seats. Therefore: **on every normal showtime, at least 15% of the `optimal` band must remain available**, whatever the slot. Enforce it in the generator, and state the per-room-type effective ceiling in a comment.
  - **🔴 A seat count is the wrong floor — make it a PAIR floor.** 15% of Premium's 50-seat optimal band is 8 available seats, and **4 of that band's seats are structurally unusable**: row 5 cols 1–2 are `preferential` and row 6 cols 9–10 are `wheelchair`, both excluded from `find_adjacent` candidates. A generator that leaves exactly those 4 plus 4 scattered singles satisfies "≥15% available" and still returns **zero recommendable pairs** — the demo breaks while every criterion passes. **The binding requirement is: at least one orphan-safe adjacent pair of general-category seats remains available inside the optimal band on every normal showtime.** Verify it by running the same adjacency logic the product runs, not with `COUNT(*)`. Keep the 15% seat floor as a secondary sanity check.
  - **QA:** (determinism, non-negotiable) seed twice with the same `SEED`/`SEED_NOW` and confirm identical seat status counts — quote both runs; (failure) confirm **no normal showtime is 100% sold** (that would break the purchase flow) and none is 100% empty; (**the cap**) for the busiest slot of a **Premium** room and a **2D** room, report the available count in the `optimal` band and confirm it is ≥ 15% — these are the small rooms where the ceiling actually binds.
  - **⚠️ Timing:** this runs a full re-seed. §Three rules item 3 is binding — one attempt, 15-minute ceiling, diagnostic ladder, **never blind retries**.
  - **Evidence:** `task-10-…txt` with both determinism runs and the occupancy spread table.

- [ ] 11. `web/src/app/api/films/route.ts` (+ the film detail route and Zod schemas): expose `status`
  - **Do:** add `status` to the films list and detail responses and to their Zod schemas, following the existing validation conventions.
  - **Accept:** `curl -s "http://localhost:3000/api/films" | head -c 400` includes `"status"` · `npx tsc --noEmit` and `pnpm lint` exit 0 · existing API tests still pass.
  - **QA:** (happy) every film in the response carries a status from the enum; (failure) an invalid status value fails Zod parsing rather than leaking through — prove with a unit test.
  - **Evidence:** `task-11-…txt` with the API response excerpt.

- [ ] 12. Recalibrate the four planted scenarios against the new baseline (F6.2)
  - **Why:** the scenarios were designed when every other room was empty. The `optimal` scenario's own comment says "rows 4–8 kept wide open (10% sold), rest ~40%" — once normal showtimes carry real occupancy, **`optimal` stops standing out**, and `no-adjacent`'s checkerboard may no longer be the only room without adjacent pairs.
  - **Do:** re-read each of the four branches in `computeSeatStatus()` and adjust so each remains **unambiguously distinguishable** from a normal showtime of the same slot: `soldout` fully sold; `front-only` availability confined to the low-tier front rows; `optimal` markedly more open in the optimal band than any normal showtime; `no-adjacent` genuinely offering no adjacent pair anywhere.
  - **Accept — one machine check per scenario, ids resolved at runtime (never hardcoded):** `soldout` → `summary.availableCount == 0`; `front-only` → every available seat has `qualityTier == "low"`; `optimal` → its optimal-band availability ratio exceeds that of a normal showtime in the same slot, quoted side by side; `no-adjacent` → no two available seats are adjacent within any block.
  - **QA (failure — the negative controls):** run the same four checks against a **normal** showtime and confirm each one **fails** there. That is what proves the scenarios are distinguishable rather than trivially true.
  - **🔴 The negative-control sample must include the hardest case:** a **busy prime-time showtime in a small room (Premium 9×10, and 2D)** — not just a quiet IMAX one. Those are where a high sold fraction can accidentally reproduce `front-only` (all non-`low` seats gone) or `no-adjacent` (no adjacent pair left). If a negative control passes when it should fail, the occupancy generator has swallowed a scenario: go back to Todo 10 and tighten the cap rather than weakening the scenario check.
  - **Evidence:** `task-12-…txt` with all eight results (four scenarios + four negative controls), naming the room type and slot of every showtime sampled.

- [ ] 13. Update the determinism and pricing tests to the new data shape
  - **Do:** update `web/tests/seed-determinism.test.ts` and any test asserting seat availability or film shape. **Update expectations; never delete a test to make it pass.** If a test becomes genuinely obsolete, say so explicitly in the evidence with the reason.
  - **Accept:** detached `pnpm test` exits 0 with no test skipped or removed — compare the test count against the Fase E baseline — **136 tests across 11 files** (`.omo/handoff-fase-e-final.md:331`; an earlier draft of this plan said 131, which was Fase D's number and is stale). Record the current count first, then explain any decrease. **Two decreases are expected and legitimate** — the proportional-rule assertions retired in Todo 26, and any determinism expectation genuinely invalidated by Todo 10's re-keying — and each must be named with its reason, never absorbed silently.
  - **⚠️ Named coupling, so it is not discovered at gate time:** `seed-determinism.test.ts:101-105` finds the `front-only` showtime **positionally** — `startsWith("st-site-med-2-imax-1-")`, `orderBy id asc`, `skip: 1`. Todo 10(b)'s re-key invalidates that lookup. Rewrite it to select by the intended time, not by position.
  - **QA:** (happy) the suite passes; (failure) confirm `seed-determinism.test.ts` still performs real re-seeds rather than being weakened into a no-op — quote the assertions.
  - **Evidence:** `task-13-…txt` with before/after test counts.

- [ ] 14. **Wave 2 close — HARD GATE. Do not start Todo 15 in this session.**
  - **Do:** **the standard gate** in order — agent trio → `pnpm lint` → `tsc` → detached `pnpm test` → **`bash web/scripts/reseed.sh`** → non-empty catalogue check → `pnpm build`. Write `.omo/handoff-fase-f-wave-2.md` and **stage it into this commit**.
  - **🔴 The re-seed at step (e) is mandatory and doubly load-bearing here:** this wave *changed the seed itself*, so step (e) is both the demo's restoration and the first end-to-end proof that the new occupancy and status logic survives a full clean run against real data.
  - **Commit:** `feat(web): film status, realistic seeded occupancy, and scenario integrity`
  - **Accept:** all exit 0 · **the re-seed ran after `pnpm test`, and the catalogue check returned a non-empty array with varied occupancy — quote both** · `git log --oneline main..HEAD --invert-grep --grep='^chore(omo)' | wc -l` → `2` · `git status --porcelain` empty · `git ls-files .omo/handoff-fase-f-wave-2.md | wc -l` → **`1`** · nothing pushed.
  - **STOP CONDITION:** complete only when `.omo/evidence/wave-2-closed-cinepais-phase-5-refinement.txt` exists **and the paste-ready continuation block (§Wave boundaries rule 4) has been printed**, naming Wave 3, Todos 15–18, and quoting the measured occupancy spread. **End the session.**

---

### Wave 3 — Web: rendering, city awareness, and the tabs (local)

- [ ] 15. `web/src/components/copilot/`: a minimal, dependency-free Markdown renderer (D1, web half)
  - **Precondition (step 0):** assert `test -f .omo/evidence/wave-2-closed-cinepais-phase-5-refinement.txt` — STOP if absent. **This wave opens in a FRESH session, so the dev server from Wave 2 is gone.** Start it and poll before any browser or curl step in this wave:
    ```bash
    mkdir -p /tmp/omo-p5
    nohup zsh -c 'cd web && pnpm dev > /tmp/omo-p5/dev.log 2>&1' &
    until [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/cities)" = "200" ]; do sleep 2; done
    ```
    A connection refusal later in this wave means the server died — restart it. It does **not** mean a stale seed.
  - **🔴 Step 0b — build the test harness this todo's QA needs; it does not exist (D6).** `web/vitest.config.ts` sets `environment: "node"` and `include: ["tests/**/*.test.ts"]` — no `.tsx`, no DOM. All 11 existing test files are `.ts`, and there is no `jsdom`, `@testing-library/react` or `@vitejs/plugin-react`. **As written, none of this todo's QA could run.** Add those three to **`devDependencies` only**, extend `include` to `["tests/**/*.test.{ts,tsx}"]`, and give this test file a `jsdom` environment. §Scope OUT's dependency ban covers **`dependencies`**; devDependencies for a test harness are in scope and expected. Without them the `<script>alert(1)</script>` assertion cannot exist, and an unprovable security claim is worse than a dev dependency.
  - **Why:** `copilot-widget.tsx:498-509` renders `{message.content}` as a plain React text child inside `<p className="… whitespace-pre-wrap …">`, so `**bold**`, `###`, `---` and `- ` appear literally. `web/package.json` has **zero** Markdown or sanitiser dependencies, deliberately.
  - **Do:** add a small renderer module under `web/src/components/copilot/` that parses the constrained subset Todo 4 now mandates — **`**bold**`, `- ` bullet lists, and blank-line paragraph breaks, nothing else** — and returns **React elements**. Never build an HTML string; never use `dangerouslySetInnerHTML`. Anything outside the subset (a stray `#`, a table pipe, an emoji) must render as **literal text**, exactly as today — degrading to plain text is always acceptable, mangling the message never is. Wire it into the assistant-message branch only; leave the user-message branch as plain text. Keep `whitespace-pre-wrap` semantics for text that has no markup.
  - **Accept:** `git diff main -- web/package.json` shows **no addition under `dependencies`** — additions under `devDependencies` are expected (D6) and must be listed explicitly (positive control: `git diff --stat main -- web/src/components/copilot/` shows files changed) · **`grep -rl "dangerouslySetInnerHTML" web/src --exclude-dir=generated | wc -l` → `0`** (⚠️ *not* `grep -rc`, which prints one line per file — 76 of them, including generated Prisma code — and can never equal a bare `0`; positive control: `grep -rl "className" web/src/components/copilot | wc -l` → ≥ 1) · `pnpm lint` and `npx tsc --noEmit` exit 0.
  - **⚠️ Container element:** render the assistant message inside a `<div>`, not the current `<p>` — a `<ul>` inside a `<p>` is invalid nesting. Keep `whitespace-pre-wrap` on the text nodes, not the wrapper.
  - **QA — a new unit-test file, each case named:** (happy) `"**hola**"` → a `<strong>` element containing `hola`; (happy) a `- ` list → a `<ul>` with one `<li>` per item; (happy) blank-line separated text → separate paragraphs; (**streaming**, the important one) a **partial** input mid-token — `"Encontré **2 sillas"` with the bold unterminated — renders without throwing and without swallowing the visible text, because tokens arrive one at a time via `use-copilot-chat.ts:278-284`; (failure) input containing `<script>alert(1)</script>` renders as **literal text**, never as an element — assert on the rendered text content; (failure) an unsupported construct like a `|table|` row renders literally rather than being dropped.
  - **Evidence:** `task-15-…txt` with every test name, plus a screenshot of the rendered bubble if the dev server is up.

- [ ] 16. `web/src/{components/copilot,lib/agent}/`: send the selected city to the agent (F2, web half)
  - **Why:** `client.ts:110` sends literally `JSON.stringify({ message, sessionId })`. The widget never calls `useCity()`, even though `city-provider.tsx` exposes it (localStorage key `cinepais.city`, default `"Bogotá"`).
  - **⚠️ Both halves must ship together or this is a silent no-op** — Pydantic v2 ignores unknown fields, so if Todo 5's `ChatRequest` change were missing, the field would be dropped with no error. Confirm Todo 5 is present on this branch before starting: `grep -c "city" agent/src/cinepais_agent/main.py` → ≥ 1.
  - **Do:** read the selected city via `useCity()` in the copilot chat hook and include it in the `POST /chat` body through `streamChat`. Keep it **optional end to end** so a missing city degrades to today's behaviour rather than erroring.
  - **Accept:** `grep -c "city" web/src/lib/agent/client.ts` → ≥ 1 (positive control: `grep -c "sessionId" web/src/lib/agent/client.ts` → ≥ 1) · `pnpm lint` and `npx tsc --noEmit` exit 0.
  - **QA:** (happy) a unit test asserting the request body contains the city currently held by the provider; (failure) with the provider absent or the city empty, the body still parses and omits the field rather than sending `null`/`undefined` — the agent must see a well-formed request either way; (integration, offline) assert the serialized body shape matches exactly what `ChatRequest` accepts, quoting the Pydantic model.
  - **Evidence:** `task-16-…txt` with the serialized body from both cases.

- [ ] 17. `web/src/app/page.tsx` + `web/src/components/films/film-card.tsx`: wire the three tabs to `status` and retire the id-suffix hack (D4)
  - **Why:** `page.tsx` renders `<EmptyState />` **unconditionally** for Pronto and Preventa, while `film-card.tsx:78-83` derives the badge from `id.slice(-2)`. Two different sources — hence the incoherence the user reported.
  - **Do:** filter each tab on `film.status`, and derive the badge from the **same field**. **Delete `badgeForFilmId()` entirely** — leaving it would preserve the drift. Keep the `EmptyState` component for the genuine case where a status has no films.
  - **Accept:** **`grep -rl "badgeForFilmId" web/src --exclude-dir=generated | wc -l` → `0`** (⚠️ use `-rl … | wc -l`, never `grep -rc` on a directory — that prints one count line per file, dozens of them, and cannot equal a bare `0`; positive control: `grep -rl "status" web/src/components/films/film-card.tsx | wc -l` → ≥ 1) · `grep -rl "slice(-2)" web/src --exclude-dir=generated | wc -l` → `0` · `pnpm lint`, `npx tsc --noEmit` and `pnpm build` exit 0.
  - **QA (browser, dev server up):** (happy) each of the three tabs shows a non-empty, **disjoint** set of films, and every card's badge matches the tab it appears under — screenshot all three; (failure) confirm no film appears under two tabs, and that a status with zero films still renders `EmptyState` rather than a broken layout.
  - **Evidence:** `task-17-…png` ×3 + `task-17-…txt`.

- [ ] 18. **Wave 3 close — HARD GATE. Do not start Todo 19 in this session.**
  - **Do:** **the standard gate** in order, including **`bash web/scripts/reseed.sh` after `pnpm test` and before `pnpm build`**. Write `.omo/handoff-fase-f-wave-3.md` and **stage it into this commit**.
  - **🔴 Skipping the re-seed here would also corrupt this wave's own evidence:** Todo 17's three-tab screenshots and `pnpm build`'s static prerender of `/` both read the database, so building on a wiped catalogue produces an empty homepage that looks like a Todo 17 bug rather than a missing re-seed.
  - **Commit:** `feat(web): render copilot markdown, send the selected city, wire the catalogue tabs`
  - **Accept:** all exit 0 · **the re-seed ran after `pnpm test` and the catalogue check returned a non-empty array — quote it** · `git log --oneline main..HEAD --invert-grep --grep='^chore(omo)' | wc -l` → `3` · `git status --porcelain` empty · `git ls-files .omo/handoff-fase-f-wave-3.md | wc -l` → **`1`** · `git diff main -- web/package.json` shows **no dependency addition**.
  - **STOP CONDITION:** complete only when `.omo/evidence/wave-3-closed-cinepais-phase-5-refinement.txt` exists **and the paste-ready continuation block (§Wave boundaries rule 4) has been printed**, naming Wave 4, Todos 19–21, and confirming no runtime dependency was added. **End the session.**

---

### Wave 4 — Impeccable UX pass (bounded, local)

- [ ] 19. Run the `impeccable` skill as an audit and produce a prioritised, evidence-backed findings list
  - **Precondition (step 0):** assert `test -f .omo/evidence/wave-3-closed-cinepais-phase-5-refinement.txt` — STOP if absent. **Fresh session ⇒ start and poll the dev server** using the identical block from Todo 15 step 0; this todo is a browser audit and cannot run without it. Also smoke-check the skill loads: `skill(name="impeccable")` — if unavailable, STOP and report rather than improvising a substitute audit.
  - **Do:** load the `impeccable` skill and audit the app **as a first-time visitor arriving from a phone**, since that is how LinkedIn traffic arrives. Cover at minimum: the home carousel and catalogue, the film detail and date/format selector, the seat map (the densest screen, and the one the demo shows), checkout and confirmation, and the copilot bubble/panel including its loading, error, rate-limit and daily-cap states.
  - **🔴 ZERO LLM SPEND IN THIS TODO. Do not send a live chat message — not one.** This audit is **not** in the phase's budget ledger; only Todo 25 is, at 2 calls. Reaching the rate-limit state live would need ≥ 11 requests in a minute (`limiter.limit("10/minute")`), and the daily-cap state would need to exhaust `DAILY_REQUEST_CAP` — either would blow the phase's entire 4-call ceiling inside an unbudgeted todo. Audit those states by **reading the widget's code paths** and by rendering them from fixtures or local component state, exactly as Fase D's fixture-replay tests did. If a state cannot be reached without spending, record it as *not visually audited, reviewed by code path* rather than spending to see it. Produce a findings list with, for each item: the screen, what is wrong, why it matters to a visitor, a proposed fix, and a severity.
  - **⚠️ Bounded by §Scope OUT:** work **within the existing design language, brand and component set**. No redesign, no new component library, no new dependency. Findings that would require any of those are recorded as *out of scope* with a one-line rationale — recorded, not silently dropped.
  - **Accept:** the findings file exists, every finding names a concrete file or route, and each is classified in-scope or out-of-scope with a reason.
  - **QA:** capture a screenshot per audited screen at a mobile viewport **and** a desktop one; a finding without a screenshot or a file reference is not a finding.
  - **Evidence:** `task-19-…md` (the findings list) + screenshots.

- [ ] 20. Apply the in-scope Impeccable findings
  - **Do:** implement every in-scope finding from Todo 19. Touch only files named in that list; anything else is scope creep. Keep UI copy Spanish and code English.
  - **Accept:** `pnpm lint`, `npx tsc --noEmit`, `pnpm build` exit 0 · every in-scope finding is marked resolved with the file and line that resolved it · `git diff --name-only main -- web/src` contains no file absent from Todo 19's list (or the exception is justified in the evidence).
  - **QA:** re-capture the same screenshots as Todo 19 at the same viewports and place them side by side with the originals — a before/after pair per changed screen. Failure path: confirm the full purchase flow still completes end to end after the changes; visual polish that breaks the flow is a regression, not a fix.
  - **Evidence:** `task-20-…txt` + the before/after screenshot pairs.

- [ ] 21. **Wave 4 close — HARD GATE. Do not start Todo 22 in this session.**
  - **Do:** **the standard gate** in order, including **`bash web/scripts/reseed.sh` after `pnpm test` and before `pnpm build`**. Write `.omo/handoff-fase-f-wave-4.md` and **stage it into this commit**.
  - **🔴 This is the last gate before Wave 5 touches production deliberately.** Leaving the demo dead here means Wave 5 opens against an empty database and every one of its checks becomes unreadable.
  - **Commit:** `style(web): UX polish pass within the existing design language`
  - **Accept:** all exit 0 · **the re-seed ran after `pnpm test` and the catalogue check returned a non-empty array — quote it** · `git log --oneline main..HEAD --invert-grep --grep='^chore(omo)' | wc -l` → `4` · `git status --porcelain` empty · `git ls-files .omo/handoff-fase-f-wave-4.md | wc -l` → **`1`** · still no dependency added.
  - **STOP CONDITION:** complete only when `.omo/evidence/wave-4-closed-cinepais-phase-5-refinement.txt` exists **and the paste-ready continuation block (§Wave boundaries rule 4) has been printed**, naming Wave 5, Todos 22–27, and **flagging in capitals that Wave 5 is the only wave that touches production deliberately and the only one that spends money (2 `/chat`, announced first)**. **End the session.**

---

### Wave 5 — Ship it: migration, production data, deploy, live proof, and unblocking the video

- [ ] 22. Merge to `main` and apply the migration to the production database
  - **Precondition:** assert `test -f .omo/evidence/wave-4-closed-cinepais-phase-5-refinement.txt` — STOP if absent.
  - **Do (step 1 — merge):** merge `phase-5-refinement` into `main` (keep `phase-5-refinement` as a local backup; never delete it).
  - **🔴 Accept (step 1) — verify the merge did not undo Fase E's publication curation, BEFORE anything expensive or irreversible runs:** `git log --oneline main -- '.omo/evidence/*' '.omo/run-continuation/*' '.omo/notepads/*' '.omo/boulder.json' | wc -l` → **`0`** (positive control: `git log --oneline main -- '.omo/plans/*' | wc -l` → non-zero). A curation violation caught here is free to fix; caught at Todo 27 it is behind a destructive re-seed and paid LLM calls.

  - **🔴 Do (step 2 — POINT AT PRODUCTION, EXPLICITLY).** Neither `prisma migrate deploy` nor `scripts/reseed.sh` knows what "production" means: `web/prisma.config.ts` loads `.env.local`, and `dotenv` does **not** override variables already present in the shell, so **the shell environment wins and `.env.local` is the fallback**. `vercel env pull .env.local` pulls the **development** environment unless told otherwise. Left implicit, both commands silently target whatever `.env.local` happens to hold — most likely dev — and every Accept below would still pass while production was never touched. Worse, Fase E's still-live 7-day seed window can make the public API look healthy, masking the failure completely.
    ```bash
    cd web
    vercel env pull .env.production.local --environment=production --yes
    export DATABASE_URL_UNPOOLED="$(grep -m1 '^DATABASE_URL_UNPOOLED=' .env.production.local | cut -d= -f2- | sed 's/^"//; s/"$//')"
    [ -n "$DATABASE_URL_UNPOOLED" ] || { echo "EMPTY — the key is absent or differently named. STOP."; exit 1; }
    ```
    **🔴 The non-empty guard is not decoration.** If the key is absent or named differently (Neon's Vercel integration also ships `POSTGRES_URL_NON_POOLING`), the pipeline yields `""`, and `reseed.sh:71` treats an empty value as *unset* and **silently falls back to `.env.local`** — reporting a source that is not the one you chose. Also note `sed` is used rather than `tr -d '"'`, which would strip quotes from anywhere inside the value.
    **Expect the hash to MATCH `.env.local`'s** — there is one database (§The fourth rule). An earlier draft of this step demanded the hosts *differ*, which is impossible here and would have stalled the wave on a criterion that can never pass. Record the 12-char hash; **never print a connection string**.
  - **Do (step 3 — migrate):** run `pnpm prisma migrate deploy`. **Expect `No pending migrations to apply`** — Todo 8 already applied it in Wave 2, because the database is shared. That output is the **success case**; an actually-pending migration here means Wave 2 did not do what its evidence claims, so STOP and reconcile before pushing.

  - **🔴 Do (step 4 — PUSH, AND ONLY NOW). Ordering is safety-critical and was previously unstated.** `getFilms()` in `web/src/lib/queries.ts` calls `prisma.film.findMany` with **no `select`**, so the generated client requests an explicit column list including `status`. `web/src/app/page.tsx` is a Server Component with no `dynamic`/`revalidate` export, so Vercel **statically prerenders `/` at build time against the database**. If the push (and its auto-deploy) landed before the migration, that build would query a column that does not exist and **fail outright** — not a slow page, a red deployment. Push only after step 3 has confirmed the migration is applied.
  - **Accept:** the hash is recorded (no credentials) · `migrate deploy` exits 0 and reports no pending migrations · the push happened **after** step 3, and the transcript shows that order · `git log --oneline origin/main..main | wc -l` → `0` after pushing.
  - **⚠️ State explicitly, do not assume:** if Vercel's git integration is enabled, this push may **auto-deploy immediately**, shipping Todo 17's status-filtered tabs while the films still carry whatever statuses Wave 2 seeded. Not destructive, but record whether an automatic deployment fired — if it did, Todo 24's deployment is a re-trigger, not the first.
  - **⚠️ Fase E's lesson, carried forward (it cost a debugging cycle there):** write any verification query as a **small script file, not `tsx -e`** — the `@/` path alias does not resolve under `-e`, and `schema.prisma`'s `datasource db` block has **no `url`**, so a bare `new PrismaClient()` will not connect. Applies to Todo 23's checks too.
  - **QA:** (happy) query production and confirm the `status` column exists on `Film` and every row has a non-null value; (failure) if `migrate deploy` errors, **STOP** — do not hand-edit production schema. Rollback: the migration is additive, so recovery is to fix the migration locally, regenerate, and re-run. Report before retrying.
  - **⚠️ Rollback path if the site breaks after this:** `cd web && vercel rollback` to the previous READY deployment, then report.
  - **Evidence:** `task-22-…txt`.

- [ ] 23. Re-seed production with the new occupancy and statuses
  - **⚠️ This is the single riskiest operation in the phase.** `web/prisma/seed.ts:349-356` **deletes** the whole catalogue before reinserting across ~24 unbatched `createMany` calls with **no transaction**. A run killed halfway leaves production **empty, not stale**. This is the exact operation that stalled at ~seat 110,000 in Fase E.
  - **🔴 Precondition — the same targeting trap as Todo 22.** `scripts/reseed.sh` resolves `DATABASE_URL_UNPOOLED` from the shell first and `.env.local` second. If Todo 22's `export DATABASE_URL_UNPOOLED=…` is not still in effect **in this shell**, this command wipes and reseeds **the wrong database**. Re-export it from `.env.production.local` and re-confirm the host before running. Print the host, never the credentials.
  - **Do:** announce to the user before running. Run `bash web/scripts/reseed.sh` against production **once**, timed, with nothing else touching the database.
  - **§Three rules item 3 is binding:** if it exceeds 15 minutes, **STOP and walk the diagnostic ladder — do not relaunch.** Healthy baseline ≈ 73 s.
  - **🔴 The script will argue with this plan. The plan wins.** On failure `reseed.sh:131` prints *"the seed failed. The catalogue may be partially written — **re-run this script** before using the demo."* **Ignore that instruction.** It was written for a disposable local database, and following it is the exact behaviour that cost Fase E 10+ hours. Walk the ladder instead.
  - **Accept:** the script exits 0 and prints a `businessDate` range starting tomorrow · `curl -s "https://cinepais.vercel.app/api/showtimes?filmId=film-01" | head -c 200` returns a **non-empty** array.
  - **QA:** (happy) sample at least five showtimes via the public API and report the `availableCount/totalCount` spread — it must be varied, with none at 0% and none at 100%; (scenarios) re-run Todo 12's four machine checks against **production**, ids resolved at runtime.
  - **🔴 QA (failure) — do NOT relaunch.** An empty production catalogue after this step is the **primary symptom of the exact stall** that cost 10+ hours in Fase E, on this exact operation. Treat it as a suspected stall and walk the §Three rules diagnostic ladder (connectivity probe → timed standalone seed → one clean run), recording each rung. **Do not re-run `reseed.sh` directly**, and do not "just try again" — the retries were themselves the cause last time. If the ladder shows a genuine defect, STOP and report; production being empty is a live outage that a second blind attempt can make permanent.
  - **Evidence:** `task-23-…txt` with the timing, the spread table and the four scenario checks.

- [ ] 24. Redeploy both halves
  - **Do:** trigger a production Vercel deployment from `main`, and `fly deploy` the agent. Confirm the Fly config is unchanged: `min_machines_running = 0`, `auto_stop_machines = 'stop'`, `soft_limit = 3`, `hard_limit = 5`, `shared-cpu-1x` / 1 GB.
  - **Accept:** the Vercel deployment is READY and the build log shows `prisma generate` (positive control: it also shows `next build`) · `curl -s -o /dev/null -w '%{http_code}' https://cinepais.vercel.app` → `200` · `curl -s https://cinepais-agent.fly.dev/health` → `{"status":"ok"}` · `grep -c "min_machines_running = 0" agent/fly.toml` → `1`.
  - **QA (zero LLM cost):** re-run Fase E's CORS preflight proof against the deployed pair — a request with the production `Origin` returns the matching `access-control-allow-origin`, and a request with `Origin: https://evil.example` does **not**. Also re-run the `fly ssh` MCP tool probe from Fase E Todo 29 to confirm the agent still reaches the real read API (this is the check that catches a regression of the `WEB_API_BASE_URL` propagation bug). **No `/chat` is spent here.**
  - **Rollback:** Vercel → `vercel rollback`; Fly → `fly releases -a cinepais-agent` then `fly deploy --image <previous digest>`, confirming the machine returns to `stopped`. Report either.
  - **Evidence:** `task-24-…txt` with both CORS transcripts and the MCP probe output.

- [ ] 25. Live proof of everything this phase changed — **budgeted at 2 `POST /chat` calls**
  - **⚠️ ANNOUNCE TO THE USER BEFORE RUNNING.** This is the only todo in the phase that spends money.
  - **Do:** with a city selected in the UI, ask **the user's original failing query** verbatim — *"Me quiero ver La Odisea en una sala IMAX, dos puestos, en un horario de noche."* — then one more targeting a different scenario. Record the exact queries.
  - **Accept (record as OBSERVED, never assert on LLM trajectory):**
    1. **Rendering** — the reply shows **no literal** `**`, `###`, `---` or emoji; bold and bullets render as elements. Screenshot.
    2. **No duplication** — the prose does not restate the card's structured facts. Screenshot both together.
    3. **Centred seats** — the recommended seat ids are in the **centre block** (IMAX cols 6–15), not columns 1–2, and the row sits mid-band. Quote the seat ids.
    4. **City anchoring** — the recommendation is in the selected city; if it is not, the reply **says so explicitly**. Record which happened.
    5. **Occupancy** — the seat map shows a realistically partly-full room, not 260/260. **⚠️ Judge this against the number Todo 10 measured, not against a hope.** `scoring_helpers.py:43` scores showtimes as `100 + 10·tier + 5·availability_ratio`; today availability is constant so the term is inert, but once Todo 10 spreads occupancy from ~10% to ~70% sold it becomes the discriminator among same-tier showtimes — a 10%-sold room scores 134.5 against a 30%-sold room's 133.5. **The agent will therefore systematically recommend the emptiest showtime**, which is in direct tension with this criterion. Record the selected showtime's sold fraction as a measurement. If it is ≥ 85% available, log it as a finding for a future phase rather than editing the score formula here — §Scope OUT keeps `scoring_helpers.py:43` frozen in this phase.
    Every one of these is a *measurement recorded in evidence*. The only hard pass/fail is that a `recommendation` event arrives and the HITL CTA pre-selects seats.
  - **QA:** the CTA navigates to `/showtimes/<id>?preselect=<ids>` and the seats appear selected. Capture the money shot.
  - **Evidence:** `task-25-…png` (money shot + rendering) + `task-25-…txt`, plus **2 appended lines** in the spend file.

- [ ] 26. Make the documentation and the demo script tell the truth, and unblock the video
  - **Do:** re-read each file, then update: root `README.md` — the seat-quality description, the new occupancy behaviour, and the `status`-driven catalogue tabs; `web/README.md` and `agent/README.md` — same, plus the `city` field on `POST /chat` and the response-formatting contract; `agent/docs/sse-contract.md` — the `city` request field. **🔴 Resolve the row-tier drift — and note the direction, because the planner initially had it backwards.** The READMEs' prose ("rows 1–3 low, 4–8 optimal, 9+ high") **matches the shipped data** and is correct: `web/prisma/seed.ts:179-213` `getSeatMeta()` uses those fixed cutoffs, with `_maxRow` deliberately unused. What is wrong is `web/src/lib/business/quality.ts`'s `rowToTier()` — a *proportional* rule that is **dead code with zero call sites** (`grep -rn "rowToTier" web/` → one hit, its own definition). **Both READMEs** carry the false qualifier — the root `README.md` says *"rows 1–3 `low`, rows 4–8 `optimal`, rows 9+ `high`, **scaled proportionally in smaller rooms**"*, and `web/README.md` repeats the claim and credits `quality.ts`. The data does **not** scale.
**🔴 The same dead rule exists THREE times, not once — clean up all of them.** (i) `web/src/lib/business/quality.ts` `rowToTier()`; (ii) its Python port `agent/src/cinepais_agent/seating.py:66` `row_to_tier()`, also with **zero production call sites**, kept alive only by `agent/tests/test_seating.py`; (iii) `seating.py`'s own module docstring, lines 5 and 9–12, which asserts *"the CODE uses a proportional formula … **The CODE is canonical.** row 3/13 ≈ 0.2308 > 0.23, so row 3 is 'optimal', not 'low'."* **That docstring is false** — the agent never computes tiers, it receives `seat.qualityTier` over the wire (`models.py:58` ← the read API ← the seed's fixed cutoffs) — and it is the most persuasive statement of the error in the whole repository, which is precisely why it must go.
    **Do:** (a) **delete `web/src/lib/business/quality.ts`** as dead code that contradicts shipped behaviour — an orphaned business rule in a public portfolio repo is worse than none; (b) delete `row_to_tier` from `seating.py`, together with the assertions in `test_seating.py:47-70` that lock in the proportional rule (including `assert row_to_tier(3, 13) == "optimal"` at `:54`), having first migrated the fixtures in Todo 3; (c) rewrite the `seating.py` docstring to state the truth: tiers arrive from the read API and originate in `seed.ts`'s `getSeatMeta()` fixed cutoffs, and remove the `quality.ts → row_to_tier` port line; (d) in **both** READMEs, keep the fixed cutoffs (they are correct), delete the "scaled proportionally" clause, and point the rule at `getSeatMeta()`.
    **Record the agent test-count change** the way Todo 13 requires for the web suite: state the before/after and name every removed assertion with its reason. Removing a test that asserts wrong behaviour is correct; removing it silently is not.
    Finally, update `specs/003-demo-script.md` for the new reality (centred seats, occupied rooms, working tabs) and **remove the recording block** — the video is now unblocked.
  - **Accept:** `grep -rn "rowToTier" web/` → **nothing** (positive control: `grep -rn "getSeatMeta" web/prisma/seed.ts | wc -l` → ≥ 2) · `test -f web/src/lib/business/quality.ts` → false · `grep -rci "proportional" README.md web/README.md` → `0` (**both** files) · `grep -c "rows 1" web/README.md` → ≥ 1 (the fixed cutoffs stay, they are correct) · **`awk '/## Request/,/## Response/' agent/docs/sse-contract.md | grep -c city` → ≥ 1** (⚠️ a bare `grep -c "city"` on that file already returns **5** today — in the recommendation payload and tool input — so it can never fail; the new field belongs in the **request** section, which is what this scoped check proves. Positive control: the same `awk` range piped to `grep -c sessionId` → ≥ 1) · `grep -rn "<WEB_URL>\|<AGENT_URL>" README.md specs/` → nothing · `pnpm lint`, `npx tsc --noEmit` and `pnpm build` exit 0 after the deletion (proving nothing imported it).
  - **QA:** for each edited file, quote in the evidence the line that made the stale claim and the line replacing it — do not paraphrase. Then execute every command in the READMEs' local-run sections verbatim and record the exit codes; an instruction that does not run is a FAIL.
  - **Evidence:** `task-26-…txt`.

- [ ] 27. **Wave 5 close + phase handoff — HARD GATE**
  - **🔴 STEP 0 — UNSET THE PRODUCTION EXPORT BEFORE ANYTHING ELSE. This is the phase's most dangerous single line.** Todos 22 and 23 `export DATABASE_URL_UNPOOLED` and Todo 23 *requires* it to still be live in the same shell. That export therefore survives into this todo, where `pnpm test` re-seeds three times with the hardcoded past `SEED_NOW = "2026-08-01"` — wiping the live catalogue minutes before this todo's own final check demands a non-empty one. The safe sequence:
    ```bash
    unset DATABASE_URL_UNPOOLED
    rm -f web/.env.production.local          # Next.js loads this file FIRST under NODE_ENV=production
    cd web && node -e 'require("dotenv").config({path:".env.local"});console.log(require("crypto").createHash("sha256").update(process.env.DATABASE_URL_UNPOOLED).digest("hex").slice(0,12))'
    ```
    Deleting `.env.production.local` matters beyond this todo: it is gitignored so it never leaks, but `next build` and `next start` load `.env.$(NODE_ENV).local` at **highest precedence**, so leaving it behind silently repoints every future local production build in this repo. Remove it as part of closing the phase.
    **Note honestly:** because there is only one database (§The fourth rule), unsetting does not change *which* database is hit — it removes a second, invisible path to it and restores the documented precedence. The re-seed at step (e) is what actually protects the demo.
  - **Do:** **the standard gate** in order, including **`bash web/scripts/reseed.sh` after `pnpm test`** and a **non-empty catalogue check against the deployed URL** before `pnpm build`. Commit, push `main`, then write `.omo/handoff-fase-f-final.md`: what shipped, every measurement (occupancy spread, seat ids chosen, timings), the exact LLM spend with its reproduction command, every deviation, and the literal next step (record the video).
  - **⚠️ `pnpm test` re-seeds the live database three times with a past date.** This is unconditional, not a maybe — Todo 7 re-confirmed the shared database at the start of Wave 2. The re-seed at step (e) is what makes this todo's own final check reachable.
  - **Commit:** `docs: demo script, API contract, and seat-quality documentation`
  - **Accept:** all gates exit 0 · `git status --porcelain` empty · `git log --oneline origin/main..main | wc -l` → `0` · both live URLs return 200 · the spend total is **≤ 4** `POST /chat` for the phase · `git ls-files .omo/handoff-fase-f-final.md | wc -l` → `1` · **the phase's last check:** `curl -s "https://cinepais.vercel.app/api/showtimes?filmId=film-01"` returns a **non-empty** array.
  - **Also verify the publication curation still holds:** `git log --oneline main -- '.omo/evidence/*' '.omo/run-continuation/*' '.omo/notepads/*' | wc -l` → `0` (positive control: `git log --oneline main -- '.omo/plans/*' | wc -l` → non-zero).
  - **STOP CONDITION:** complete only when `.omo/evidence/wave-5-closed-cinepais-phase-5-refinement.txt` exists, the handoff is committed, **and the paste-ready continuation block (§Wave boundaries rule 4) has been printed** — for this final wave it names the **verification wave F1–F5** instead of a next wave, states the total LLM spend against the 4-call ceiling, and ends with the literal remaining human step: **record the demo video, now unblocked**. **End the session**, then run the final verification wave.

---

## Final verification wave

Run by the orchestrator after Todo 27. **Shared-state rules:** no lane switches branches, no lane
re-seeds while another runs, only one lane drives a browser, and **no lane spends an LLM call.** All
five must APPROVE.

- [ ] F1. Plan compliance audit — re-run every acceptance criterion in Todos 1–27 from a clean shell, pairing each negative-result grep with a positive control. Report the exact count that pass, fail, or could not be re-run, and why. **Explicitly check that all five wave handoff notes exist and are tracked** (`git ls-files .omo/handoff-fase-f-wave-*.md | wc -l` → `5`) — Fase E lost one of six because that rule lived only in a global section.
- [ ] F2. Code quality review — sweep `git diff main@{before-merge}..main` for dead code, `any`, and leftovers. Confirm **no runtime dependency was added**: `git diff … -- web/package.json` shows no `dependencies` change. Confirm `badgeForFilmId`, `slice(-2)`, `rowToTier`/`quality.ts` **and the Python port `row_to_tier`** are all gone — **the grep must span the whole repo, not just `web/`**, because the prior pass scoped it to `web/` and that is exactly how the agent's copy survived: `grep -rn "rowToTier\|row_to_tier\|badgeForFilmId\|slice(-2)" web/src web/prisma agent/src agent/tests` → nothing (positive control: `grep -rn "getSeatMeta" web/prisma/seed.ts | wc -l` → ≥ 2). Confirm `mcp_widening.py` is untouched. Confirm the seat-ranking code derives quality bands from the **fixed** cutoffs, not a proportional rule.
- [ ] F3. Security review — no `dangerouslySetInnerHTML` anywhere; the Markdown renderer escapes `<script>` as literal text (re-run that test); the `city` field is length-bounded and validated; no `.env` or key pattern is tracked on `main` (re-run Fase E's full-history scan); `min_machines_running = 0` and `hard_limit = 5` still set.
- [ ] F4. Hands-on QA against the **deployed** site, browsing only — walk the full purchase flow; confirm the three catalogue tabs are populated and disjoint; confirm rooms show partial occupancy; confirm the copilot bubble mounts and its limit/error copy matches the shipped constants by exact string. **Do not send a chat message** — zero spend.
- [ ] F5. Scope fidelity — confirm every Must-NOT-Have held: no new dependency, no `dangerouslySetInnerHTML`, no redesign, no evals run, ≤ 4 `/chat`, no Fly limits raised, no hardcoded dates or seed-derived ids, phase branches intact, no attribution lines, no CineColombia reference. Enumerate and classify every changed file.

---

## Commit strategy

| Wave | Subject |
|---|---|
| 1 | `fix(agent): recommend centred seats, constrain response formatting, accept the user's city` |
| 2 | `feat(web): film status, realistic seeded occupancy, and scenario integrity` |
| 3 | `feat(web): render copilot markdown, send the selected city, wire the catalogue tabs` |
| 4 | `style(web): UX polish pass within the existing design language` |
| 5 | `docs: demo script, API contract, and seat-quality documentation` |

Executor wave commits are counted with `--invert-grep --grep='^chore(omo)'`. Orchestrator bookkeeping
commits are expected; **never rewrite history to make a count match.**

## Dependency matrix

| Todo | Depends on | Why |
|---|---|---|
| 2 | 1 | branch must exist |
| 3 | 2 | tests lock the new ranking |
| 4, 5 | 1 | independent prompt/API edits |
| 6 | 2–5 | wave gate |
| 7 | 6 | fresh session; starts the dev server |
| 8 | 7 | migration needs a reachable dev DB |
| 9 | 8 | cannot seed a field that does not exist |
| 10 | 7 | occupancy is independent of status |
| 11 | 8, 9 | API exposes a seeded field |
| 12 | 10 | recalibration is against the new baseline |
| 13 | 9–12 | tests follow the data |
| 14 | 8–13 | wave gate |
| 15 | 14 | fresh session |
| 16 | 5, 14 | **both halves or silent no-op** |
| 17 | 11, 14 | tabs need `status` in the API |
| 18 | 15–17 | wave gate |
| 19 | 18 | fresh session |
| 20 | 19 | applies its findings |
| 21 | 19, 20 | wave gate |
| 22 | 21 | fresh session; merges everything |
| 23 | 8, 22 | schema before data |
| 24 | 22, 23 | deploy against migrated, seeded data |
| 25 | 24 | live proof needs both halves deployed |
| 26 | 25 | documents measured truth |
| 27 | 22–26 | wave gate |
| F1–F5 | 27 | post-implementation |

## Risks the executor must surface rather than silently absorb

1. **The production re-seed is destructive and un-transactioned.** It stalled once already. One attempt, 15-minute ceiling, diagnostic ladder. An empty production catalogue is a live outage, not a slow test.
2. **Dev and production may share one Neon database** (Todo 7 answers this). If they do, `pnpm test` in Todos 14/18/21/27 will disturb the live demo — surface it, do not decide alone.
3. **The city change is a two-sided contract.** Pydantic ignores unknown fields, so a half-shipped change fails silently. Todo 16 asserts Todo 5 is present before starting.
4. **The planted scenarios may stop being distinguishable** once normal rooms have occupancy. Todo 12 exists precisely to prevent that, with negative controls.
5. **Impeccable findings can grow without bound.** §Scope OUT caps them at the existing design language; out-of-scope findings are recorded for a future phase, never silently implemented.
6. **The demo video is downstream of all of this.** Recording before Todo 26 captures the very defects this phase fixes.
7. **`quality.ts` is dead code that contradicts the shipped data.** Todo 26 deletes it. Until then, treat `seed.ts`'s `getSeatMeta()` as the only source of truth for quality tiers — anything else will be wrong for Premium and 2D rooms.

---

## Review record — Metis pass (pre-handoff)

An adversarial review ran against this plan before handoff. Findings were **repaired in place**, not
merely noted, and the planner independently verified each one against the real files before accepting it.

| # | Severity | Finding | Repair |
|---|---|---|---|
| B1 | **BLOCKER** | Todo 23's QA said *"if the catalogue comes back empty, re-run the refresh"* — directly contradicting §Three rules item 3 three bullets above, at the single most dangerous step. An empty catalogue is the **primary symptom of the stall that cost 10+ hours**, and a fresh executor would follow the nearer instruction | QA rewritten: an empty catalogue is a **suspected stall**; walk the diagnostic ladder, never relaunch `reseed.sh` |
| B2 | **BLOCKER** | Todos 22/23 said "against production" but nothing ever **targeted** production. `prisma.config.ts` loads `.env.local`, `dotenv` does not override the shell, and `vercel env pull` defaults to **development** ⇒ both destructive commands would silently hit dev while every criterion still passed — and Fase E's live 7-day window could make the public API look healthy, masking it completely | Explicit `vercel env pull --environment=production` + `export DATABASE_URL_UNPOOLED` + a host-only verification step, in both todos |
| B3 | **BLOCKER** | Todo 2 told the executor to derive quality-band bounds from `web/src/lib/business/quality.ts` — which is **dead code with zero call sites** (verified: `grep -rn "rowToTier" web/` → one hit, its own definition). Real tiers come from `seed.ts:179-213` `getSeatMeta()` with **fixed** cutoffs and a deliberately unused `_maxRow`. The rules diverge badly for Premium (9 rows: fixed marks only row 9 `high`; proportional would mark 6–9) ⇒ the flagship fix would ship subtly wrong for 2 of 3 room types while an IMAX-only suite reported success. **Todo 26 compounded it** by instructing the READMEs to be "corrected" to describe the dead rule | Todo 2 repointed at the fixed cutoffs; Todo 3 gained a **Premium/2D fixture** (test 7) that fails if the dead rule was used; Todo 26 inverted — the prose was right, the code is orphaned, so `quality.ts` is **deleted** |
| B4 | **BLOCKER** | Todo 19 required auditing the copilot's *"rate-limit and daily-cap states"* in a live browser with **no** "do not chat" guard — unlike F4, which has one. Reaching those states live needs ≥ 11 requests in a minute, or exhausting the 40-call daily cap: the phase's entire 4-call ceiling, spent inside a todo not even in the budget ledger | Explicit zero-spend rule added: audit those states by code path and fixtures, never by spending |
| B5 | **BLOCKER** | Todo 7 (Wave 2) correctly starts and polls the dev server, but **Todos 15 and 19 do not** — and each wave is a fresh session, so the process is gone. Todo 15's own QA hedged *"if the dev server is up"*, betraying the gap; Todo 19 is a pure browser audit. The same defect class already repaired at the wave-1→2 boundary, simply not propagated | Todo 7's start-and-poll block copied verbatim into Todos 15 and 19 |
| M1 | MAJOR | Todo 2 defined two distances but never said how they **combine** — lexicographic or weighted, and in which order. Two executors would produce different rankings, and Todo 3's fixture would not distinguish them | Pinned: lexicographic, `(-tier, horizontal, vertical, row, col)`, horizontal primary, with float midpoints for even-sized groups |
| M2 | MAJOR | Todo 12's negative controls can be **numerically unsatisfiable**: Premium is 90 seats with only 60 non-`low`; at ~70% sold with best-first clustering, a normal room ends with zero non-`low` seats and becomes indistinguishable from `front-only` | Todo 10 gained a hard floor — **≥ 15% of the `optimal` band stays available on every normal showtime** — and Todo 12's sample must include a busy Premium/2D room |
| M3 | MAJOR | The publication-curation check lived only in Todo 27, **behind** the destructive re-seed and the paid live calls | Moved into Todo 22's own Accept, right after the merge |
| M4 | MAJOR | Preconditions checked that `vercel`/`fly` **exist**, not that they are authenticated — an expired token would fail mid-Wave-5, after the migration and re-seed | `vercel whoami` / `fly auth whoami` / `gh auth status` added |
| M5 | MAJOR | Todo 22 pushes `main`; if git auto-deploy is on, that ships status-filtered tabs before Todo 23 seeds real statuses. The plan left it ambiguous | Assumption stated explicitly and its outcome must be recorded |
| m1 | MINOR | D3's summary table dropped the "sold" qualifier the operative text had | Qualified, with a note that every figure in the plan is a *sold* fraction |
| m2 | MINOR | Todo 19 never confirmed the `impeccable` skill loads in a fresh session | Smoke-check added |

**Metis also confirmed as sound:** the preconditions correctly anticipate the planner's own untracked
artifacts; Todo 9's deferred check is a *named criterion in Todo 11's Accept*, not deferred prose; the
Todo 24 `fly ssh` probe genuinely spends zero LLM; Todo 3's centre-block claim is arithmetically
constructible for IMAX; Todo 25 correctly records LLM behaviour as observation rather than asserting on
trajectory; and no seed-derived id is hardcoded anywhere.

**Chain-of-error worth recording:** an exploration subagent reported the proportional rule as canonical
because it read `quality.ts` and never checked call sites; the planner accepted it. Metis caught it by
grepping for callers. **Reading a function is not evidence that anything calls it.**

---

## Review record — HIGH-ACCURACY pass (Momus + Oracle, independent, parallel)

A second review ran at the user's request, after the Metis repairs. Two reviewers with deliberately
different mandates — Momus on plan-craft and verifiability, the Oracle on *"would the resulting system
actually work?"* — plus the planner's own verification pass. **32 findings: 10 BLOCKER, 10 MAJOR,
12 MINOR. Both verdicts were REQUEST-CHANGES.** All are repaired above. Highlights:

| # | Sev | Finding | Repair |
|---|---|---|---|
| **O-B1** | **BLOCKER** | **The flagship fix was specified wrong.** "Distance to the centre of *the group's own block*" gives every block its own zero point, so a pair at IMAX cols 1–2 (block distance **1.5**) beats a pair at cols 6–7 in the true centre block (block distance **4.0**) — **re-creating the front-left-corner bug the todo exists to fix**, relocated from row 4 to row 6, while Todo 25 simultaneously demands centre-block seats | Metric changed to **distance to the ROOM centre**, `(1+cols)/2` — IMAX 10.5, 2D 8.0, Premium 5.5. D2 corrected in the decision table. Todo 3 gained **test 2b**, the only test that discriminates the two formulas (an empty room cannot) |
| **M-B1** | **BLOCKER** | **The plan's whole local-vs-production separation rests on a premise Fase E disproved in writing.** `.omo/handoff-fase-e-final.md` §9: dev and prod are ONE Neon database, SHA-256 identical (`ec264e7be82e`). So Wave 2's "local DB only" heading is false, Todo 8's `migrate dev` would target production (and can offer to **reset** it), and Todo 22's Accept demanded hosts that *differ* — impossible | New **§The fourth rule** states the fact and its five consequences; Todo 7 re-confirms by hash instead of re-asking; `migrate dev` **banned** in favour of `--create-only` + `migrate deploy`; the impossible criterion deleted; Todo 22's migrate re-framed as an expected **no-op** |
| **M-B2** | **BLOCKER** | **Every wave gate silently kills the live demo.** `pnpm test` re-seeds three times with a hardcoded `SEED_NOW = "2026-08-01"` — now a past date — so the catalogue empties. Fase E measured **57 → 0 → 672**. Four of five gates had no warning and none re-seeded; worse, `pnpm build` statically prerenders `/`, baking the empty catalogue into the output | User accepted the downtime (**D5**) but not the *persistence* of it: **the standard gate** now runs test → **re-seed** → non-empty check → build, written out literally inside all five wave-close todos |
| **O-B5** | **BLOCKER** | **A repair from the previous pass created this one.** The `export DATABASE_URL_UNPOOLED` added to fix production targeting survives into Todo 27, where `pnpm test` inherits it and wipes production with the stale date — minutes before Todo 27's own check demands a non-empty catalogue | Todo 27 gained a **step 0**: `unset` the export and delete `.env.production.local` before anything runs |
| **O-B2** | **BLOCKER** | Re-keying `scenarioFor()` to a literal time collides with `pickFourSlots()`, which drops 1 of 5 slots — giving each scenario a 1-in-5 chance of not existing. Across four scenarios, **`1−(4/5)⁴ ≈ 59%`** that at least one vanishes silently. And `forcedFilmFor()` still keyed on `slotIdx`, desynchronising film from scenario | Both functions re-keyed **together**, anchor survival must be **guaranteed and proven by query**, and the PRNG-shift consequence handed to Todo 13 |
| **O-B3/B4, M-B4** | **BLOCKER** | `Film.status` had no `@default`, so the migration cannot apply to a populated table; and Todo 22 **never said when to push** — pushing before the migration makes Vercel prerender `/` against a missing column and **fail the build outright** | `@default(cartelera)` mandated and grep-verified; push promoted to an explicit **step 4**, strictly after `migrate deploy` |
| **M-B3** | **BLOCKER** | The preconditions expected 2 dirty files; the tree has **3** (a modified Fase E plan). Todo 6's "clean tree" criterion was therefore unreachable — the plan stalls at step zero | Preconditions and Todo 1 corrected to the exact three paths |
| **M-M1** | MAJOR | Todos 15/16 QA requires rendering React, but vitest runs `environment: "node"`, `include` matches only `.ts`, and there is no jsdom or testing-library. **The XSS test could not exist** | **D6** permits test-only devDependencies; the ban was always about runtime `dependencies`. Harness setup added as Todo 15 step 0b |
| **M-M3** | MAJOR | `prompts.py:41` **explicitly orders** the model to restate cinema, time and price — the duplication Todo 4 removes — while Todo 4 said "keep behavioural lines byte-for-byte". A careful executor would ship a no-op | §"Estilo de respuesta" declared in scope **in full**; the byte-for-byte rule now applies only outside it |
| **O-M1** | MAJOR | The ≥15% optimal-band floor counts **seats**, but 4 of Premium's optimal seats are accessibility/preferential and excluded from candidates — so the floor can be met with **zero recommendable pairs** | Floor restated as **at least one orphan-safe adjacent general-category pair**, verified with the product's own adjacency logic |
| **O-M2** | MAJOR | `score = 100 + 10·tier + 5·availability` is inert today because every room is empty; varied occupancy makes it the discriminator, so **the agent will systematically pick the emptiest showtime** — against Todo 25's "realistically partly-full" criterion | Interaction stated, measured, and bounded; the formula stays frozen per §Scope OUT, with an out-of-scope note for a future phase |
| **O-M3** | MAJOR | Nothing tied `status` to the schedule: a film badged *"Pronto"* would still sell tickets tonight, and the agent cannot see it (`FilmSummary` uses `extra="ignore"`) | Schedule semantics pinned per status; `film-01`/`film-02` forced to stay `cartelera` because `forcedFilmFor()` and the determinism test depend on them |
| **O-M5** | MAJOR | "Thread the city into the agent invocation" had **no mechanism** — `SYSTEM_PROMPT` is an f-string bound once at startup, and a `{city}` placeholder would break at import | Static prompt rule + a validated per-turn context prefix in `stream_agent`, with the injection risk called out explicitly |
| **M-M2/M-M5** | MAJOR | Two criteria were **vacuous**: `grep -c "block" seating.py` already returns 17, and `grep -c "city" sse-contract.md` already returns 5 | Both replaced with checks that are false today — a baseline delta, and an `awk`-scoped range over the request section |
| 12 MINOR | — | `grep -rc <dir>` prints per-file counts and can never equal `0` (Todos 15/17) · stale 131-test baseline (really **136**) · the `high` band has no derivable centre · pre-existing hardcoded dates would read as a Scope-OUT breach · `.env.production.local` outranks `.env.local` for every future `next build` · Fase E's `tsx -e` lesson not carried forward · the export can silently resolve empty and fall back · **`reseed.sh:131` itself tells you to re-run it** · `<ul>` inside `<p>` is invalid · status from the PRNG would shift every film assignment · the determinism test finds its showtime positionally | all applied |

**Found by the planner independently, while verifying the previous pass's repairs rather than trusting
them:** the dead tier rule exists **three** times, not one — `quality.ts`, its Python port
`seating.py:66`, and a `seating.py` docstring asserting *"The CODE is canonical"*, which is false and is
where the original error was learned. Critically, `test_seating.py:204` builds the **exact fixture Todo 3
would reuse** from the dead rule, so the executor could have calibrated the centring maths against tiers
production does not have, with every test green. Both reviewers independently confirmed it.

**The lesson this pass paid for:** the previous review's repairs were *correct in themselves* and still
produced two new blockers — one by leaving a shell variable exported (O-B5), one by fixing `web/` and
never grepping `agent/` (M-B5). **A repair is a change, and a change deserves the same scrutiny as the
code it replaced.** And: Fase E had already answered the shared-database question in writing. Nobody
read it. **Read the previous phase's answers before re-asking its questions.**
