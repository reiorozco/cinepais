# Plan — CinePaís Fase E / Fase 4: pulido + deploy + demo + post

**Slug:** `cinepais-phase-4-deploy`
**Intent:** clear · **review_required:** false
**Draft / decision record:** `.omo/drafts/cinepais-phase-4-deploy.md`
**Base branch:** `phase-3-integration` @ `9303bbf` (verify, never assume)
**Planner:** Prometheus. **Executor:** a separate `/start-work` session.

---

## Goal

Take CinePaís from a local-only, never-deployed repo to a **publicly reachable portfolio artifact**:
polished, published on GitHub under a clean `main`, deployed (web → Vercel, agent → Fly.io), protected
by real spend controls, kept alive past its 7-day seed horizon, and accompanied by a recorded
"antes vs. después" demo plus a LinkedIn post draft.

## Non-negotiable conventions (AGENTS.md)

- Code, identifiers, filenames, comments → **English**. UI copy + agent replies → **Spanish**.
- Fictional brand **CinePaís**. Never CineColombia's real name, logo, or endpoints.
- Mock data only. No real cinema API, no live scraping.
- **No attribution lines anywhere** ("Generated with…", "Co-Authored-By…") — commits, docs, or code.
- Commits only where this plan says so. Never push outside the todos that say to push.
- Phases run in fresh chats; **each wave close is a hard stop** (enforced as a criterion, not prose).

---

## Preconditions (run FIRST; if any fails, STOP and report)

```bash
cd /Users/reiorozco/Dev/cinepais
git branch --show-current      # expect: phase-3-integration
git log --oneline -1           # expect: 9303bbf chore(omo): Final Verification Wave complete — F1-F4 all APPROVE
git remote -v                  # expect: EMPTY (nothing pushed yet)
git rev-parse --verify main    # expect: FAIL, exit 128 (no main yet)
git status --porcelain         # see the expected set below — NOT expected to be empty
```

**`git status --porcelain` is expected to show exactly these three untracked planning artifacts**, and
nothing else. They exist because the planning session wrote them into this same working tree:

```
?? .omo/drafts/cinepais-phase-4-deploy.md
?? .omo/handoff-fase-e.md
?? .omo/plans/cinepais-phase-4-deploy.md
```

Anything **beyond** those three is an unexpected dirty tree → STOP and report. Todo 1 stages them, which
is what allows every later `git status --porcelain` → empty criterion to be satisfiable at all.

`git rev-parse --verify main` is expected to **fail**; exit 128 is the pass condition here, not an error.

### Tool availability (check once, before Todo 1)

```bash
for t in git node pnpm npx python3 docker fly gh vercel uv; do
  command -v "$t" >/dev/null 2>&1 && echo "OK   $t" || echo "MISSING $t"
done
```

`git node pnpm npx python3 uv` are needed from Wave 1; `gh` from Wave 3; `vercel` from Wave 4;
`docker` and `fly` from Wave 5. Any `MISSING` among them → STOP and report **before** starting the wave
that needs it, not when a todo fails deep inside it. `shellcheck` is optional (Todo 13 Path B already
falls back to `bash -n`).

## Verified baselines (measured 2026-08-14 — do NOT re-derive, but DO re-confirm before gating)

| Surface | Command | Baseline |
|---|---|---|
| agent lint | `cd agent && uv run ruff check .` | exit 0, "All checks passed!" |
| agent types | `cd agent && uv run basedpyright` | exit 0, 0 errors 0 warnings |
| agent tests | `cd agent && uv run pytest tests/ -m "not evals" -q --timeout=120` | exit 0, 105 passed / 1 skipped |
| web full gate | `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `pnpm build` | all exit 0 (Fase D §4) |

Both halves are GREEN at baseline, so a green gate is legitimate to mandate.

### Two rules that protect the shared database

1. `pnpm test` takes **5–12 minutes** (mostly `seed-determinism.test.ts` re-seeding Neon three times).
   Launch it **detached with an exit-code file**, never under a short shell timeout — a SIGTERM
   mid-run corrupts the shared DB:
   ```bash
   mkdir -p /tmp/omo-p4 && nohup zsh -c 'cd web && pnpm test > /tmp/omo-p4/test.log 2>&1; echo $? > /tmp/omo-p4/test.exit' &
   # poll until /tmp/omo-p4/test.exit exists, then read it
   ```
2. **Never overlap `pnpm test` with `pnpm build`**, and never run two `pnpm test` concurrently. Both
   hit the same Neon DB and produce spurious, code-unrelated FK failures.

3. **🔴 ONE ATTEMPT. NEVER RETRY A HUNG SEED OR TEST RUN BLINDLY.** *(Added after Wave 1: an executor
   lost **10+ hours** looping on a `seed-determinism` hang that stalled around seat ~110,000 of 119,280.
   The root cause was **connection contention created by its own repeated interrupted retries** — each
   retry made the next one likelier to hang. Wave 1 touched no seed or DB file; there was no code
   defect. Retrying was the failure.)*

   If a seed or `pnpm test` run exceeds **15 minutes** (the measured ceiling is ~730 s), **STOP it and
   diagnose — do not relaunch.** Walk this ladder in order and record each rung's result:

   | # | Probe | Reads as |
   |---|---|---|
   | 1 | Connectivity check against Neon | Fails ⇒ infrastructure, not code. Stop and report. |
   | 2 | Run the seed **standalone** (`pnpm prisma db seed`, recomputed `SEED_NOW`), timed | Clean run (~73 s measured) ⇒ the seed is healthy; the hang was contention. |
   | 3 | **One** clean full `pnpm test`, nothing else running, detached with the exit-code poll | Passing (136/136 in ~558 s measured) ⇒ resolved. Record and move on. |

   Only if rung 2 or 3 reproduces the hang is there a real defect — then stop and report it rather than
   attempting a fix. **Wall-clock spent looping is a reportable deviation**, not a private cost.

### The seed rule (never hardcode a date)

Every seeding step in this plan MUST recompute `SEED_NOW`:

```bash
cd /Users/reiorozco/Dev/cinepais/web
SEED_NOW=$(python3 -c "from datetime import date, timedelta; print((date.today()+timedelta(days=1)).strftime('%Y-%m-%d'))")
TZ=America/Bogota SEED=20260801 SEED_NOW=$SEED_NOW pnpm prisma db seed
```

Pre-flight before trusting any UI or agent result (needs the dev server on `:3000`):

```bash
curl -s "http://localhost:3000/api/showtimes?filmId=film-01" | head -c 200
```

`[]` ⇒ stale seed, re-seed. Healthy ⇒ `Seed complete: 119280 seats across 672 showtimes`.

---

## Locked decisions (from the approval gate — do not relitigate)

| Topic | Decision |
|---|---|
| Publishing | **Public repo**, `.omo/` **curated**: `plans/`, `drafts/`, handoffs SHIP; `evidence/` + `run-continuation/` do NOT |
| `main` | **Squash** into a clean `main`, one commit per phase. The 4 phase branches are **never deleted** |
| Agent host | **Fly.io**, org `personal`, region **`iad`**, `shared-cpu-1x` + **1 GB**, scale-to-zero |
| Spend control | `[MANUAL — USER]` hard Google spend cap **+** a global daily request cap inside `agent/` |
| Demo longevity | Automated daily re-seed, **measured first**, with a mandatory documented plan B |

## Scope OUT / Must-NOT-Have (guardrails against unrequested additions)

- ❌ **No Next.js proxy** in front of the agent. The widget calls it directly, deliberately.
- ❌ **No new runtime dependency** in `web/package.json` (`dependencies`). Dev/tooling only if a todo says so.
- ❌ **Do not run `agent/tests/evals`** — it spends real money. Not once, not "quickly".
- ❌ **Do not over-provision the Fly VM.** `shared-cpu-1x` / 1 GB. No `performance-*` sizes.
- ❌ **Do not delete or rewrite** `phase-0-scaffold`, `phase-1-ui`, `phase-2-agent`, `phase-3-integration`.
- ❌ **Do not squash `chore(omo)` commits** to make a count match. Use `--invert-grep` (see below).
- ❌ **Do not annotate `sse-contract.md:125`** — the `Alternative` schema's `priceFrom` is `int`, correctly non-nullable.
- ❌ **Do not build a re-seed cron, a re-seed route, or a `CRON_SECRET`.** Decision reversed at the gate (see Todo 12). The destructive, un-transactioned seed never runs unattended against production.
- ❌ **Do not raise the Fly concurrency limits** above `soft_limit = 3` / `hard_limit = 5`, and do not set `min_machines_running` above `0` to work around a symptom — both change the cost profile the user approved.
- ❌ **Do not treat the in-app daily cap as a spend guarantee.** It resets on every cold start. The Google-side hard stop is the only ceiling.
- ❌ **Do not touch** any `web/` or `agent/` file not named by a todo.
- ❌ **Do not hardcode** any date, `businessDate`, or showtime id derived from a seed.
- ❌ **No CineColombia** names/logos/endpoints. **No attribution lines.**
- ❌ **Do not commit** `agent/.env`, `web/.env.local`, or any real key.

## Commit-count criterion (Fase D trap)

Orchestrator `chore(omo):` commits inflate any raw count. Whenever a wave asserts a commit count, use:

```bash
git log --oneline <base>..HEAD --invert-grep --grep='^chore(omo)' | wc -l
```

## Evidence convention

Each todo writes `.omo/evidence/task-<N>-cinepais-phase-4-deploy.txt` (or `.md`/`.png`). `.gitignore:26`
ignores `.omo/evidence/`, so committing evidence needs `git add -f`, and plain `git status --porcelain`
will NOT reveal it — audit with `git status --porcelain --ignored`.

## Wave boundaries are gates, not suggestions

Fase D wrote "stop and continue in a fresh chat" as prose; the executor reclassified it as a
"session-architecture preference" and overrode it at **two of three** boundaries. This plan makes the
boundary checkable from **both sides**:

1. **Closing side.** A wave's final todo is complete only when
   `.omo/evidence/wave-<N>-closed-cinepais-phase-4-deploy.txt` exists and contains that wave's exit
   codes. The executor then ends the session.
2. **Opening side.** The FIRST todo of every following wave must begin by asserting the previous
   wave's file exists — `test -f .omo/evidence/wave-<N-1>-closed-cinepais-phase-4-deploy.txt` — and
   STOP if it does not. A wave that starts without its predecessor's receipt has failed its own first
   criterion.
3. **Ownership.** Starting the next wave is the **orchestrator's / user's** action, not the executor's.
   The executor never advances a wave on its own initiative.

4. **Every wave writes a handoff note, and it is staged into that wave's own commit.** AGENTS.md
   requires a handoff note between sessions, and Fase D produced one per wave. `.omo/` is git-ignored
   only for `evidence/` and `run-continuation/`, so an unstaged handoff note would sit untracked and
   break the **next** wave's `git status --porcelain` → empty criterion. Name it exactly
   `.omo/handoff-fase-e-wave-<N>.md` and `git add` it as part of that wave's commit. Six waves ⇒ six
   notes, each carrying: what shipped, what was measured, what deviated, and the literal next command.

**Honest residual risk:** none of this can *technically force* a process to terminate — an executor
determined to continue can write the receipt and keep going. This is a known limitation, recorded here
rather than papered over. If a wave boundary is crossed anyway, the F1 lane must report it as a
deviation rather than absorbing it silently.

## Test strategy

**Tests-after**, plus **agent-executed QA per todo** (happy path + failure path, exact command, evidence
path). Two new unit tests are explicitly authored (Todos 9, 10). No human-in-the-loop verification is
required except the four `[MANUAL — USER]` steps, which are called out by name.

## LLM budget for the whole phase

**Ceiling: 6 live `POST /chat` calls total.** Fase D spent 2 for the entire phase. Cost modelling note:
2 `/chat` produced **7** httpx calls to Gemini (ReAct loop) — budget by the httpx metric, gate by the
`/chat` metric. Every live query must be announced to the user before it runs, with a justification.
Count them in `.omo/evidence/llm-spend-cinepais-phase-4-deploy.txt`, appending one line per call.

---

## Todos

### Wave 1 — Polish and blocking fixes (100% local, zero deploy, zero LLM spend)

- [x] 1. `git`: cut `phase-4-deploy` from `phase-3-integration` and record the four quality baselines
  - **Do:** `git checkout -b phase-4-deploy` from `phase-3-integration`. **Then stage the three planning artifacts** so downstream clean-tree criteria are reachable: `git add .omo/plans/cinepais-phase-4-deploy.md .omo/drafts/cinepais-phase-4-deploy.md .omo/handoff-fase-e.md` (they are committed as part of Todo 11's wave commit; do not commit them separately here). Then run and capture, verbatim, all four baseline commands from §Verified baselines (agent ruff/basedpyright/pytest, and web `pnpm lint` + `npx tsc --noEmit` only — **do not** run `pnpm test`/`pnpm build` in this todo).
  - **Accept:** `git branch --show-current` → `phase-4-deploy`; `git rev-parse phase-4-deploy phase-3-integration` prints the SAME sha twice; `git status --porcelain | grep -c '^??'` → `0` (nothing untracked remains; positive control: `git status --porcelain | grep -c '^A'` → `3`); all captured commands exit 0.
  - **QA (failure path):** confirm the branch is NOT `main` and `git remote -v` is still empty — nothing may be pushed in this wave.
  - **Evidence:** `task-1-…txt` with each command, its output, and its exit code.

- [x] 2. `web/package.json`: wire `prisma generate` into the build so a clean checkout compiles (BLOCKER B1)
  - **Why:** `web/src/generated/` is ignored by root `.gitignore:20` and `git ls-files web/src/generated` → `0`, yet `web/src/lib/db/client.ts:1` imports `@/generated/prisma/client` and `web/src/lib/api/queries.ts:3` imports `@/generated/prisma/enums`. There is no `postinstall`/`prebuild`. On Vercel the very first build fails.
  - **Do:** add `"prebuild": "prisma generate"` to `web/package.json` scripts. Do not add any dependency. Do not change the `build` script itself.
  - **Accept:** with the generated client deleted (`rm -rf web/src/generated`), `cd web && pnpm build` exits 0 and `web/src/generated/prisma/client.ts` exists afterwards. Run `pnpm build` **only** when no `pnpm test` is running.
  - **QA (failure path):** `rm -rf web/src/generated && npx tsc --noEmit` must FAIL with a missing-module error, proving the generated client is genuinely required; then re-run `pnpm prisma generate` and confirm `npx tsc --noEmit` exits 0 again.
  - **Evidence:** `task-2-…txt` with the deliberate failure, the fix, and both exit codes.

- [x] 3. `agent/src/cinepais_agent/main.py`: key the rate limit off `Fly-Client-IP` (BLOCKER N1)
  - **Why:** `main.py:34` uses `Limiter(key_func=get_remote_address)`. Behind Fly's proxy that does not resolve the visitor IP, so the 10/min per-IP limit collapses into one shared bucket — the only control that actually binds stops binding. Precedent: `matchday-agent` keys on `Fly-Client-IP` (`docs/decisions.md` §8.11).
  - **Do:** add a `_client_ip(request)` key function that prefers the `Fly-Client-IP` header and falls back to `get_remote_address(request)` when the header is absent (so local dev is unchanged). Wire it into `Limiter(key_func=_client_ip)`. English identifiers and comments.
  - **Accept:** `cd agent && uv run pytest tests/ -m "not evals" -q` exits 0; `uv run ruff check .` exits 0; `uv run basedpyright` exits 0.
  - **QA:** add a unit test in `agent/tests/test_abuse_controls.py` asserting BOTH: (happy) a request carrying `Fly-Client-IP: 203.0.113.9` produces key `203.0.113.9`; (failure) a request with no such header falls back to the remote address and does NOT raise.
  - **Evidence:** `task-3-…txt` with both test names and the three exit codes.

- [x] 4. `agent/src/cinepais_agent/{config.py,main.py}` + `.env.example`: comma-separated multi-origin CORS (BLOCKER B4)
  - **Why:** `main.py:73-78` passes `allow_origins=[settings.cors_origin]` — exactly one origin — so Vercel preview domains are rejected. Precedent to mirror: `matchday-agent/src/matchday_agent/app.py:125-127` `_resolve_origins()`.
  - **Do:** parse `CORS_ORIGIN` as a comma-separated list (trim blanks, drop empties) and pass the resulting list to `CORSMiddleware`. Keep the env var **named `CORS_ORIGIN`** (it is already documented in `agent/README.md` and `web/README.md:218-220`); do not rename it. Update `agent/.env.example:3` with a two-origin example and an inline comment. Update the `agent/README.md` env table row.
  - **Accept:** three agent gates exit 0. `grep -n "split" agent/src/cinepais_agent/config.py` returns the parser (positive control: the same grep with a nonsense pattern returns nothing).
  - **QA:** unit tests covering (happy) `"https://a.example,https://b.example"` → a 2-element list; (failure/edge) `""` → `[]`, and `"https://a.example, ,https://a.example"` → no blank entries.
  - **Evidence:** `task-4-…txt`.

- [x] 5. `agent/src/cinepais_agent/{config.py,main.py}`: global daily request cap with a friendly Spanish message
  - **Why:** the session cap is bypassable — `main.py:97` takes `sessionId` from the client, so rotating it defeats it. A process-wide daily budget is the only in-app ceiling that a stranger cannot trivially sidestep.
  - **Three controls ship together here, because any one alone is insufficient.**

    **(a) Global daily request cap.** Add `daily_request_cap: int = 40` to `Settings` (env `DAILY_REQUEST_CAP`). In `main.py`, count accepted `/chat` requests in a UTC-day-keyed counter. When the cap is reached, return `EventSourceResponse(error_stream(...))` with code `daily_cap_exceeded` and this **exact** Spanish string (Colombian register — no voseo):
    > `El copiloto alcanzó su cupo de consultas de hoy. Vuelve mañana — el resto del sitio sigue disponible.`
    Place the check **after** the empty-message and input-length checks and **before** the session-cap check, so malformed input never consumes budget.
    **Why 40 and not a round 200:** budget ≈ USD 2.50; Fase D measured **3.5 Gemini calls per `/chat`**. 40 × 3.5 = 140 generation calls per counter window, which is defensible. 200 was ~10× the entire credit. Put this arithmetic in a comment.

    **(b) `recursion_limit` on the agent.** `agent.py:128-133` calls `_create_agent_fn(...)` with **no recursion limit**, so LangGraph defaults to 25 super-steps. The 3.5-calls-per-request figure is a *happy path* number; when a tool errors the model retries and the multiplier climbs toward that ceiling. Pass `recursion_limit=8` in the agent config.

    **(c) Bound `search_showtimes` output.** `mcp_server.py:74-110` — `search_showtimes()` takes **all-optional** parameters and returns every match with no limit. Called bare that is ~672 showtimes × a 10-field model, tens of thousands of tokens, **re-sent as input on every subsequent LLM call in the turn**. `MAX_INPUT_CHARS` bounds the user message only, never tool output. Cap results at **40** items and add a `truncated: true` hint, mirroring the guard `recommend_best` already has at `:222`.

  - **⚠️ Document this honestly, do not overstate it.** The counter lives in an in-process `cachetools.TTLCache` (same pattern as `main.py:36-38`), and Todo 28 sets `min_machines_running = 0` with auto-stop ≈ 4 min idle ⇒ **the counter resets on every cold start**. It is a courtesy brake, **not** a hard ceiling. The hard ceiling is the Google-side spend cap in Todo 26. Say exactly this in `agent/README.md` and in the root README's Known limitations — never imply the in-app cap is a real cost guarantee.
  - **Do (docs):** document `DAILY_REQUEST_CAP` in `agent/.env.example` and the `agent/README.md` env table, including the reset caveat.
  - **Accept:** three agent gates exit 0 · `grep -c "recursion_limit" agent/src/cinepais_agent/agent.py` → `1` (positive control: `grep -c "_create_agent_fn" agent/src/cinepais_agent/agent.py` → ≥ 1) · `grep -rn "cold start" agent/README.md` returns the caveat line.
  - **QA:** unit tests for — (happy) a request under the cap streams normally; (failure) request `cap+1` yields the `daily_cap_exceeded` code and does not increment further; (edge) rolling the day key resets the counter; (c) `search_showtimes` with no arguments returns exactly 40 items plus `truncated: true`, and a narrow query returns fewer with `truncated` absent or false. Assert on the error **code** and on item counts, never on LLM output.
  - **Evidence:** `task-5-…txt` with test names and the budget arithmetic.

- [x] 6. `web/src/app/checkout/page.tsx`: handle fetch failure instead of showing an infinite skeleton
  - **Why:** `:79-85` has a `.then().then()` chain with **no `.catch()`**, so a network failure leaves the skeleton at `:142-152` forever.
  - **Do:** add an error state and a `.catch()`; also treat a non-`ok` response as an error. Render a Spanish error message with a retry affordance. Match the existing component conventions; add no new dependency.
  - **Accept:** `pnpm lint` and `npx tsc --noEmit` exit 0.
  - **QA:** with the dev server running, drive the page with the network request forced to fail (e.g. an offline/route-abort condition) and capture a screenshot showing the Spanish error state, **not** a skeleton. Happy path: a normal load still renders the order summary. Note: browser console will log `Failed to load resource` for the induced failure — that is expected; assert on uncaught exceptions / error boundaries instead.
  - **Evidence:** `task-6-…png` (error state) + `task-6-…txt`.

- [x] 7. `web/src/components/films/film-card.tsx` + `web/src/components/home/hero-carousel.tsx`: `preload` → `priority`
  - **Why:** `film-card.tsx:41` passes `preload={preload}` and `hero-carousel.tsx:113` passes `preload={index === 0}` to `next/image`, which has no `preload` prop. Positive control that `priority` is the right name: `web/src/app/films/[id]/page.tsx:89` already uses `priority`.
  - **Do:** rename the prop to `priority` at the component definitions **and at every call site**. Find them first: `grep -rn "preload" web/src --include=*.tsx --include=*.ts`. Fix every hit. Do not change any other Image attribute.
  - **Accept:** `grep -rn "preload" web/src --include=*.tsx --include=*.ts` returns **nothing** (positive control: the same grep for `priority` returns ≥3 hits). `pnpm lint` and `npx tsc --noEmit` exit 0.
  - **QA:** load `/` and `/films` in the dev browser and record that no React "unknown prop" warning appears in the console; capture the console output.
  - **Evidence:** `task-7-…txt` with both greps and the console capture.

- [x] 8. `agent/docs/sse-contract.md`: annotate `priceFrom` as nullable — **line 90 ONLY**
  - **Why:** `:90` is the `recommendation` schema and `agent/src/cinepais_agent/events.py:47` types it `priceFrom: int | None`, while sibling nullable fields at `:81-82` are marked `"string | null"`. **`:125` is the `Alternative` schema and `events.py:30` types it `priceFrom: int` — correctly non-nullable. Do NOT touch line 125.**
  - **Do:** change only the `recommendation` schema entry so the field's nullability is explicit, in the same notation the neighbouring nullable fields already use.
  - **Accept:** `git diff --stat agent/docs/sse-contract.md` shows exactly **1 file, 1 insertion, 1 deletion**. `git diff agent/docs/sse-contract.md | grep -c '^[+-]'` → `4` — the `---` and `+++` **file-header lines** plus the one removed and one added line. The `Alternative` block still reads `"priceFrom": 32000,` unchanged. **Verify with a line-precise check, not a file-wide count** — the string occurs on lines 90, 107 (the wire example) and 125, so the count is `3` before the edit and `2` after, never `1`: `sed -n '125p' agent/docs/sse-contract.md` must print `  "priceFrom": 32000,`, and `grep -c '"priceFrom": 32000,' agent/docs/sse-contract.md` → `2`.
  - **QA:** re-read `events.py:30` and `:47` and record both type annotations in the evidence, proving the asymmetry is real and the edit matches it.
  - **Evidence:** `task-8-…txt` with the diff and both quoted Python lines.

- [x] 9. `web/tests/selection.test.ts`: cover the reducer's showtime-switch branch and the `clear` action
  - **Why:** `web/src/lib/business/selection.ts:97-100` clears and re-applies when `showtimeId` changes; no test covers it, nor the `clear` action at `:92`.
  - **Do:** add tests to the existing file, following its existing `describe`/`test` conventions.
  - **Accept:** the new tests pass. Run **only** this file to keep it fast: `cd web && npx vitest run tests/selection.test.ts` exits 0.
  - **QA:** (happy) toggling a seat with a different `showtimeId` yields a state whose `showtimeId` is the new one and whose selection contains only the new seat; (failure/edge) `clear` empties the selection and preserves `showtimeId`. Prove the test is meaningful by temporarily inverting the assertion, observing a FAIL, and restoring it — record both runs.
  - **Evidence:** `task-9-…txt` with the deliberate-fail run and the passing run.

- [x] 10. `web/tests/pricing.test.ts`: cover the Onyx format
  - **Why:** `web/src/lib/business/pricing.ts:17` defines `Onyx: 28000` and it appears in `FORMAT_PRECEDENCE` (`:36`), but the suite only covers IMAX, 2D and Premium.
  - **Do:** add Onyx cases mirroring the existing tests' structure, including at least one zone multiplier and the Wednesday-discount interaction. Derive expected values from `pricing.ts` itself — read it, do not guess.
  - **Accept:** `cd web && npx vitest run tests/pricing.test.ts` exits 0.
  - **QA:** (happy) Onyx general, non-Wednesday; (edge) Onyx on the discount day, asserting the documented rounding. Same invert-then-restore proof as Todo 9.
  - **Evidence:** `task-10-…txt`.

- [x] 11. **Wave 1 close — HARD GATE. Do not start Todo 12 in this session.**
  - **Do:** run the FULL gate in this order, never overlapping: (a) `cd agent && uv run ruff check . && uv run basedpyright && uv run pytest tests/ -m "not evals" -q`; (b) `cd web && pnpm lint`; (c) `npx tsc --noEmit`; (d) `pnpm test` **detached with the exit-code-file poll** from §Two rules; (e) **after** (d) finishes, `pnpm build`. Then commit.
  - **Commit:** `fix(web,agent): deploy blockers — prisma generate, Fly client IP, multi-origin CORS, daily cap, polish backlog`
  - **Accept (all must hold):** every command above exits 0 · `git log --oneline phase-3-integration..HEAD --invert-grep --grep='^chore(omo)' | wc -l` → `1` · `git status --porcelain` is empty · `git remote -v` is still EMPTY · `git rev-parse --verify main` still fails with 128 · `git diff --name-only phase-3-integration -- web/package.json` shows the file changed and `git diff phase-3-integration -- web/package.json | grep -c '"prebuild"'` → `1`.
  - **STOP CONDITION (checkable, not advisory):** this todo is complete only when a file
    `.omo/evidence/wave-1-closed-cinepais-phase-4-deploy.txt` exists containing all of the above exit
    codes. **The executor must then end the session.** Todo 12 begins in a fresh chat. An executor that
    continues past this line has failed the todo, regardless of downstream results.
  - **Evidence:** `wave-1-closed-…txt` + `task-11-…txt`.

---

### Wave 2 — Anti-rot: keep the public demo alive past 7 days (BLOCKER B2)

- [x] 12. **MEASURE FIRST:** time a full re-seed against Neon and record the number
  - **Why:** `web/prisma/seed.ts` generates `for (let day = 0; day < 7; day++)` — 7 days — and `web/src/lib/business/cutoff.ts` drops anything within 15 minutes, so from ~day X+7 `GET /api/showtimes` returns `[]`. The chosen fix depends on how long a re-seed actually takes; guessing here picks the wrong mechanism.
  - **Do (step 0 — this wave opens in a FRESH session, so nothing is running):** first confirm Wave 1 actually closed — `test -f .omo/evidence/wave-1-closed-cinepais-phase-4-deploy.txt` must succeed, otherwise STOP. Then start the web dev server in the background and wait until it is genuinely serving, before any `curl`:
    ```bash
    mkdir -p /tmp/omo-p4
    nohup zsh -c 'cd web && pnpm dev > /tmp/omo-p4/dev.log 2>&1' &
    # poll up to 60s for readiness — do NOT proceed until this returns 200
    until [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/cities)" = "200" ]; do sleep 2; done
    ```
  - **Do (step 1):** run the §Seed rule command under `time`, capturing wall-clock seconds and the final "Seed complete: … seats across … showtimes" line. Run it **once**. Do not run it concurrently with anything else.
  - **🔴 This todo re-runs the exact operation that hung in Wave 1** (a full 119,280-seat re-seed against Neon, which stalled around seat ~110,000). **§Two rules item 3 is binding here:** if it exceeds 15 minutes, stop and walk the diagnostic ladder — **do not relaunch**. Wave 1 lost 10+ hours to blind retries that were themselves the cause. Baseline for comparison: a healthy standalone seed measured **~73 s**. If your run is wildly slower, that is contention, not a code defect.
  - **Note for the README (Todo 13):** report the **clean** measured duration, not a contended one. A number inflated by a stalled run would make the "Demo data" section dishonest.
  - **Accept:** the evidence file records a numeric duration in seconds and the seat/showtime counts. No mechanism is chosen before this number exists.
  - **QA:** immediately after, `curl -s "http://localhost:3000/api/showtimes?filmId=film-01" | head -c 200` returns a non-empty JSON array (proving the seed took effect).
    **Distinguish the two failure modes — they look similar and the wrong diagnosis wastes the one re-seed this todo exists to measure:**
    - `curl` exits non-zero / "Connection refused" ⇒ **the dev server is not running.** Go back to step 0. This is NOT a stale seed. Do **not** re-seed.
    - `curl` exits 0 and the body is `[]` ⇒ **stale seed.** Re-seed with a recomputed `SEED_NOW` (never a literal date), and note that the re-run invalidates the timing measurement — record the FIRST clean run's duration.
  - **Evidence:** `task-12-…txt` with the timing and the curl output.
  - **No branch — the mechanism is already decided (see below).** This measurement is not a gate; it produces the honest number that goes into the README's "Demo data" section and into the demo-day pre-flight. Record it and move on.

  > **DECISION (user, at the approval gate — supersedes the earlier "automated daily re-seed" answer):**
  > **Take the documented manual refresh. There is no cron and no re-seed route.**
  > Rationale, measured from the code: `web/prisma/seed.ts:349-356` **deletes** the entire catalogue
  > (seat → showtimeFormat → showtime → siteFormat → site → film) and reinserts across ~24 unbatched
  > `createMany` calls (`:360, :376, :394, :446, :455, :473, :479`) with **no enclosing transaction**.
  > A serverless invocation killed mid-run leaves production **destroyed, not stale** — no rollback, no
  > retry, no alert — and during a normal run the live site serves an empty catalogue with 404s on any
  > open `/showtimes/<id>` (ids are regenerated with new day offsets at `:423`). For a portfolio piece
  > read by a hiring manager, a one-command refresh with an honest "datos actualizados el <fecha>" line
  > is strictly better than a cron that can silently empty the database.
  >
  > **Field evidence, acquired after this decision was made (Wave 1):** a full re-seed **stalled around
  > seat ~110,000 of 119,280** and stayed stuck for hours. That is precisely the delete-then-reinsert
  > window described above. Had this been running unattended on a cron against production, the live
  > demo would have been left **wiped**, at an arbitrary hour, with no rollback and nobody watching.
  > The decision was correct, and is now backed by an observed failure rather than only by reasoning.

- [x] 13. `web/scripts/reseed.sh` + README "Demo data": the documented one-command refresh
  - **Precondition:** the dev server from Todo 12 step 0 must still be serving — re-check `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/cities` → `200` before any QA curl below. A connection refusal means restart it, **not** re-seed.
  - **Do:** write a single-command script that performs the §Seed rule recompute (`SEED_NOW` = tomorrow, never a literal) plus the seed, and prints the resulting `businessDate` range on success. It must **fail loudly** when `DATABASE_URL_UNPOOLED` is unset rather than silently seeding nothing. Then add a **"Demo data"** section to the public README (created in Todo 17) stating plainly: the seed covers **7 days** from the refresh date, the demo therefore needs a refresh roughly weekly, the refresh is this one command, and the last refresh date. Use the number Todo 12 measured so the note is honest about how long it takes.
  - **Explicitly NOT built (decision recorded at Todo 12):** no `vercel.json` `crons` entry, no `/api/admin/reseed` route, no `CRON_SECRET`, no `maxDuration` tuning, no shared-seeding-module extraction. The destructive un-transactioned re-seed never runs unattended against production.
  - **Accept:** `bash web/scripts/reseed.sh` exits 0 and prints a range whose first date is tomorrow's recomputed value · `bash -n web/scripts/reseed.sh` exits 0 (plus `shellcheck` if available) · `grep -rn "crons" web/ --include='*.json' --exclude-dir=node_modules` returns nothing (positive control: `grep -rn "scripts" web/package.json` returns hits) · `grep -c "Demo data" README.md` → `1` **(this criterion runs in Todo 17, which creates the README; record it there and cross-reference)**.
  - **QA:** (happy) run it, then `curl -s "http://localhost:3000/api/showtimes?filmId=film-01" | head -c 200` returns a non-empty array; (failure) run it with `DATABASE_URL_UNPOOLED` unset and confirm a clear non-zero-exit error, and that the catalogue is still intact afterwards (`curl` still non-empty) — a failed refresh must not leave the database wiped.
  - **Evidence:** `task-13-…txt`, opening with Todo 12's measured seconds.

- [x] 14. `agent/src/cinepais_agent/agent.py`: propagate `WEB_API_BASE_URL` into the MCP subprocess (**BLOCKER — latent production bug**)
  - **Why (traced end to end, verified first-hand):** `agent.py:89-97` builds the stdio connection with `transport`, `command`, `args` — and **no `env` key**. In the installed MCP client, `mcp/client/stdio/__init__.py:127` reads `env=({**get_default_environment(), **server.env} if server.env is not None else get_default_environment())`, and `:28` defines `DEFAULT_INHERITED_ENV_VARS = (HOME, LOGNAME, PATH, SHELL, TERM, USER)`. So the child inherits **only those six variables**. `mcp_server.py` imports `settings` and constructs `CinepaisApiClient(base_url=settings.web_api_base_url)` on every tool call (`:91, :123, :160, :213`), and `config.py:8` defaults that to `http://localhost:3000`.
    ⇒ **On Fly, every tool call would hit `localhost:3000` inside the container, where nothing is listening.** The copilot would be broken on day one.
  - **Why it has never been seen:** `agent/.env` has never set `WEB_API_BASE_URL` to a non-default value, so locally the default is correct *by coincidence*. And nothing in a deploy would catch it: `build_agent()` only performs the MCP handshake (`agent.py:113`), making **zero** HTTP calls to the web API, so `/health` returns 200 and the startup logs look perfect. It would surface only during a live `/chat` — the one step that spends money.
  - **Do:** add an explicit `"env"` mapping to the connection dict carrying `WEB_API_BASE_URL` from `settings.web_api_base_url` (and any other setting `mcp_server.py` reads from `settings`). Verify by reading `mcp_server.py` which settings it actually touches — do not guess; pass exactly those.
  - **Accept:** three agent gates exit 0 · `grep -c '"env"' agent/src/cinepais_agent/agent.py` → `1` (positive control: `grep -c '"transport"' agent/src/cinepais_agent/agent.py` → `1`).
  - **QA:** (happy) a unit test asserting the connection dict returned by `_get_mcp_client()` contains an `env` mapping whose `WEB_API_BASE_URL` equals `settings.web_api_base_url`; (failure) a test that sets `WEB_API_BASE_URL` to a sentinel value and asserts the sentinel — **not** `http://localhost:3000` — appears in the connection dict. The second test is the one that would have caught this bug; without it the fix is unprotected against regression.
  - **Deferred live proof:** Todo 31 proves this end to end on Fly at **zero LLM cost**, before any `/chat` is spent.
  - **Evidence:** `task-14-…txt` quoting the two library lines above and both test names.

- [x] 15. **Wave 2 close — HARD GATE. Do not start Todo 16 in this session.**
  - **Do:** full gate as in Todo 11 (agent trio, then web lint/tsc, then detached `pnpm test`, then `pnpm build`). Commit.
  - **Commit:** `fix(agent): propagate web API base URL to the MCP subprocess; docs(web): documented demo-data refresh`
  - **Accept:** all exit 0 · `git log --oneline phase-3-integration..HEAD --invert-grep --grep='^chore(omo)' | wc -l` → `2` · `git status --porcelain` empty (the wave handoff note must be staged into this commit — see §Wave boundaries) · `git remote -v` still EMPTY · the evidence records Todo 12's measured seconds · `grep -rn "crons" web/ --include='*.json' --exclude-dir=node_modules` returns nothing.
  - **STOP CONDITION:** complete only when `.omo/evidence/wave-2-closed-cinepais-phase-4-deploy.txt` exists with those results. **End the session.** Todo 16 begins in a fresh chat.

---

### Wave 3 — `main` and publication

- [x] 16. Root `.gitignore` + `git rm --cached`: curate `.omo/` for a public repo
  - **Why:** `git ls-files .omo | wc -l` → **125** tracked files (3.7 MB), including **54** under `evidence/` (force-added past `.gitignore:26`) and **35** under `run-continuation/`. The user's decision: plans, drafts and handoffs ship; evidence and run-continuation do not.
  - **Do:** add `.omo/run-continuation/` if not already covered, then `git rm -r --cached .omo/evidence .omo/run-continuation` so they stop being tracked while remaining on disk. **Do not delete the files from the filesystem** — later todos still write evidence there.
  - **Accept:** `git ls-files .omo/evidence | wc -l` → `0` and `git ls-files .omo/run-continuation | wc -l` → `0` (positive control: `git ls-files .omo/plans | wc -l` → **`6`** — five pre-existing plans plus this phase's, which Todo 1 staged and Todo 11 committed; use `-ge 5` if you prefer a range). `ls .omo/evidence | wc -l` is still non-zero, proving nothing was deleted on disk.
  - **QA:** (failure) `git status --porcelain --ignored | head` confirms the untracked-but-ignored state rather than pending deletions of real files.
  - **Evidence:** `task-16-…txt`.

- [x] 17. Repo root: public `README.md` and `LICENSE`
  - **Why:** the repo root has `AGENTS.md`/`CLAUDE.md` but no public-facing README. Precedent to follow (the user's own): `matchday-agent/README.md` — a copy-paste live-demo block, "What's inside", a measured deploy section, and an honest **"Known limitations"** section.
  - **Do:** write `README.md` in **English** (code-facing doc) describing CinePaís, the stack, the two halves, how to run locally, and the read-API contract, with placeholders `<WEB_URL>` and `<AGENT_URL>` to be filled in Wave 5. Include a **Known limitations** section that states plainly: mock data only, the seed horizon and how it is refreshed, the Fly cold start, and the daily copilot cap. Add an MIT `LICENSE` (matching the precedent repo). **State explicitly that CinePaís is a fictional brand and that no real cinema API is used.** No attribution lines.
  - **Accept:** `README.md` and `LICENSE` exist at the repo root; `grep -ci "cinecolombia" README.md` → `0` (positive control: `grep -ci "cinepais" README.md` → ≥ 5); `grep -ciE "generated with|co-authored-by" README.md LICENSE` → `0`.
  - **QA:** every command in the README's local-run section is executed verbatim from a clean shell and recorded — a README instruction that does not run is a FAIL. (Skip only the deploy-URL sections still holding placeholders.)
  - **Commit (covers Todos 16 AND 17 — REQUIRED, or Todo 18's tree comparison cannot succeed):** `docs: public README, LICENSE, and curated .omo/ for publication`. Stage the modified root `.gitignore`, the `git rm --cached` removals from Todo 16, plus the new `README.md` and `LICENSE`.
  - **Accept (commit):** `git status --porcelain` is empty afterwards · `git log --oneline -1` prints that subject · `git show --stat HEAD | grep -c 'README.md'` → `1`.
  - **Evidence:** `task-17-…txt`.

- [x] 18. `git`: build a clean, squashed `main` — one commit per phase
  - **Do:** create `main` as an orphan/new branch and land the work as **5** commits, each squashing one phase's tree, in order. Subjects, verbatim:
    1. `feat: scaffold, deterministic mock data and read API`
    2. `feat(web): manual purchase flow — catalogue, showtimes, seat map, checkout`
    3. `feat(agent): LangGraph + MCP cinema copilot with SSE`
    4. `feat(web): copilot integration — SSE widget, recommendation card, HITL pre-selection`
    5. `feat: production readiness — deploy config, spend controls, polish`
    The final tree of `main` must be **byte-identical** to `phase-4-deploy`'s tree.
  - **🔴 CURATE EVERY COMMIT, NOT JUST THE LAST — this is the difference between honouring the user's decision and irreversibly violating it.** A git tree is a **full snapshot**, so squashing a phase's tree verbatim republishes whatever that phase tracked. Measured on the real branches:

    | tree | `.omo/evidence` | `.omo/run-continuation` |
    |---|---|---|
    | `phase-0-scaffold` | 0 | 23 |
    | `phase-1-ui` | 0 | 35 |
    | `phase-2-agent` | 11 | 35 |
    | `phase-3-integration` | 54 | 35 |

    Todo 16's `git rm --cached` only shapes the **final** tree. Left uncorrected, commits 1–4 publish all of it, permanently browsable at `github.com/reiorozco/cinepais/tree/<sha>/.omo/evidence` — directly contradicting the locked Q1 decision, and **unfixable after Todo 21 pushes**.
  - **Exact procedure (do not improvise; `git checkout <ref> -- .` does NOT delete files absent from `<ref>`):**
    ```bash
    git checkout --orphan main
    git rm -rf --cached . >/dev/null          # empty the index
    for ref in phase-0-scaffold phase-1-ui phase-2-agent phase-4-deploy; do
      git read-tree -u --reset "$ref"          # materialise that phase's tree exactly
      git rm -r --cached --ignore-unmatch .omo/evidence .omo/run-continuation   # CURATE
      git commit -m "<the subject for this phase>"
    done
    ```
    (`phase-4-deploy` supplies both the Fase D integration state and this phase's work; use the four subjects below in order, with the 5th commit being this phase's own — split the last `read-tree` into the two commits your subjects require.)
  - **Precondition (load-bearing):** `phase-4-deploy` must already carry Todo 17's commit. Verify first: `git log --oneline phase-4-deploy -1` prints `docs: public README, LICENSE, and curated .omo/ for publication`, and `git ls-tree phase-4-deploy --name-only | grep -c '^README.md$'` → `1`. If either fails, Todo 17's commit was skipped — go back and make it. `git rev-parse <ref>^{tree}` resolves the **last commit's** tree, not the working tree, so an uncommitted Todo 16/17 makes the comparison below impossible to satisfy.
  - **Accept:** `git rev-parse main^{tree}` equals `git rev-parse phase-4-deploy^{tree}` (identical trees — this is the load-bearing check) · `git log --oneline main | wc -l` → `5` · all four phase branches still resolve: `for b in phase-0-scaffold phase-1-ui phase-2-agent phase-3-integration; do git rev-parse --verify $b; done` succeeds for each · `git ls-files .omo/evidence | wc -l` on `main` → `0`.
  - **QA (failure path):** `git log --oneline main -- '.omo/evidence/*' '.omo/run-continuation/*' | wc -l` → **`0`**, proving neither directory entered the published history. Positive control: `git log --oneline main -- '.omo/plans/*' | wc -l` → non-zero.
    **Do NOT use `--all` here.** `--all` walks *every* ref, including the four phase branches §Scope OUT forbids deleting — it currently returns `9` and no action Todo 18 can take would ever make it `0`. Scope the log to `main`.
  - **QA (per-commit proof, stronger):** `for c in $(git rev-list main); do echo "$c $(git ls-tree -r --name-only $c | grep -c '^\.omo/evidence/')"; done` → every line ends in `0`.
  - **Evidence:** `task-18-…txt`.

- [x] 19. `[MANUAL — USER]` + `gh`: create the GitHub repo and push `main`
  - **Verified inputs:** GitHub login `reiorozco`; token scopes include `repo`; **no `cinepais` repo exists** (checked, with a positive `matchday` control); default branch `main`; the user's precedent remote style is **SSH** (`git@github.com:reiorozco/matchday-agent.git`).
  - **`[MANUAL — USER]`:** the user confirms the repo name and that it should be **public**, then the executor creates it. Do not create it unilaterally without that confirmation in the session.
  - **Do:** create `reiorozco/cinepais` as **public** with a one-line description in the precedent style (stack + "Live at …" once URLs exist; a placeholder is acceptable now and updated in Wave 6). Add the SSH remote, push `main`, set it as the default branch. **Do not push the four phase branches.**
  - **Accept:** `git remote -v` shows exactly one `origin` over SSH · `git ls-remote --heads origin | wc -l` → `1` and that head is `refs/heads/main` · `gh repo view reiorozco/cinepais --json visibility --jq .visibility` → `PUBLIC` · `git status -sb` shows no divergence.
  - **QA (security, mandatory before pushing — scan HISTORY, not just the tip):**
    1. `git ls-files | grep -iE '\.env$|\.env\.local$' | wc -l` → `0` (positive control: `git ls-files | grep -c '\.env\.example'` → ≥ 1).
    2. **Full-history scan**, because `git grep <pattern> main` searches only that revision's tree and this plan builds five commits from four different trees:
       ```bash
       git log -p main | grep -nEi 'AIza[0-9A-Za-z_-]{20,}|lsv2_(pt|sk)_[0-9a-f]{32}|FlyV1 fm2_[A-Za-z0-9+/=_-]{10,}|gh[pousr]_[A-Za-z0-9]{20,}|postgres(ql)?://[^ ]*:[^ ]*@|ep-[a-z0-9-]+\.[a-z0-9-]+\.aws\.neon\.tech' | wc -l
       ```
       → `0`. The pattern set covers this project's **actual** secret shapes: Google API key, LangSmith key, Fly deploy token, GitHub PAT, Postgres URL with credentials, and a bare Neon host. The original two-pattern check missed four of the six.

       **⚠️ Every pattern MUST require a token body.** The Fly alternative originally read `FlyV1 fm2_`
       as a bare literal — the only one of the six without a length quantifier — so it matched **this
       very code block**, and `.omo/plans/` is in the SHIP set. That produced a permanent, structural
       false positive (found in the field at Wave 3). **A scanner with a known-harmless standing match
       is a broken scanner:** when a real Fly token later appears the count goes 1 → 2 and nobody
       notices, because `0` stopped being the expected value. Quantifier added. If you ever extend this
       pattern set, give every new entry a body requirement for the same reason.
       Positive control that the scan works: the same command with `AIza` replaced by a string known to be present (e.g. `CinePaís`) returns a non-zero count.
    - **If either check is non-zero, STOP and do not push.** Report the matching commit and path; do not attempt to "clean it up" and push anyway.
  - **Note on the one known historical match:** `.omo/evidence/f4-wave-cinepais-phase-3-integration.md` contains an `AIza…`-shaped string that is a **synthetic self-test** of the scanner (the line is an `echo … | grep -E …` control), not a real credential. Todo 18's curation removes that file from every published commit, so the scan should come back clean. If it does not, curation failed — go back to Todo 18 rather than waving it through.
  - **Evidence:** `task-19-…txt` with both security checks run **before** the push.

- [x] 20. **Wave 3 close — HARD GATE. Do not start Todo 21 in this session.**
  - **Accept:** `main` exists and is pushed · the security greps are recorded as passing · the four phase branches still exist locally and are **not** on the remote · `git status --porcelain` empty.
  - **STOP CONDITION:** complete only when `.omo/evidence/wave-3-closed-cinepais-phase-4-deploy.txt` exists with those results. **End the session.**

---

### Wave 4 — Deploy the web to Vercel

- [x] 21. Reserve BOTH hostnames and set BOTH env vars **before** either deploy
  - **Why (the phase's #1 trap):** `NEXT_PUBLIC_AGENT_URL` is a `NEXT_PUBLIC_*` var, so it is **inlined at build time** — changing it later on Vercel requires a full rebuild, not an env edit. Both hostnames are choosable in advance, so wiring them up front removes the trap entirely.
  - **Do:** fix the agent app name as `cinepais-agent` ⇒ `https://cinepais-agent.fly.dev`. **If the Fly app name is taken**, pick `cinepais-copilot`, record the substitution, and use it consistently everywhere thereafter. Set `NEXT_PUBLIC_AGENT_URL=https://cinepais-agent.fly.dev` on Vercel for the **production** environment.
  - **⚠️ The Vercel domain is a PREDICTION at this point, not a confirmed fact.** Measured on this project: `domains: []`, `latestDeployment: null`, `live: false` — no domain exists until Todo 24 deploys. Record `https://cinepais.vercel.app` as the **predicted** production URL, explicitly labelled as unconfirmed, and note that Todo 24 re-verifies it before Todo 29 bakes it into a Fly secret. Do **not** describe it as confirmed anywhere in the evidence.
  - **Accept:** `cd web && vercel env ls` shows `NEXT_PUBLIC_AGENT_URL` in the production environment — **run it from `web/`, not the repo root**: the Vercel link lives at `web/.vercel/project.json` and there is no root `.vercel/`, so the root invocation is unlinked. The evidence records both hostnames in one place, with the Vercel one marked `PREDICTED — re-verify at Todo 24`.
  - **QA:** (failure) confirm the value contains no trailing slash and uses `https://` — a trailing slash produces a double-slash request path.
  - **Evidence:** `task-21-…txt` with the hostname table.

- [x] 22. Vercel: disable SSO deployment protection (BLOCKER B3)
  - **Why:** measured on this project — `ssoProtection.enabled = true`, `deploymentType: all_except_custom_domains`. Every `*.vercel.app` URL would show a Vercel login wall, making the portfolio link useless.
  - **Do:** disable Vercel Authentication for the project. Leave password protection and trusted IPs off.
  - **Accept:** re-reading the project's deployment-protection settings shows `ssoProtection.enabled = false`.
  - **QA (the real proof):** after Todo 24 deploys, `curl -s -o /dev/null -w '%{http_code}' <WEB_URL>` from a shell with **no Vercel session** returns `200`, not `401`. Record the status code.
  - **Evidence:** `task-22-…txt`.

- [x] 23. Neon: apply migrations and seed the production database
  - **Do:** confirm which Neon database the Vercel project's `DATABASE_URL` points at, and whether it is the same one dev uses (`web/.env.local`). Record the answer explicitly — the user must know if dev and prod share data. Then run `pnpm prisma migrate deploy` against it, followed by the §Seed rule seed with a **recomputed** `SEED_NOW`. Also record the Neon **region**, which Wave 5 uses to justify the Fly region.
  - **Accept:** `migrate deploy` exits 0 · the seed prints `Seed complete: 119280 seats across 672 showtimes` · the evidence names the Neon region and states plainly whether prod and dev share a database.
  - **QA (runnable now, without any deployment):** (happy) confirm rows exist in the production database. **Write this as a small script file, not `tsx -e`** — the `@/` path alias does not resolve under `-e`, and `schema.prisma`'s `datasource db` block has **no `url`**, so a bare `new PrismaClient()` will not connect. Mirror `web/src/lib/db/client.ts`, which constructs `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })`, using **relative** imports. The script prints the `showtime` and `seat` counts and exits non-zero if either is 0. (failure) a count of `0` means the seed did not land — re-seed with a recomputed `SEED_NOW`, never a literal date. Delete the temporary script afterwards and note that in the evidence.
  - **Note:** the HTTP-level freshness check (`<WEB_URL>/api/showtimes?filmId=film-01` non-empty) is **owned by Todo 24's Accept list**, because no deployment exists yet at this point. It is not deferred prose here — it is a named criterion there.
  - **Evidence:** `task-23-…txt`.

- [x] 24. Deploy the web to production and verify the site works end to end (without the copilot)
  - **Do:** trigger a production deployment from `main`. Confirm the build ran `prisma generate` via the `prebuild` script.
  - **Accept:** the deployment status is READY · the build log contains a `prisma generate` invocation (positive control: it also contains `next build`) · `curl -s -o /dev/null -w '%{http_code}' <WEB_URL>` → `200`.
  - **Accept — resolve Todo 21's PREDICTED domain into a fact (do this before Wave 5 uses it):** re-read the project's `domains` field now that a deployment exists, and record the **actual** production URL. If it differs from Todo 21's prediction, update `NEXT_PUBLIC_AGENT_URL` on Vercel **and redeploy** (it is build-time inlined), and carry the corrected value forward as Wave 5's `CORS_ORIGIN`. Record `PREDICTED=<x>` and `ACTUAL=<y>` side by side, even when they match.
  - **Accept — seed freshness against production (moved here from Todo 23, which could not run it yet):** `curl -s "<WEB_URL>/api/showtimes?filmId=film-01" | head -c 200` returns a **non-empty** JSON array. `[]` is a FAIL — re-seed with a recomputed `SEED_NOW` and re-check.
  - **QA (drive the real Fase B flow on the deployed site, browser-based):** home → a film → pick date/format → open a showtime → select 2 adjacent seats → checkout → confirm. Capture a screenshot at the seat map and at the confirmation. Also confirm posters render (the `placehold.co` `remotePatterns` entry in `web/next.config.ts` covers them). Failure path: open a nonexistent showtime id and confirm a 404, not a crash. **The copilot is expected to be non-functional at this point** — the agent is not deployed yet; record that as expected, not as a defect. If Path A was taken, also record whether the Todo 14 cron is registered.
  - **Evidence:** `task-24-…png` ×2 + `task-24-…txt`.

- [x] 25. **Wave 4 close — HARD GATE. Do not start Todo 26 in this session.**
  - **Commit:** `chore(web): production deployment configuration` (only if files changed; if nothing changed, record that and skip the commit rather than creating an empty one)
  - **Accept:** `<WEB_URL>` returns 200 without a Vercel session · the purchase flow screenshots exist · the Neon region and the shared-vs-separate DB answer are recorded.
  - **STOP CONDITION:** complete only when `.omo/evidence/wave-4-closed-cinepais-phase-4-deploy.txt` exists. **End the session.**

---

### Wave 5 — Deploy the agent to Fly.io and prove the things that only exist live

- [ ] 26. `[MANUAL — USER]` ×2: confirm Fly billing, then set the hard Google spend cap
  - **Why:** the org `personal` was created **2026-07-26**, *after* Fly removed free allowances — it is pay-as-you-go, not grandfathered. Bills stay ≈ $0 only because `min_machines_running = 0` keeps usage under the minimum billing threshold. And the only true ceiling on Gemini spend is a cap that **stops calls**, not one that emails an alert.
  - **`[MANUAL — USER]` A:** the user opens the Fly dashboard billing page and reports the plan, any free allowance, trial status, and payment method. **No `fly deploy` runs until this is reported.** (`fly billing` does not exist in `flyctl` v0.4.83 — this cannot be automated.)
  - **`[MANUAL — USER]` B:** the user configures a spend cap on the Google side for the Gemini API and reports **both** the amount **and whether it hard-stops requests or only sends an alert.**
  - **🔴 STOP CONDITION (user decision at the approval gate — this reverses the plan's earlier fallback):**
    **If the account can only ALERT and cannot hard-stop, this wave STOPS here and the user is consulted before the agent is exposed publicly.** Do **not** fall back to "treat the Todo 5 daily cap as the primary control" — that reasoning is wrong and the plan previously had it backwards. The Todo 5 counter lives in an in-process cache, and Todo 30 configures `min_machines_running = 0` with auto-stop at ≈ 4 min idle, so **the counter resets on every cold start**: send the cap, wait five minutes, it is zero again. It is a courtesy brake, never a ceiling. The Google-side hard stop is the only real ceiling on a publicly reachable endpoint.
  - **Accept:** the evidence records both user reports verbatim, including the cap amount and an explicit `HARD-STOP` or `ALERT-ONLY` verdict. **If either report is missing, or the verdict is `ALERT-ONLY`, STOP the wave and report to the user. Nothing further in Wave 5 runs.**
  - **Evidence:** `task-26-…txt`.

- [ ] 27. `agent/Dockerfile` + `agent/.dockerignore`: single-stage Python image
  - **Precedent (adapt, do not copy):** `matchday-agent/Dockerfile` — four hard-won fixes to carry over: (1) `useradd` + `chown` the WORKDIR **before** `uv sync`, or `.venv/` ends up root-owned and the container crash-loops; (2) `ENV PATH="/app/.venv/bin:${PATH}"`; (3) two-step `uv sync` — `--no-dev --frozen --no-install-project` after copying only `pyproject.toml`+`uv.lock`, then a full `uv sync --no-dev --frozen` after copying source (a missing step 2 caused `ModuleNotFoundError` on their first deploy); (4) `CMD` with the **absolute venv path**, never `uv run uvicorn`, which re-syncs on every start.
  - **Key divergence — do NOT include a Node stage.** `matchday-agent` needs Node because its MCP server is an external npm package. CinePaís's MCP is an **in-repo Python module**: `agent/src/cinepais_agent/agent.py:83-97` spawns `sys.executable -m cinepais_agent.mcp_server`. A single `python:3.12-slim` stage suffices, and starting via `/app/.venv/bin/uvicorn` makes `sys.executable` resolve inside the venv — exactly what that spawn requires.
  - **Do:** write the Dockerfile serving on port **8080** (`--host 0.0.0.0 --port 8080`) plus a `HEALTHCHECK` hitting `/health` (which already exists at `agent/src/cinepais_agent/main.py:100-102`). Write `.dockerignore` excluding `.git/`, `.venv/`, `__pycache__/`, `.pytest_cache/`, `.ruff_cache/`, `.env` and `.env.*` **while keeping `.env.example`**, `.omo/`, `docs/`, and the deploy artifacts themselves.
  - **⚠️ `AGENT_MODEL_OVERRIDE` is MANDATORY in the test run.** `agent/src/cinepais_agent/config.py:13` defaults `agent_model_override` to `""`. With it empty, `main.py`'s `lifespan` → `build_agent()` → `get_llm()` falls into runtime model discovery, which issues **real network calls to Google's API** (a `models.list()`, and on failure an invoke-per-candidate probe). With a dummy key those calls fail on auth and cost nothing, but the container must not be started without the override.
  - **⚠️ Build for the architecture Fly actually runs.** This workstation is `darwin/arm64`, so a plain `docker build` produces an **arm64** image while `fly deploy` builds and runs **amd64** — Todo 27 would be validating an artifact that never gets deployed. Use `--platform linux/amd64` for both build and run (emulated, slower — accept it once). Risk of divergence is low (`uv.lock` has no sdist-only packages, so both arches resolve to wheels), but this todo is the gate for Todo 29 and must test what ships.
  - **Accept:** `cd agent && docker build --platform linux/amd64 -t cinepais-agent .` exits 0. Then start the container **with the override**:
    ```bash
    docker run --rm -d --platform linux/amd64 -p 8080:8080 \
      -e GOOGLE_API_KEY=dummy \
      -e AGENT_MODEL_OVERRIDE=gemini-3.6-flash \
      -e CORS_ORIGIN=http://localhost:3000 \
      --name cinepais-agent-test cinepais-agent
    # lifespan blocks the listener during startup — POLL, never curl immediately
    until [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/health)" = "200" ]; do sleep 2; done
    ```
    `/health` must reach `200` within 60 s. Stop and remove the container afterwards.
  - **QA (three checks):**
    1. **MCP spawnability** (the container-specific risk): `docker exec cinepais-agent-test /app/.venv/bin/python -c "import cinepais_agent.mcp_server; print('ok')"` prints `ok`.
    2. **No secret in the image:** `docker run --rm cinepais-agent ls -a /app | grep -c '^\.env$'` → `0` (positive control: the same listing shows `pyproject.toml`).
    3. **No model discovery happened:** `docker logs cinepais-agent-test | grep -c 'Using AGENT_MODEL_OVERRIDE: gemini-3.6-flash'` → `1`, and `docker logs cinepais-agent-test | grep -ci 'models.list\|Using model:'` → `0`. If discovery ran anyway, **stop the container and report** — do not proceed.
  - **LLM spend: 0 `POST /chat`.** No chat request is ever issued here. With the override set, no generation call is attempted either.
  - **Evidence:** `task-27-…txt`.

- [ ] 28. `agent/fly.toml`: scale-to-zero configuration
  - **Do:** author it with — `app = 'cinepais-agent'` (or the Todo 21 substitute); `primary_region = 'iad'`, justified in a comment by the Neon region recorded in Todo 23 and by Vercel proximity; `[build] dockerfile = 'Dockerfile'`; `[env] PORT = '8080'`; `[http_service]` with `internal_port = 8080`, `force_https = true`, **`auto_stop_machines = 'stop'`** (the string form, as authored in the precedent), `auto_start_machines = true`, **`min_machines_running = 0`**; `[http_service.concurrency]` `type = 'requests'`, **`soft_limit = 3`, `hard_limit = 5`**; `[[http_service.checks]]` `GET /health`, `interval = '30s'`, `timeout = '5s'`, `grace_period = '15s'`; and `[[vm]] size = 'shared-cpu-1x'`, `memory = '1gb'`. **No `performance-*` size.**
  - **⚠️ Concurrency is deliberately lower than the precedent's 10/20.** Each concurrent `/chat` runs a ReAct loop, and the MCP client opens a **fresh stdio session — a new Python interpreter — per tool call** (`agent.py:89-97`; `close_agent()` at `:138-140` is a no-op). Twenty concurrent streams on a 1 GB VM is a trivial `curl` loop away from an OOM, and the per-IP limit is 10 **per minute**, which does not bound *concurrency* at all. The precedent repo already OOM-killed a Fly VM in exactly this class. A portfolio demo needs no more than 3/5.
  - **Non-secrets belong in `[env]`, secrets in `fly secrets`** (the precedent's own split, and what makes the QA below meaningful): `PORT`, `WEB_API_BASE_URL`, `CORS_ORIGIN`, `AGENT_MODEL_OVERRIDE`, and `DAILY_REQUEST_CAP` are **not** secrets → put them in `[env]`. Only `GOOGLE_API_KEY` (and LangSmith keys, if enabled) go through `fly secrets`.
  - **Accept:** `cd agent && fly config validate` exits 0 · `grep -c "min_machines_running = 0" agent/fly.toml` → `1` · `grep -c "performance-" agent/fly.toml` → `0` (positive control: `grep -c "shared-cpu-1x" agent/fly.toml` → `1`) · `grep -c "hard_limit = 5" agent/fly.toml` → `1` · `grep -c "AGENT_MODEL_OVERRIDE" agent/fly.toml` → `1`.
  - **QA:** re-read the file and confirm no **secret value** appears anywhere in it — `grep -ciE 'AIza|lsv2_|FlyV1' agent/fly.toml` → `0` (positive control: `grep -c "GOOGLE_API_KEY" agent/fly.toml` → `0` as well, since the key name itself must not appear here — it is set via `fly secrets`).
  - **Evidence:** `task-28-…txt`.

- [ ] 29. Fly: set secrets and deploy the agent
  - **Do:** create the app in the `personal` org. Put the **non-secrets in `fly.toml [env]`** (Todo 28): `PORT=8080`, `WEB_API_BASE_URL` = the **ACTUAL** Vercel production URL resolved in Todo 24, `CORS_ORIGIN` = the same URL, `AGENT_MODEL_OVERRIDE=gemini-3.6-flash`, `DAILY_REQUEST_CAP` from Todo 5. Set **only** `GOOGLE_API_KEY` through `fly secrets set --stage`. **Never echo a secret value into any log, terminal capture, or evidence file** — record names only. Then deploy.
  - **Accept:** `fly status -a cinepais-agent` shows a machine · `fly secrets list -a cinepais-agent` lists **only** `GOOGLE_API_KEY` (names only; values must not appear) · `curl -s -o /dev/null -w '%{http_code}' https://cinepais-agent.fly.dev/health` → `200`.
  - **QA (startup):** `fly logs` shows `Using AGENT_MODEL_OVERRIDE: gemini-3.6-flash` and `Agent initialized successfully` (`main.py:29` calls `logging.basicConfig(level=logging.INFO)` at import precisely so these survive under uvicorn). Failure path: the log must contain no `Failed to initialize agent`, and **no `Using model:`** — that string would mean the override was ignored and live model discovery ran.
  - **🔴 QA (the one that proves Todo 14's fix, at ZERO LLM cost — run it BEFORE any `/chat` is spent):** a green `/health` proves nothing about the MCP subprocess, because `build_agent()` performs only the MCP handshake and makes no HTTP call to the web API. Prove the tool path reaches the **real** API:
    ```bash
    fly ssh console -a cinepais-agent -C "/app/.venv/bin/python -c \"
    import asyncio, json
    from cinepais_agent.mcp_server import search_showtimes
    print(json.dumps(asyncio.run(search_showtimes(film_query='La Odisea')))[:400])
    \""
    ```
    (adjust the call to `mcp_server.py`'s actual tool signature — read it first, do not guess).
    **Pass:** real showtime data comes back. **Fail:** a connection error to `localhost:3000`, which means `WEB_API_BASE_URL` is still not reaching the child ⇒ Todo 14's fix did not take. **STOP and fix before spending a single `/chat`.** This invokes an MCP tool directly — **no LLM is involved, cost is exactly zero.**
  - **Rollback if this todo fails:** `fly releases -a cinepais-agent` to list versions, `fly deploy --image <previous digest>` to revert, confirm the machine returns to `stopped`, and report. Do not iterate blindly on a live app.
  - **This todo spends zero `/chat` calls.**
  - **Evidence:** `task-29-…txt` with the secret **names** only and the full MCP tool-call transcript.

- [ ] 30. Rebuild the web so the inlined agent URL takes effect, then prove CORS live
  - **Why:** `NEXT_PUBLIC_AGENT_URL` was set in Todo 21 but is baked at build time; unless the deployment that serves users was built after that, the widget still points at `localhost:8000`. And **CORS can only ever be proven live** — Playwright `route.fulfill` satisfies a request without a real preflight (Fase D measured `preflight: 0`), so no fixture can catch a misconfiguration.
  - **Do:** trigger a fresh production deployment, then verify from a shell.
  - **Accept:** a preflight probe returns the right header —
    ```bash
    curl -s -i -X OPTIONS https://cinepais-agent.fly.dev/chat \
      -H "Origin: <WEB_URL>" -H "Access-Control-Request-Method: POST" \
      -H "Access-Control-Request-Headers: content-type" | grep -i 'access-control-allow-origin'
    ```
    returns `<WEB_URL>`. **Negative control (mandatory):** the same request with `Origin: https://evil.example` must **not** return an `access-control-allow-origin` for that origin. Both transcripts go in the evidence.
  - **QA:** in the deployed page's JS bundle, confirm the Fly hostname is present and `localhost:8000` is not — `curl -s <WEB_URL> | grep -c 'cinepais-agent.fly.dev'` compared against `grep -c 'localhost:8000'` → the latter must be `0`. (If the string is split across chunks, fetch the referenced JS asset and grep that instead; record which method was used.)
  - **Evidence:** `task-30-…txt` with both preflight transcripts.
  - **LLM spend: 0.**

- [ ] 31. Live end-to-end proof against the deployed pair — **budgeted at 2 `POST /chat` calls**
  - **⚠️ ANNOUNCE TO THE USER BEFORE RUNNING.** This is the only todo in the phase that spends money. Two queries, matching Fase D's total for its whole phase.
  - **Do:** with the agent **cold** (stopped — confirm via `fly status` first), open `<WEB_URL>` in a browser, open the copilot, and ask exactly **two** Spanish queries, each targeting a named planted scenario (`web/prisma/seed.ts:232` defines all four: `soldout`, `front-only`, `optimal`, `no-adjacent`):
    - **Query 1 → the `no-adjacent` / `front-only` territory:** ask for several seats together in IMAX on a near date, phrased naturally in Spanish, so the copilot must confront limited adjacency and explain the tradeoff.
    - **Query 2 → the `optimal` scenario:** ask for the best-quality showtime of the weekend, so the copilot must recommend by seat quality.
    Record the exact Spanish text of both queries in the evidence. Measure and record: time to first token, total turn duration, and whether tokens rendered **incrementally** or arrived in one block. Fixtures deliver a whole stream in one reader chunk (`readerChunks: 1`, measured in Fase D), so incremental rendering is only ever observable live — this is the only chance to catch CDN/proxy buffering.
  - **Accept:** a `recommendation` event arrives and the card renders; the HITL CTA navigates to `/showtimes/<id>?preselect=<ids>` and the seats appear pre-selected. **Record the `outcome` enum as observed — never assert a specific value.** LLM trajectory is not a deterministic guarantee; that belongs in unit tests. This exact mistake cost Fase C four review rounds.
  - **QA (three live-only risks, all recorded as measurements, not pass/fail assertions on timing):**
    1. **Cold start** — the precedent app measured **20.79 s** on `/health`, and CinePaís tool turns run 5–45 s, so a first query can plausibly reach ~65 s. Record the actual number and check it against the widget's unreachable/timeout copy. If the copy fires before the real answer arrives, file it as a defect for Todo 32.
    2. **Idle SSE does not keep a Fly machine awake** — `matchday-agent/fly.toml:42-44` documents that Fly Proxy scores load on inbound HTTP only. Record whether the 45 s turn completed without the machine stopping mid-stream.
    3. **Auto-stop** — the precedent measured ≈ 4 min after the last request. Note the observed behaviour.
  - **Evidence:** `task-31-…png` (money shot: card + pre-selected seats) + `task-31-…txt` with the timings, plus **2 appended lines** in `llm-spend-cinepais-phase-4-deploy.txt`.

- [ ] 32. Fix anything Todo 31's three measurements exposed
  - **Do:** if the timeout copy fires too early, widen it and adjust the Spanish copy to set expectations about a cold start. If streaming was buffered, record the finding and the mitigation attempted. If a defect is cosmetic and out of scope, record it in the README's **Known limitations** instead of fixing it — and say which choice was made and why. **Preserve the Fase D session-cap copy correction** (the plan's original wording was factually false; `sessionStorage` survives a reload — the shipped copy naming "new tab, or come back later" is correct and must not be reverted).
  - **Accept:** agent trio + web lint/tsc exit 0. If no change was needed, record that explicitly with the measurements that justify it.
  - **QA:** re-verify with **fixtures only** — zero further live spend.
  - **Evidence:** `task-32-…txt`.

- [ ] 33. **Wave 5 close — HARD GATE. Do not start Todo 34 in this session.**
  - **Commit:** `feat(agent): Fly.io deployment — Dockerfile, fly.toml, scale-to-zero`
  - **Accept:** full gate exits 0 · `<WEB_URL>` and `https://cinepais-agent.fly.dev/health` both return 200 · both CORS transcripts (positive and negative) recorded · the live-spend file totals **exactly 2** `POST /chat` for this wave · `min_machines_running = 0` confirmed still set.
  - **STOP CONDITION:** complete only when `.omo/evidence/wave-5-closed-cinepais-phase-4-deploy.txt` exists. **End the session.**

---

### Wave 6 — Demo, post, and documentation truth

- [ ] 34. `specs/003-demo-script.md`: the "antes vs. después" shot list
  - **Do:** write a shot-by-shot script contrasting the two paths. **Before:** the manual flow — home → film → date/format → accordion → seat map → hunt for 2 adjacent good seats → checkout. **After:** one Spanish question to the copilot → recommendation card → CTA → seats already pre-selected. Include the exact Spanish queries to type, the planted scenario to use, expected durations, and a **pre-flight checklist**: re-seed with a recomputed `SEED_NOW`, `curl` the API for a non-empty array, and **warm the agent** with a `GET /health` before recording so the ~21 s cold start does not appear in the video. Reference the existing money-shot captures `.omo/evidence/task-16-live-hitl.png` and `task-14-hitl-money-shot.png` as framing references. Note that showtime ids encode a **day offset** from `SEED_NOW`, so never hardcode a `businessDate` in the script.
  - **Accept:** the file exists; every command in its pre-flight section is executed verbatim and recorded as exit 0; `grep -cE '20[0-9]{2}-[0-9]{2}-[0-9]{2}' specs/003-demo-script.md` → `0` (no hardcoded dates; positive control: `grep -c 'SEED_NOW' specs/003-demo-script.md` → ≥ 1).
  - **QA (part 1):** walk the "before" path once on the deployed site and confirm each scripted step matches reality; correct the script where it does not.
  - **QA (part 2 — close the `specs/002` §Sesión E deliverable #1 loop, at ZERO LLM cost):** Todo 31's two live queries covered two of the four planted scenarios. Confirm the **other two are still reachable on the deployed data** using the read API alone, no copilot:
    **Derive both ids at runtime — never hardcode them.** §Scope OUT forbids hardcoding "any showtime id derived from a seed", and these ids genuinely are seed artifacts: `seed.ts:423` builds them as `st-${site}-${room}-${day}-${timeToId(time)}`, where the time component comes from `pickFourSlots()` (`:218-223`) drawing off the shared PRNG. The scenario is keyed on `slotIdx === 0`, **not** on any literal time. Resolve them from the API:
    ```bash
    # soldout — film-02 at site-med-1 / imax (seed.ts:262). Pick the match with availableCount 0.
    SOLD=$(curl -s "<WEB_URL>/api/showtimes?filmId=film-02" \
      | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s);const m=a.find(x=>x.siteId==='site-med-1'&&x.room==='imax');console.log(m?m.id:'')})")
    test -n "$SOLD" || { echo "FAIL: soldout showtime not found"; exit 1; }
    ```
    - **`soldout` assertion** — `head -c 300` can never reach `summary`, because the response is `{ showtime, seats, summary }` and `seats` holds ~178 objects (`web/src/lib/api/queries.ts:180`). Parse it:
      ```bash
      curl -s "<WEB_URL>/api/showtimes/$SOLD/seats" \
        | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log('availableCount',j.summary.availableCount);process.exit(j.summary.availableCount===0?0:1)})"
      ```
      Must print `availableCount 0` and exit 0.
    - **`front-only` assertion** — replace the unjudgeable "concentrated in the low-quality front rows" with an exact machine check: **every** seat whose `status === 'Available'` has `qualityTier === 'low'`.
      ```bash
      curl -s "<WEB_URL>/api/showtimes/$FRONT/seats" \
        | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);const av=j.seats.filter(x=>x.status==='Available');const bad=av.filter(x=>x.qualityTier!=='low').length;console.log('available',av.length,'non-low',bad);process.exit(av.length>0&&bad===0?0:1)})"
      ```
      Resolve `$FRONT` the same way from `filmId=film-01` at `site-med-2` / `imax` (`seed.ts:266`).
    Record both transcripts. If a scenario is unreachable, that is a seed/deploy defect — report it rather than silently accepting it.
  - **Evidence:** `task-34-…txt` with both scenario responses.
  - **LLM spend: 0** (the "after" path is walked during recording, inside the Todo 35 budget).

- [ ] 35. `[MANUAL — USER]`: record the video/GIF
  - **Why:** an agent cannot record the user's screen. This step is the user's.
  - **Do:** the executor runs the Todo 34 pre-flight, confirms the site and agent are warm and the seed is fresh, and hands the user the script. The user records. **Budget: up to 2 additional `POST /chat` calls** for the take(s) — announce before each, and append to the spend file.
  - **Accept:** the user confirms a recording exists and states where it lives. **Store the video OUTSIDE the repo** (it would bloat a public repo); the README links to it instead. Record the chosen location.
  - **QA:** the executor re-verifies the seed is still fresh (`curl` → non-empty) immediately before the user records; a stale seed mid-recording is the single most likely failure.
  - **Evidence:** `task-35-…txt` with the pre-flight results and the spend lines.

- [ ] 36. `specs/004-linkedin-post.md`: the post draft
  - **Do:** write the draft in **Spanish** (it is user-facing copy). Angle, per `specs/002` §Sesión E: the skill-story — *"en Fleet AI replicaba web apps para entrenar agentes; acá construí una réplica de un cine + un copiloto que arregla un dolor real de UX"* — landing the client↔business balance as the business point (the copilot recommends by seat quality **without ever discouraging the sale**). Follow the user's own format precedent at `matchday-agent/docs/marketing/linkedin.md`. Include the demo link, the repo link, and an honest one-liner that the data is mock and the brand fictional. Given the Q1 decision to ship a curated `.omo/`, include one short line about the orchestration process being visible in the repo. **No attribution lines. Never name CineColombia.**
  - **Accept:** the file exists; `grep -ci "cinecolombia" specs/004-linkedin-post.md` → `0` (positive control: `grep -ci "cinepais"` → ≥ 3); `grep -ciE "generated with|co-authored-by" specs/004-linkedin-post.md` → `0`.
  - **QA:** every URL in the draft is fetched and returns 200 — a post with a dead link is the failure mode that matters here.
  - **Evidence:** `task-36-…txt` with each URL's status code.

- [ ] 37. Make the documentation tell the truth about what was actually shipped
  - **Why:** "a Verification section that disagrees with the shipped code is worse than none — it is what reviewers cite." Several docs now contain claims this phase invalidated.
  - **Do:** update, after **re-reading each file**: root `README.md` — replace `<WEB_URL>`/`<AGENT_URL>` placeholders with the real URLs and finalize **Known limitations** with the measured cold start, the seed horizon and its refresh path, and the daily copilot cap. `AGENTS.md` — correct the deploy/cost section: Fly.io is **pay-as-you-go, kept ≈ $0 by scale-to-zero**, not "free tier"; record the region and VM size; record that a hard Google spend cap plus an in-app daily cap are the spend controls. `agent/README.md` — document `CORS_ORIGIN` as comma-separated, `DAILY_REQUEST_CAP`, and the `Fly-Client-IP` rate-limit key. `web/README.md` — resolve the "Known contract gap (advisory for Fase E)" note now that Todo 8 fixed it. `specs/002-implementation-plan.md` §Sesión E — mark it done and point at `specs/003`/`004`. Update the GitHub repo description with the live URL.
  - **Accept:** `grep -n "Fly" AGENTS.md | grep -ci "free"` → **`0`** (a single deterministic number — the blunt `grep "free tier" AGENTS.md` would always match the legitimate and still-true *Neon* free-tier line, so it can never pass or fail meaningfully; positive control: `grep -c "Fly" AGENTS.md` → ≥ 1, proving the file is being read) · `grep -c "advisory for Fase E" web/README.md` → `0` (positive control: `grep -c "priceFrom" web/README.md` → ≥ 1) · no placeholder remains anywhere: `grep -rn "<WEB_URL>\|<AGENT_URL>" README.md AGENTS.md web/README.md agent/README.md specs/` → nothing (positive control: the same `grep -rn "CinePaís"` over those paths returns many hits).
  - **QA:** for each edited file, quote in the evidence the line that previously made the false claim and the line that replaces it. Do not paraphrase.
  - **Evidence:** `task-37-…txt`.

- [ ] 38. **Wave 6 close + phase handoff — HARD GATE**
  - **Do:** full gate (agent trio → web lint → tsc → detached `pnpm test` → `pnpm build`). Commit, push `main`, then write `.omo/handoff-fase-e-final.md` covering: what shipped, the live URLs, the exact total LLM spend with its reproduction command, every `[MANUAL — USER]` step and its outcome, all measurements from Todos 12/31, and every deviation.
  - **Commit:** `docs: demo script, LinkedIn draft, and deployment documentation`
  - **⚠️ `pnpm test` re-seeds the shared Neon DB three times.** If Todo 23 recorded that production and dev **share one database**, running the full gate here would wipe the live demo the phase just proved and recorded on video. In that case: do **not** run `pnpm test` blind — either point it at a separate database, or run the gate and then **re-run `web/scripts/reseed.sh` against production afterwards**, re-verifying the catalogue. Record which route was taken.
  - **Accept:** all gates exit 0 · `git status --porcelain` empty · `git log --oneline origin/main..main | wc -l` → `0` (nothing unpushed) · both live URLs return 200 · the spend file's total is **≤ 6** `POST /chat` for the entire phase · the handoff exists and its "what shipped" section was written by re-reading the files, not from memory.
  - **Accept — the LAST check of the phase, run after everything else:** `curl -s "<WEB_URL>/api/showtimes?filmId=film-01"` returns a **non-empty** array. A 200 from the homepage is satisfied by an empty catalogue, so without this the phase could close green on a dead demo. If it is empty, run `web/scripts/reseed.sh` and re-check before declaring the phase complete.
  - **STOP CONDITION:** complete only when `.omo/evidence/wave-6-closed-cinepais-phase-4-deploy.txt` exists and the handoff is committed. **End the session**, then run the final verification wave.

---

## Final verification wave

Run by the orchestrator after Todo 38. **Shared-state rules — a Fase B review round was lost to
violating them:** no lane switches branches, no lane re-seeds while another lane runs, only one lane at
a time drives a browser, and **no lane spends an LLM call**. All five must APPROVE.

- [ ] F1. Plan compliance audit — re-run every acceptance criterion in Todos 1–38 from a clean shell, pairing each negative-result grep with a positive control. Report the exact count of criteria that pass, fail, or could not be re-run, and why.
- [ ] F2. Code quality review — sweep `git diff phase-3-integration..main` for dead code, `any`, and secrets. Confirm `web/package.json` gained no runtime dependency: `git diff phase-3-integration..main -- web/package.json` must show only the `prebuild` script addition. Confirm no seeding logic was duplicated or extracted (the manual-refresh decision means `web/prisma/seed.ts` stays the single source).
- [ ] F3. Security and spend review — verify: the rate limit keys off `Fly-Client-IP`; the MCP connection dict carries an `env` with `WEB_API_BASE_URL` (R2-1) and the sentinel regression test exists; `recursion_limit` is set and `search_showtimes` output is capped; `DAILY_REQUEST_CAP` is the budget-derived value and its cold-start reset is documented as a limitation, not sold as a guarantee; the Google cap was reported as `HARD-STOP`; no `.env` and no key pattern is tracked on `main`; `min_machines_running = 0` and `hard_limit = 5` are still set; **no `crons` entry and no re-seed route exist anywhere**. Re-run Todo 19's **full-history** scan against `main`.
- [ ] F4. Hands-on QA against the **deployed** site, fixtures and browsing only — walk the full Fase B purchase flow on `<WEB_URL>`, confirm posters render, confirm a 404 on a bad showtime id, and confirm the copilot bubble mounts. Assert the limit/unreachable copy by **exact string match against the shipped constants**, not by judging whether it "reads well". **Do not send a chat message** — zero LLM spend. Confirm `<WEB_URL>` returns 200 with no Vercel session, and that `/api/showtimes?filmId=film-01` is non-empty.
- [ ] F5. Scope fidelity — confirm every Must-NOT-Have held: no proxy, no runtime dep, no evals run, VM is `shared-cpu-1x`/1 GB, the four phase branches still exist and are absent from the remote, no `chore(omo)` commit was squashed to satisfy a count, `sse-contract.md:125` is untouched, no hardcoded dates, no attribution lines, no CineColombia reference. Enumerate and classify every changed file.

---

## Commit strategy

| Wave | Subject |
|---|---|
| 1 | `fix(web,agent): deploy blockers — prisma generate, Fly client IP, multi-origin CORS, daily cap, polish backlog` |
| 2 | `fix(agent): propagate web API base URL to the MCP subprocess; docs(web): documented demo-data refresh` |
| 3 | `docs: public README, LICENSE, and curated .omo/ for publication` (Todo 17, covers Todos 16–17 — **required** for Todo 18) then the squash commits per Todo 18 + the push in Todo 19 |
| 4 | `chore(web): production deployment configuration` *(skip if no files changed)* |
| 5 | `feat(agent): Fly.io deployment — Dockerfile, fly.toml, scale-to-zero` |
| 6 | `docs: demo script, LinkedIn draft, and deployment documentation` |

Executor wave commits are counted with `--invert-grep --grep='^chore(omo)'`. Orchestrator bookkeeping
commits are expected and legitimate; **never rewrite history to make a raw count match.**

## Dependency matrix

| Todo | Depends on | Why |
|---|---|---|
| 2–10 | 1 | branch must exist |
| 11 | 2–10 | wave gate |
| 12 | 11 | fresh session |
| 13 | 12 | the measured duration selects Path A or Path B |
| 14 | 13 | schedules the Path A route it invokes |
| 15 | 12–14 | wave gate |
| 16–18 | 15 | fresh session |
| 19 | 18 | pushes the `main` that 18 builds |
| 20 | 16–19 | wave gate |
| 21 | 20 | needs the published repo |
| 22 | 21 | same project |
| 23 | 21 | needs the prod DB target |
| 24 | 2, 22, 23 | build needs `prebuild`; access needs SSO off; data needs the seed |
| 25 | 21–24 | wave gate |
| 26 | 25 | fresh session; **blocks all deploying** |
| 27 | 26 | do not build before billing is confirmed |
| 28 | 23, 27 | region justified by the Neon region |
| 29 | 4, 5, 21, 27, 28 | secrets need the multi-origin parser, the cap, and the URLs |
| 30 | 24, 29 | both halves must exist |
| 31 | 30 | CORS must pass before a live query is worth spending |
| 32 | 31 | fixes what 31 measured |
| 33 | 26–32 | wave gate |
| 34 | 33 | fresh session; scripts the deployed site |
| 35 | 34 | records the script |
| 36 | 24, 29, 35 | links must resolve |
| 37 | 8, 24, 29, 31 | documents measured truth |
| 38 | 34–37 | wave gate |
| F1–F5 | 38 | post-implementation |

## Review record — Metis pass (pre-handoff)

An adversarial review was run against this plan before handoff and its findings were **repaired in
place**, not merely noted. Recorded so a reviewer can audit the repair rather than trust it.

| # | Severity | Finding | Repair |
|---|---|---|---|
| B-1 | BLOCKER | The Preconditions block expected one untracked file, but the planning session itself wrote `.omo/plans/…` and `.omo/drafts/…` into the same tree — the executor would halt before Todo 1, and every later `git status --porcelain` → empty criterion was unsatisfiable | Preconditions now enumerate all three expected untracked artifacts; Todo 1 stages them and asserts `grep -c '^??'` → `0` |
| B-2 | BLOCKER | Todos 16 and 17 had **no commit**, so `phase-4-deploy`'s last-commit tree could never equal `main`'s — Todo 18's load-bearing check was structurally impossible | Todo 17 gained a required commit covering both todos; Todo 18 gained a precondition verifying it, and explains that `^{tree}` resolves the last commit, not the working tree |
| B-3 | BLOCKER | Wave 2 opens in a fresh session and immediately curls `localhost:3000` with no server started — and the plan's own "`[]` ⇒ stale seed" guidance would misdiagnose a connection refusal, wasting the single re-seed the todo exists to time | Todo 12 gained a step 0 that starts the dev server and polls for readiness; the two failure modes (refused vs `[]`) are now explicitly distinguished with different remedies; Todo 13 re-checks the server |
| M-1 | MAJOR | Todo 21 told the executor to "confirm" a Vercel domain that measurably does not exist (`domains: []`, zero deployments); a wrong prediction would surface only after Fly secrets were already set | The domain is now labelled **PREDICTED**; Todo 24 resolves it to `ACTUAL`, redeploys if it differs, and carries the corrected value into Wave 5 |
| M-2 | MAJOR | Todo 27 claimed "zero LLM calls" — **false.** `config.py:13` defaults the model override to `""`, so container startup runs live model discovery against Google | The test run now sets `AGENT_MODEL_OVERRIDE`, polls `/health` instead of racing a blocking `lifespan`, and asserts from the logs that discovery did **not** run |
| M-3 | MAJOR | Todo 23's seed-freshness check was deferred to "after Todo 24" as prose, with no checkable home — exactly the anti-pattern this project has been bitten by | The HTTP check is now a named criterion in Todo 24's Accept; Todo 23 gained a DB-level check it can actually run at that point |
| M-4 | MAJOR | Wave stop conditions were worded more forcefully than Fase D's but used the same unenforceable mechanism | Added §"Wave boundaries are gates": receipts are asserted from both sides, wave-advance ownership moves to the orchestrator, and the residual risk is stated honestly instead of hidden |
| M-5 | MAJOR | The four planted demo scenarios — an explicit `specs/002` §Sesión E deliverable — were never re-verified post-deploy | Todo 31 now names which scenario each of its two budgeted live queries targets; Todo 34 verifies the remaining two through the read API at **zero** LLM cost |
| N-1 | MINOR | "2 context markers" mislabelled the `---`/`+++` diff file headers | Wording corrected; a second positive-control grep added |
| N-2 | MINOR | `grep -rn "free tier" AGENTS.md` can never fail — it always matches the legitimate *Neon* free-tier line | Replaced with `grep -n "Fly" AGENTS.md \| grep -ci "free"` → `0`, a single deterministic number |
| N-3 | MINOR | No tool-availability check before Wave 5 depended on `docker`/`fly`/`gh` | Preconditions gained a tool loop naming which wave needs each tool |

Metis also re-verified as accurate: every `file:line` citation, the live `ssoProtection.enabled: true`
measurement, all four branch SHAs, and scope coverage against `specs/002` §Sesión E. *(Its claim that
the Todo 8 diff arithmetic was fully verified was itself wrong — see R2-5 below.)*

### Round 2 — high-accuracy review (Momus + Oracle, in parallel). Both returned REJECT.

Requested by the user. Two independent reviewers; ~28 findings. All repaired below. The two decision-level
findings were taken back to the user and answered at the gate.

| # | Severity | Finding | Repair |
|---|---|---|---|
| R2-1 | **BLOCKER** (Oracle) | **`WEB_API_BASE_URL` never reaches the MCP subprocess.** `agent.py:89-97` has no `env` key; `mcp/client/stdio/__init__.py:127` + `:28` mean the child inherits only `HOME, LOGNAME, PATH, SHELL, TERM, USER`. On Fly every tool call would hit `localhost:3000` inside the container. Invisible locally (the default is right by coincidence) and invisible to `/health` (the handshake makes no HTTP call) — it would have surfaced only while spending the live budget | **New Todo 14** fixes it with an explicit `env` mapping + a sentinel regression test; **Todo 29** adds a zero-LLM `fly ssh` tool-call proof that runs *before* any `/chat`. Verified first-hand by the planner |
| R2-2 | **BLOCKER** (both) | **Vercel cron cannot invoke the planned route.** Vercel issues a **GET** with `Authorization: Bearer $CRON_SECRET`; `crons` entries accept only `path` + `schedule`. A POST route gated on `x-reseed-token` returns 405/401 forever. `RESEED_TOKEN` was also never set anywhere, and no `maxDuration` was configured | Confirmed against Vercel's docs by the planner. **Moot** — the user chose the documented manual refresh, so the cron, the route and the secret are all removed and added to §Scope OUT |
| R2-3 | **BLOCKER** (both) | **Squashing per-phase trees republishes `.omo/evidence` + `run-continuation`** (11 and 54 evidence files; 23–35 run-continuation), violating the locked Q1 decision **irreversibly** after the push. Todo 16's `git rm --cached` only shaped the final tree | **Todo 18** now curates **every** commit via an explicit `read-tree` + `git rm --cached` loop, with a per-commit verification; **Todo 19**'s scan extended to full history |
| R2-4 | **BLOCKER** (Oracle) | **The daily cap was near-decorative**: in-process counter + `min_machines_running = 0` + ~4 min auto-stop ⇒ resets every cold start. No `recursion_limit` (LangGraph default 25). `search_showtimes` returns unbounded results that re-enter as input each turn. `DAILY_REQUEST_CAP=200` × 3.5 calls ≈ 10× the entire credit | **Todo 5** rebuilt: cap derived from the real budget (**40**), `recursion_limit=8`, `search_showtimes` capped at 40 + `truncated`, and the reset caveat documented honestly. **Todo 26** now makes an alert-only Google cap a **STOP condition** (user decision), reversing the plan's earlier backwards fallback |
| R2-5 | MAJOR (Momus) | Todo 8's positive control expected `1`; the string occurs on lines 90, 107 and 125 ⇒ `3` before, `2` after | Corrected to `2` plus a line-precise `sed -n '125p'` check |
| R2-6 | MAJOR (Momus) | Todo 16's positive control expected `5` plans, but the B-1 repair makes it `6` | Corrected to `6` |
| R2-7 | MAJOR (Momus) | **Todo 7's greps are broken in zsh** — unquoted `--include=*.tsx` raises "no matches found", so the negative check passed *vacuously* while 7 real `preload` hits existed | Globs quoted in both the Do and the Accept |
| R2-8 | MAJOR (Momus) | Wave gates assert an empty tree, but AGENTS.md mandates a per-session handoff note — six waves, five unaccounted untracked files | §Wave boundaries item 4: the note is named and staged into its own wave's commit |
| R2-9 | MAJOR (Momus) | Todo 34's `soldout` check used `head -c 300`, which can never reach `summary.availableCount`; the `front-only` check was unjudgeable prose | Both replaced with parsed, exit-code assertions |
| R2-10 | MAJOR (Momus) | Todo 34 hardcoded a showtime id, violating the plan's **own** §Scope OUT rule — the id is a PRNG artifact of `pickFourSlots()` | Both ids now resolved at runtime from the API |
| R2-11 | MAJOR (both) | **No rollback path** for the three irreversible steps | New §Rollback section with detection + recovery per step, and a rule that recoveries are reported, never silent |
| R2-12 | MAJOR (Momus) | Todos 33/38 run `pnpm test` unconditionally — which re-seeds 3× and could wipe the live demo if prod and dev share a database. Todo 38's Accept was satisfiable by an empty catalogue | Todo 38 branches on Todo 23's shared-DB answer and adds a final non-empty-catalogue check as the phase's last gate |
| R2-13 | MAJOR (Oracle) | **`hard_limit = 20` on a 1 GB VM invites OOM** — each tool call spawns a fresh Python interpreter, and the per-IP limit does not bound concurrency | Todo 28: `soft_limit = 3`, `hard_limit = 5`, with the reasoning recorded |
| R2-14 | MAJOR (Oracle) | **Todo 27 tested arm64; Fly runs amd64** — the gate validated an artifact that never ships | `--platform linux/amd64` on both build and run |
| R2-15 | MAJOR (Momus) | Todo 13 Path A's "extract the shared logic into a module" was an un-made architecture decision | Moot — Path A removed |
| R2-16 | MAJOR (Momus) | Todo 18's QA used `git log --all`, which walks the preserved phase branches and can never return `0` | Scoped to `main`, plus a per-commit check |
| R2-17 | MINOR | Todo 21 ran `vercel env ls` from the repo root, but the link lives at `web/.vercel/` | `cd web &&` added |
| R2-18 | MINOR | Todo 23's `tsx -e` QA could not work: `@/` does not resolve under `-e`, and `schema.prisma` has no `datasource url` | Rewritten as a script file mirroring `client.ts`'s adapter construction |
| R2-19 | MINOR | Non-secrets (`WEB_API_BASE_URL`, `CORS_ORIGIN`, `AGENT_MODEL_OVERRIDE`, `DAILY_REQUEST_CAP`) were being set via `fly secrets`, muddying the split the plan itself verifies | Todos 28/29: non-secrets in `fly.toml [env]`; only `GOOGLE_API_KEY` via `fly secrets` |
| R2-20 | MINOR | The branch for Waves 4–6 was never stated | New §Branch discipline: work continues on `main` from Todo 22 |
| R2-21 | MINOR | Todo 5's Spanish copy was approximate and used voseo (Rioplatense), inconsistent with a Colombian brand | Exact string specified, Colombian register |

### Round 3 — findings from the field (during execution, not review)

Three defects that **all three reviewers and the planner missed**, surfaced only by running the plan.
Recorded because they show where paper review has a ceiling.

| # | Found at | Finding | Repair |
|---|---|---|---|
| R3-1 | Wave 1 | A full re-seed **stalled at ~seat 110,000 of 119,280**, and blind retries turned it into a **10+ hour** loop — the retries were themselves the cause (connection contention), not a code defect | §Two rules item 3: one attempt, a 15-minute ceiling, and a three-rung diagnostic ladder with measured baselines. Also added as field evidence to Todo 12's decision block, since it is exactly the destructive window that justified dropping the cron |
| R3-2 | Wave 3, Todo 18 | **20 `.omo/notepads/` files were tracked on `main` across all five phases.** They are gitignored (`.gitignore:38`) as scratch state — the same category as `evidence/` and `run-continuation/` that the locked Q1 decision excludes — but the ignore rule **postdates** their first commit in `phase-0-scaffold`, so ignoring never untracked them. Todo 18's curation list named only two of the three directories | Curation list extended to `.omo/notepads/`; `main` rebuilt from scratch and re-verified per commit. **Neither Metis, Momus, Oracle nor the planner caught this** — every one of us reasoned from the *decision text* ("evidence + run-continuation") instead of enumerating what was actually tracked |
| R3-3 | Wave 3, Todo 19 | The `FlyV1 fm2_` alternative had no token-body quantifier and matched the plan's own QA code block, producing a permanent false positive | Quantifier added (see above), with a standing rule that every pattern requires a body |

**Standing lesson from R3-2:** when a decision is phrased as a category ("orchestrator scratch state
does not ship"), the plan must **enumerate the members of that category from the repo**, not restate the
category. `git ls-files .omo | sed 's|/[^/]*$||' | sort -u` would have listed all four directories in one
command, and no reviewer ran it.

**Both reviewers independently confirmed as sound:** the single-stage `python:3.12-slim` Dockerfile
(no `grpcio`/protobuf in `uv.lock`, 0 sdist-only packages across 81, lock in sync — it will build with
no compiler), the `sys.executable` reasoning, the `Fly-Client-IP` re-key, the `prebuild: prisma generate`
fix, disabling SSO protection, reserving both hostnames before either deploy, rejecting `performance-*`
sizing, the `sse-contract.md:125` correction, and full scope coverage with **no scope creep**.

## Rollback — what to do when an irreversible step goes wrong

The plan has three steps that cannot simply be re-run. Each gets an explicit recovery path, because
"the deploy succeeded but the thing is broken" is a normal outcome, not an exceptional one.

| Step | Detection | Recovery |
|---|---|---|
| **Todo 21 — public push** | The pre-push history scan is non-zero, or something shipped that the Q1 decision excluded and is noticed after the push | **Do NOT attempt a history rewrite on a public repo.** Delete the GitHub repo, **rotate any credential that appeared**, rebuild `main` cleanly per Todo 18's curated-tree procedure, re-run the full-history scan, and only then re-push. Report to the user before re-pushing. |
| **Todo 26 — Vercel deploy** | Deployment is READY but the QA purchase flow fails, images 404, or the catalogue is empty | `cd web && vercel rollback` to the previous READY deployment (on a first-ever deploy there is none — in that case leave it and report). Fix, redeploy, re-run Todo 26's Accept list in full. Never leave a broken production deployment live while iterating. |
| **Todo 29 — Fly deploy** | `/health` never reaches 200, the MCP tool proof fails, or the machine crash-loops | `fly releases -a cinepais-agent` to list versions; `fly deploy --image <previous digest>` to revert; confirm `fly status` returns the machine to `stopped` so it stops accruing cost. If this is the first release, `fly apps destroy` is acceptable — the app holds no data. Report before retrying. |

**Universal rule:** if a rollback is performed, it goes in the wave handoff note and in the final
handoff as a deviation. A silent recovery is a lie by omission to the F-lanes.

## Branch discipline for Waves 4–6

Waves 1–3 commit on `phase-4-deploy`. **From Todo 22 (Wave 3 close) onward, all work continues on
`main`**, which is the pushed branch. `phase-4-deploy` is frozen as a local backup and is never deleted.
This matters because Wave 5 creates `agent/Dockerfile`, `agent/fly.toml` and `agent/.dockerignore`,
which must live on the branch that is actually published and deployed from.

## Open risks the executor must surface rather than silently absorb

1. **Fly app name `cinepais-agent` may be taken.** Not provable read-only. Todo 21 names the fallback.
2. **Idle SSE may not keep the Fly machine awake** during a 45 s turn (documented in the precedent's own `fly.toml`). Todo 31 measures it; if it bites, record it and raise it — do not silently bump `min_machines_running`, which changes the cost profile the user approved.
3. **Prod and dev may share one Neon database.** Todo 23 answers this explicitly. If they do share, a `pnpm test` run (which re-seeds three times) will disturb the live demo — surface this to the user rather than deciding alone.
4. **Vercel Hobby allows one cron execution per day.** If Path A needs more, that is a plan-B conversation, not an upgrade decision the executor makes.
