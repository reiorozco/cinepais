# cinepais-phase-3-integration - Planning Draft

> Prometheus planning state. Resume point after compaction. Plan file is NOT written until the user approves.
> NOTE: scaffold-plan.mjs could not be run — this planning session has no shell tool. Draft hand-built with the
> script's field set preserved. Same applies to the plan file if approved.

```yaml
slug: cinepais-phase-3-integration
intent: clear
review_required: false      # user stated post-phase reviews are "lean" unless they say otherwise
classification: Architecture   # spans web/ lib + providers + a route + a new UI surface; cross-phase contract
status: plan-complete
plan_path: .omo/plans/cinepais-phase-3-integration.md
pending-action: none — plan delivered, awaiting the user's start-work decision
approved_at: user approved after the Q1-Q4 brief, adding a mandatory per-wave handoff requirement
shape: 18 implementation todos across 4 waves + 4 final verifiers
metis: run; 1 BLOCKER + 3 MAJOR + 2 MINOR folded in (dirty-tree precondition scoped to web/+agent/ with a
  planning-artifacts pre-commit; vacuous `grep -qv .trim()` replaced with an inverted positive count + control;
  4 directory greps given `-r` + positive controls; selection.test.ts untouched-check added; Todo 10 z-index
  bounding-box check added; 429 body key `error` vs `code` documented in Todo 4)
```

## Components ledger (topology lock)

| id | outcome | status | evidence |
|---|---|---|---|
| C1 SSE transport | Browser can POST to the agent and receive parsed, schema-validated named events | explored | `agent/docs/sse-contract.md`; librarian brief (WHATWG §9.2.6) |
| C2 Chat widget UI | Spanish floating copilot panel in `web/`, streams tokens, shows tool activity, handles all 5 event types + limits | explored | `web/src/app/layout.tsx:42-48` (provider mount point); `web/src/components/ui/` (9 shadcn parts) |
| C3 Recommendation card | Structured card + alternatives rendered ONLY from the `recommendation` payload, soldout entries disabled | explored | `sse-contract.md:112-156` |
| C4 HITL pre-selection | Navigate to `/showtimes/[id]` and pre-select recommended seats through the EXISTING business rules | explored | `web/src/lib/business/selection.ts:38,73-144`; `web/src/components/seats/seat-map.tsx:99-123` |
| C5 Deterministic verification | Full widget + preselect provable with zero LLM spend | explored | `web/vitest.config.ts` (node env, `tests/**/*.test.ts`); Phase C captured SSE streams in `.omo/evidence/` |

## Verified facts (with paths)

### Repo / git
- Branches: `phase-0-scaffold`, `phase-1-ui`, `phase-2-agent`. **No `main`.** HEAD = `phase-2-agent` (`.git/HEAD`).
- `.git/logs/HEAD:15` — `checkout: moving from phase-1-ui to phase-2-agent` at the SAME sha `578d832`.
  **=> `phase-2-agent` is a linear superset containing the whole Fase B UI.** Fase D can branch off it and has both halves.
- `.gitignore:26` ignores `.omo/evidence/` → evidence needs `git add -f` to land (carried over from Fase C).

### web/ stack (all read from files, not recalled)
- `web/package.json`: Next `16.3.0`, React/ReactDOM `19.2.8`, Tailwind `^4`, Zod `^4.4.3`, Vitest `^2.1.9`,
  ESLint `^9`, pnpm `10.28.1`. Scripts: `dev`, `build`, `start`, `lint` (`eslint`), `test` (`vitest run`), `test:watch`.
  **No `typecheck` script** → `npx tsc --noEmit`. **No Prettier.**
- `web/tsconfig.json`: `strict: true`, alias `@/*` → `./src/*`, `exclude: ["node_modules","tests"]`.
- `web/vitest.config.ts`: `environment: "node"`, `include: ["tests/**/*.test.ts"]`.
  **=> NO jsdom, NO testing-library, NO Playwright package. React components cannot be unit-tested today.**
- shadcn `base-nova`, installed primitives: accordion, badge, button, card, dialog, select, skeleton, sonner, tabs.
- Brand tokens in `web/src/styles/globals.css`: `--brand-header`, `--surface-dark`, `--seat-available`,
  `--seat-selected`, `--seat-sold`, `--seat-preferential`.
- `web/src/app/layout.tsx:42-48`: `<CityProvider><SelectionProvider>{Header, children, Footer}</SelectionProvider></CityProvider>`
  then `<Toaster/>`. Root layout is NOT remounted on client navigation → a widget mounted here keeps its
  conversation across the navigation to the seat map. **This is what makes HITL possible.**
- `grep chat|copilot|EventSource|SSE` over `web/src` → **0 matches**. Nothing to reuse or collide with.

### Seat selection machinery (the HITL target)
- `web/src/lib/business/selection.ts`: `selectionReducer(state, action)`;
  `SelectionState = { showtimeId: string|null; selectedSeatIds: Set<string>; error: "max"|"orphan"|null }`;
  actions today are only `{type:"toggle", showtimeId, seat, rowSeats, blocks}` and `{type:"clear"}`.
  `MAX_SEATS = 4` (`:38`); orphan checked per block (`:120-141`); wheelchair treated as Sold in orphan check (`:70`).
- `web/src/components/providers/selection-provider.tsx`: Context + `useReducer`, split state/actions contexts,
  toast on `error` transition (`:42-50`). Hooks `useSelectionState`, `useSelectionActions`, `useSelection`.
- `web/src/components/seats/seat-map.tsx`: client island; receives `seats` as PROPS (never in context);
  `seatId` is `area_row_col` and lands on `data-seat-id` (`:409`); fill classes at `:444-450`
  (`bg-seat-selected` / `bg-seat-sold` / `bg-seat-preferential` / `bg-seat-available`);
  wheelchair first-click opens a confirm dialog (`:115-119`).
- Route: `/showtimes/[id]` — Server Component, `getSeats(id)` + `getFilmDetail(...)`, **accepts no query params today**.
- `useSelection().dispatch` is reachable from ANY client component under the root layout, including the widget.
  BUT the widget has no seat data, so it cannot build a `toggle` action itself. Pre-selection must happen
  where the seats live: on the seat-map page, after navigation.

### Agent contract facts that constrain the UI
- `POST :8000/chat` `{message, sessionId}` → `text/event-stream`, named events
  `token|tool_call|recommendation|done|error`.
- `recommendation` is built ONLY from `recommend_best` output, never from LLM text (`sse-contract.md:74`).
- `Alternative.qualityTier` NULLABLE; `null` + `reason:"esta función está agotada"` = soldout tradeoff entry,
  appears on **all three outcomes** incl. `no_availability` (`sse-contract.md:144-156`). Max 3 widened + 1 tradeoff.
- `token` may be **absent** on tool-only turns (`sse-contract.md:212`) → never gate the card on prose.
- **Multiple `recommendation` events per turn are normal and the LATER one is the correction.**
  Evidence: notepad `cinepais-phase-2-agent-fixes/learnings.md` — todo 17 (`city="El Poblado"` → `city="Medellín"`)
  and F3 round 7 (Premium/Laureles → re-query honouring IMAX). **=> last-wins is evidence-backed, not a guess.**
- `agent/src/cinepais_agent/mcp_server.py:22,157,208`: `_MAX_SEATS = 4`, `n > 4` returns an error dict.
  **=> `seatIds.length <= 4` always; the widget still validates rather than trusting it.**
- Limits: 10 req/min per IP (429), 20 queries/session, input 2000 chars, `MAX_OUTPUT_TOKENS=1024`,
  CORS locked to `CORS_ORIGIN` (default `http://localhost:3000`). Latency 1-5s conversational, **5-45s tool turns**.
- All `error.message` values are already Spanish → widget renders them, never re-authors them.

### External research (librarian, cited)
- Native `EventSource` cannot POST. Options: hand-rolled `fetch` + `getReader` + WHATWG parse (0 deps);
  `@microsoft/fetch-event-source` v2.0.1 **last published 2021-04-25, frozen**; `eventsource-parser` v4.0.0 (active);
  Vercel AI SDK `ai` v7 — **incompatible**, requires the backend to speak the AI-SDK data-stream protocol.
- WHATWG §9.2.6 parse rules: normalize `\r\n`/`\r` → `\n` BEFORE splitting; strip exactly ONE leading space
  after `:`; blank line dispatches; `:`-prefixed lines are comments; `TextDecoder({stream:true})` for
  multi-byte chars split across chunks. #1 real-world bug = a frame straddling a chunk boundary.
- Next Route Handler SSE passthrough works (`new Response(upstream.body, ...)`) but needs
  `dynamic="force-dynamic"`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`.
  Vercel Hobby streaming max duration reported ~25s.

## Adopted defaults (announced, not asked)

1. **Hand-rolled SSE parser, zero new runtime dependencies.** ~60 LOC, WHATWG-compliant, and — decisive here —
   it is a pure function unit-testable inside the EXISTING node-env Vitest with no jsdom/testing-library.
   Rejected: `@microsoft/fetch-event-source` (frozen 5 years), `eventsource-parser` (fine but unnecessary),
   AI SDK (protocol-incompatible).
2. **Zod schemas for every event payload.** Zod 4 already ships in `web/`; matches `web/src/lib/api/schemas.ts`.
   Never trust the wire; a malformed payload degrades to a Spanish error bubble instead of crashing the widget.
3. **`preselect` becomes a NEW reducer action, not a loop of `toggle`s.** `toggle` is not idempotent — React 19
   StrictMode double-effects would silently DESELECT everything. A `{type:"preselect"}` action that SETS a
   validated selection is idempotent, runs through max-4 + orphan + wheelchair rules (no bypass), and is
   deterministically unit-testable. Additive: existing `toggle`/`clear` tests stay untouched.
4. **Pre-selection skips wheelchair seats** and reports it in Spanish. Spec rule #4 — accessibility seats are
   never auto-selected on someone's behalf. (Agent already avoids recommending them; this is defence in depth.)
5. **Truncated prose gets no heuristic.** `MAX_OUTPUT_TOKENS=1024` can cut mid-sentence and the contract emits
   no truncation signal — inventing one means guessing. The recommendation CARD is the source of truth and is
   built from tool output, so it is never truncated; the prose is decoration. Render as received.
6. **`sessionId` = `crypto.randomUUID()` persisted in `sessionStorage`**, so a reload keeps the 20-query budget
   honest rather than farming a fresh one, and two tabs do not share a cap.
7. **Client-side 2000-char guard** on the input so `input_too_long` can never be reached from the widget.
8. **Suggestion chips** with 3-4 hardcoded Spanish queries aimed at the planted seed scenarios. Zero AI,
   makes the demo reproducible, and gives the empty state a job.
9. **Spanish UI copy / English code**, per AGENTS.md. No new deps beyond what `shadcn add` may pull.

## AI-vs-deterministic analysis (user explicitly requested)

**Fase D adds ZERO new AI.** Every part is deterministic:

| Concern | Resolution | Why not AI |
|---|---|---|
| Extract showtime + seats from the answer | `recommendation` event payload | Contract already forbids parsing LLM text (`sse-contract.md:74`) |
| Decide which recommendation wins | last event of the turn | Evidence-backed rule, not a judgement call |
| Detect a soldout alternative | `qualityTier === null` | Field-level, exact |
| Validate a pre-selection | existing `wouldLeaveOrphan` + max-4 | Pure functions already unit-tested in Fase B |
| Error copy | agent already sends Spanish `message` | Re-authoring it would duplicate a frozen contract |
| Starter prompts | 4 hardcoded strings | An LLM writing UI copy is spend with no upside |

**Where AI could theoretically help and is deliberately rejected:** client-side intent classification for chips,
LLM-authored microcopy, prose→structure extraction. All three are cost with negative reliability value here.

## Owner-decisions — ANSWERED by the user (locked)

- **Q1 Branch topology → `phase-3-integration` branched off `phase-2-agent`.** Keeps the linear phase-N chain.
  `main` is explicitly NOT created in this phase; that decision moves to Fase E alongside deploy + push.
- **Q2 Transport → DIRECT browser → agent**, base URL from `NEXT_PUBLIC_AGENT_URL` (default `http://localhost:8000`).
  No Next.js proxy Route Handler. Rationale locked: (a) slowapi's rate limit is per-IP and a proxy collapses it
  into a single global bucket (regression of a Fase C defence); (b) tool turns run to 45s while Vercel Hobby
  streaming caps ~25s, so a proxy would sever exactly the most valuable queries. CORS already permits :3000.
  **Consequence for Fase E (record, do not implement here): `CORS_ORIGIN` must be repointed at the Vercel domain
  and `NEXT_PUBLIC_AGENT_URL` at the Fly.io host.**
- **Q3 Widget shape → floating bubble bottom-right opening a panel.** Decisive property: the root layout is not
  remounted on client navigation, so the panel stays open across `router.push` to `/showtimes/[id]` — conversation
  and pre-selected seat map visible in ONE frame. That is the "antes vs después" shot for Fase E.
- **Q4 Verification budget → fixture-replay first, live agent last.** Captured Fase C SSE streams become checked-in
  fixtures; Playwright `page.route()` fulfils `POST **/chat` from them, so the whole widget is E2E-verified with
  ZERO LLM spend. The live agent is exercised only in the final wave, **capped at 2 real queries**, purely to prove
  the live browser→:8000 wiring (CORS, streaming, 429 shape). No mock code ships in the product bundle.

## Playwright fixture-replay probe (measured during planning — do not re-litigate)

Ran a hermetic probe (no app, no agent, no real network) to de-risk the plan's most fragile assumption before
execution. Verdict: **the mechanism works.** Raw measurements:

- Cross-origin `POST http://localhost:8000/chat` IS intercepted by `page.route("**/chat")`; `postData` preserved
  verbatim including `¿` and accents.
- `route.fulfill({ contentType: "text/event-stream", body })` → `res.status 200`, `res.body.getReader()` works,
  533 bytes, **5 frames in order**: `tool_call, token, token, recommendation, done`. Accents intact through
  `TextDecoder`.
- `status: 429` + JSON body deliverable and readable. **Body key is `error`, not `code`** — independently confirms
  the Metis near-miss; Todo 4 now says to read `message` only and hardcode the code.
- `route.abort("failed")` → in-page `TypeError: Failed to fetch`. That is the exact shape Todo 4's
  `agent_unreachable` branch must catch.

**Three limits found, each of which invalidated a criterion I had written — folded into the plan:**

1. `readerChunks: 1` — fulfill delivers the WHOLE body in one chunk. "Tokens stream incrementally" and
   "a tool-activity label appears mid-flight" are **unobservable against a fixture**. Moved: incrementality →
   live Todo 16; chunk-boundary correctness → byte-at-a-time Vitest in Todo 3; tool label → deterministic
   map assertion. This was the exact Fase C failure mode (a criterion satisfiable only by luck) and the probe
   caught it before any code was written.
2. `preflight: 0` — fulfilling satisfies CORS without a separate `OPTIONS` round trip, so **fixtures never
   exercise real CORS**. Only Todo 16 proves it. Recorded so no reviewer over-claims fixture coverage.
3. A 429 and an abort each emit a browser-level console error (`Failed to load resource: … 429`,
   `net::ERR_FAILED`). These are the browser reporting a dead resource, NOT app defects. Every "zero console
   errors" criterion now excludes `Failed to load resource` and asserts on uncaught exceptions instead —
   otherwise Todos 13 and 14 would have failed spuriously on correct code.

## Approval gate

Brief presented with Q1-Q4. Waiting for the user's explicit okay. Approval authorizes writing
`.omo/plans/cinepais-phase-3-integration.md` ONLY — never implementation. Execution is a separate
`/start-work` session started by the user.
