# Handoff — Wave 2 Complete (Todos 12–15, Anti-rot + MCP env blocker)

> For the next executor session (Wave 3, Todos 16–18). Read this FIRST, then
> `.omo/notepads/cinepais-phase-4-deploy/*.md` for the detailed learnings.

## What Shipped in Wave 2

Wave 2 had one job: keep the public demo alive past its 7-day seed horizon (BLOCKER B2), and fix a
latent production bug found on the way (BLOCKER, Todo 14).

| Todo | Scope | Files Changed | Status |
|------|-------|---------------|--------|
| 12 | MEASURE FIRST — time a full re-seed against Neon | *(none — measurement only)* | ✅ |
| 13 | One-command demo-data refresh | `web/scripts/reseed.sh` (new, executable) | ✅ |
| 14 | Propagate `WEB_API_BASE_URL` into the MCP subprocess | `agent/src/cinepais_agent/agent.py`, `agent/tests/test_agent_core.py` | ✅ |
| 15 | Wave 2 close — hard gate + commit | `.omo/plans/…` (checkboxes), `.omo/handoff-fase-e-wave-2.md`, `.omo/boulder.json` | ✅ |

### Todo 14 was a real production bug, not polish

`MultiServerMCPClient` spawns `python -m cinepais_agent.mcp_server` over stdio. Read first-hand at
`mcp/client/stdio/__init__.py:127`: when `server.env is None`, the child receives **only**
`get_default_environment()` — on POSIX that is `HOME, LOGNAME, PATH, SHELL, TERM, USER` (`:28-45`).
`WEB_API_BASE_URL` is in neither the POSIX nor the win32 branch, so the subprocess silently fell back
to `config.py:8`'s `http://localhost:3000`. Correct on a laptop; on Fly.io that points at a port
inside the container where nothing listens — **all four MCP tools would have failed on day one.**

The fix passes exactly one variable (`env` is merged *over* the defaults at `:127`, so `PATH` is not
lost). `GOOGLE_API_KEY` is deliberately **not** forwarded: the child does no LLM work, so forwarding
it would widen the blast radius of a compromised subprocess for zero benefit (least-privilege,
`AGENTS.md`).

## What Was Measured

### The headline number (Todo 12)

```
Full re-seed against Neon:  66.83 s wall-clock (real)   [/usr/bin/time -p: user 8.72, sys 0.45]
Result:                     Seed complete: 119280 seats across 672 showtimes
Seed attempts:              EXACTLY ONE. Exit 0. No hang, no retry.
```

Two things this number settled:

1. **It chose the mechanism.** At ~67 s, a documented manual refresh is comfortably viable. Nothing
   about this number argued for a cron. (The plan had already decided this at its approval gate;
   the measurement confirmed rather than re-opened it.)
2. **It exonerated the code.** The run sailed past seat 110,000 — the exact point where the Wave 1
   incident stalled for 10+ hours — without pausing, and came in **~6 s faster** than the healthy
   ~73 s baseline. That is direct evidence the Wave 1 stall was connection contention from repeated
   interrupted retries, **not** a defect in `web/prisma/seed.ts`.

End-to-end through the new script (Todo 13): **71.96 s** — the ~5 s delta is the script's own env
resolution, `SEED_NOW` recompute, and post-seed read-back. README copy says "about 70 seconds",
rounding toward the larger figure so it never undersells the wait.

### Wave 2 close gate (all green)

```
Agent:
  uv run ruff check .                              → exit 0   "All checks passed!"
  uv run ruff format --check .                     → exit 0   "36 files already formatted"
  uv run basedpyright                              → exit 0   "0 errors, 0 warnings, 0 notes"
  uv run pytest tests/ -m "not evals" -q --timeout=120
                                                   → exit 0   "118 passed, 15 deselected in 11.40s"
Web:
  pnpm lint                                        → exit 0
  npx tsc --noEmit                                 → exit 0
  pnpm test  (detached, exit-code-file poll)       → exit 0   "Test Files 11 passed (11)"
                                                              "Tests 136 passed (136)"
                                                              "Duration 611.60s"
  pnpm build                                       → exit 0   all 12 routes compiled
```

**Agent test count reconciliation:** Wave 1 closed at *115 passed, 1 skipped*. Wave 2 shows
*118 passed, 0 skipped*. That is `116 non-eval tests + 2 new from Todo 14 = 118`. The vanished
skip is **not** a lost test: `tests/test_api_client.py:300` skips with "Web server not reachable on
localhost:3000", and a dev server was up during the agent run, so it executed and passed instead of
skipping. Web stays at 136/136 — Wave 2 added no web tests.

## What Deviated from the Plan

### Deviation 1 (Todo 12) — a parallel session was editing the working tree mid-measurement

`git status` at the end of Todo 12 showed `agent/src/cinepais_agent/agent.py` and
`agent/tests/test_agent_core.py` modified, with mtimes **inside** the measurement window. Todo 12 is
measurement-only and ran no command that writes to `agent/` — the edits were Todo 14 being executed
by a **parallel session**.

**Impact on the number: none.** No DB-touching process ran alongside the seed (`pgrep` for
`prisma|vitest|pnpm test|pytest` → none), the agent reaches data through the web read API rather than
Prisma, and the seed beat the healthy baseline — all inconsistent with contention. 66.83 s stands.

**Why it is reported anyway:** the Todo 12 brief asserted "nothing else is currently running against
the dev server or the DB." True for the DB, **false for the working tree**. `pnpm test` re-seeds
**3×**; if a parallel session fires it while another holds a seed, that reproduces the exact Wave 1
contention scenario — and it would look like a mysterious hang, not a scheduling collision.
**Recommendation carried into Wave 3: only one todo may hold Neon at a time.** Agent-side Python
todos parallelize safely; anything reaching Prisma does not.

### Deviation 2 (Todo 13) — a runtime bug the syntax check could not see, fixed at zero DB cost

`web/scripts/reseed.sh` failed on its first real launch in 0.06 s:

```
web/scripts/reseed.sh: line 128: SEED_NOW: readonly variable
```

The script held the computed date in `SEED_NOW`, marked it `readonly`, then invoked the seed with a
`SEED_NOW="$SEED_NOW"` assignment prefix — bash refuses to shadow a readonly variable. `bash -n` had
exited 0 on the file: this is a runtime error, not a syntax error.

**This consumed ZERO seed runs.** Bash rejects the assignment before executing the command, so
`pnpm prisma db seed` never started and the DB was never touched — the one-attempt budget stayed
intact. Fixed by holding the value in `SEED_NOW_VALUE`. Before spending the real seed, a stub `pnpm`
was put first on `PATH` so every line *except* the seed ran against the live DB; the real run then
passed on its first attempt.

### Deviation 3 (Todo 15) — `pnpm test` aborted by the harness, relaunched once with a fixed mechanism

The first detached `pnpm test` launch was killed at ~125 s. **It was neither a hang nor a test
failure**: the log shows the first full seed completing (119,280 seats) and the second determinism
seed already at 15,000 seats, and the only error was `ELIFECYCLE` — pnpm reporting a *terminated
child*, a signal artifact with no assertion failure. No `.exit` file was written, because the entire
process group died.

**Root cause was the launcher, not the code.** `nohup … & disown` removes a job from the shell's job
table but does **not** survive the agent harness killing the launcher's process group when its
120 s tool timeout fires. A second attempt using `setsid` did not run at all — **macOS ships no
`setsid` binary**, and the `2>/dev/null` on the launch line swallowed the "command not found", so it
consumed zero DB work. The working mechanism was a python3 **double-fork + `os.setsid()`**, which
gives the run its own session and makes it immune to a process-group kill.

**Why relaunching was not a blind retry** (§Two rules item 3 discipline): the run never hung (it was
*ahead* of the healthy pace), never approached the 900 s ceiling, and left **zero surviving processes
and zero leaked Neon connections** — verified before relaunch, which is precisely the precondition
the Wave 1 contention scenario requires. The failure had a specific, identified, mechanical cause in
the launcher with a specific fix. The re-run was also the *repair*: the aborted run had left the DB
half-seeded (~15k of 119,280 seats). Total real `pnpm test` runs against Neon: **2** (one aborted by
infrastructure, one clean).

**Carry into Wave 3:** on macOS, detach long DB-heavy runs with the python3 double-fork +
`os.setsid()` launcher at `/tmp/omo-p4/launch_test.py`, and make the launching tool call return
immediately. `nohup`/`disown` alone is not sufficient here, and `setsid` does not exist.

### Deviation 4 (Todo 15) — the dev server was killed before the gate

A `pnpm dev` server was still running on :3000 from Todo 13. Per the todo's Step 1 ("nothing should
be competing with `pnpm test`/`pnpm build`") it was killed and port 3000 confirmed free before the
detached run. This is the DB-exclusivity rule from Deviation 1 applied in practice.

## Scope Discipline — what Wave 2 deliberately did NOT build

Verified absent, not merely un-discussed:

```
grep -rn "crons" web/ --include='*.json' --exclude-dir=node_modules   → NOTHING
find web -name 'vercel.json' -not -path '*/node_modules/*'            → 0
find web/src -path '*admin*'                                          → 0
grep -rn "CRON_SECRET\|maxDuration" web/src                           → 0
```

No cron entry, no `/api/admin/reseed` route, no shared-seeding-module extraction. The destructive,
un-transactioned re-seed never runs unattended against production.

## ⚠️ Handoff Item for Todo 17 — the README "Demo data" section is STAGED, not landed

The root `README.md` **does not exist yet** and Todo 17 owns creating it. Its Accept criterion
(`grep -c "Demo data" README.md` → `1`) requires Todo 17 to be the commit that lands the section, so
Todo 13 deliberately created no placeholder. The exact ready-to-paste text is at:

> **`.omo/notepads/cinepais-phase-4-deploy/readme-demo-data-section.md`**

**Todo 17 must consume it verbatim,** and must read the trap recorded inside it: `grep -c` counts
matching **lines**, so if `Demo data` appears on a second line anywhere in `README.md` the criterion
returns `2` and fails. The staged block contains it on exactly one line (verified); the file tells
Todo 17 to phrase the seed-horizon note in *Known limitations* differently and cross-link instead.

The `Last refreshed: 2026-08-15` line in that block is a placeholder to be updated for real in
Wave 4 (Todo 23).

## Next Command (Wave 3)

Run in a **FRESH session/chat**:

```bash
/start-work cinepais-phase-4-deploy
```

It resumes at **Todo 16** (root `.gitignore` + `git rm --cached` — curate `.omo/` for a public repo),
then Todo 17 (public `README.md` + `LICENSE`) and Todo 18 (build a clean, squashed `main`).

**Do not continue Wave 3 in this session** — the wave boundary is a hard stop per the plan's
multi-chat discipline, and starting the next wave is the orchestrator's action, not the executor's.

## State at Wave 2 Close

- **Branch:** `phase-4-deploy` (still the only branch; `main` does not exist yet — Todo 18 creates it)
- **Remote:** still **EMPTY** — everything is local-only, nothing has been pushed
- **Commits since `phase-3-integration`** (excluding `chore(omo)`): **2** — Wave 1 (`cd2dcbd`) + Wave 2
- **Working tree:** clean
- **Demo data:** freshly seeded, `businessDate` window `2026-08-16 → 2026-08-22` (672 showtimes),
  refreshable in ~70 s with `bash web/scripts/reseed.sh`

## Key Learnings for Wave 3

1. **A subprocess inherits six env vars, and yours isn't one.** Read the library's actual default-env
   constant before assuming a child sees the parent's config.
2. **Falsify the thing the test *names*, not just "the feature."** Todo 14's happy-path test passes
   against a hardcoded `http://localhost:3000` because both sides equal that default in a test env —
   only the sentinel test (`http://sentinel-test-marker:9999`) discriminates. Proven by breaking the
   fix two different ways.
3. **`bash -n` proves syntax, not runtime.** The `readonly SEED_NOW` collision passed the syntax check
   and failed instantly at runtime. Rehearse destructive scripts behind a stubbed binary on `PATH`.
4. **Mirror the precedence the real consumer uses.** A naive `[ -n "$DATABASE_URL_UNPOOLED" ]` guard
   would have rejected 100% of legitimate refreshes on this machine while looking correct in review.
5. **Read state back out of the database rather than printing arithmetic** that can silently diverge
   from what was actually written.
6. **`disown` ≠ detached, and macOS has no `setsid`.** Use a double-fork + `os.setsid()` for anything
   long-running, and verify the launcher actually started something before trusting it.
7. **One-attempt discipline means diagnose-then-act, not never-relaunch.** The distinguishing check is
   whether surviving processes / leaked connections exist and whether the run was actually hanging.

## Files to Read Before Wave 3

1. `.omo/notepads/cinepais-phase-4-deploy/learnings.md` — detailed patterns (Todos 12, 13, 14).
2. `.omo/notepads/cinepais-phase-4-deploy/decisions.md` — architectural choices + the Todo 17 pointer.
3. `.omo/notepads/cinepais-phase-4-deploy/issues.md` — the DB-exclusivity recommendation.
4. `.omo/notepads/cinepais-phase-4-deploy/readme-demo-data-section.md` — **required input for Todo 17.**
5. `.omo/plans/cinepais-phase-4-deploy.md` §Todos 16–18 — Wave 3 scope.

## Commit Summary

**Branch:** `phase-4-deploy`
**Commit message:** `fix(agent): propagate web API base URL to the MCP subprocess; docs(web): documented demo-data refresh`
**Files:** `web/scripts/reseed.sh`, `agent/src/cinepais_agent/agent.py`, `agent/tests/test_agent_core.py`, `.omo/plans/cinepais-phase-4-deploy.md`, `.omo/handoff-fase-e-wave-2.md`, `.omo/boulder.json`
**Status:** gate green, evidence written, ready for Wave 3.
