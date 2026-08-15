---
slug: cinepais-phase-1-ui
status: review-passed
intent: clear
review_required: true
pending-action: user runs /start-work in a fresh chat to activate Atlas on this plan
plan_path: .omo/plans/cinepais-phase-1-ui.md
review:
  momus:
    status: complete
    session: ses_02c0b7756ffeSKEoF9S58JBufL
    rounds: 2
    result: "R1 REJECT (3 blockers: pricing literal self-contradiction, wave-1 commit race Todo6-before-Todo4, 2 non-executable Playwright asserts) → R2 OKAY (2 residual Scope-bullet NITs, fixed post-review)"
  independent:
    status: complete
    session: ses_02c0b2433ffew6WsqrOJMtHaL3
    rounds: 2
    result: "R1 REJECT (blockers: seed emits single-format showtimes so pricing tests were against impossible data; orphan 1-based/0-based index mixing; plus city-policy/provider-shape/URL-payload/wheelchair-orphan NITs) → R2 APPROVE ('Plan is ready for /start-work'; 2 NITs fixed post-review)"
amended-decision: pages do NOT self-fetch their own HTTP API (build-time static prerender would fail hitting localhost); shared data-access lib/api/queries.ts is used by BOTH route handlers (thin wrappers, HTTP contract intact for the agent) and Server Components (direct import). Client components use HTTP helpers.
amended-decision-2: seed has contiguous cols (no aisle seats); layout.ts defines visual BLOCKS per room type; UI renders gaps between blocks; orphan validation runs wouldLeaveOrphan per block slice with empty aisleCols.
approach: Build the full manual purchase UI ("antes" experience) in web/ consuming the existing read API — home, catalog, film detail + showtimes accordion, interactive seat map with business-rule validation (max 4, orphan), simulated checkout — faithful to design-reference screenshots 01-05 with CinePaís brand identity, plus the computed pricing module (COP, format×zone×Wednesday) exposed through the API for Fase C reuse. Visual work executed with impeccable + frontend skills; QA via Playwright MCP against the reference screenshots.
---

# Draft: cinepais-phase-1-ui

## Components (topology ledger)
| id | outcome | status | evidence |
| --- | --- | --- | --- |
| pricing | `lib/business/pricing.ts` (COP matrix: format base × zone multiplier × Wednesday discount) + unit tests; API exposes `priceFrom` (showtimes) and per-seat `price` + `priceTable` (seats endpoint); schemas.ts extended | active | vitest + curl |
| brand-foundation | globals.css palette switched to CinePaís reference tokens (OKLCH), metadata/lang=es, CinePaís wordmark SVG, header + footer shells | active | build + screenshot |
| ui-primitives | shadcn components added (button, card, badge, tabs, select, accordion, dialog, skeleton, sonner) + typed API client helpers + city selector state | active | build + tsc |
| page-home | `/` — nav, city selector, hero carousel (3 destacados), tabs Cartelera/Pronto/Preventa, film grid, footer (screenshot 01) | active | Playwright screenshot |
| page-catalog | `/films` — dark-bg poster grid + tabs + filter button (screenshot 02) | active | Playwright screenshot |
| page-film-detail | `/films/[id]` — backdrop hero, ficha (director/cast/duración/género), sinopsis, Horarios: date selector (7 días), format tabs, accordion por cine with showtime cards (screenshots 03-04) | active | Playwright screenshot |
| page-seat-map | `/showtimes/[id]` — info card, legend (5 states), interactive seat grid (zones, wheelchair icons, aisles), selection with max-4 + orphan validation, running total, CTA (screenshot 05) | active | Playwright interaction test |
| page-checkout | `/checkout` — order summary (film/función/sillas/precios/total COP), confirm button → mock confirmation page with deterministic order number | active | Playwright flow test |
| polish-qa | impeccable + visual-qa pass vs screenshots 01-05, responsive (mobile usable, desktop faithful), loading/empty/error states, a11y basics | active | side-by-side screenshots |

## Open assumptions (announced defaults)
| assumption | adopted default | rationale | reversible? |
| --- | --- | --- | --- |
| Pricing matrix (COP) | Base: 2D=18000, Doblada/Subtitulada=18000 (language formats don't change price), IMAX=32000, Onyx=28000, Premium room=+0 (zone drives it). Zone multipliers: general=1.0, preferential=1.15, premium=1.35, wheelchair=1.0. Wednesday (America/Bogota businessDate)=×0.6. Round to nearest 500 COP | realistic Colombian cinema prices; deterministic; enables "más económica" queries in Fase C | yes (constants file) |
| `priceFrom` on Showtime | min seat price for that showtime (usually general non-Wednesday) | what listing UIs show | yes |
| Seats response pricing | each seat gets `price: number` (COP int); summary gets `priceTable: { general, preferential, premium, wheelchair }` | UI total + agent reasoning | yes |
| Tabs Pronto/Preventa | tabs render; Pronto/Preventa show elegant empty state ("Próximamente...") — all 10 films live in Cartelera | no releaseStatus in schema; empty state avoids schema/seed changes | yes |
| Hero carousel | first 3 films by id, posterUrl as background, deterministic | no "featured" flag in schema | yes |
| City selector | header select fed by /api/cities; persisted in localStorage; default = first city (Bogotá); filters films + showtimes views | matches reference nav; no auth/user | yes |
| Badges on cards | deterministic from film id hash: ids 01-06 "Estreno", 07-08 none, 09-10 "Preventa" (visual only) | screenshot fidelity without schema change | yes |
| Routes | `/` home · `/films` catalog · `/films/[id]` detail · `/showtimes/[id]` seat map · `/checkout` + `/checkout/confirmation` | conventional App Router | yes |
| Selection state | React context (SelectionProvider) holding showtimeId + seatIds + prices; survives navigation to checkout via context (no URL serialization); page refresh on /checkout redirects home (acceptable for demo) | simplest correct; HITL preselección in Fase D will reuse this provider | yes |
| Aisles for orphan rule | UI computes aisleCols per room layout constant (mirror of seed layout: IMAX 13×20, 2D 12×15, premium 9×10; aisle positions defined in one shared constants file `lib/business/layout.ts`) | seed materialized seats without explicit aisle data | yes |
| Zoom controls on seat map | CSS transform scale (0.75×/1×/1.25×) buttons, bottom-right per screenshot 05 | fidelity; cheap | yes |
| Wheelchair seats UX | selectable only after a confirm dialog ("¿Necesitas silla de accesibilidad?") — spec rule #4 handled with care | spec requires care, not blocking | yes |
| Order number | deterministic hash of showtimeId+seatIds → `CP-XXXXXX` | demo reproducibility | yes |
| Component tests | pricing unit tests (Vitest) + selection-hook logic tests; NO component/DOM tests — UI verified by agent-executed Playwright QA per todo | portfolio scope; Playwright MCP covers real behavior without adding test deps | yes |
| Playwright | via Playwright MCP (agent tooling) — NOT added as repo dependency | QA is agent-executed; repo stays lean | yes |
| Base UI reality | components come from shadcn 4.16 `base-nova` (Base UI) — do NOT fight it back to new-york/Radix; restyle via tokens + className | that's what init produced; tokens deliver fidelity | no (committed) |
| Metadata/brand | lang="es", title "CinePaís — Cine en Colombia", description in Spanish, CinePaís wordmark SVG (text + film-reel glyph) in header | AGENTS.md: UI Spanish, fictional brand | yes |

## Findings (cited - path:lines)
- `web/src/lib/api/schemas.ts:1-94` — real Zod shapes: FilmSummary/FilmDetail/Showtime (has siteName+city denormalized), Seat (row/col/area/status/areaCategory/qualityTier), SeatSummary.byArea fixed 4 keys. Pricing todo EXTENDS these (adds priceFrom, price, priceTable).
- `web/src/lib/business/orphan.ts:11-15` — `wouldLeaveOrphan(rowAvailability: SeatStatus[], selection: number[], aisleCols: Set<number>): boolean` — ready for seat-map client validation; UI must supply aisleCols.
- `web/src/lib/business/quality.ts` — rows 1-3 low / 4-8 optimal / 9+ high (per README).
- `web/src/app/layout.tsx:15-24` — Geist wired; metadata still "Create Next App", lang="en" → MUST fix.
- `web/components.json:3` — style is `base-nova` (shadcn 4.16 default, Base UI-backed); aliases `@/components`, `@/components/ui`, `@/lib`, `@/hooks`.
- `web/package.json` — next 16.3.0, react 19.2.8, zod ^4.4.3, shadcn ^4.16.1, `@base-ui/react` ^1.7.0, lucide ^1.28. No Radix.
- `web/README.md` §Read API — real response examples for all 5 endpoints (copy shapes from there, do not invent). Cities: city-1 Bogotá, city-2 Medellín. Showtime id format `st-site-bog-3-imax-4-2245`. IMAX summary: general 156 / premium 100 / wheelchair 2 / preferential 2.
- `web/AGENTS.md` — auto-generated Next.js agent rules: read `node_modules/next/dist/docs/` before writing Next code (Next 16.3 conventions may differ from training data).
- `specs/design-reference/` screenshots 01-05 + README:5-12 — views to replicate; §30-31 legend colors: verde=seleccionada, gris=vendida, azul=general, negro=preferencial, ícono=wheelchair; "Pantalla" label on top.
- Design analysis (session, Look_at): 01 white-bg home w/ hero carousel + 6-col grid; 02 dark charcoal catalog; 03/04 backdrop hero + date carousel + format tabs + accordion; 05 seat grid ~20col×13row, legend 5 states, zoom controls, Atrás/Seleccionar boletas buttons.
- `specs/001-cine-copiloto-boletas.md:87-92` — business rules: max 4 seats, no orphans, pricing format+zone+discount-day, accessibility care, 15-min cutoff (already enforced server-side).
- Phase 0 plan `.omo/plans/cinepais-phase-0-scaffold.md` — all 13 todos + F1-F4 checked; commits live on branch `phase-0-scaffold`.

## Decisions (with rationale)
1. **Pricing = computed, not stored** (user-approved): `lib/business/pricing.ts` pure function `seatPrice(format, areaCategory, businessDate)` + constants; API route handlers call it; NO DB migration, NO reseed. Fase C consumes via API.
2. **API contract extension is part of Fase B** and documented in README so Fase C planning reads the updated contract: `Showtime.priceFrom`, `Seat.price`, `SeatSummary.priceTable`.
3. **Branch**: `phase-1-ui` off `phase-0-scaffold` (Fase 0 not yet merged to main — merging is user's call, not ours).
4. **Design fidelity**: replicate layout/hierarchy/components of screenshots with CinePaís identity (wordmark, palette derived from reference: near-black header `oklch(0.13 0 0)`, blue primary ~`oklch(0.55 0.18 255)`, bright green selected ~`oklch(0.72 0.2 145)`, dark charcoal catalog bg). Final token values tuned during the impeccable pass.
5. **Skills routing for executors**: visual todos run with `load_skills: ["impeccable", "frontend"]`; QA todos use Playwright MCP; code standards via `programming` where logic-heavy (pricing).
6. **Server Components by default**; client components only where interactive (carousel, tabs, city selector, seat map, selection context, checkout form).
7. **Data fetching**: pages fetch via internal API routes with typed helpers in `lib/api/client.ts` (fetch + Zod parse) — same contract the agent uses, honoring "UI and agent consume the same read API" from 002. Server Components call the helpers with absolute URL from env/headers.
8. **No new runtime deps** except what `shadcn add` brings. Carousel: CSS scroll-snap + small client component (NO embla/swiper).
9. **Checkout is a page, not a dialog** (screenshots imply full flow); confirmation page shows deterministic order number + "Esto es una demo" note.
10. **max 4 seats**: enforced in SelectionProvider (UI disables 5th selection + toast explaining rule); orphan: on each candidate selection call `wouldLeaveOrphan` per affected row; invalid → seat shakes + toast with the rule explanation (spec Gherkin #6).
11. **Accessibility seats**: wheelchair seats render with lucide icon; selecting one triggers confirm dialog; companion seat suggested (spec rule #4) — not auto-selected.
12. **Loading/empty/error states**: every page has loading.tsx (skeleton), empty states (no showtimes for filters → friendly message + suggestion), error.tsx per route group.
13. **QA per page todo**: Playwright MCP script: navigate, assert key elements, screenshot to `.omo/evidence/`, compare vs `specs/design-reference/0X-*.png` (human-eye comparison by visual-qa reviewer subagent in polish todo).
14. **Tests**: Vitest for pricing (matrix cases incl. Wednesday, rounding, wheelchair=general price) + selection reducer logic (max4, orphan integration, dedup). No DOM testing libs.
15. **README + AGENTS.md web section updated** at the end: new endpoints fields, pages map, how to run UI.

## Scope IN
- Pricing module + API extension + schema extension + tests + README contract update.
- Brand foundation: tokens, metadata es, wordmark, header/footer.
- shadcn primitives (button card badge tabs select accordion dialog skeleton sonner) + typed API client + SelectionProvider + city state.
- 5 page surfaces: home, catalog, film detail (+showtimes), seat map, checkout+confirmation.
- Business-rule UX: max 4, orphan block + explanation, wheelchair dialog, sold/cutoff states.
- Polish wave: impeccable pass, responsive, states, a11y basics (focus, contrast, aria on seat grid).
- 3 wave commits on `phase-1-ui`, no push.

## Scope OUT (Must NOT have)
- NO copilot/chat widget, NO SSE client — Fase D.
- NO agent code — Fase C.
- NO real payment, NO auth, NO user accounts.
- NO DB schema changes, NO migrations, NO reseed (pricing is computed).
- NO changes to Fase 0 business functions signatures (orphan/cutoff/quality) — extend, don't break; their tests must stay green.
- NO breaking changes to existing 5 endpoint response fields — only ADDITIVE fields (priceFrom, price, priceTable); existing Fase 0 schema tests must still pass.
- NO new heavy deps (no carousel/animation libs, no react-query, no zustand — context suffices).
- NO proxy.ts/middleware.
- NO CineColombia brand/logo/name anywhere.
- NO deploy work.
- NO push, NO commits to main or phase-0-scaffold.

## Open questions
> None — both user forks resolved (B only; pricing computed). Everything else defaulted above with rationale.

## Approval gate
status: awaiting-approval
approach: frontmatter `approach:` + Decisions above. ~14 todos across 3 waves (foundation+pricing → pages → polish/QA) + F1-F4 final verification wave.
next action after approval: write .omo/plans/cinepais-phase-1-ui.md with full todos, then handoff to /start-work.
