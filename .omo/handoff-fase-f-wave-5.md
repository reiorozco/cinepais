# Fase F — Wave 5 handoff (Todos 22–27)

**Wave 5 is closed.** It was the only wave that touched production deliberately and the only one that
spent money. Everything is merged, pushed, deployed, re-seeded and proven live.

> **Scope note.** The phase-wide summary — all five waves, every measurement, the full deviation list and
> the findings carried forward — lives in **`.omo/handoff-fase-f-final.md`**. This file exists because
> plan §Wave boundaries rule 5 requires *every* wave to write `handoff-fase-f-wave-<N>.md`, and the
> Final Verification Wave's F1 checks `git ls-files .omo/handoff-fase-f-wave-*.md | wc -l` → **5**. Read
> the `-final` note for the phase; read this one for Wave 5 specifically.

- **Branch:** `main` (Todo 22 merged `phase-5-refinement`; Todos 26–27 committed directly on `main`)
- **Commit:** `docs: demo script, API contract, and seat-quality documentation`
- **LLM spend this wave: 2 `/chat`. Cumulative: 2 of 4.** All of the phase's spend happened here.
- **Deviations this wave: 1** (see §5).

---

## 1. What shipped

### Todo 22 — merge, curate, migrate, push
Merged `phase-5-refinement` into `main`. Verified Fase E's publication curation survived the merge
(moved here from Todo 27 by the adversarial review, deliberately *ahead* of the destructive steps).
Pointed `DATABASE_URL_UNPOOLED` explicitly at production via
`vercel env pull .env.production.local --environment=production`, then ran `prisma migrate deploy`, which
reported **`No pending migrations to apply`** — the expected answer, because Wave 2 had already applied
`20260820041341_add_film_status` and there is only one database. Only then pushed.
Evidence: `.omo/evidence/task-22-cinepais-phase-5-refinement.txt`

### Todo 23 — re-seed production
The single riskiest operation of the phase. `seed.ts` deletes the whole catalogue across ~24 unbatched
`createMany` calls with **no transaction** — the exact operation that stalled at ~seat 110 000 in Fase E
and cost 10+ hours. It ran once, completed normally, and was not retried.
Evidence: `.omo/evidence/task-23-cinepais-phase-5-refinement.txt`

### Todo 24 — redeploy both halves
Web to Vercel, agent to Fly.io. Fly cost controls confirmed **untouched**: `min_machines_running = 0`
and `hard_limit = 5` still set. Zero LLM spend (the `fly ssh` probe genuinely costs nothing).
Evidence: `.omo/evidence/task-24-cinepais-phase-5-refinement.txt`

### Todo 25 — live proof (the only money spent in the entire phase)
Two `POST /chat` calls against the deployed pair, both announced beforehand, both HTTP 200.

| # | Query | Result |
|---|---|---|
| 1 | IMAX / Bogotá / 2 seats / evening — the user's original failing query, verbatim | `st-site-bog-3-imax-4-2245`, seats `1_7_10, 1_7_11` (**G10, G11**), **distance 0.0 from room centre**, city anchored correctly, room **95.0% available**, ~28 s warm |
| 2 | 2D / Medellín / 3 seats / weekend afternoon, fresh session | `st-site-med-3-2d-1-2-2245`, seats `1_6_9, 1_6_10, 1_6_11` (**F9, F10, F11**), city anchored correctly, room **75.6% available**, ~31 s warm |

Call 1 landing at **distance 0.0** is the direct live proof that Wave 1's D2 change worked — the same
shaped query previously returned the front-left corner. The HITL CTA was confirmed working end-to-end.
Evidence: `.omo/evidence/task-25-cinepais-phase-5-refinement.txt` + 7 PNGs (`task-25-call1-*`,
`task-25-call2-*`), plus 2 appended lines in
`.omo/evidence/llm-spend-cinepais-phase-5-refinement.txt`.

### Todo 26 — documentation truth pass
Killed the **proportional row-tier claim in all three places** it lived: deleted
`web/src/lib/business/quality.ts` (`rowToTier()`, zero call sites), removed `row_to_tier` from
`agent/src/cinepais_agent/seating.py` together with the assertions that locked in the proportional rule,
and rewrote `seating.py`'s module docstring, which had asserted *"The CODE is canonical … row 3/13 ≈
0.2308 > 0.23, so row 3 is 'optimal', not 'low'"* — false, and the most persuasive statement of the error
anywhere in the repo. The agent never computes tiers; it receives `seat.qualityTier` over the wire.

Both READMEs kept the fixed cutoffs (rows 1–3 `low`, 4–8 `optimal`, 9+ `high` — these were always
correct) and lost the "scaled proportionally" clause, now pointing at `seed.ts`'s `getSeatMeta()`.
`agent/docs/sse-contract.md` gained the `city` request field. `specs/003-demo-script.md` was updated for
the new reality and **the recording block removed — the video is unblocked.**
Evidence: `.omo/evidence/task-26-cinepais-phase-5-refinement.txt`

### Todo 27 — this close
Step 0 plus the standard gate, all seven steps, plus both handoff notes and the commit.

---

## 2. Step 0 — the phase's most dangerous single line

Run first, alone, before any gate step.

```bash
unset DATABASE_URL_UNPOOLED
rm -f web/.env.production.local
cd web && node -e 'require("dotenv").config({path:".env.local"}); …'   # -> ec264e7be82e
```

**What was actually found.** The shell export from Todos 22/23 had **not** survived into this session —
recorded honestly rather than claimed as a save. The *other* half of the hazard was live: 
`web/.env.production.local` existed (3 406 bytes, written 02:40). That file is the one that matters
beyond this todo — Next.js loads `.env.$(NODE_ENV).local` at **highest precedence**, so leaving it behind
silently repoints every future local production build in this repo. It is gitignored (`web/.gitignore:34`
`.env*`) and only `web/.env.example` is tracked, so this was about **precedence, not leakage**.

Hash re-confirmed through `.env.local` alone: **`ec264e7be82e`** — the expected value.

Confirmed downstream at step (e), where `reseed.sh` reported
`DATABASE_URL_UNPOOLED: resolved from .../web/.env.local (118 chars)` — the documented fallback
precedence genuinely exercised, not bypassed.

**Honest note, as the plan requires:** because there is exactly one Neon database, unsetting did not
change *which* database was hit. It removed a second, invisible path to it. **The re-seed at step (e) is
what actually protected the demo.**

---

## 3. The gate — all seven steps, in order

| Step | Command | Exit | Measured |
|---|---|---|---|
| 0 | unset + `rm` + hash | **0** | `ec264e7be82e` via `.env.local` |
| (a) | `uv run ruff check .` | **0** | All checks passed! |
| (a) | `uv run basedpyright` | **0** | 0 errors, 0 warnings, 0 notes |
| (a) | `uv run pytest tests/ -m "not evals" -q` | **0** | **158 passed, 1 skipped, 15 deselected**, 10.65 s |
| (b) | `pnpm lint` | **0** | eslint, no findings |
| (c) | `npx tsc --noEmit` | **0** | no output |
| (d) | detached `pnpm test` | **0** | **13 files / 166 tests**, **452.16 s** |
| (e) | `bash web/scripts/reseed.sh` | **0** | **90 s** · 672 showtimes · 119 280 seats · `2026-08-21 → 2026-08-27` |
| (f) | `curl` **deployed** `…?filmId=film-01` | **0** | **non-empty**, 87 showtimes, 19 127 bytes |
| (g) | `pnpm build` | **0** | 10/10 static pages, 12 routes |

**(d) and (e) are one unit, and (d) really did take the demo down.** `pnpm test` re-seeds three times at
the hardcoded past `SEED_NOW = "2026-08-01"`, which is unconditional. Between (d) and (e) the live
catalogue was genuinely outside the purchasable window. Step (e) is the remedy the plan mandates, and it
is what made this todo's own final check reachable.

Both (d) and (e) were launched detached with exit-code files and polled — **one attempt each**, no blind
retry, both far inside the 15-minute ceiling.

**The pytest skip is not a regression.** `agent/tests/test_api_client.py:300` skips itself with *"Web
server not reachable on localhost:3000"*. No dev server ran in this session, correctly — this wave
verifies **production**, not localhost. Wave 2 saw `159 passed` only because a dev server happened to be
up. The same 159 are collected either way.

**Step (f) was run against `https://cinepais.vercel.app`, not localhost** — the one wave where the gate's
catalogue check targets the deployed URL, because production is what matters now.

```
[{"id":"st-site-med-1-2d-2-0-1400","filmId":"film-01","siteId":"site-med-1",
  "siteName":"CinePaís El Poblado","city":"Medellín","businessDate":"2026-08-21",
  "time":"14:00","room":"2d-2","formats":["2D
BYTES=19127 · ARRAY_LENGTH=87 · IS_NON_EMPTY_ARRAY=true
```

Re-seed timing in context: **W1 35 s · W2 49 s · W3 84 s · W4 74 s · W5 90 s.** The Fase E stall
signature never recurred.

Full receipt: `.omo/evidence/wave-5-closed-cinepais-phase-5-refinement.txt`

---

## 4. Verified state at close

- Working tree clean · `git log --oneline origin/main..main | wc -l` → **0**
- `https://cinepais.vercel.app` → **200** · `https://cinepais-agent.fly.dev/health` → **200** `{"status":"ok"}`
- Publication curation:
  `git log --oneline main -- '.omo/evidence/*' '.omo/run-continuation/*' '.omo/notepads/*' | wc -l` → **0**
  (positive control `.omo/plans/*` → **16**)
- All six phase branches intact; no history rewritten
- Database freshly seeded, window `2026-08-21 → 2026-08-27`

---

## 5. Deviation

**One.** Todo 27 names `.omo/handoff-fase-f-final.md` as the wave's handoff, but plan §Wave boundaries
rule 5 requires every wave to write `.omo/handoff-fase-f-wave-<N>.md`, and F1 checks that the count of
those is **5**. Only four existed. Writing only the `-final` file would have made F1 report a false
breach — the exact failure Fase E suffered when that rule lived only in a global section. **Both files
were written and both are in this wave's commit.**

Nothing else deviated. No gate step was retried and the diagnostic ladder was never entered.

Recorded so F5 does not misfile it: Step 0 found the shell export already unset, contrary to the plan's
expectation. The sibling hazard (`web/.env.production.local`) *was* present and was removed, so the step
earned its place regardless.

---

## 6. What remains

**The Final Verification Wave, F1–F5** — plan compliance audit, code quality review, security review,
hands-on QA against the deployed site (browsing only, **zero spend**), and scope fidelity. Run by the
orchestrator, in parallel, never by the executor. No lane switches branches, no lane re-seeds while
another runs, only one lane drives a browser, and **no lane spends an LLM call.** All five must APPROVE.

**And the one human step: record the demo video. It is now unblocked** — `specs/003-demo-script.md` is
the shot list, updated by Todo 26 and with its recording block removed.

Two practical notes before recording: the catalogue window closes **2026-08-27** (re-seed first if that
date has passed), and the copilot's first question after an idle period pays a **~9.5 s** cold start, so
a throwaway warm-up question helps — though it costs a `/chat` call against whatever budget the next
phase sets. This phase's ceiling does not carry over.
