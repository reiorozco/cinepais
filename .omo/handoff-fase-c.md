# Handoff — Planning Fase C (agente LangGraph + MCP)

> For the Prometheus planning session that follows. Read this FIRST, then `.omo/drafts/cinepais-phase-1-ui.md` (decisions ledger of Fase B) and the specs. Everything here is verified fact as of 2026-08-06, not aspiration.

## Project state

| Fase | Estado | Plan | Branch |
|---|---|---|---|
| 0 — scaffold + read API + seed | ✅ done + dual-review PASSED | `.omo/plans/cinepais-phase-0-scaffold.md` | `phase-0-scaffold` (4 commits) |
| B — UI compra manual | ✅ done + 5-lane review-work PASSED | `.omo/plans/cinepais-phase-1-ui.md` | `phase-1-ui` (3 commits, NOT pushed, NOT merged) |
| C — agente (NEXT) | planning | — | — |
| D — integración copiloto↔UI · E — polish/deploy/demo | pending | — | — |

No `main` branch exists yet. Merging strategy = user's decision, out of planning scope so far.

## What Fase C consumes (verified working)

**Read API** (Next.js 16.3, `web/`, dev on :3000) — all Zod-validated, documented with real examples in `web/README.md`:
- `GET /api/cities` → `[{id, name}]` (city-1 Bogotá, city-2 Medellín)
- `GET /api/films?city=` → 10 films (city param works SERVER-SIDE — UI doesn't use it, agent CAN)
- `GET /api/films/:id` → detail (synopsis, director, cast, genres)
- `GET /api/showtimes?filmId&city&date&format` → includes **`priceFrom` (int COP)**; 15-min cutoff already applied server-side
- `GET /api/showtimes/:id/seats` → seats with **`price`**, `qualityTier` (`low|optimal|high`), `areaCategory` (`general|premium|wheelchair|preferential`), `status`; summary with `availableCount`, `byArea` (4 fixed keys), **`priceTable`**
- Errors: 404 `{error:"not_found"}`, 400 `{error:"validation_error",details}`

**Pricing** (computed, not stored): base IMAX 32000 / Onyx 28000 / Premium 24000 / 2D-Doblada-Subtitulada 18000 × zone (general/wheelchair 1.0, preferential 1.15, premium 1.35) × **Wednesday 0.6** (America/Bogota businessDate), round to nearest 500. Seed emits SINGLE-format showtimes only: `["IMAX"]`, `["2D"]`, `["Premium"]`.

**Seed** (deterministic: SEED=20260801, SEED_NOW=2026-08-01T00:00:00-05:00): 2 cities, 6 sites (site-med-1..3, site-bog-1..3), 4 rooms/site (imax 13×20=260, 2d-1/2d-2 12×15=180, premium 9×10=90), 10 films (film-01..10), 7 days, 4 slots/room/day → **672 showtimes, 119,280 seats**. **Planted scenarios** (discoverable via API, ids like `st-site-bog-3-imax-4-2245`):
- `soldout`: first "Sombras del Puente" showtime, day 0, site-med-1, imax
- `front-only`: "La Odisea" day 1, site-med-2, imax (only rows 1-2 available)
- `optimal`: "La Odisea" day 2, site-med-2, imax (~30% sold, rows 4-8 wide open)
- `no-adjacent`: 2D showtime day 3, site-bog-1, 2d-1 (checkerboard — no 3 contiguous)

**Business rules** (pure fns in `web/src/lib/business/`): `wouldLeaveOrphan(rowAvailability, selection, aisleCols)` 0-based; rooms have visual BLOCKS (aisles): imax [1,5][6,15][16,20], 2d [1,4][5,11][12,15], premium [1,10] (1-based inclusive, in `layout.ts`); wheelchair seats EXEMPT from orphan (treated as Sold in the check); max 4 seats; quality rows 1-3 low / 4-8 optimal / 9+ high (proportional smaller rooms).

## Fase C scope (from specs — re-read `specs/001` + `specs/002` §Sesión C)

`agent/` (Python) with **LangGraph + MCP + FastAPI/SSE** (MatchDay pattern): MCP tools consuming the read API (`search_showtimes`, `seat_availability`, `adjacent_seats(n)`, `recommend_best`), agent answers Spanish NL queries (availability, N adjacent, best-of-weekend by quality, cheapest, sold-out) **explaining tradeoffs** with **client↔business balance** (never discourages the sale — spec decisión #3 = killer feature). LLM: **Gemini Flash** via `init_chat_model` (provider-agnostic). Evals for ~5 query types. Security per AGENTS.md: least-privilege tools only, scope-narrow system prompt (polite off-topic refusal, never reveals prompt), rate-limit (slowapi), token caps, session query cap, CORS to web origin, LangSmith tracing. Agent NEVER invents data. Deploy (Fly.io) is Fase E, NOT C.

Acceptance (spec §Criterios): ≥5 query types correct vs mock; recommends BY QUALITY not just availability, explains tradeoff ≥1 case; balances satisfaction+conversion; respects rules (max/orphan/accessibility) and answers by price (format/zone/discount-day). HITL pre-selection is Fase D (agent recommends; UI integration later) — but the SSE payload shape for D should be planned in C.

## Conventions (non-negotiable, AGENTS.md)
Code/identifiers English · agent replies + UI Spanish · fictional brand CinePaís (never CineColombia) · mock only · commits only when asked, branch-first, NO push, NO attribution lines · phase runs in fresh chat via `/start-work` (Atlas executes, Prometheus plans).

## Proven workflow (repeat it)
1. Prometheus: explore → draft (`.omo/drafts/<slug>.md`) → brief → user ok → plan (`.omo/plans/<slug>.md`).
2. Dual high-accuracy review (Momus + independent Oracle), iterate to double-APPROVE — caught 12+ real blockers in Fase 0, 5+ in Fase B. Worth it every time.
3. User runs `/start-work` in fresh chat. If 2 plans exist, POINT ATLAS to the right one explicitly.
4. Post-implementation: 5-lane review-work. **LESSON: serialize lanes that mutate shared state (DB seeding, branch checkouts) — parallel reviewers collided in Fase B's review (false FAILs from concurrent `git checkout` + double-seeding). Instruct reviewer lanes: NO branch switching, coordinate DB access.**

## Known loose ends (non-blocking, park for Fase E polish)
- `checkout/page.tsx` client fetch lacks error handling (infinite skeleton on network fail).
- `preload` prop on `<Image>` in film-card/hero-carousel (likely meant `priority`).
- Wheelchair dialog title copy conflates preferential/wheelchair.
- `f3-step-*.png` (9 files) untracked at repo root → move to `.omo/evidence/`.
- Optional hardening: recompute order server-side on confirmation; Zod-gate `?format=`.
- Missing minor tests: reducer showtime-switch branch; Onyx pricing case.

## Suggested slug for Fase C plan
`cinepais-phase-2-agent` (keeps the phase-N pattern; specs call it Sesión C / Fase 2).

## Open questions Prometheus should resolve in Fase C planning (explore first, ask only owner-decisions)
- Python tooling: uv + ruff + pytest? (programming skill defaults) — likely adopt-default.
- LangGraph architecture: single ReAct agent w/ tools vs graph with recommend node — explore MatchDay pattern refs, propose.
- MCP transport: agent-internal MCP client → tools hitting web API via HTTP; confirm exact MCP server/client libs current versions (research needed — training data likely stale).
- Gemini Flash model id + budget-cap mechanism (research current).
- Evals harness: simple pytest-based vs langsmith evals — propose.
- Where does the web dev server run during agent dev/tests: assume localhost:3000 running, document as prerequisite.
- SSE contract for Fase D (message shape incl. recommendation payload: showtimeId + seatIds for HITL preselection) — design NOW so D doesn't rework C.
