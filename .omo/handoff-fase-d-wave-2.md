# Handoff: CinePaís Phase 3 Integration — Wave 2 Complete

**Date:** 2026-08-14  
**Branch:** `phase-3-integration`  
**Commit:** `feat(web): HITL seat pre-selection — preselect reducer action + ?preselect= URL contract` (run `git log --oneline -1` to get the exact SHA)

---

## 1. Wave Status Table

| Todo | Task | Status | Notes |
|------|------|--------|-------|
| 1 | Repo: branch + config + fixtures | ✓ Done | Wave 1 |
| 2 | Zod event schemas | ✓ Done | Wave 1 |
| 3 | WHATWG SSE parser | ✓ Done | Wave 1 |
| 4 | Streaming client | ✓ Done | Wave 1 |
| 5 | Wave 1 close: gate + commit + handoff | ✓ Done | Wave 1 |
| 6 | `preselect` reducer action | ✓ Done | Wave 2 |
| 7 | `?preselect=` URL contract + SeatMap | ✓ Done | Wave 2 |
| 8 | Playwright proof (4/4 scenarios) | ✓ Done | Wave 2 |
| 9 | Wave 2 close: gate + commit + handoff | ✓ Done | Wave 2 (this todo) |
| 10 | Copilot shell: floating bubble + panel | Pending | Wave 3 |
| 11 | Conversation streaming + activity indicator | Pending | Wave 3 |
| 12 | Recommendation card + CTA navigation | Pending | Wave 3 |
| 13 | Graceful limits + error handling | Pending | Wave 3 |
| 14 | Fixture-replay E2E tests | Pending | Wave 3 |
| 15 | Wave 3 close: gate + commit + handoff | Pending | Wave 3 |
| 16 | Live agent proof (2 real queries) | Pending | Wave 4 |
| 17 | README documentation | Pending | Wave 4 |
| 18 | Wave 4 close: final verification | Pending | Wave 4 |

---

## 2. What Was Actually Built

### New Files Created

| Path | Purpose |
|------|---------|
| `web/tests/selection-preselect.test.ts` | 13 tests for `preselect` reducer action (idempotency, max-4, orphan rule, wheelchair refusal, etc.) |

### Files Modified

| Path | Change | Lines |
|------|--------|-------|
| `web/src/lib/business/selection.ts` | Added `preselect` action to `SelectionAction` union; implemented `applyPreselect` logic via recursive `toggle` delegation | +77 (additive only) |
| `web/src/app/showtimes/[id]/page.tsx` | Added `searchParams: Promise<{ preselect?: string }>` parsing; cap at 8 entries; forward to `<SeatMap>` | +45 |
| `web/src/components/seats/seat-map.tsx` | Added `preselectSeatIds` prop; `useEffect` + `useRef` guard for one-time dispatch; `data-preselected="true"` + `outline-*` ring; Spanish banner with count + reason | +172 |

### Evidence Files (Force-Added)

| Path | Purpose |
|------|---------|
| `.omo/evidence/task-6-cinepais-phase-3-integration.txt` | Todo 6 evidence: RED→GREEN transcript, design decision (delegation pattern), mutation checks |
| `.omo/evidence/task-7-cinepais-phase-3-integration.txt` | Todo 7 evidence: gate commands (tsc/lint/build/test all EXIT=0), 127 tests pass, file diffs |
| `.omo/evidence/task-8-cinepais-phase-3-integration.txt` | Todo 8 evidence: 4/4 Playwright scenarios (happy/over-cap/wheelchair/garbage), zero LLM spend, screenshot |
| `.omo/evidence/task-8-preselect-happy.png` | Screenshot: 2 green pre-selected seats with banner |
| `.omo/evidence/task-9-cinepais-phase-3-integration.txt` | Todo 9 evidence: gate verification (this todo) |

---

## 3. Decisions Taken During Execution

### Design Decision: Delegation Pattern for `applyPreselect`

**Tension in the plan:** Todo 6's body says "reuse/extract a shared helper" but the acceptance criteria forbid any `-` lines inside the existing `toggle` body. Extracting would create those forbidden lines; duplicating would create drift.

**Resolution:** `applyPreselect` admits each candidate seat by calling `selectionReducer` recursively with a synthetic `{ type: "toggle" }` action. This satisfies both constraints:
- Zero duplication — max-4, orphan check, wheelchair exemption all enforced by the same code
- Zero `-` lines in `selection.ts` (only +77 lines, the `--- a/…` header is the only `-`)
- `wouldLeaveOrphan` is reached, not bypassed
- Matches the file's existing convention (line 83 already recurses for showtime-mismatch)

**Safety condition:** Input `seatIds` must be deduped before the loop (test 3 locks this via mutation M2).

### Tailwind Ring vs Outline Choice

**Issue:** The seat button's base has `ring-1 ring-inset ring-black/10`. Adding `ring-2 ring-primary` for the preselect annotation would be dropped by tailwind-merge, but `ring-inset` would survive and draw the ring INSIDE the 24px button.

**Resolution:** Use `outline-solid outline-2 outline-offset-1 outline-primary` instead. Zero conflict with the base ring, survives tailwind-merge, and `outline-primary` resolves to the existing token (verified in built CSS).

### Spanish Banner Copy — State-Descriptive, Not Past-Tense

**Issue:** Live-derived `appliedCount` changes when the user hand-deselects a copilot seat. Past-tense copy ("El copiloto pre-seleccionó 2 sillas") becomes false immediately, and the shortfall line ends up blaming a business rule for the user's own click.

**Resolution:** State-descriptive Spanish: `Tienes N sillas pre-seleccionadas por el copiloto. Revísalas y confirma — aún no se ha comprado nada.` Both the count and the "no purchase yet" statement remain true in every state.

### URL Preselect Cap at 8 Entries

**Decision:** Cap the parsed `?preselect=` array at 8 entries before it reaches the reducer. The reducer enforces max-4 anyway, but a hostile URL must not drive an unbounded loop.

---

## 4. Verification Evidence

### Gate Execution (All Four Commands)

```bash
# Command 1: pnpm lint
cd /Users/reiorozco/Dev/cinepais/web && pnpm lint
Exit code: 0
Result: No ESLint errors or warnings

# Command 2: npx tsc --noEmit
cd /Users/reiorozco/Dev/cinepais/web && npx tsc --noEmit
Exit code: 0
Result: No TypeScript errors

# Command 3: pnpm build
cd /Users/reiorozco/Dev/cinepais/web && pnpm build
Exit code: 0
Result: Production build successful
Routes: 10 (1 static, 9 dynamic)
/showtimes/[id] now Dynamic (reading searchParams opted it out of prerendering)

# Command 4: pnpm test (FULL SUITE)
cd /Users/reiorozco/Dev/cinepais/web && pnpm test
Exit code: 0
Result: 127 tests across 10 files, all pass
  - cutoff.test.ts: 4 tests ✓
  - orphan-rule.test.ts: 7 tests ✓
  - selection.test.ts: 8 tests ✓ (Wave 1, untouched)
  - selection-preselect.test.ts: 13 tests ✓ (Wave 2 Todo 6)
  - agent-sse.test.ts: 27 tests ✓ (Wave 1)
  - pricing.test.ts: 19 tests ✓
  - schemas.test.ts: 7 tests ✓
  - agent-events.test.ts: 27 tests ✓ (Wave 1)
  - agent-client.test.ts: 12 tests ✓ (Wave 1)
  - seed-determinism.test.ts: 3 tests ✓ (Wave 1, slow but passes)
Duration: ~5-12 minutes (seed-determinism.test.ts alone accounts for ~300-500s because it seeds the Neon DB three times)
```

### Todo 6 Verification

- **Tests:** 13/13 pass (selection-preselect.test.ts)
- **Coverage:** idempotency (run twice → identical output), max-4 cap, unknown/sold/wheelchair drops, orphan rule, showtime replacement
- **Mutation checks:** M1 (wheelchair guard), M2 (dedup guard), M3 (idempotency via EMPTY_STATE) each turn exactly 1 test RED when removed
- **Diff:** +77 lines, zero `-` lines inside existing toggle/clear bodies

### Todo 7 Verification

- **Files:** page.tsx (+45 lines), seat-map.tsx (+172 lines)
- **Tests:** 127 tests pass (includes seed-determinism.test.ts from Wave 1)
- **Build:** EXIT=0, /showtimes/[id] now Dynamic
- **Lint:** EXIT=0 (no eslint-disable needed for dispatch in useEffect)
- **TSC:** EXIT=0

### Todo 8 Verification

- **Scenarios:** 4/4 pass
  1. Happy: 2 adjacent seats pre-selected, banner shows count, total $64.000 ✓
  2. Over-cap: 5 seats → 4 applied, error="max", total $128.000 ✓
  3. Wheelchair: wheelchair seat NOT selected, other 2 applied, total $64.000 ✓
  4. Garbage: invalid seat ids handled gracefully, 0 preselected, page renders ✓
- **LLM spend:** $0.00 (agent never started, zero /chat calls)
- **Console errors:** Zero uncaught exceptions
- **Screenshot:** task-8-preselect-happy.png captured

---

## 5. What Remains

### Wave 3 Todos (Starting at Todo 10) — Widget UI

| Todo | Task | First Action |
|------|------|--------------|
| 10 | Copilot shell: floating bubble + panel mounted in root layout | Create `web/src/components/copilot/` with bubble + panel components; mount in `web/src/app/layout.tsx` |
| 11 | Conversation streaming + activity indicator | Wire `streamChat()` from Todo 4; render token stream; show `tool_call` activity label |
| 12 | Recommendation card + CTA navigation | Render from `recommendation` event payload; CTA navigates to `/showtimes/<id>?preselect=<seatIds>` |
| 13 | Graceful limits + error handling | Handle 429, `session_cap_exceeded`, `input_too_long`, transport failures; surface `sessionQueriesUsed`/`sessionQueryCap` |
| 14 | Fixture-replay E2E tests | `page.route()` intercept `/chat`; fulfill with fixtures from `web/tests/fixtures/agent-sse/` |
| 15 | Wave 3 close: gate + commit + handoff | Full gate: `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `pnpm build` all exit 0 |

**Key Constraints:**
- Do NOT modify `CityProvider`, `SelectionProvider`, `Header`, `Footer` (Wave 1 exception for CityProvider is closed)
- Do NOT touch `agent/`
- Do NOT add new runtime dependencies
- All UI copy Spanish, all code English

---

## 6. Context the Next Chat Needs

### Running Servers

**Status:** None left running.
- Dev server (`pnpm dev`) was NOT started in this session
- Agent server (Fly.io) is NOT deployed yet (Wave 4 task)

### Database State

**Seed Parameters Used:**
- `SEED=20260801`
- `SEED_NOW=2026-08-15` (computed as `date.today() + 1 day` on 2026-08-14)

**Seed State:**
- 119,280 seats across 672 showtimes
- 10 films, 2 cities (Bogotá, Medellín), 6 sites
- All showtimes have `businessDate=2026-08-15` (strictly future, 15-min cutoff excludes nothing)

**To Resume with Same State:**
```bash
cd /Users/reiorozco/Dev/cinepais/web
SEED_NOW=$(python3 -c "from datetime import date, timedelta; print((date.today()+timedelta(days=1)).strftime('%Y-%m-%d'))")
TZ=America/Bogota SEED=20260801 SEED_NOW=$SEED_NOW pnpm prisma db seed
```

**Pre-flight check (must return non-empty array, not `[]`):**
```bash
curl -s "http://localhost:3000/api/showtimes?filmId=film-01" | head -c 200
```

### Branch & Commit Info

- **Branch:** `phase-3-integration`
- **Last Commit:** `feat(web): HITL seat pre-selection — preselect reducer action + ?preselect= URL contract` (run `git log --oneline -1` to get the exact SHA)
- **Remote:** None configured (no push performed)

### Known-Good Regression URL

For Wave 3 QA, use this URL to verify preselect still works:
```
http://localhost:3000/showtimes/st-site-med-3-imax-0-1930?preselect=1_1_10,1_1_11
```

Expected result:
- 2 green seats (1_1_10, 1_1_11)
- Banner: `Tienes 2 sillas pre-seleccionadas por el copiloto. Revísalas y confirma — aún no se ha comprado nada.`
- Total: $64.000

**Note:** The showtime id `st-site-med-3-imax-0-1930` is stable for IMAX rooms across re-seeds (it's the first IMAX showtime in the seed). The seat ids `1_1_10,1_1_11` are layout-stable for any IMAX room (row 1, cols 10-11, always in block [1,5]).

---

## 7. Traps and Advisories

### Advisory: Full Test Suite is Slow (Not Broken)

**Issue:** The full `pnpm test` suite takes 5-12 minutes to complete. The `seed-determinism.test.ts` file alone accounts for ~300-500s because it seeds the Neon DB three times (once per test: "seed is deterministic", "sampled seats are identical", "planted scenarios are present"). This is documented in Wave 1's own handoff (line 436: "The full suite runs 667s, of which `seed-determinism.test.ts` alone is 517s").

**Critical:** Do NOT exclude this test from the gate. The plan's acceptance criteria require `pnpm test` (full suite, no exclusions) to exit 0. The test is slow but passes.

**Mitigation for future sessions:** Launch the full suite detached with an exit-code-file poll (never use a short shell timeout that could SIGTERM it mid-run). Do NOT run `pnpm test` concurrently with another session's `pnpm test` — the shared Neon DB will produce FK constraint errors (documented in this plan's notepad).

### Advisory: Contract Under-Specification (Fase E)

**Issue:** `agent/docs/sse-contract.md` does not document that `priceFrom` can be `null` in `RecommendationEvent` when `no_availability` outcome is sent.

**Action:** In Fase E, update the contract example to show `priceFrom: null` for `no_availability`. Current status: Python implementation is correct (nullable). Do NOT edit contract in Wave 3.

### Advisory: Ref-Guard Key Scheme (Wave 3 will need this)

The `useRef` guard in `seat-map.tsx` uses this key scheme:
```ts
const preselectKey = `${showtime.id}:${preselectRequest.join(",")}`;
```

Wave 3's chat widget CTA (Todo 12) will do:
```ts
router.push('/showtimes/'+id+'?preselect='+seatIds.join(','))
```

The ref guard ensures one-time dispatch even on soft navigation (fresh array, same contents).

### Advisory: Tailwind Merge Behavior

The `outline-*` classes survive tailwind-merge where `ring-*` would not. Verified in built CSS: `.outline-primary{outline-color:var(--primary)}` resolves to the existing token. Do NOT switch back to `ring-*` for the preselect annotation.

---

## 8. Resume Instruction

### To Continue Wave 3 in a Fresh Chat

1. **Open a new chat session.**
2. **Feed it this handoff file:**
   ```bash
   cat /Users/reiorozco/Dev/cinepais/.omo/handoff-fase-d-wave-2.md
   ```
3. **Start with Todo 10:**
   ```bash
   /start-work cinepais-phase-3-integration
   ```
   Then select Todo 10 from the plan.

4. **Verify branch and commit:**
   ```bash
   cd /Users/reiorozco/Dev/cinepais
   git branch --show-current  # Should print: phase-3-integration
   git log --oneline -1       # Should print: feat(web): HITL seat pre-selection...
   ```

5. **Re-seed if the calendar day rolled over:**
   ```bash
   cd /Users/reiorozco/Dev/cinepais/web
   SEED_NOW=$(python3 -c "from datetime import date, timedelta; print((date.today()+timedelta(days=1)).strftime('%Y-%m-%d'))")
   TZ=America/Bogota SEED=20260801 SEED_NOW=$SEED_NOW pnpm prisma db seed
   ```

6. **Pre-flight check (must return non-empty array):**
   ```bash
   curl -s "http://localhost:3000/api/showtimes?filmId=film-01" | head -c 200
   ```

7. **Run the gate to confirm clean state:**
   ```bash
   cd /Users/reiorozco/Dev/cinepais/web
   pnpm lint && npx tsc --noEmit && pnpm build && pnpm test
   ```
   All four should exit 0. The full `pnpm test` suite takes 5-12 minutes (seed-determinism.test.ts alone is ~300-500s). Launch it detached with an exit-code-file poll, never with a short shell timeout.

8. **Begin Todo 10:**
   - Read the plan lines 310-330 for full spec
   - Create `web/src/components/copilot/` with bubble + panel components
   - Mount in `web/src/app/layout.tsx` (root layout, survives navigation)
   - Floating bubble bottom-right, opens panel on click
   - Panel has message list, input field (2000-char guard), 4 hardcoded Spanish suggestion chips

---

**Wave 2 Status:** ✓ COMPLETE (Todos 6-9)  
**Wave 3 Status:** Ready to start (Todos 10-15)  
**Next Session:** Fresh chat with this handoff file, start at Todo 10

---
