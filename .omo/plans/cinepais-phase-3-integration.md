# cinepais-phase-3-integration - Work Plan

## TL;DR (For humans)

**What you'll get:** The CinePaís copilot living inside the web app. A floating bubble opens a Spanish chat panel that streams the agent's answer token by token, shows what it is doing while a 45-second tool call runs, and renders a structured recommendation card built only from the `recommendation` event. Accept the recommendation and the app navigates to that showtime and pre-selects the suggested seats on the map — highlighted, validated against the real business rules, never purchased — waiting for you to confirm. Sold-out alternatives show up honestly as disabled "Agotada" entries instead of pretending to be buyable.

**Why this approach:** The widget lives in the root layout, which Next.js does not remount on client navigation, so the conversation survives the jump to the seat map and both are visible in one frame — that is the "antes vs. después" shot. The intent to pre-select travels as a URL query param (`/showtimes/<id>?preselect=1_4_7,1_4_8`) rather than hidden state, which makes the whole HITL feature provable by navigating to a hand-typed URL with no LLM in the loop. Pre-selection goes through a new idempotent `preselect` reducer action instead of a loop of `toggle`s, because `toggle` is not idempotent and React 19 StrictMode would silently deselect everything in dev. No new runtime dependencies: the SSE parser is ~60 lines of pure, unit-tested code.

**What it will NOT do:** No changes to `agent/` and no changes to the frozen SSE contract. No `main` branch, no deploy, no push (Fase E). No new runtime dependencies, no jsdom, no testing-library. No re-authoring the Spanish error copy the agent already sends. No AI added anywhere — Fase D is 100% deterministic.

**Effort:** Large
**Risk:** Medium-low — the real risk is an agent recommendation the reducer legitimately rejects (orphan rule); handled by returning a partial selection plus a Spanish explanation, locked by a dedicated unit test.

**Cost:** 2 real Gemini queries, in the last wave only. Every other verification runs off captured Fase C fixtures at zero spend.

**Decisions locked with you:** branch `phase-3-integration` off `phase-2-agent` (no `main` yet) · browser talks to the agent DIRECTLY via `NEXT_PUBLIC_AGENT_URL` (a proxy would collapse the agent's per-IP rate limit into a global one and hit Vercel's ~25s streaming cap against 45s tool turns) · floating bubble bottom-right · fixture-replay verification with 2 live queries at the end.

**Executing this plan across several chats:** every wave ends with a mandatory handoff todo that writes `.omo/handoff-fase-d-wave-<N>.md` and then STOPS. Start the next wave in a fresh chat, feeding it that handoff file. That is a hard gate, not a suggestion.

Your next move: run `/start-work cinepais-phase-3-integration` in a fresh chat. It will execute Wave 1 and stop at the handoff.

---

> TL;DR (machine): Large effort, Medium-low risk. Chat copilot widget in `web/` consuming the frozen agent SSE contract, plus HITL seat pre-selection via a `?preselect=` URL contract and a new idempotent `preselect` reducer action. Zero new runtime deps, zero new AI. 18 todos across 4 waves, each wave ending in a blocking handoff + commit, then 4 final verifiers. Branch `phase-3-integration`, no push. Verification is fixture-replay (0 spend) except a 2-query live proof in Wave 4.

## Scope

### Must have

1. Branch `phase-3-integration` created off `phase-2-agent`; all commits land there; **no push**, **no `main`**.
2. `NEXT_PUBLIC_AGENT_URL` (default `http://localhost:8000`) documented in `web/.env.example` and read through one typed accessor — never hardcoded at call sites.
3. `web/src/lib/agent/sse.ts`: a pure, incremental, WHATWG-compliant SSE frame parser. Normalizes `\r\n` and `\r` to `\n` BEFORE splitting, strips exactly one leading space after `:`, treats `:`-prefixed lines as comments, dispatches on blank line, and correctly buffers a frame split across chunk boundaries.
4. `web/src/lib/agent/events.ts`: Zod schemas for all five events, mirroring `agent/src/cinepais_agent/events.py` EXACTLY — including `Alternative.qualityTier` nullable, `RecommendationEvent.qualityTier` nullable, and **`RecommendationEvent.priceFrom` nullable** (`events.py:47` is `int | None`; the contract doc's example value `32000` under-specifies this).
5. `web/src/lib/agent/client.ts`: `streamChat()` using `fetch` + `response.body.getReader()` + `AbortController`, mapping non-OK HTTP responses (notably 429, which carries no SSE body) and network/CORS failures into the same `error` event shape the rest of the app consumes.
6. New `{ type: "preselect" }` action in `web/src/lib/business/selection.ts`: **assigns** a validated selection (idempotent), enforcing max-4, the per-block orphan rule, and skipping wheelchair seats. Additive — `toggle` and `clear` and their existing tests are untouched.
7. `/showtimes/[id]` accepts `?preselect=<comma-separated seatIds>`, forwards it to `<SeatMap>`, which applies it exactly once behind a ref guard, marks those seats with `data-preselected="true"` plus a distinct ring, and shows a Spanish banner explaining the copilot pre-selected them.
8. Chat widget mounted in `web/src/app/layout.tsx`: floating bubble bottom-right opening a panel; message list; token streaming; `tool_call` activity indicator; 2000-char client-side input guard; `sessionId` via `crypto.randomUUID()` persisted in `sessionStorage`; 4 hardcoded Spanish suggestion chips targeting the planted seed scenarios.
9. Recommendation card rendered from the `recommendation` payload only, **last event of the turn wins**; alternatives list where `qualityTier === null` renders disabled with an "Agotada" badge on every outcome; card CTA navigates to `/showtimes/<showtimeId>?preselect=<seatIds>` with the panel staying open.
10. Graceful limits: 429, `session_cap_exceeded`, `input_too_long`, transport/CORS failure, and the `done` event's `sessionQueriesUsed`/`sessionQueryCap` surfaced when the cap is close.
11. SSE fixtures copied out of the gitignored `.omo/evidence/` into tracked `web/tests/fixtures/agent-sse/`, and Playwright `page.route()` E2E replaying them — zero LLM spend.
12. Exactly 2 live agent queries in Wave 4 proving real browser→`:8000` wiring (CORS, streaming, 429 shape).
13. `web/README.md` documents the copilot, the `?preselect=` URL contract, and `NEXT_PUBLIC_AGENT_URL`.
14. Four wave commits, conventional messages, no attribution lines, no push.
15. A handoff file per wave at `.omo/handoff-fase-d-wave-<N>.md`, after which execution STOPS.

### Authorized scope exception (added 2026-08-14 by the planner, after Wave 1)

**The lint baseline was NOT clean when this plan was written, and the plan did not check it.** `pnpm lint`
exit 0 is mandated as a wave gate, but Fase B code carried pre-existing `react-hooks/set-state-in-effect`
errors, making the gate unreachable without repairing them. Wave 1 therefore modified three Fase B UI files.
This is **authorized retroactively** — it was a plan defect, not executor overreach:

| File | Change | Why it was unavoidable |
|---|---|---|
| `web/src/components/providers/city-provider.tsx` | `useState`+`useEffect` → `useSyncExternalStore` (`subscribe`/`getSnapshot`/`getServerSnapshot`) | pre-existing lint error; the first fix attempt (lazy `useState` initializer) caused a real SSR hydration mismatch, caught by live QA and reverted |
| `web/src/components/films/showtimes-explorer.tsx` | `useEffect` retained with two justified `eslint-disable-next-line` comments | pre-existing lint error; the first fix attempt (key-based Accordion reset) silently broke first-cinema auto-expand, caught by live QA and reverted |
| `web/src/components/seats/seat-map.tsx` | removed an unused `row` parameter from `SeatRow` | pre-existing `@typescript-eslint/no-unused-vars` warning |

**F4 must NOT file these three as scope violations.** F4 MUST still verify that (a) each change is limited to
what this table describes, and (b) the shipped implementation matches the table — specifically
`useSyncExternalStore` in `city-provider.tsx` and the retained `useEffect` in `showtimes-explorer.tsx`, NOT the
rejected first attempts that `.omo/handoff-fase-d-wave-1.md` §4 erroneously documents (see that file's
ADDENDUM §C2).

**This exception is closed.** It authorizes nothing beyond the three rows above. Wave 3's Todo 10 guardrail
("must NOT modify `CityProvider`") remains in force for all remaining waves.

### Must NOT have (guardrails, anti-slop, scope boundaries)

- **NO changes to `agent/`** — not one file. The SSE contract is FROZEN; the widget adapts to it.
- **NO edits to `agent/docs/sse-contract.md`.** If a mismatch with `events.py` is found, record it in the handoff as an advisory for Fase E; do not "fix" the contract.
- **NO `main` branch, NO push, NO deploy config, NO Fly.io/Vercel changes.**
- **NO new runtime dependencies.** Explicitly banned: `@microsoft/fetch-event-source`, `eventsource-parser`, `ai`/Vercel AI SDK, `zustand`, `redux`, `react-query`, `swr`, `axios`, `socket.io`, `date-fns`/`dayjs`.
- **NO jsdom, NO @testing-library/***, NO Playwright as an npm dependency.** UI verification uses the Playwright MCP tools; logic verification uses the existing node-env Vitest.
- **NO Next.js Route Handler proxy for `/chat`** — decided against; it collapses the agent's per-IP rate limit into a global bucket and adds Vercel's streaming duration cap to a 45s path.
- **NO parsing of LLM prose** to derive showtime/seat/price data. The `recommendation` payload is the only structured source, per `sse-contract.md:74`.
- **NO bypass of the selection business rules.** Pre-selection MUST route through `selectionReducer`; never write `selectedSeatIds` directly.
- **NO signature or behaviour change to `toggle` / `clear` / `wouldLeaveOrphan` / `normalizeRoom`.** Their existing tests must pass unmodified.
- **NO auto-selection of wheelchair seats**, ever, including via `?preselect=`.
- **NO truncation heuristic** on assistant prose. `MAX_OUTPUT_TOKENS=1024` can cut mid-sentence and the contract emits no truncation signal; inventing one is guessing. The card carries the actionable data.
- **NO English UI copy.** All user-visible strings Spanish; all code, filenames, identifiers and comments English.
- **NO CineColombia** name, logo, or real endpoints.
- **NO mock/dev-only agent route shipped in the product bundle.** Fixture replay happens in the test harness only.
- **NO fabricated evidence.** Every number in an evidence file comes from a real captured command. If an assert fails, STOP and report the raw payload — never weaken the test.
- **NO edits by the executor to this plan's prose or acceptance criteria.** Checkboxes, boulder state, drafts and notepads only.

## Verification strategy

> Zero human intervention — all verification is agent-executed.

- **Test decision: TDD for all pure logic** (SSE parser, Zod schemas, `preselect` reducer action) — tests written first and proven RED before the implementation. Tests-after (smoke + Playwright) for UI. Framework: the existing Vitest 2 in `web/` (`environment: "node"`, `include: ["tests/**/*.test.ts"]`). Exit codes are the gate, never output-text greps as primary evidence.
- **Exact commands** (all run from `/Users/reiorozco/Dev/cinepais/web`): `pnpm test` · `pnpm lint` · `npx tsc --noEmit` · `pnpm build` · `pnpm dev`. **There is no `typecheck` script and no Prettier** — do not invent them.
- **UI verification:** Playwright MCP (`browser_navigate`, `browser_snapshot`, `browser_evaluate`, `browser_take_screenshot`, `browser_run_code_unsafe` for `page.route()`). Dev server: `cd web && (pnpm dev > /tmp/fase-d-web.log 2>&1 &)`, wait for HTTP 200, kill afterwards.
- **Fixture replay (the zero-spend backbone):** `page.route("**/chat", ...)` fulfils with `contentType: "text/event-stream"` and a fixture body from `web/tests/fixtures/agent-sse/`.
- **PROVEN MECHANISM + ITS LIMITS (measured during planning, do not re-litigate).** A live probe confirmed: cross-origin `POST` to `http://localhost:8000/chat` IS intercepted; `route.fulfill` with `text/event-stream` yields a working `res.body.getReader()`; all 5 named events arrive in order; Spanish accents survive the `TextDecoder` path; `status: 429` with a JSON body is deliverable; and `route.abort("failed")` surfaces in-page as `TypeError: Failed to fetch` (so that is what Todo 4's `agent_unreachable` branch must catch). **Three hard limits follow, and the acceptance criteria below are written around them:**
  1. **`route.fulfill` delivers the whole body in ONE reader chunk** (`readerChunks: 1`, measured). Fixture tests therefore CANNOT observe incremental token rendering or a mid-flight tool-activity label — everything lands in a single tick. Incrementality is asserted ONLY in the live run (Todo 16); chunk-boundary correctness is asserted ONLY byte-at-a-time in Vitest (Todo 3). Never write a fixture criterion that depends on timing.
  2. **No CORS preflight is exercised** (`preflight: 0`, measured — fulfilling satisfies it without a separate `OPTIONS` round trip). Real CORS is proven ONLY by Todo 16.
  3. **A 429 or an aborted request emits a browser-level console error** (`Failed to load resource: … 429`, `net::ERR_FAILED`). These are the browser reporting a failed network resource, NOT application defects. Any "zero console errors" criterion MUST exclude `Failed to load resource` entries and assert on uncaught exceptions / React error boundaries instead. Real captures come from `.omo/evidence/f3-fixes-r6-qa1.txt|qa2.txt|qa3.txt` (verbatim wire format, verified present). Synthetic fixtures for shapes not present in the captures MUST carry a header comment naming them synthetic and citing the contract section they were derived from — a synthetic test input is legitimate; presenting one as a captured run is not.
- **Next 16.3 convention guard:** before ANY page/component work the executor reads the relevant guide under `web/node_modules/next/dist/docs/` (mandated by `web/AGENTS.md`) — training-data Next.js conventions are stale.
- **LSP diagnostics:** zero errors in touched files before closing each todo.
- **Evidence:** `/Users/reiorozco/Dev/cinepais/.omo/evidence/task-<N>-cinepais-phase-3-integration.<ext>`. `.gitignore:26` ignores `.omo/evidence/`, so committing evidence requires `git add -f`.
- **STOP rule (inherited from Fase C, non-negotiable):** if an assert fails, stop and report the raw payload. Never weaken a test to make it pass. Never assert on LLM trajectory in an E2E test — that guarantee belongs in unit tests.

## Execution strategy

### Waves and the handoff gate

Four waves. **Each wave ends with a blocking handoff todo. When that todo completes, execution STOPS — the executor reports that the wave is done and instructs the user to open a fresh chat for the next wave.** This exists because a long plan in one chat degrades context quality; each wave is sized to finish comfortably inside one session.

**Handoff correctness rules (added 2026-08-14 after the Wave 1 handoff shipped two defects — both are now mandatory checks before any handoff is committed):**

1. **Never hardcode a date-derived value.** The Wave 1 handoff told the next session to seed `SEED_NOW=2026-08-01`, which by then was two weeks in the past; the 15-minute cutoff would have emptied `/api/showtimes` and Todo 8 would have failed looking like a code bug. Any handoff that mentions seeding MUST give the **recompute command**, never a literal date:
   `SEED_NOW=$(python3 -c "from datetime import date, timedelta; print((date.today()+timedelta(days=1)).strftime('%Y-%m-%d'))")`
   and MUST include the pre-flight `curl -s "http://localhost:3000/api/showtimes?filmId=film-01"` with the note that `[]` means re-seed.
2. **A handoff's "what was built" section must be re-read against the actual files before committing.** The Wave 1 handoff's §4 *Verification* documented the two implementations QA had already REJECTED, contradicting its own §3. Before committing a handoff, open each file it describes and confirm the described code is what is actually there. A `Verification` section that disagrees with the shipped code is worse than no section — it is what a reviewer will cite.
3. **Cross-reference todos by their title text, not by an invented numbering.** The Wave 1 handoff renumbered Todos 1-4 off by one against the plan.
4. **State the resume point as the plan's todo number AND its title**, so a mismatch is self-evident.

**Handoff file template** — every handoff writes `.omo/handoff-fase-d-wave-<N>.md` containing, in this order:

1. **Wave status table** — every todo in the plan with `done | in progress | pending`, wave by wave.
2. **What was actually built** — files created/modified with paths, and the one-line purpose of each.
3. **Decisions taken during execution** — anything the executor resolved that the plan did not fully specify, with the reasoning. If the answer is "none", say so explicitly.
4. **Verification evidence** — the exact commands run, their exit codes, and the evidence paths. Real numbers only.
5. **What remains** — the next wave's todos and its first concrete action.
6. **Context the next chat needs** — running servers and ports, DB seed state (`SEED_NOW` value used), branch name, last commit SHA and subject, any environment quirk discovered.
7. **Traps and advisories** — anything that would bite the next session (e.g. a contract/doc mismatch, a flaky path, a gitignored artifact).
8. **Resume instruction** — the literal command to continue, and which todo number to start from.

### Parallel execution waves

- **Wave 1 — Transport core (Todos 1-5).** 1 first (branch + fixtures + env). Then 2, 3 in parallel (independent pure modules). 4 after 2 and 3. 5 closes the wave.
- **Wave 2 — Pre-selection contract (Todos 6-9).** 6 first (reducer). 7 after 6. 8 after 7. 9 closes.
- **Wave 3 — Widget UI (Todos 10-15).** 10 first (shell + mount). 11, 12 after 10; 11 and 12 touch different components and may run in parallel. 13 after 11. 14 after 11, 12, 13. 15 closes.
- **Wave 4 — Live proof + docs (Todos 16-18).** 16 then 17. 18 closes and hands off to the final verification wave.

### Dependency matrix

| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | — | 2-18 | — |
| 2 | 1 | 4 | 3 |
| 3 | 1 | 4 | 2 |
| 4 | 2, 3 | 5, 11 | — |
| 5 | 4 | 6 | — |
| 6 | 5 | 7 | — |
| 7 | 6 | 8 | — |
| 8 | 7 | 9 | — |
| 9 | 8 | 10 | — |
| 10 | 9 | 11, 12 | — |
| 11 | 10, 4 | 13, 14 | 12 |
| 12 | 10 | 14 | 11 |
| 13 | 11 | 14 | — |
| 14 | 11, 12, 13 | 15 | — |
| 15 | 14 | 16 | — |
| 16 | 15 | 17 | — |
| 17 | 16 | 18 | — |
| 18 | 17 | F1-F4 | — |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

### Wave 1 — Transport core (pure logic, no UI)

- [x] 1. Repo: branch `phase-3-integration` + `NEXT_PUBLIC_AGENT_URL` config + copy SSE fixtures out of gitignored evidence - expect branch created, build green, fixtures tracked
  What to do / Must NOT do:
    - FIRST, land the planning artifacts. `.omo/plans/cinepais-phase-3-integration.md`, `.omo/drafts/cinepais-phase-3-integration.md` and `.omo/boulder.json` are expected to be untracked/modified right now — they are this session's own inputs and are NOT gitignored (`.gitignore:26` covers only `.omo/evidence/`). Commit them on `phase-2-agent` before branching: `chore(omo): phase-3-integration planning artifacts and boulder state` (mirrors the Fase C precedent commit `682c3c4`). This also makes F4's later "plan prose unedited" diff meaningful — without it there is no baseline to diff against.
    - THEN verify the CODE trees are clean: `git status --porcelain -- web/ agent/` must be empty. If it is not, STOP and report — do not stash, do not commit someone else's work. Do NOT run a bare `git status --porcelain` as the gate; orchestrator state under `.omo/` is expected to move during execution and is authorized by §Commit strategy.
    - `git checkout phase-2-agent && git checkout -b phase-3-integration`.
    - Add to `web/.env.example`: `NEXT_PUBLIC_AGENT_URL="http://localhost:8000"` with a comment naming it the CinePaís agent base URL (Fase E repoints it at Fly.io).
    - Create `web/src/lib/agent/config.ts` exporting `AGENT_BASE_URL` = `process.env.NEXT_PUBLIC_AGENT_URL ?? "http://localhost:8000"`. This is the ONLY place the URL is read.
    - Create `web/tests/fixtures/agent-sse/` and copy these three REAL captures verbatim (they are in gitignored `.omo/evidence/`, so they must be copied into the tracked tree, not symlinked): `f3-fixes-r6-qa1.txt` → `real-broad.txt`, `f3-fixes-r6-qa2.txt` → `real-narrow-two-recommendations.txt`, `f3-fixes-r6-qa3.txt` → `real-date-range.txt`.
    - Verify each copy byte-for-byte against its source (`cmp` or `md5`), and record the per-file counts of `^event: ` lines by type. These counts are FACTS used by later todos — capture them, do not estimate.
    - Write `web/tests/fixtures/agent-sse/README.md` (English) recording, per fixture: source evidence filename, the query it came from, and the event-type counts you just measured.
    - Must NOT create `main`. Must NOT push. Must NOT touch `agent/`. Must NOT write any parser yet.
  Parallelization: Wave 1 | Blocked by: — | Blocks: all
  References: `.git/logs/HEAD:15` (proves `phase-2-agent` descends from `phase-1-ui`, so this branch carries both UI and agent); `.gitignore:26` (`.omo/evidence/` ignored — hence the copy); `.omo/evidence/f3-fixes-r6-qa2.txt:1-12` (verified verbatim SSE wire format); `web/.env.example`; AGENTS.md (English code, no attribution lines).
  Acceptance criteria: `git branch --show-current` prints `phase-3-integration` · `git rev-parse --verify main` exits non-zero (no `main` created) · `grep -q 'NEXT_PUBLIC_AGENT_URL' web/.env.example` · `test -f web/src/lib/agent/config.ts` · all three fixtures exist under `web/tests/fixtures/agent-sse/` and each is byte-identical to its evidence source · `cd web && pnpm build; echo EXIT=$?` prints `EXIT=0`.
  QA scenarios: happy: `cd web && grep -c '^event: ' tests/fixtures/agent-sse/real-narrow-two-recommendations.txt` returns a non-zero count matching the number recorded in the fixtures README. failure: `git rev-parse --verify main` must FAIL (exit non-zero) — if it succeeds, a `main` branch was created out of scope; STOP and report. Evidence `/Users/reiorozco/Dev/cinepais/.omo/evidence/task-1-cinepais-phase-3-integration.txt`.
  Commit: N

- [x] 2. `web/src/lib/agent/events.ts`: Zod schemas mirroring the agent's Pydantic models exactly - expect a nullable-correct discriminated union with tests RED first
  What to do / Must NOT do:
    - TDD: write `web/tests/agent-events.test.ts` FIRST and prove it RED before implementing.
    - Mirror `agent/src/cinepais_agent/events.py` field-for-field using Zod 4 (already a dependency, `zod@^4.4.3`). Follow the existing style in `web/src/lib/api/schemas.ts`.
    - `TokenEventSchema`: `type: z.literal("token")`, `content: z.string()`.
    - `ToolCallEventSchema`: `type: z.literal("tool_call")`, `tool: z.string()`, `input: z.record(z.string(), z.unknown())`.
    - `AlternativeSchema`: `showtimeId`, `filmId`, `siteName`, `businessDate`, `time` all `z.string()`; `formats: z.array(z.string())`; `priceFrom: z.number()` (**NOT nullable** — `events.py:30` is `int`); `qualityTier: z.enum(["low","optimal","high"]).nullable()` (`events.py:31`); `reason: z.string()`.
    - `RecommendationEventSchema`: `type: z.literal("recommendation")`; `outcome: z.enum(["recommended","degraded","no_availability"])`; `showtimeId`, `filmId`, `siteName`, `city`, `businessDate`, `time` each `z.string().nullable()`; `seatIds: z.array(z.string())`; `requestedN: z.number()`; `formats: z.array(z.string())`; **`priceFrom: z.number().nullable()`** (`events.py:47` is `int | None` — the contract doc's example `32000` under-specifies this; getting it wrong crashes the card on `no_availability`); `qualityTier: z.enum(["low","optimal","high"]).nullable()`; `reasoning: z.string()`; `alternatives: z.array(AlternativeSchema).default([])`.
    - `DoneEventSchema`: `type: z.literal("done")`, `sessionQueriesUsed: z.number()`, `sessionQueryCap: z.number()`.
    - `ErrorEventSchema`: `type: z.literal("error")`, `code: z.string()`, `message: z.string()`.
    - Export `AgentEventSchema` as a discriminated union on `type`, plus inferred TS types for each.
    - Export `parseAgentEvent(eventName: string, rawData: string): AgentEvent | null` — returns `null` on malformed JSON or schema failure instead of throwing, so one bad frame can never kill the stream.
    - Tests MUST include: a soldout `Alternative` with `qualityTier: null` parsing successfully; a `no_availability` recommendation with `showtimeId: null` AND `priceFrom: null` parsing successfully; malformed JSON returning `null`; a payload missing a required field returning `null`; every one of the five event types round-tripping.
    - At least one test MUST parse a real `data:` payload lifted verbatim out of `web/tests/fixtures/agent-sse/real-narrow-two-recommendations.txt` — schemas that only pass against hand-written objects prove nothing about the wire.
    - Must NOT use `.catch()` or `.passthrough()` to paper over mismatches — a schema failure must be visible as `null`.
    - Must NOT edit `agent/`.
  Parallelization: Wave 1, parallel with Todo 3 | Blocked by: 1 | Blocks: 4
  References: `agent/src/cinepais_agent/events.py:10-88` (authoritative field types and nullability); `agent/docs/sse-contract.md:28-198` (wire examples); `agent/docs/sse-contract.md:112-156` (Alternative + soldout tradeoff semantics); `web/src/lib/api/schemas.ts` (existing Zod conventions); `web/vitest.config.ts` (node env, `tests/**/*.test.ts`); `web/tsconfig.json` (`@/*` → `./src/*`, `exclude: ["node_modules","tests"]`).
  Acceptance criteria: `cd web && pnpm test; echo EXIT=$?` prints `EXIT=0` · `grep -q 'priceFrom: z.number().nullable()' src/lib/agent/events.ts` (recommendation-level nullability present) · `grep -c 'nullable()' src/lib/agent/events.ts` returns at least 8 · `npx tsc --noEmit; echo EXIT=$?` prints `EXIT=0` · the RED-then-GREEN transcript is in the evidence file.
  QA scenarios: happy: a test parses the verbatim real `recommendation` payload from the fixture and asserts `alternatives.some(a => a.qualityTier === null)` where the fixture contains a soldout entry (if it does not, assert the count you measured in Todo 1 instead — do not invent one). failure: `parseAgentEvent("recommendation", '{"type":"recommendation"}')` returns `null` and does NOT throw. Evidence `/Users/reiorozco/Dev/cinepais/.omo/evidence/task-2-cinepais-phase-3-integration.txt`.
  Commit: N

- [x] 3. `web/src/lib/agent/sse.ts`: WHATWG-compliant incremental SSE frame parser - expect chunk-boundary splitting handled, tests RED first
  What to do / Must NOT do:
    - TDD: write `web/tests/agent-sse.test.ts` FIRST and prove it RED.
    - Implement a stateful incremental parser: `createSseParser()` returning `{ feed(chunk: string): SseFrame[] }` where `SseFrame = { event: string; data: string }`. Pure and synchronous — no fetch, no DOM, no timers, so it runs in the existing node-env Vitest.
    - Spec rules that MUST be implemented (WHATWG HTML §9.2.6): normalize `\r\n` and `\r` to `\n` BEFORE splitting; hold the trailing incomplete line in an internal buffer across `feed()` calls; a blank line dispatches the accumulated frame; a line starting with `:` is a comment and is ignored; split each field line on the FIRST `:`; strip EXACTLY ONE leading space from the value (`.trim()` is WRONG and will corrupt Spanish content with meaningful spacing); a line with no `:` is a field name with an empty value; multiple `data:` lines join with `\n`; `event` defaults to `"message"` when absent; after dispatch, reset the event and data buffers.
    - Tests MUST include, at minimum: a frame split across two `feed()` calls mid-field (e.g. `"event: tok"` then `"en\ndata: {}\n\n"`) yielding exactly one correct frame — this is the single most common real-world bug; a comment line ignored; multi-line `data:` joined with `\n`; a value with a leading space preserved beyond the first; CRLF input; two frames in one chunk; and feeding the ENTIRE contents of `web/tests/fixtures/agent-sse/real-narrow-two-recommendations.txt` one byte at a time, asserting the resulting frame count and event-type counts equal the numbers recorded in Todo 1.
    - The byte-at-a-time fixture test is the load-bearing one: it proves the parser against real agent output under the worst possible chunking.
    - Must NOT use any npm SSE library. Must NOT use `TextDecoder` here — decoding belongs in the client (Todo 4); this module takes strings so it stays pure and trivially testable.
  Parallelization: Wave 1, parallel with Todo 2 | Blocked by: 1 | Blocks: 4
  References: WHATWG HTML §9.2.6 "Interpreting an event stream" (`https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation`); `agent/docs/sse-contract.md:19-24` (frame shape); `.omo/drafts/cinepais-phase-3-integration.md` §External research (why hand-rolled: `@microsoft/fetch-event-source` frozen since 2021-04-25, `eventsource-parser` unnecessary, AI SDK protocol-incompatible); `web/vitest.config.ts`.
  Acceptance criteria: `cd web && pnpm test; echo EXIT=$?` prints `EXIT=0` · the byte-at-a-time fixture test exists and asserts counts equal to the Todo 1 measurements · `grep -q "replace(/\\\\r\\\\n/g" src/lib/agent/sse.ts` or equivalent proof that CRLF normalization precedes splitting · **single-space stripping, not trim**: `grep -c '\.trim()' src/lib/agent/sse.ts` returns `0` — note this is a POSITIVE-presence count inverted to zero, NOT `grep -qv`, which would pass on any file containing at least one unrelated line; pair it with the positive control `grep -c "" src/lib/agent/sse.ts` returning a non-zero line count to prove the file was actually read · `npx tsc --noEmit; echo EXIT=$?` prints `EXIT=0`.
  QA scenarios: happy: byte-at-a-time replay of the real fixture yields the exact recorded event-type counts. failure: feeding `":heartbeat\n\n"` yields zero frames (comment correctly ignored, no phantom empty frame). Evidence `/Users/reiorozco/Dev/cinepais/.omo/evidence/task-3-cinepais-phase-3-integration.txt`.
  Commit: N

- [x] 4. `web/src/lib/agent/client.ts`: `streamChat()` over fetch + reader + AbortController - expect HTTP 429 and transport failures normalized into `error` events
  What to do / Must NOT do:
    - Implement `streamChat({ message, sessionId, signal, onEvent }): Promise<void>`: POST to `` `${AGENT_BASE_URL}/chat` `` with `content-type: application/json` and body `{ message, sessionId }`, pass `signal`, read `response.body.getReader()`, decode with `new TextDecoder()` using `{ stream: true }` (required so multi-byte Spanish characters split across chunks do not corrupt), feed the parser from Todo 3, validate each frame with `parseAgentEvent` from Todo 2, and invoke `onEvent` per valid event.
    - Non-OK responses carry NO SSE body. Map them to a synthetic `error` event: HTTP 429 → `{ type:"error", code:"rate_limit_exceeded", message:"Has superado el límite de solicitudes. Intenta de nuevo en un momento." }`; any other non-OK → `code:"http_error"` with a Spanish message. Attempt to read the agent's JSON error body first and prefer its `message` when present — the agent's Spanish copy always wins over ours. **Note the shape gap:** the live 429 body uses the key `"error"`, NOT `"code"` (`agent/src/cinepais_agent/main.py:87-91`), so read `message` only and hardcode `code: "rate_limit_exceeded"` yourself; reading `body.code` yields `undefined`.
    - Network/CORS/DNS failure (fetch rejects) → `{ type:"error", code:"agent_unreachable", message:"No pude conectarme al copiloto. Verifica que el agente esté corriendo." }`.
    - An `AbortError` MUST NOT produce an error event — user cancellation is not a failure. Swallow it and return.
    - A frame that fails schema validation is skipped silently (already `null` from Todo 2); it must not abort the stream.
    - Tests in `web/tests/agent-client.test.ts` MUST stub `globalThis.fetch` and drive: (a) a successful stream built from the real fixture, asserting the ordered list of event types received; (b) a 429 response with no body producing exactly one `rate_limit_exceeded` error event; (c) a rejected fetch producing exactly one `agent_unreachable` event; (d) an aborted signal producing ZERO error events; (e) one malformed frame in the middle of a good stream being skipped while surrounding events still arrive.
    - Build the fake stream with `new ReadableStream` and `TextEncoder` so the decoding path is genuinely exercised — do not bypass it by handing the client pre-decoded strings.
    - Must NOT hardcode the agent URL — read `AGENT_BASE_URL` from Todo 1's config module. Must NOT add retry/backoff logic (YAGNI; the agent is rate-limited and a retry storm is the failure mode we are avoiding).
  Parallelization: Wave 1 | Blocked by: 2, 3 | Blocks: 5, 11
  References: `agent/docs/sse-contract.md:3-24` (endpoint + request body); `agent/docs/sse-contract.md:232-245` (error code table, all messages already Spanish); `agent/README.md` §Security (10 req/min per IP, CORS to `CORS_ORIGIN`); `agent/src/cinepais_agent/main.py:86` (429 status); librarian brief §4 (AbortController pattern, React 19 StrictMode double-effect is safe because `abort()` is idempotent); `web/src/lib/agent/config.ts` (Todo 1).
  Acceptance criteria: `cd web && pnpm test; echo EXIT=$?` prints `EXIT=0` · all five stubbed scenarios (a)-(e) exist as named tests · `grep -q 'AGENT_BASE_URL' src/lib/agent/client.ts` and `grep -c 'localhost:8000' src/lib/agent/client.ts` returns 0 (no hardcoded URL) · `grep -q '{ stream: true }' src/lib/agent/client.ts` · `npx tsc --noEmit; echo EXIT=$?` prints `EXIT=0` · `pnpm lint; echo EXIT=$?` prints `EXIT=0`.
  QA scenarios: happy: the fixture-driven test asserts the received event-type sequence equals the sequence measured from the fixture in Todo 1. failure: the abort test asserts `errorEvents.length === 0` — if an `AbortError` leaks through as a user-visible error, STOP and fix the catch, do not relax the assertion. Evidence `/Users/reiorozco/Dev/cinepais/.omo/evidence/task-4-cinepais-phase-3-integration.txt`.
  Commit: N

- [x] 5. Wave 1 close: commit + write `.omo/handoff-fase-d-wave-1.md` + STOP - expect a fresh chat can resume at Todo 6 with no other context
  What to do / Must NOT do:
    - Run the full gate from `web/`: `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `pnpm build`. All four must exit 0. If any fails, STOP and report — do not commit a red tree.
    - Commit on `phase-3-integration`: `feat(web): agent SSE transport — WHATWG parser, Zod event schemas, streaming client`. No attribution lines. **No push.**
    - Force-add the wave's evidence files (`git add -f .omo/evidence/task-1..4-cinepais-phase-3-integration.txt`) since `.gitignore:26` excludes that directory.
    - Write `.omo/handoff-fase-d-wave-1.md` following the handoff template in §Execution strategy — all 8 sections, no section omitted. Include: the measured fixture event counts (they are inputs to later todos), the exact commit SHA and subject, the branch name, whether any web/agent server was left running, and any contract-vs-`events.py` mismatch observed (notably that `sse-contract.md` under-specifies `priceFrom` nullability — record as a Fase E advisory, do NOT edit the contract).
    - Commit the handoff too.
    - **STOP HERE.** Report to the user: Wave 1 complete, Wave 2 starts at Todo 6, open a fresh chat and feed it `.omo/handoff-fase-d-wave-1.md`. Do NOT begin Todo 6 in this session.
    - Must NOT edit this plan's prose or acceptance criteria — checkboxes only.
  Parallelization: Wave 1 close | Blocked by: 4 | Blocks: 6
  References: §Execution strategy handoff template (8 required sections); `.omo/handoff-fase-c.md` (proven precedent for shape and tone); `.gitignore:26`; AGENTS.md (commits only when asked, branch first, no push, no attribution).
  Acceptance criteria: `git log --oneline -1` shows the wave-1 subject on branch `phase-3-integration` · `git status --porcelain` is empty · `test -f .omo/handoff-fase-d-wave-1.md` · that file contains all 8 template section headings (verify with 8 greps) · `git rev-parse --verify main` still exits non-zero · `git log origin/phase-3-integration..HEAD 2>&1 | head -1` shows no remote configured (proving nothing was pushed).
  QA scenarios: happy: `grep -c '^## ' .omo/handoff-fase-d-wave-1.md` returns at least 8. failure: `cd web && pnpm test; echo EXIT=$?` must print `EXIT=0` at commit time — a red suite at a wave boundary is a STOP condition, never a "fix it next wave" note. Evidence `/Users/reiorozco/Dev/cinepais/.omo/evidence/task-5-cinepais-phase-3-integration.txt`.
  Commit: Y | `feat(web): agent SSE transport — WHATWG parser, Zod event schemas, streaming client`

### Wave 2 — Pre-selection contract (deterministic HITL, still no chat UI)

- [x] 6. `preselect` action in `web/src/lib/business/selection.ts`: idempotent, rule-respecting seat assignment - expect existing toggle/clear tests untouched and green
  What to do / Must NOT do:
    - TDD: extend `web/tests/selection.test.ts` (or add `web/tests/selection-preselect.test.ts`) FIRST, prove RED.
    - Add to the `SelectionAction` union — ADDITIVE ONLY:
      `| { type: "preselect"; showtimeId: string; seatIds: string[]; rowSeatsByRow: Map<number, SeatForSelection[]>; seatsById: Map<string, SeatForSelection>; blocks: [number, number][] }`.
    - Semantics — this action **assigns**, it does not toggle. Given the same input it must produce the same output no matter how many times it runs (React 19 StrictMode runs effects twice in dev; a `toggle` loop would silently DESELECT everything, which is precisely why this action exists).
    - Algorithm, in this exact order: (1) start from `EMPTY_STATE` with the given `showtimeId` — a pre-selection replaces any prior selection rather than adding to it; (2) resolve each requested id through `seatsById`, dropping unknown ids; (3) drop seats whose `status !== "Available"`; (4) drop seats whose `areaCategory === "wheelchair"` (spec rule #4 — accessibility seats are NEVER auto-selected on someone's behalf, even if the agent suggested one); (5) accept ids in the given order until `MAX_SEATS` (4) is reached, dropping the rest; (6) after each accepted seat run the SAME per-block orphan check the `toggle` path uses, and drop any seat whose acceptance would leave an orphan.
    - Result: `{ showtimeId, selectedSeatIds: <accepted>, error }` where `error` is `null` when every requested id was accepted, and otherwise reuses the existing `"max" | "orphan"` union — **do not widen the error type**; `SelectionState.error` feeds the existing toast effect at `selection-provider.tsx:42-50` and widening it silently changes that surface. If seats were dropped for a reason with no existing code (unknown/sold/wheelchair), set `error: null` and let the UI report the count difference instead (Todo 7 renders that).
    - Reuse the existing `wouldLeaveOrphan` + `rowStatuses` construction, including the wheelchair-treated-as-Sold exemption. Extract a shared helper if that avoids duplication, but **do not change `toggle`'s behaviour or signature**.
    - Tests MUST cover: 2 valid adjacent seats accepted; running the action TWICE with identical input producing an identical `selectedSeatIds` (idempotency — the StrictMode lock); 5 requested ids capped to 4; an unknown seatId dropped without throwing; a `Sold` seat dropped; a `wheelchair` seat dropped even when `Available`; a request that would leave an orphan dropping the offending seat while keeping the valid ones; a `showtimeId` different from current state replacing rather than merging the selection.
    - Must NOT mutate `selectedSeatIds` in place. Must NOT bypass `wouldLeaveOrphan`. Must NOT modify `toggle`, `clear`, `MAX_SEATS`, `EMPTY_STATE`, `orphan.ts`, or any existing test assertion.
  Parallelization: Wave 2 | Blocked by: 5 | Blocks: 7
  References: `web/src/lib/business/selection.ts:8-14` (`SeatForSelection` shape), `:16-32` (state + action union), `:38` (`MAX_SEATS = 4`), `:50-72` (rule docblock incl. wheelchair exemption), `:100-141` (candidate build + per-block orphan loop to mirror); `web/src/lib/business/orphan.ts:11-15` (`wouldLeaveOrphan` signature, 0-based); `web/src/lib/business/layout.ts:1-5` (block ranges, 1-based inclusive); `web/src/components/providers/selection-provider.tsx:42-50` (the toast effect that consumes `error`); `specs/001-cine-copiloto-boletas.md:91` (accessibility rule #4); `agent/src/cinepais_agent/mcp_server.py:22,157` (agent already caps n at 4 — we validate anyway, never trust).
  Acceptance criteria: `cd web && pnpm test; echo EXIT=$?` prints `EXIT=0` · `git diff phase-2-agent -- src/lib/business/orphan.ts | wc -l` returns 0 (orphan module untouched) · `git diff phase-2-agent -- tests/orphan-rule.test.ts | wc -l` returns 0 · `git diff -- tests/selection.test.ts` contains no `-` line inside any pre-existing `toggle` or `clear` test block — enumerate every removed line and classify it; extending the file is authorized, editing an existing assertion is not · the diff of `selection.ts` contains no `-` line inside the existing `toggle` body (verify with `git diff -- src/lib/business/selection.ts` and inspect every removed line; if any removed line sits inside the toggle path, STOP) · a named idempotency test exists and passes · `npx tsc --noEmit; echo EXIT=$?` prints `EXIT=0`.
  QA scenarios: happy: applying `["1_4_7","1_4_8"]` twice yields `selectedSeatIds.size === 2` both times with identical contents. failure: applying `["1_4_7","1_4_8","1_4_9","1_4_10","1_4_11"]` yields exactly 4 accepted and `error === "max"` — if it yields 5, the max rule was bypassed; STOP. Evidence `/Users/reiorozco/Dev/cinepais/.omo/evidence/task-6-cinepais-phase-3-integration.txt`.
  Commit: N

- [x] 7. `?preselect=` URL contract on `/showtimes/[id]` + SeatMap application + Spanish banner - expect seats highlighted from a hand-typed URL, no agent involved
  What to do / Must NOT do:
    - Read the relevant guide under `web/node_modules/next/dist/docs/` for `searchParams` in Next 16.3 BEFORE editing the page (`web/AGENTS.md` mandates this; the API is a Promise in this version).
    - `web/src/app/showtimes/[id]/page.tsx`: add `searchParams: Promise<{ preselect?: string }>` alongside the existing `params`, await it, and pass a parsed `preselectSeatIds: string[]` down to `<SeatMap>`. Parse by splitting on `,`, trimming, and dropping empties. Cap the parsed array at 8 entries before it ever reaches the reducer — a hostile URL must not drive an unbounded loop. Do NOT validate seat existence here; that is the reducer's job (Todo 6).
    - `web/src/components/seats/seat-map.tsx`: accept the new optional prop `preselectSeatIds?: string[]`. In a `useEffect`, guarded by a `useRef` "already applied" flag keyed on `showtime.id + preselect string`, dispatch ONE `{ type: "preselect", ... }` action, building `seatsById` and `rowSeatsByRow` from the existing `seatByRowCol` index and `blocks` from the existing `layout.blocks`.
    - The ref guard is required even though the action is idempotent: it prevents re-dispatching on every unrelated re-render. The idempotency from Todo 6 is the second line of defence, not a substitute.
    - Mark applied seats: add `data-preselected="true"` to seat buttons whose id was in the accepted preselect set, plus a visually distinct ring (a token-based ring on top of the existing `bg-seat-selected` green — they ARE selected, this only annotates provenance). Do NOT introduce a new colour token; compose from existing ones in `web/src/styles/globals.css`.
    - Add a Spanish banner above the seat grid, rendered only when a preselect was applied: it names the count actually selected and, when fewer than requested, says so plainly. Copy must be honest and constructive, e.g. `El copiloto pre-seleccionó 2 sillas. Revísalas y confirma.` and, on a partial result, a second line stating how many could not be applied and why in plain Spanish (agotadas / no contiguas / máximo 4 / sillas de accesibilidad reservadas). The banner MUST make clear nothing has been purchased.
    - Must NOT auto-advance to checkout. Must NOT write `selectedSeatIds` directly. Must NOT open the wheelchair dialog from a preselect (those seats are dropped, not confirmed). Must NOT change existing seat click behaviour, zoom, legend, or the bottom bar.
  Parallelization: Wave 2 | Blocked by: 6 | Blocks: 8
  References: `web/src/app/showtimes/[id]/page.tsx:52-75` (current signature — `params` is already a Promise; `searchParams` follows the same shape); `web/src/components/seats/seat-map.tsx:27-31` (`SeatMapProps`), `:53-62` (layout + blocks derivation), `:67-78` (`seatByRowCol` index to reuse), `:83-84` (`activeIds` showtime guard), `:93-97` (`rowSeatsFor`), `:409` (`data-seat-id` attribute — the E2E hook), `:444-450` (`seatFillClass`); `web/src/lib/business/layout.ts:1-15`; `web/AGENTS.md` (read bundled Next docs first); AGENTS.md (UI copy Spanish, code English).
  Acceptance criteria: `cd web && npx tsc --noEmit; echo EXIT=$?` prints `EXIT=0` · `pnpm lint; echo EXIT=$?` prints `EXIT=0` · `pnpm build; echo EXIT=$?` prints `EXIT=0` · `grep -q 'preselect' src/app/showtimes/\[id\]/page.tsx` · `grep -q 'data-preselected' src/components/seats/seat-map.tsx` · `grep -q 'type: "preselect"' src/components/seats/seat-map.tsx` · `grep -c 'selectedSeatIds' src/components/seats/seat-map.tsx` shows no direct assignment (read-only usage) · all existing tests still green (`pnpm test` exits 0).
  QA scenarios: happy: covered end-to-end in Todo 8. failure: `pnpm build` must exit 0 — if adding `searchParams` breaks the build, read the bundled Next 16.3 docs rather than adding `export const dynamic`, which is banned by the Fase 0/1 convention. Evidence `/Users/reiorozco/Dev/cinepais/.omo/evidence/task-7-cinepais-phase-3-integration.txt`.
  Commit: N

- [x] 8. Playwright proof of the preselect contract using a hand-typed URL - expect green seats with ZERO LLM spend
  What to do / Must NOT do:
    - Ensure the stack is up and the seed is valid. The agent evals require strictly-future showtimes and the web API applies a 15-minute cutoff, so re-seed with tomorrow as `SEED_NOW` if the calendar day rolled over: `SEED_NOW=$(python3 -c "from datetime import date, timedelta; print((date.today()+timedelta(days=1)).strftime('%Y-%m-%d'))")` then `cd web && TZ=America/Bogota SEED=20260801 SEED_NOW=$SEED_NOW pnpm prisma db seed`. Start dev: `cd web && (pnpm dev > /tmp/fase-d-web.log 2>&1 &)`, wait for HTTP 200 on `http://localhost:3000`.
    - **The agent must NOT be started for this todo. Zero Gemini spend. Zero `/chat` calls.**
    - Pick a REAL showtime and REAL adjacent available seat ids by querying the read API directly: `curl -s "http://localhost:3000/api/showtimes?filmId=film-01" ` and `curl -s "http://localhost:3000/api/showtimes/<id>/seats"`. Derive two adjacent `Available`, non-wheelchair seats in the same row and the same block. Record the exact ids used — they are evidence, not decoration.
    - Navigate to `http://localhost:3000/showtimes/<id>?preselect=<seatA>,<seatB>` with `browser_navigate`, then assert with `browser_evaluate`: both seats carry `data-preselected="true"`; both carry `aria-pressed="true"`; the count of `[data-preselected="true"]` equals 2; the banner text is present and in Spanish; the running total in the bottom bar is non-zero.
    - Capture a screenshot to `.omo/evidence/task-8-preselect-happy.png`.
    - Negative case 1 — over-cap: navigate with 5 seat ids and assert exactly 4 end up selected.
    - Negative case 2 — wheelchair refusal: find a wheelchair seat id from the seats API, request it in `preselect`, and assert it is NOT selected (`data-preselected` absent on that seat) and no dialog opened.
    - Negative case 3 — garbage input: navigate with `?preselect=not_a_seat,,,` and assert the page renders normally with zero preselected seats and no console error.
    - Kill the dev server afterwards and record that the port is free.
    - Must NOT weaken an assertion to get a pass. If a seat is not selected when it should be, capture the raw DOM state and STOP.
  Parallelization: Wave 2 | Blocked by: 7 | Blocks: 9
  References: `agent/README.md` §Seed rule (why `SEED_NOW` must be strictly future); `.omo/notepads/cinepais-phase-2-agent-fixes/learnings.md` (todo-14 entry: exact startup sequence that worked, ~12s to Ready, re-seed before relying on data); `web/README.md` §Read API contract (endpoint shapes); `web/src/components/seats/seat-map.tsx:409` (`data-seat-id` hook); `web/README.md` §Business rules encoded.
  Acceptance criteria: all four navigations (happy, over-cap, wheelchair, garbage) executed and asserted · happy case shows exactly 2 elements matching `[data-preselected="true"]` · over-cap case shows exactly 4 · wheelchair case shows the wheelchair seat NOT selected · garbage case shows 0 preselected and the page still renders the seat grid · screenshot saved · the evidence file records the literal showtimeId and seatIds used, the raw `browser_evaluate` return values, and confirmation that no process was listening on `:8000` during the run.
  QA scenarios: happy: `[data-preselected="true"]` count === 2 on the happy URL. failure: the garbage URL must not throw — assert zero uncaught console errors via `browser_console_messages` at level `error`. Evidence `/Users/reiorozco/Dev/cinepais/.omo/evidence/task-8-cinepais-phase-3-integration.txt` + `task-8-preselect-happy.png`.
  Commit: N

- [x] 9. Wave 2 close: commit + write `.omo/handoff-fase-d-wave-2.md` + STOP - expect a fresh chat can resume at Todo 10
  What to do / Must NOT do:
    - Full gate from `web/`: `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `pnpm build` — all exit 0 or STOP.
    - Commit: `feat(web): HITL seat pre-selection — preselect reducer action + ?preselect= URL contract`. No attribution. No push.
    - `git add -f` the wave's evidence (including the PNG).
    - Write `.omo/handoff-fase-d-wave-2.md` with all 8 template sections. It MUST record: the literal showtimeId and seatIds used in Todo 8 (the next chat needs a known-good URL for regression), the `SEED_NOW` value the DB currently holds, whether the dev server was left running, and the exact banner copy shipped so Wave 3 keeps voice consistent.
    - **STOP HERE.** Report Wave 2 complete; Wave 3 starts at Todo 10 in a fresh chat seeded with this handoff.
  Parallelization: Wave 2 close | Blocked by: 8 | Blocks: 10
  References: §Execution strategy handoff template; `.omo/handoff-fase-c.md`; `.gitignore:26`.
  Acceptance criteria: `git log --oneline -1` shows the wave-2 subject · `git status --porcelain` empty · `test -f .omo/handoff-fase-d-wave-2.md` and it contains all 8 section headings · the handoff contains the literal known-good preselect URL · `git rev-parse --verify main` still exits non-zero.
  QA scenarios: happy: `grep -c '^## ' .omo/handoff-fase-d-wave-2.md` returns at least 8. failure: `cd web && pnpm test; echo EXIT=$?` must print `EXIT=0` before the commit. Evidence `/Users/reiorozco/Dev/cinepais/.omo/evidence/task-9-cinepais-phase-3-integration.txt`.
  Commit: Y | `feat(web): HITL seat pre-selection — preselect reducer action + ?preselect= URL contract`

### Wave 3 — Chat widget UI (fixture-verified, zero LLM spend)

- [x] 10. Copilot shell: floating bubble + panel mounted in the root layout - expect it visible on every route and surviving client navigation
  What to do / Must NOT do:
    - Read the relevant bundled Next 16.3 guide before touching `layout.tsx` (`web/AGENTS.md` rule).
    - Create `web/src/components/copilot/copilot-widget.tsx` (`"use client"`): a fixed bottom-right launcher button and a panel that opens above it. Compose from installed shadcn primitives only — `button`, `card`, `badge`, `skeleton` are available; `accordion`, `dialog`, `select`, `tabs`, `sonner` also exist. **Do not run `shadcn add`**; if a primitive is missing, use a plain semantic element with Tailwind.
    - Mount it in `web/src/app/layout.tsx` INSIDE `<SelectionProvider>` (it will need selection context later) and after `<Footer />`, leaving `<Toaster />` last. This placement is what makes the panel survive `router.push` — the root layout is not remounted on client navigation, and that property is the whole HITL demo.
    - State for this todo: `open` boolean only. No streaming yet.
    - Accessibility: launcher has an `aria-label` in Spanish and `aria-expanded`; the panel is a labelled region; `Escape` closes it; focus moves into the panel on open and returns to the launcher on close; visible focus rings.
    - Responsive: on narrow viewports the panel takes the usable width with a safe margin and must never overflow the viewport horizontally (`layout.tsx` sets `overflow-x-hidden` on `<html>`, so an overflow bug will silently clip instead of scrolling — check with a real narrow viewport).
    - Styling: use existing tokens (`--brand-header`, `--surface-dark`, `--primary`). Spanish copy: launcher label and an empty-state line introducing the copilot. Do NOT invent a new colour token.
    - Z-index must sit above the seat map's bottom bar without covering the "Seleccionar boletas" button when the panel is closed.
    - Must NOT add streaming, message state, or any network call in this todo. Must NOT modify `Header`, `Footer`, `CityProvider`, or `SelectionProvider`.
  Parallelization: Wave 3 | Blocked by: 9 | Blocks: 11, 12
  References: `web/src/app/layout.tsx:30-53` (exact provider nesting and where to mount); `web/src/components/ui/` (the 9 installed primitives); `web/src/styles/globals.css` (brand tokens, `--brand-header`, `--surface-dark`); `web/src/components/seats/seat-map.tsx` (bottom bar to avoid overlapping); `web/AGENTS.md`; AGENTS.md (Spanish UI copy).
  Acceptance criteria: `cd web && pnpm build; echo EXIT=$?` prints `EXIT=0` · `pnpm lint; echo EXIT=$?` prints `EXIT=0` · `npx tsc --noEmit; echo EXIT=$?` prints `EXIT=0` · with dev running, `browser_navigate` to `/`, `/films`, and a `/showtimes/<id>` URL each show the launcher (assert via `browser_evaluate` that the launcher element exists on all three) · clicking the launcher opens the panel and `Escape` closes it · navigating client-side from `/` to `/films` with the panel OPEN leaves it open (assert the panel element is still in the DOM after navigation) — this is the load-bearing assertion of this todo · **z-index proof**: on a `/showtimes/<id>` page with the panel CLOSED, `browser_evaluate` a bounding-box comparison showing the launcher's `getBoundingClientRect()` does not intersect the "Seleccionar boletas" button's rect, and that `document.elementFromPoint()` at that button's centre returns the button (not the launcher).
  QA scenarios: happy: open the panel on `/`, click through to a film, assert the panel is still open. failure: at a 390px-wide viewport, assert `document.documentElement.scrollWidth <= window.innerWidth` with the panel open — horizontal overflow is a real bug here because `<html>` clips it. Evidence `/Users/reiorozco/Dev/cinepais/.omo/evidence/task-10-cinepais-phase-3-integration.txt` + `task-10-copilot-shell.png`.
  Commit: N

- [x] 11. Conversation: streaming tokens, tool activity, input guard, session id, suggestion chips - expect a full turn rendered from a fixture with no agent running
  What to do / Must NOT do:
    - Create `web/src/components/copilot/use-copilot-chat.ts` (`"use client"`): the state machine for a conversation. Holds an ordered message list (`user` | `assistant`), per-assistant-message accumulated text, a `status` of `idle | streaming | done | error`, the current tool activity label, the latest recommendation payload, and `{ sessionQueriesUsed, sessionQueryCap }` from the last `done` event.
    - Wire it to `streamChat` from Todo 4. Keep one `AbortController` in a ref; abort on unmount and when the user sends a new message. Aborting must not surface an error (Todo 4 already guarantees this).
    - Event handling, exactly: `token` → append `content` to the current assistant message; `tool_call` → set a Spanish activity label derived from a hardcoded map (`recommend_best` → "Buscando la mejor función…", `search_showtimes` → "Consultando funciones…", `seat_availability` → "Revisando disponibilidad…", `adjacent_seats` → "Buscando sillas juntas…", unknown tool → "Consultando…"); `recommendation` → **replace** the turn's recommendation payload (last wins); `done` → clear activity, set `status: "done"`, store the session counters; `error` → render the agent's Spanish `message` verbatim as an error bubble and end the turn.
    - **Tokens may be entirely absent on tool-only turns** — the assistant bubble must never block on prose. If a turn ends with a recommendation and no tokens, render the card alone without an empty bubble.
    - `sessionId`: `crypto.randomUUID()` on first use, persisted in `sessionStorage` under a namespaced key (e.g. `cinepais.copilot.sessionId`). Read it lazily inside an effect, never during render — `sessionStorage` does not exist during SSR and touching it in the render path breaks hydration.
    - Input UI: a textarea with `maxLength={2000}`; a character counter that only appears past ~1800; send on Enter (Shift+Enter for newline); send disabled while streaming and when the trimmed value is empty. This makes `input_too_long` and `empty_message` unreachable from the widget.
    - Suggestion chips: exactly 4 hardcoded Spanish queries shown only when the conversation is empty, aimed at the planted seed scenarios (sold-out, front-rows-only, no-adjacent, best-of-weekend-by-quality). Clicking one sends it. Derive the wording from the scenario descriptions, not from invented film titles — the titles must be real seed titles.
    - While streaming show a subtle activity affordance; tool turns run 5-45s, so silence reads as a hang.
    - Must NOT parse the assistant prose for structured data. Must NOT re-author any agent error message. Must NOT add a truncation heuristic when `done` arrives mid-sentence — render as received. Must NOT implement retry/backoff.
  Parallelization: Wave 3, parallel with Todo 12 | Blocked by: 10, 4 | Blocks: 13, 14
  References: `agent/docs/sse-contract.md:202-220` (both orderings; `token` may be absent on tool turns); `:160-177` (`done` counters); `:181-198` + `:232-245` (error events, messages already Spanish); `agent/README.md` §Security (2000-char input cap, 20-query session cap); `.omo/handoff-fase-c.md:28-33` (planted scenarios: `soldout`, `front-only`, `no-adjacent`, `optimal`, and the real seed film titles); `web/src/lib/agent/client.ts` (Todo 4); `web/src/components/providers/city-provider.tsx` (existing pattern for reading browser storage safely in an effect).
  Acceptance criteria: `cd web && pnpm build; pnpm lint; npx tsc --noEmit` all exit 0 · `grep -rc 'crypto.randomUUID' src/components/copilot/ | grep -v ':0$'` returns at least one file with a non-zero count (note `-r`: the path is a DIRECTORY, and a bare `grep` on a directory exits 2 with "Is a directory" regardless of the code) · `grep -rq 'maxLength={2000}' src/components/copilot/` · no `sessionStorage` access outside a `useEffect` (verify by inspecting every occurrence) · exactly 4 chips defined · a Playwright fixture-replay run (mechanics in Todo 14) renders a streamed assistant message and a tool activity label.
  QA scenarios: happy: replay `real-broad.txt` via `page.route()` and assert the assistant bubble contains the FULL expected Spanish text once the turn settles. **Do NOT assert that text appeared incrementally or that a tool-activity label was visible mid-flight — `route.fulfill` delivers the whole body in one reader chunk (measured), so both are unobservable against a fixture and such a criterion is unsatisfiable.** Assert the tool-label MAPPING instead, deterministically: drive the hook's event handler directly (or export the pure `toolLabel(tool: string): string` map) and assert each of the five tool names yields its Spanish label. Incremental rendering is proven live in Todo 16. failure: replay a fixture whose stream contains ONLY `tool_call` + `recommendation` + `done` (no `token`) and assert no empty assistant bubble is rendered and no uncaught exception is thrown. Evidence `/Users/reiorozco/Dev/cinepais/.omo/evidence/task-11-cinepais-phase-3-integration.txt`.
  Commit: N

- [x] 12. Recommendation card + alternatives with honest sold-out rendering + CTA to preselect - expect soldout entries disabled on every outcome
  What to do / Must NOT do:
    - Create `web/src/components/copilot/recommendation-card.tsx` (`"use client"`), rendering ONLY from a validated `RecommendationEvent`.
    - Primary block, shown when `outcome` is `recommended` or `degraded`: `siteName · city`, formatted `businessDate` (reuse the `es-CO` UTC-safe formatting approach already in `web/src/app/showtimes/[id]/page.tsx:29-41` — parse as `T00:00:00Z`, never local time), `time`, `formats` badges, `priceFrom` via the existing `formatCOP`, a quality label in Spanish derived from `qualityTier` (`low` → "adelante", `optimal` → "óptima", `high` → "atrás"), the seat count, and `reasoning`.
    - **`priceFrom` and `qualityTier` on the recommendation are nullable** (`events.py:47-48`). Render a neutral fallback, never `$ null` or `NaN`. Same for `siteName`/`city`/`businessDate`/`time`, all nullable.
    - `degraded` must be visually distinct from `recommended` and say plainly, in Spanish, that fewer seats than requested were found — using `seatIds.length` vs `requestedN` — while still offering the purchase. Never discourage the sale (spec decision #3).
    - `no_availability`: no primary block; the alternatives list becomes the primary content with a Spanish lead-in.
    - Alternatives list, on ALL THREE outcomes: for each entry render `siteName · time · priceFrom` plus its Spanish `reason`. When `qualityTier === null` the entry is a sold-out tradeoff: render it **disabled/informational** with an "Agotada" badge, non-clickable, visually muted, and it must NOT offer a preselect CTA. All other entries are clickable and navigate to their own showtime. Expect up to 3 widened entries plus 1 sold-out entry (4 total) — the layout must not break at 4.
    - CTA on the primary block, only when `showtimeId` is non-null AND `seatIds.length > 0`: `router.push('/showtimes/' + showtimeId + '?preselect=' + seatIds.join(','))`. Use `useRouter` from `next/navigation` so it is a client-side navigation — a full page load would remount the root layout and destroy the conversation, defeating the whole design. **The panel must stay open across this navigation.**
    - Copy must never imply a purchase happened. The CTA wording should read as "ver y confirmar", not "comprar".
    - Must NOT render anything derived from assistant prose. Must NOT make the sold-out entry clickable. Must NOT use `window.location` or `<a href>` for the CTA.
  Parallelization: Wave 3, parallel with Todo 11 | Blocked by: 10 | Blocks: 14
  References: `agent/docs/sse-contract.md:72-108` (recommendation schema + outcome branch contract), `:112-133` (Alternative schema + reason strings), `:135-142` (widening cap: ≤3 widened + 1 tradeoff), `:144-156` (**sold-out tradeoff is outcome-agnostic — appears on `recommended`, `degraded` AND `no_availability`**), `:249-258` (SelectionProvider handoff note); `agent/src/cinepais_agent/events.py:21-50` (authoritative nullability); `web/src/lib/format.ts` (`formatCOP`); `web/src/app/showtimes/[id]/page.tsx:29-41` (UTC-safe `es-CO` date formatting to reuse); `specs/001-cine-copiloto-boletas.md:106` (never discourage the sale).
  Acceptance criteria: `cd web && pnpm build; pnpm lint; npx tsc --noEmit` all exit 0 · `grep -q 'qualityTier === null' src/components/copilot/recommendation-card.tsx` (or an equivalent explicit null check driving the disabled branch) · `grep -q 'useRouter' src/components/copilot/recommendation-card.tsx` and `grep -rc 'window.location' src/components/copilot/ | grep -v ':0$'` returns nothing (every file counts 0; `-r` is required — a bare grep on a directory exits 2 and proves nothing), with the positive control `grep -rc 'useRouter' src/components/copilot/ | grep -v ':0$'` returning at least one line to prove the sweep actually reached the files · the CTA href/target is built as `?preselect=` + comma-joined ids · fixture-replay assertions in Todo 14 confirm the disabled sold-out entry.
  QA scenarios: happy: replay a fixture whose recommendation carries a sold-out alternative and assert exactly one alternative element is disabled and carries the "Agotada" badge, while the others remain clickable. failure: feed the card a `no_availability` payload with `priceFrom: null`, `showtimeId: null`, `qualityTier: null` and assert it renders without throwing and without printing the literal strings `null`, `NaN`, or `undefined` anywhere in its text content. Evidence `/Users/reiorozco/Dev/cinepais/.omo/evidence/task-12-cinepais-phase-3-integration.txt`.
  Commit: N

- [x] 13. Limits and failure states rendered gracefully - expect 429, session cap and an unreachable agent all produce calm Spanish, never a crash
  What to do / Must NOT do:
    - Render `error` events as a distinct, non-alarming bubble using the agent's own Spanish `message` verbatim. Only when no message is available (transport failure) use the widget's own copy from Todo 4.
    - `rate_limit_exceeded` (HTTP 429, no SSE body): show the message and disable the send button for 60 seconds with a visible countdown in Spanish, then re-enable. This is the one place a timer is justified — it prevents the user hammering a limit that is protecting the demo's budget.
    - `session_cap_exceeded`: show the message and disable sending permanently for that session, with a Spanish line explaining the session limit and that reloading starts a new one. Do NOT silently mint a fresh `sessionId` to bypass the cap — that would defeat a deliberate Fase C cost control.
    - Surface the `done` counters: when `sessionQueriesUsed >= sessionQueryCap - 3`, show an unobtrusive Spanish line with remaining queries. Below that threshold show nothing.
    - `agent_unreachable`: Spanish message plus a hint that the agent may not be running. No stack traces, no English, no error codes shown to the user.
    - Every failure path must leave the widget usable — the panel stays open, prior messages stay visible, and `status` returns to a state where a retry is possible (except the permanent session-cap case).
    - Must NOT auto-retry. Must NOT rotate `sessionId` on cap. Must NOT display raw `code` values or HTTP status numbers in the UI (they belong in evidence, not in front of a user).
  Parallelization: Wave 3 | Blocked by: 11 | Blocks: 14
  References: `agent/docs/sse-contract.md:232-245` (full error code table with Spanish messages); `:160-177` (`done` counters); `agent/README.md` §Security + §Cost controls (10/min per IP, 20/session resets after 1h, why the caps exist); `web/src/lib/agent/client.ts` (synthetic 429 / unreachable mapping from Todo 4).
  Acceptance criteria: `cd web && pnpm build; pnpm lint; npx tsc --noEmit` all exit 0 · `grep -rc 'sessionStorage.removeItem\|sessionStorage.clear' src/components/copilot/ | grep -v ':0$'` returns nothing (no cap-bypass; `-r` required, and pair it with the positive control `grep -rc 'sessionStorage' src/components/copilot/ | grep -v ':0$'` returning at least one line so a silently-broken sweep cannot masquerade as a clean result) · fixture/route-level assertions in Todo 14 cover 429, session cap and unreachable · no English string appears in any user-visible copy added by this todo (inspect every added JSX string).
  QA scenarios: happy: intercept `**/chat` with `page.route()` fulfilling HTTP 429 (no body) and assert a Spanish message renders, the send control is disabled, and a countdown is visible. failure: intercept with `route.abort("failed")` to simulate a dead agent/CORS rejection and assert the widget shows the Spanish unreachable message and remains open. **The console-error assertion here must EXCLUDE browser network-failure entries**: a 429 emits `Failed to load resource: … 429` and an abort emits `net::ERR_FAILED` — both were measured during planning and are the browser reporting a dead resource, not app defects. Assert instead that no entry remains after filtering out messages matching `Failed to load resource`, i.e. no uncaught exception and no React error boundary. Evidence `/Users/reiorozco/Dev/cinepais/.omo/evidence/task-13-cinepais-phase-3-integration.txt`.
  Commit: N

- [x] 14. Playwright fixture-replay E2E of the whole copilot flow - expect the full HITL loop proven with ZERO Gemini spend
  What to do / Must NOT do:
    - **The agent must NOT be running. Zero `/chat` calls to a real agent. Assert `:8000` is free before starting and record that in evidence.**
    - Start the web dev server (re-seed first if the calendar day rolled over — see Todo 8).
    - Build the interception harness with `browser_run_code_unsafe`: `page.route("**/chat", route => route.fulfill({ status: 200, contentType: "text/event-stream", headers: { "cache-control": "no-cache" }, body: <fixture text> }))`. Load fixture bodies from `web/tests/fixtures/agent-sse/`.
    - Fixtures needed. First INSPECT the three real captures and record which shapes they actually contain. For any shape the real captures do NOT provide, author a synthetic fixture under `web/tests/fixtures/agent-sse/synthetic-*.txt`, each carrying a leading `: ` SSE comment line naming it synthetic and citing the `sse-contract.md` section it was derived from. A synthetic test input is legitimate; labelling one as a captured run is fabrication and is forbidden.
      - `recommended` with a sold-out alternative;
      - two `recommendation` events in one stream (last-wins) — the real narrow capture is documented to contain this; verify rather than assume;
      - `no_availability` with widened alternatives plus the sold-out entry;
      - tool-only turn with no `token` events;
      - conversational turn with tokens only;
      - an `error` event mid-stream.
    - Assertions, each recorded with its raw return value:
      1. The assistant bubble contains the full expected Spanish text once the turn settles, and the tool-label map returns the right Spanish string for each of the five tool names. **Do NOT assert incrementality or a mid-flight label** — one reader chunk, measured; that belongs to Todo 16.
      2. On the two-recommendation fixture, exactly ONE card is displayed and it reflects the **last** payload — assert on a field that differs between the two payloads (read both from the fixture and name the discriminating field in evidence).
      3. The sold-out alternative is disabled, badged "Agotada", and has no preselect CTA; sibling alternatives remain clickable. Verify on BOTH a `recommended` fixture and a `no_availability` fixture.
      4. Clicking the primary CTA navigates to `/showtimes/<id>?preselect=<ids>`, the seats become `data-preselected="true"`, **and the copilot panel is still open** — assert the panel element exists after navigation. This single assertion proves the whole architecture.
      5. 429 and unreachable behaviours from Todo 13.
      6. The 2000-char guard: type 2100 characters and assert the textarea value length is 2000.
    - Screenshot the money shot — panel open next to the seat map with pre-selected seats — to `.omo/evidence/task-14-hitl-money-shot.png`. Fase E will reuse this framing for the video.
    - Kill the dev server; confirm ports free.
    - Must NOT weaken any assertion. A failure means STOP and report the raw DOM/stream, per the STOP rule.
  Parallelization: Wave 3 | Blocked by: 11, 12, 13 | Blocks: 15
  References: `agent/docs/sse-contract.md` (all sections — the fixtures must conform); `.omo/notepads/cinepais-phase-2-agent-fixes/learnings.md` (F3 round-7 entry: the narrow query reproducibly emits TWO recommendation payloads and the later one is the correction — the basis for last-wins); `web/tests/fixtures/agent-sse/README.md` (Todo 1 measurements); `web/src/components/seats/seat-map.tsx:409` (`data-seat-id`); Todo 8 evidence (known-good showtimeId + seatIds).
  Acceptance criteria: all six assertion groups executed with raw outputs recorded · assertion 4 explicitly confirms the panel survived navigation · assertion 2 names the discriminating field between the two recommendation payloads and shows the rendered card matches the LAST one · evidence records that `:8000` had no listener for the entire run · money-shot screenshot saved · `browser_console_messages` at level `error`, **after filtering out entries matching `Failed to load resource`** (expected browser noise from the deliberate 429/abort probes), returns zero entries across the run.
  QA scenarios: happy: the full chain — replay fixture, card renders, click CTA, land on the seat map with 2 preselected seats, panel still open. failure: on the two-recommendation fixture, assert the count of rendered recommendation cards for that turn is exactly 1 — if 2 render, last-wins was not implemented; STOP. Evidence `/Users/reiorozco/Dev/cinepais/.omo/evidence/task-14-cinepais-phase-3-integration.txt` + `task-14-hitl-money-shot.png`.
  Commit: N

- [x] 15. Wave 3 close: commit + write `.omo/handoff-fase-d-wave-3.md` + STOP - expect a fresh chat can resume at Todo 16
  What to do / Must NOT do:
    - Full gate from `web/`: `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `pnpm build` — all exit 0 or STOP.
    - Commit: `feat(web): CinePaís copilot widget — SSE chat, recommendation card, HITL preselect CTA`. No attribution. No push.
    - `git add -f` the wave's evidence, including both PNGs and every fixture added.
    - Write `.omo/handoff-fase-d-wave-3.md` with all 8 sections. It MUST record: which fixtures are real captures vs synthetic (and why each synthetic one was needed), the discriminating field used for the last-wins assertion, the exact copy shipped for the 429/session-cap/unreachable states, and the fact that no live agent call has been made in the entire phase so far.
    - **STOP HERE.** Report Wave 3 complete; Wave 4 starts at Todo 16 in a fresh chat. Warn the user explicitly that Wave 4 is the ONLY wave that spends Gemini credit — 2 queries — so they can decline or defer.
  Parallelization: Wave 3 close | Blocked by: 14 | Blocks: 16
  References: §Execution strategy handoff template; `.omo/handoff-fase-c.md`; `.gitignore:26`.
  Acceptance criteria: `git log --oneline -1` shows the wave-3 subject · `git status --porcelain` empty · `test -f .omo/handoff-fase-d-wave-3.md` with all 8 section headings · the handoff states the upcoming live-query cost explicitly · `git rev-parse --verify main` still exits non-zero.
  QA scenarios: happy: `grep -c '^## ' .omo/handoff-fase-d-wave-3.md` returns at least 8. failure: `cd web && pnpm test; echo EXIT=$?` must print `EXIT=0` before committing. Evidence `/Users/reiorozco/Dev/cinepais/.omo/evidence/task-15-cinepais-phase-3-integration.txt`.
  Commit: Y | `feat(web): CinePaís copilot widget — SSE chat, recommendation card, HITL preselect CTA`

### Wave 4 — Live proof + docs (the only wave that spends Gemini credit)

- [x] 16. Live end-to-end proof against the real agent - expect 2 queries MAXIMUM, real CORS + streaming + preselect confirmed
  RESOLVED 2026-08-14: user gave explicit consent for exactly 2 real Gemini queries and confirmed `agent/.env` carries a valid `GOOGLE_API_KEY`. Pre-flight re-seed (`SEED_NOW=2026-08-15`) executed and the sold-out planted scenario (`st-site-med-1-imax-0-1400`, `availableCount: 0`) was re-verified on the FRESH seed before any spend. Exactly 2 `POST /chat` calls made and confirmed via `grep -c` on the raw agent log at three checkpoints (after query 2, after the 429 probe, and at final cleanup) — count never moved past 2. See `.omo/evidence/task-16-cinepais-phase-3-integration.txt` + `.omo/evidence/task-16-agent.log`.
  What to do / Must NOT do:
    - **BUDGET GATE: exactly 2 `POST /chat` calls. Not three. Count them and prove the count from the agent log.** If a run fails and a third call seems necessary, STOP and report rather than spending more.
    - Preconditions, in order: (1) web dev server on `:3000`; (2) DB seeded with `SEED_NOW` = tomorrow (`TZ=America/Bogota SEED=20260801 SEED_NOW=<tomorrow> pnpm prisma db seed`) — the 15-minute cutoff silently removes showtimes if the seed is stale, which manifests as a mysteriously empty agent answer; (3) pre-flight `curl -s http://localhost:3000/api/showtimes/st-site-med-1-imax-0-1400/seats` and confirm `summary.availableCount == 0`, proving the planted sold-out scenario is intact; (4) start the agent: `cd agent && uv run uvicorn cinepais_agent.main:app --port 8000`, capturing the log to a file.
    - Confirm from the agent's startup log which model actually resolved (`Using model: …`) and record it. Also grep the `httpx` lines for the model actually hit on the wire — the app's self-report and the wire agreeing is far stronger evidence than either alone, and it costs nothing.
    - Query 1 (BROAD, exercises the recommendation + sold-out tradeoff): send it **through the widget in the browser**, not curl — the entire point is proving the real browser→`:8000` path including CORS preflight and streaming. Assert: tokens streamed incrementally (not one lump at the end), a tool activity label appeared, a recommendation card rendered, and the panel behaved.
    - Then click the CTA and assert the seat map pre-selects the recommended seats and the panel stays open. Screenshot to `.omo/evidence/task-16-live-hitl.png`.
    - Query 2 (a different scenario, e.g. sold-out or no-adjacent) to exercise a second branch. Assert the card renders whatever branch comes back — **do NOT assert which `outcome` enum value appears.** That is LLM-trajectory-dependent and is exactly the class of criterion that cost four rounds in Fase C. Assert only structural invariants: a card rendered, no uncaught errors, and any alternative with `qualityTier === null` is disabled.
    - **If more than one `recommendation` event arrives in a turn, that is expected**, not a defect — assert the rendered card matches the LAST payload.
    - 429 check WITHOUT spending: assert the CORS/limit wiring by observing response headers on the two calls already made, or by exercising the widget's 429 path with `page.route()` as in Todo 13. Do NOT fire 11 rapid requests to trigger a real rate limit — that burns budget for a behaviour already proven deterministically.
    - Record from the agent log: the count of `POST /chat` lines (must be exactly 2), the model id, and observed latencies.
    - Kill the agent; confirm `:8000` free. Leave the web server state documented.
    - Must NOT change any code to make a live run pass. If the live run reveals a defect, record it, STOP, and report — a code change at this point needs its own todo and re-verification.
  Parallelization: Wave 4 | Blocked by: 15 | Blocks: 17
  References: `agent/README.md` §Run, §Seed rule (why `SEED_NOW` must be strictly future), §Troubleshooting; `.omo/notepads/cinepais-phase-2-agent-fixes/learnings.md` (todo-14 startup sequence; F3 round-7 entry on grepping the `httpx` log to prove the wire model and on multi-payload turns; the rule that two greens on a bimodal criterion prove nothing); `.omo/handoff-fase-c.md:28-33` (planted scenarios and their ids); `agent/docs/sse-contract.md:224-229` (latency expectations: tool turns 5-45s).
  Acceptance criteria: the agent log shows exactly 2 `POST /chat` entries (`grep -c '"POST /chat' <log>` returns `2`) · the resolved model id is recorded from BOTH the app log line and an `httpx` request line, and they agree · query 1 produced a rendered recommendation card in the browser and the CTA produced `data-preselected="true"` seats with the panel still open · `browser_console_messages` at level `error` returns zero entries · no `outcome` enum value is asserted anywhere in this todo's criteria · `:8000` confirmed free afterwards · screenshot saved.
  QA scenarios: happy: query 1 → card → CTA → preselected seats → panel open, all captured with raw values. failure: if a live turn emits an `error` event, capture the raw stream and STOP — do not retry into more spend and do not soften the criterion. Evidence `/Users/reiorozco/Dev/cinepais/.omo/evidence/task-16-cinepais-phase-3-integration.txt` + `task-16-live-hitl.png` + the raw agent log copied to `.omo/evidence/task-16-agent.log`.
  Commit: N

- [x] 17. Documentation: `web/README.md` copilot section + env var + preselect URL contract - expect a reader can run the whole thing from the docs alone
  What to do / Must NOT do:
    - Add a **Copiloto (Fase D)** section to `web/README.md` covering: what the widget does; that it talks DIRECTLY to the agent (no Next proxy) and why in one line; `NEXT_PUBLIC_AGENT_URL` with its default and the note that Fase E repoints it at Fly.io while `CORS_ORIGIN` on the agent must be repointed at the Vercel domain; the exact commands to run both halves locally (web on `:3000`, agent on `:8000`, plus the `SEED_NOW` seed rule); and the `?preselect=` URL contract with a worked example using the real ids from Todo 8.
    - Update the existing **UI pages** table in `web/README.md` to note that `/showtimes/[id]` now accepts `?preselect=`.
    - Document the pre-selection business-rule behaviour honestly: seats may be dropped for being sold, non-adjacent (orphan rule), beyond the max of 4, or accessibility seats — and that the UI says so in Spanish.
    - Grep the README for **behavioural claims** that this phase made stale, not just for keywords. Fase C recorded five separate doc/code drifts caught exactly this way; do the same sweep here.
    - If a mismatch between `agent/docs/sse-contract.md` and `agent/src/cinepais_agent/events.py` was confirmed (notably `priceFrom` nullability at `events.py:47`), record it in `web/README.md` as a note **and** in the final handoff as a Fase E advisory. **Do NOT edit `agent/docs/sse-contract.md` or any file under `agent/`.**
    - Must NOT add attribution lines. Must NOT document features that were not built.
  Parallelization: Wave 4 | Blocked by: 16 | Blocks: 18
  References: `web/README.md` (existing structure, §UI pages table, §Read API contract, §Business rules encoded); `agent/README.md` §Environment variables (`CORS_ORIGIN`, `WEB_API_BASE_URL`); `agent/src/cinepais_agent/events.py:47`; `agent/docs/sse-contract.md:72-95`; Todo 8 evidence (real ids for the worked example); AGENTS.md (no auto-generated attribution).
  Acceptance criteria: `grep -q 'NEXT_PUBLIC_AGENT_URL' web/README.md` · `grep -q 'preselect' web/README.md` · `grep -qi 'copiloto' web/README.md` · `git diff --name-only phase-2-agent -- agent/ | wc -l` returns `0` (agent untouched across the ENTIRE phase — this is the strongest single scope check in the plan) · `grep -ci 'generated with\|co-authored-by' web/README.md` returns `0`.
  QA scenarios: happy: a reader following only `web/README.md` §Copiloto can start both servers and reach a preselected seat map. failure: `git diff --name-only phase-2-agent -- agent/` must be EMPTY — if any agent file changed, STOP; the frozen contract was violated. Evidence `/Users/reiorozco/Dev/cinepais/.omo/evidence/task-17-cinepais-phase-3-integration.txt`.
  Commit: N

- [x] 18. Wave 4 close: commit + write `.omo/handoff-fase-d-final.md` + hand off to the final verification wave
  What to do / Must NOT do:
    - Full gate from `web/`: `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `pnpm build` — all exit 0 or STOP.
    - Commit: `docs(web): copilot integration guide, preselect URL contract, agent env var`. No attribution. No push.
    - `git add -f` all remaining evidence.
    - Write `.omo/handoff-fase-d-final.md` with all 8 sections, plus a dedicated **Fase E inputs** section listing: `CORS_ORIGIN` must move to the Vercel domain, `NEXT_PUBLIC_AGENT_URL` to the Fly.io host, the money-shot screenshot paths for the video, the confirmed model id, the total live-query spend (2), and every advisory found (including the `sse-contract.md` `priceFrom` nullability gap and anything else surfaced).
    - Also record the Fase C loose ends that remain open and were deliberately NOT touched (they are listed in `.omo/handoff-fase-c.md` §Known loose ends) so Fase E inherits a complete picture.
    - **STOP HERE.** Report Fase D implementation complete and tell the user the final verification wave (F1-F4) runs next and requires zero further LLM spend.
  Parallelization: Wave 4 close | Blocked by: 17 | Blocks: F1-F4
  References: §Execution strategy handoff template; `.omo/handoff-fase-c.md` (incl. §Known loose ends to carry forward); `.gitignore:26`.
  Acceptance criteria: `git log --oneline -1` shows the wave-4 subject · `git status --porcelain` empty · `test -f .omo/handoff-fase-d-final.md` with all 8 section headings plus a `Fase E inputs` section · `git log --oneline phase-2-agent..HEAD | wc -l` returns `4` (exactly four wave commits) · `git rev-parse --verify main` still exits non-zero · no remote configured, nothing pushed.
  QA scenarios: happy: `grep -q 'Fase E' .omo/handoff-fase-d-final.md`. failure: `git diff --name-only phase-2-agent -- agent/ | wc -l` must return `0`. Evidence `/Users/reiorozco/Dev/cinepais/.omo/evidence/task-18-cinepais-phase-3-integration.txt`.
  Commit: Y | `docs(web): copilot integration guide, preselect URL contract, agent env var`

## Final verification wave

> Runs after ALL todos. Lanes run in parallel BUT must not fight over shared state: **no lane switches branches, no lane re-seeds the DB, and only one lane at a time drives a browser.** (Fase B lost a review round to parallel reviewers colliding on `git checkout` and double-seeding.) All four must APPROVE. Results are surfaced to the user, who gives the final okay. **Zero LLM spend: no lane starts the agent.**

- [x] F1. Plan compliance audit - every todo's acceptance criteria independently re-verified
  Re-run every acceptance criterion in Todos 1-18 from a clean shell and record raw output. Confirm each todo's evidence file exists and that its numbers were derived from real captures, not narrative. Pair every negative-result grep with a positive control proving the grep could have matched (Fase C rule — a silently-broken grep also returns 0). Flag any criterion that is stale or unsatisfiable as written, citing the superseding text. Do NOT re-run the live agent. Evidence `/Users/reiorozco/Dev/cinepais/.omo/evidence/f1-wave-cinepais-phase-3-integration.md`.

- [x] F2. Code quality review - conventions, dead code, and the no-new-dependency guarantee
  Verify: `git diff phase-2-agent -- web/package.json` shows NO new runtime dependency and no jsdom/testing-library/playwright addition; every new file is English-named with English identifiers and comments while all user-visible strings are Spanish; no file added by this phase exceeds a reasonable size without justification; no dead constants or unused exports in `web/src/lib/agent/` or `web/src/components/copilot/`; no `any`; `pnpm lint` and `npx tsc --noEmit` exit 0. Confirm no direct writes to `selectedSeatIds` outside the reducer and that `toggle`/`clear`/`orphan.ts` are behaviourally unchanged. Evidence `/Users/reiorozco/Dev/cinepais/.omo/evidence/f2-wave-cinepais-phase-3-integration.md`.

- [x] F3. Hands-on QA - drive the real UI, fixtures only
  Start the web server, re-seed if the day rolled over, and personally exercise: the manual purchase flow from Fase B (regression — the widget must not have broken it), the copilot panel across three routes, panel persistence across client navigation, the preselect URL by hand, the over-cap and wheelchair refusal cases, the 429 and unreachable paths via `page.route()`, and the 2000-char guard. Parse every JSON payload per-event rather than trusting whole-stream greps (Fase C round-6 rule). Assert zero console errors. Do NOT start the agent. Evidence `/Users/reiorozco/Dev/cinepais/.omo/evidence/f3-wave-cinepais-phase-3-integration.md` + screenshots.

- [x] F4. Scope fidelity - nothing added, nothing dropped, nothing frozen was touched
  Verify: `git diff --name-only phase-2-agent -- agent/` is EMPTY; no `main` branch exists; nothing was pushed; exactly 4 wave commits; all four handoff files exist with their 8 sections; every §Must NOT have guardrail holds (grep for each banned dependency by name); no plan prose or acceptance criterion was edited by the executor (`git diff phase-2-agent -- .omo/plans/cinepais-phase-3-integration.md` should show checkbox flips only — enumerate every changed line and classify it). Confirm no key material anywhere: `grep -rnE "AIza[0-9A-Za-z_-]{20,}|AQ\.[A-Za-z0-9_-]{20,}" web/ .omo/` returns zero. Evidence `/Users/reiorozco/Dev/cinepais/.omo/evidence/f4-wave-cinepais-phase-3-integration.md`.

## Commit strategy

Branch `phase-3-integration`, created off `phase-2-agent` in Todo 1. **Four commits, one per wave**, conventional messages, no attribution lines of any kind, **no push** (no remote is configured, and Fase E owns publishing).

| Wave | Todo | Message |
| --- | --- | --- |
| 1 | 5 | `feat(web): agent SSE transport — WHATWG parser, Zod event schemas, streaming client` |
| 2 | 9 | `feat(web): HITL seat pre-selection — preselect reducer action + ?preselect= URL contract` |
| 3 | 15 | `feat(web): CinePaís copilot widget — SSE chat, recommendation card, HITL preselect CTA` |
| 4 | 18 | `docs(web): copilot integration guide, preselect URL contract, agent env var` |

Evidence under `.omo/evidence/` requires `git add -f` (`.gitignore:26`). Handoff files at `.omo/handoff-fase-d-wave-<N>.md` and `.omo/handoff-fase-d-final.md` are committed with their wave. The executor may flip checkboxes in this plan and commit boulder/draft/notepad state, but **must never edit the plan's prose or acceptance criteria**.

## Success criteria

1. A user opens any page, clicks the copilot bubble, asks in Spanish, and sees the answer stream in with a visible indication of work during a 5-45s tool turn.
2. When the agent recommends, a structured card renders from the `recommendation` payload alone — never from prose — and when a turn emits several payloads, exactly one card shows and it reflects the last.
3. Sold-out alternatives (`qualityTier === null`) render disabled with an "Agotada" badge on `recommended`, `degraded` and `no_availability` alike, while actionable alternatives stay clickable.
4. Accepting a recommendation navigates client-side to the seat map, pre-selects the seats through the real business rules, keeps the copilot panel open, and buys nothing.
5. Pre-selection honours max-4, the orphan rule and the wheelchair exemption; when seats are dropped the UI explains it in Spanish instead of failing silently.
6. The `?preselect=` URL contract works from a hand-typed URL with no agent running — the HITL feature is provable without an LLM.
7. Rate limits, session caps and an unreachable agent all produce calm Spanish copy and leave the widget usable; the session cap is never bypassed.
8. `agent/` is byte-identical to `phase-2-agent`; the SSE contract was not edited.
9. No new runtime dependency, no jsdom, no testing-library; `pnpm test`, `pnpm lint`, `npx tsc --noEmit` and `pnpm build` all exit 0.
10. Total live LLM spend for the phase is exactly 2 queries, proven from the agent log.
11. Four handoff files exist, each complete enough that a fresh chat resumed the next wave without re-reading the codebase.
12. All four final verification lanes APPROVE, and the user gives the final okay.
