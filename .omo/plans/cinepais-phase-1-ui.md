# cinepais-phase-1-ui - Work Plan

## TL;DR (For humans)

**What you'll get:** The complete manual ticket-buying experience in Spanish under the CinePaís brand, faithful to the 5 reference screenshots: home with hero carousel and film grid, dark catalog, film detail with date/format selectors and per-cinema showtime accordion, an interactive seat map that enforces the real business rules (max 4 seats, no orphan seats, accessibility care), and a simulated checkout with Colombian-peso pricing and a deterministic confirmation number. Prices become part of the API so the future copilot can answer "¿cuál es la función más económica?".

**Why this approach:** Pricing is computed (a pure function), not stored — no database changes, no reseed, and the API only GAINS fields so nothing built in Fase 0 breaks. Pages read data through a shared query layer instead of calling their own HTTP endpoints (self-fetch breaks static builds), while the HTTP API stays intact as the contract for the agent. Visual work runs with the impeccable/frontend skills and is verified against the reference screenshots with a real browser.

**What it will NOT do:** No chat/copilot widget (Fase D). No Python agent (Fase C). No real payments or accounts. No database migrations. No deploys, no pushes.

**Effort:** Large
**Risk:** Medium-low — main risk is visual fidelity, mitigated by an iterative browser-QA polish wave; second risk is Next 16.3 conventions drift, mitigated by reading the bundled docs before UI work.
**Decisions to sanity-check:** COP pricing matrix (2D $18.000 / Onyx $28.000 / IMAX $32.000 × zone × miércoles 0.6, round to $500) · tabs Pronto/Preventa show empty states · selection lives in React context (refresh on /checkout redirects home) · shadcn `base-nova`/Base UI kept as-is, fidelity via tokens · no new runtime deps.

Your next move: this plan goes through dual high-accuracy review (Momus + Oracle), then you run `/start-work` in a fresh chat. Full execution detail follows below.

---

> TL;DR (machine): Large effort, Medium-low risk. Manual purchase UI (5 surfaces) faithful to design-reference 01-05, computed COP pricing exposed additively through the API, business-rule UX (max4/orphan/wheelchair), Playwright-MCP QA per page + impeccable polish wave. 14 todos, 3 waves, 3 commits on branch `phase-1-ui`, no push. Dual review required before handoff.

## Scope

### Must have
1. Branch `phase-1-ui` created off `phase-0-scaffold`; all commits land there; no push.
2. Brand foundation: `layout.tsx` → `lang="es"`, metadata `title: "CinePaís — Cine en Colombia"` (+ template `%s | CinePaís`), Spanish description; `next.config.ts` → `images.remotePatterns` for `placehold.co` + `dangerouslyAllowSVG: true` (seed posterUrls are SVG placeholders).
3. CinePaís design tokens in `web/src/styles/globals.css` (OKLCH, derived from reference screenshots: near-black header, blue primary, bright-green "selected", dark-charcoal catalog bg) + `web/src/components/brand/wordmark.tsx` (inline SVG: "CinePaís" text + simple film-reel glyph; no external assets).
4. `web/src/lib/business/pricing.ts`: pure `seatPrice(formats, areaCategory, businessDate)` + exported `PRICING` constants — base COP by dominant format (IMAX 32000 > Onyx 28000 > Premium 24000 > 2D/Doblada/Subtitulada 18000), zone multiplier (general 1.0, wheelchair 1.0, preferential 1.15, premium 1.35), Wednesday ×0.6 (UTC day-of-week on the `YYYY-MM-DD` string), rounded to nearest 500. Plus `web/src/lib/format.ts` with `formatCOP()` (Intl es-CO). Vitest coverage.
5. `web/src/lib/api/queries.ts`: shared data-access (getCities, getFilms, getFilmDetail, getShowtimes, getSeats) returning schema-parsed objects — used by BOTH route handlers (thin wrappers; HTTP contract unchanged for the agent) and Server Components (direct import; NO self-HTTP-fetch).
6. Additive API extension: `ShowtimeSchema` + `priceFrom`, `SeatSchema` + `price`, `SeatSummarySchema` + `priceTable` (4 zone keys). Existing Fase 0 fields untouched; existing tests stay green; `web/README.md` contract section updated with new fields + example values.
7. shadcn primitives installed: button, card, badge, tabs, select, accordion, dialog, skeleton, sonner (style `base-nova` as configured — do NOT fight it).
8. `web/src/lib/business/layout.ts`: room layout constants mirroring the seed (imax 13×20, 2d 12×15, premium 9×10) + visual seat BLOCKS per room (aisle gaps); orphan validation runs `wouldLeaveOrphan` per block slice.
9. `web/src/components/providers/selection-provider.tsx`: client context holding `{ showtimeId, selectedSeatIds: Set<string>, error }` (state-only; seats stay page props; `totalCOP` derived at call site); enforces max 4 (blocks 5th + Spanish toast) and orphan rule (blocks + explains); reducer logic unit-tested.
10. City state: header selector fed by `/api/cities` data, persisted in `localStorage` (`cinepais.city`), default `Bogotá`; filters films/showtimes views.
11. Header (black bar: wordmark, nav "Películas", city selector) + footer (copyright ficticio + links dummy) in root layout — per screenshot 01.
12. `/` home: hero carousel (first 3 films, CSS scroll-snap, no carousel lib), tabs Cartelera/Pronto/Preventa (Pronto/Preventa = elegant empty state), film grid (responsive columns), deterministic badges (film 01-06 "Estreno", 09-10 "Preventa").
13. `/films` catalog: dark-charcoal variant, poster grid, same tabs, "Filtrar por" button (city/format filter via searchParams).
14. `/films/[id]` detail: backdrop hero (poster as bg + overlay), ficha (director, cast, duración, estreno, género), sinopsis, **Horarios**: 7-day date selector (from today, HOY + short Spanish day names), format tabs (from that film's showtimes), accordion per cinema with showtime cards (hora bold, sala + formato small, `priceFrom` shown as "Desde $XX.XXX") — screenshots 03-04.
15. `/showtimes/[id]` seat map: info card (poster, title, badges, cine, sala, fecha/hora, duración), 5-state legend, seat grid (blocks with gaps, row letters, wheelchair icons via lucide, sold=gray/general=blue/preferential=black/selected=green), zoom controls (0.75/1/1.25 CSS scale), selection wired to SelectionProvider, running total in COP, "Atrás" + "Seleccionar boletas" buttons — screenshot 05.
16. Wheelchair seats: selecting one opens a confirm dialog (Spanish, respectful copy per spec rule #4) before adding.
17. `/checkout`: order summary (film, función, sillas with per-seat price, total COP), "Confirmar" → `/checkout/confirmation` with deterministic order number `CP-` + 6-char hash of showtimeId+sorted seatIds, "Esto es una demo — no se realizó ningún cobro". Empty selection → client-side `router.replace("/")` in `useEffect` (no server `redirect()` in client components).
18. Every route: `loading.tsx` (skeletons), `error.tsx`, and friendly Spanish empty states (e.g. no showtimes for the filter combo → suggestion to change date/format).
19. Polish wave: impeccable + visual-qa side-by-side vs screenshots 01-05, responsive (desktop-faithful, mobile-usable), a11y basics (seat grid keyboard/aria, focus rings, contrast).
20. Vitest additions: pricing matrix cases + selection reducer; ALL Fase 0 tests still green.
21. `web/README.md`: pages map + updated API contract; root `AGENTS.md` untouched.
22. 3 wave commits (Todos 6, 12, 14), conventional messages, no attribution lines, no push.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- **NO chat widget, NO SSE, NO copilot UI** — Fase D.
- **NO `agent/` code** — Fase C.
- **NO DB schema changes, NO migrations, NO reseed, NO edits to `prisma/seed.ts`.**
- **NO breaking API changes** — new fields only; renaming/removing/retyping existing fields is forbidden; Fase 0 `tests/schemas.test.ts` must pass unmodified (extend the README examples, keep old assertions).
- **NO signature changes** to `orphan.ts` / `cutoff.ts` / `quality.ts`; their tests stay untouched and green.
- **NO new runtime dependencies** beyond what `shadcn add` installs — explicitly banned: embla, swiper, framer-motion, react-query, zustand, redux, styled-components, axios, date-fns/dayjs/luxon (use native `Intl`/`Date`).
- **NO self-HTTP-fetch from Server Components** (build-time prerender hits no server) — pages import `queries.ts`; only client components may call HTTP helpers.
- **NO `export const dynamic = "force-dynamic"`** or other route-segment config exports on pages/handlers (Fase 0 rule; cacheComponents forward-compat).
- **NO real payment UI** (no card fields, no "pago" wording implying real charge), NO auth, NO cookies beyond localStorage city.
- **NO CineColombia** name/logo/real endpoints anywhere; fictional copy only.
- **NO English UI copy** — all user-visible strings Spanish; code/identifiers English.
- **NO `middleware.ts`/`proxy.ts`. NO deploy config. NO push. NO commits to `main` or `phase-0-scaffold`.**
- **NO hand-rolled seat-map canvas/WebGL** — CSS grid of buttons is enough and accessible.
- **NO placeholder lorem-ipsum** left in final copy; every visible string intentional Spanish.

## Verification strategy
> Zero human intervention — all verification is agent-executed.

- **Test decision:** TDD-lite for pricing + selection reducer (tests first); tests-after (smoke) for everything else. Framework: existing Vitest 2 (`FORCE_COLOR=0`, exit codes as gates — never output-text greps as primary).
- **UI verification:** Playwright MCP per page todo — `browser_navigate` → `browser_snapshot`/asserts → `browser_take_screenshot` saved under `/Users/reiorozco/Dev/cinepais/.omo/evidence/` (absolute paths). Dev server: `cd web && (pnpm dev > /tmp/nextdev.log 2>&1 &)` + wait; kill after.
- **LSP diagnostics:** zero errors in touched files before closing each todo.
- **Next 16.3 convention guard:** before ANY page/component work, the executor reads the relevant guides under `web/node_modules/next/dist/docs/` (per `web/AGENTS.md` auto-rules) — training-data Next.js conventions may be stale.
- **Evidence:** `/Users/reiorozco/Dev/cinepais/.omo/evidence/task-<N>-cinepais-phase-1-ui.<ext>` (`.txt` command output, `.png` screenshots).

## Execution strategy

### Parallel execution waves
**Wave 1 — Foundation (Todos 1–6):** 1 → 2 sequential (branch first). 3, 4 sequential (4 consumes pricing). 5 parallel with 3–4. 6 after 3, **4**, and 5 (the wave-close commit message names the priced API — Todo 4 MUST be done first; Momus R1 finding #2). Wave commit at 6.
**Wave 2 — Surfaces (Todos 7–12):** 7 (header/footer in layout) first; then 8, 9, 10, 11 parallelizable (different routes); 12 after 11 (consumes SelectionProvider flow). Wave commit at 12.
**Wave 3 — Polish (Todos 13–14):** 13 then 14. Wave commit at 14.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | — | 2–14 | — |
| 2 | 1 | 7–13 | 3, 5 |
| 3 | 1 | 4, 6 | 2, 5 |
| 4 | 3 | 6, 10, 11, 12 | 5 |
| 5 | 1 | 6, 7-12 | 2, 3, 4 |
| 6 | 3, 4, 5 | 11, 12 | 7 |
| 7 | 2, 5 | 8–12 | 6 |
| 8 | 7 | 13 | 9, 10, 11 |
| 9 | 7 | 13 | 8, 10, 11 |
| 10 | 4, 7 | 13 | 8, 9, 11 |
| 11 | 4, 6, 7 | 12, 13 | 8, 9, 10 |
| 12 | 6, 11 | 13 | — |
| 13 | 8–12 | 14 | — |
| 14 | 13 | F1–F4 | — |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [x] 1. Repo: create branch `phase-1-ui` + brand metadata + image config - expect build green with Spanish metadata
  What to do / Must NOT do:
    - `git checkout phase-0-scaffold && git checkout -b phase-1-ui` (verify clean `git status` first; if dirty, stop and report).
    - Edit `web/src/app/layout.tsx`: `lang="es"`; metadata → `{ title: { default: "CinePaís — Cine en Colombia", template: "%s | CinePaís" }, description: "Cartelera, horarios y boletas de cine en Colombia. Demo de portafolio con datos ficticios." }`. Keep Geist fonts and existing className wiring.
    - Edit `web/next.config.ts`: add `images: { remotePatterns: [{ protocol: "https", hostname: "placehold.co" }], dangerouslyAllowSVG: true, contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;" }` (seed posterUrls are placehold.co SVGs; CSP per Next docs for SVG).
    - Before editing, read `web/node_modules/next/dist/docs/` guide for `next.config` / metadata if present (web/AGENTS.md rule).
    - Note for ALL image usage in later todos: do NOT pass a `quality` prop on `<Image>` (Next 16.3 `images.qualities` whitelist warns on non-listed values); if `pnpm build` ever warns about image config, add `images.qualities: [75]` and re-run.
    - Must NOT touch page.tsx yet. Must NOT add route-segment config exports.
  Parallelization: Wave 1 | Blocked by: — | Blocks: all
  References: `web/src/app/layout.tsx:15-24` (current metadata "Create Next App", lang="en"); `web/AGENTS.md` (read bundled Next docs); draft `.omo/drafts/cinepais-phase-1-ui.md` assumptions "Metadata/brand"; AGENTS.md `:31` (UI Spanish).
  Acceptance criteria: `git branch --show-current` prints `phase-1-ui` · `grep -q 'lang="es"' web/src/app/layout.tsx` · `grep -q 'CinePaís' web/src/app/layout.tsx` · `grep -q 'placehold.co' web/next.config.ts` · `cd web && pnpm build; echo EXIT=$?` prints `EXIT=0`.
  QA scenarios: happy: `bash -c "cd web && (timeout 20s pnpm dev >/tmp/d.log 2>&1 &) && sleep 12 && curl -sS http://localhost:3000 | grep -o '<title>[^<]*</title>'; pkill -f 'next dev' || true"` → title contains `CinePaís`. failure: `grep -q 'Create Next App' web/src/app/layout.tsx` → exit 1. Evidence `/Users/reiorozco/Dev/cinepais/.omo/evidence/task-1-cinepais-phase-1-ui.txt`.
  Commit: N

- [x] 2. `web/src/styles/globals.css` + wordmark: CinePaís design tokens (OKLCH) + brand SVG component - expect tokens present and page renders with new palette
  What to do / Must NOT do:
    - Extend/replace the neutral shadcn palette in `globals.css` `:root`/`.dark` with CinePaís tokens (keep ALL existing shadcn variable NAMES working — components depend on them; change VALUES, add new ones):
      - `--background: oklch(1 0 0)` (light pages), `--foreground: oklch(0.16 0.01 260)`.
      - `--primary: oklch(0.52 0.17 258)` (reference blue for buttons/links), `--primary-foreground: oklch(0.985 0 0)`.
      - Add CUSTOM tokens (also map in `@theme inline` as `--color-*`): `--brand-header: oklch(0.13 0.01 260)` (near-black nav), `--surface-dark: oklch(0.19 0.01 260)` (catalog bg), `--seat-available: oklch(0.52 0.17 258)`, `--seat-selected: oklch(0.72 0.2 145)` (bright green), `--seat-sold: oklch(0.85 0 0)`, `--seat-preferential: oklch(0.2 0 0)`.
      - Values are STARTING points — Todo 13 (impeccable pass) tunes them against screenshots; keep them centralized (no hardcoded colors in components; enforce via grep in acceptance).
    - Create `web/src/components/brand/wordmark.tsx`: server component, inline `<svg>` — film-reel circle glyph + "CinePaís" in bold; props `{ className }`; white-on-dark by default via `currentColor`.
    - Must NOT introduce HSL. Must NOT hardcode hex/oklch inside components (tokens only).
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 7-13 | Can parallelize with: 3, 5
  References: `specs/design-reference/README.md:30-31` (legend colors); session design analysis (01 white home / 02 dark charcoal / header black / blue accents / green selected); `web/src/styles/globals.css` (current shadcn tokens — READ before editing); draft decision #4.
  Acceptance criteria: `grep -q 'brand-header' web/src/styles/globals.css` · `grep -q 'seat-selected' web/src/styles/globals.css` · `grep -q 'hsl(' web/src/styles/globals.css` exits 1 · `test -f web/src/components/brand/wordmark.tsx && grep -q 'CinePaís' web/src/components/brand/wordmark.tsx` · `cd web && pnpm build; echo EXIT=$?` → `EXIT=0`.
  QA scenarios: happy: Playwright MCP → `browser_navigate` http://localhost:3000 → `browser_take_screenshot` to `/Users/reiorozco/Dev/cinepais/.omo/evidence/task-2-cinepais-phase-1-ui.png`. failure: `grep -rE 'oklch\(|#[0-9a-fA-F]{3,6}' web/src/components/ --include='*.tsx' | grep -v wordmark` → empty (no hardcoded colors outside tokens; wordmark exempt if it uses currentColor only).
  Commit: N

- [x] 3. `web/src/lib/business/pricing.ts` + `web/src/lib/format.ts` + tests (TDD-lite) - expect pricing matrix fully tested green
  What to do / Must NOT do:
    - **Seed reality (Oracle R1 finding #1): every showtime carries exactly ONE format — `["IMAX"]`, `["2D"]`, or `["Premium"]`. `Onyx`/`Doblada`/`Subtitulada` are never emitted by the seed.** Test against the real domain; keep the full precedence table as future-proofing marked speculative.
    - Write `web/tests/pricing.test.ts` FIRST. Rounding rule (single source of truth): `Math.round(raw / 500) * 500` (JS half-away-from-zero). Locked expected literals:
      - `seatPrice(["IMAX"], "general", "2026-08-04")` = **32000**
      - `seatPrice(["IMAX"], "premium", "2026-08-04")` = **43000** (32000×1.35 = 43200 → 43000)
      - `seatPrice(["IMAX"], "preferential", "2026-08-04")` = **37000** (32000×1.15 = 36800 → 37000)
      - `seatPrice(["2D"], "general", "2026-08-05")` = **11000** (18000×0.6 = 10800 → 11000; 2026-08-05 is Wednesday)
      - `seatPrice(["2D"], "preferential", "2026-08-04")` = **20500** (18000×1.15 = 20700; 20700/500 = 41.4 → Math.round → 41 → 20500)
      - `seatPrice(["2D"], "wheelchair", "2026-08-04")` = same as general = **18000**
      - `seatPrice(["Premium"], "premium", "2026-08-04")` = **32500** (24000×1.35 = 32400 → 32500) — **document in pricing.ts JSDoc: format "Premium" (room) and zone "premium" (areaCategory) are different axes and DO compound**
      - `dominantFormat(["IMAX"]) → "IMAX"`, `dominantFormat(["2D"]) → "2D"`, `dominantFormat(["Premium"]) → "Premium"` (real domain) + ONE speculative test `dominantFormat(["IMAX","Subtitulada"]) → "IMAX"` commented `// speculative: seed emits single-format showtimes today`.
      - `formatCOP(18000)`: assert byte-level — `s.charCodeAt(1) === 0x00a0` (Intl es-CO uses `$` + NBSP U+00A0 + `18.000`; a copy-pasted regular space would silently mismatch). Full-string literal frozen AFTER running once on the local Node.
      - For any literal above where the executor's computed value differs from the plan's, TRUST THE LOCKED FORMULA, print the computed value, freeze it as the literal, and note the delta in evidence.
    - Then implement `pricing.ts`: `export const PRICING = { base: { IMAX: 32000, Onyx: 28000, Premium: 24000, "2D": 18000, Doblada: 18000, Subtitulada: 18000 }, zoneMultiplier: { general: 1.0, wheelchair: 1.0, preferential: 1.15, premium: 1.35 }, wednesdayFactor: 0.6, roundTo: 500 }` · `dominantFormat(formats: Format[]): Format` (precedence IMAX > Onyx > Premium > 2D > Doblada > Subtitulada) · `isWednesday(businessDate: string): boolean` (parse `YYYY-MM-DD` as UTC: `new Date(businessDate + "T00:00:00Z").getUTCDay() === 3`) · `seatPrice(formats: Format[], areaCategory: AreaCategory, businessDate: string): number` (base × zone × wed, `Math.round(x / 500) * 500`).
    - `format.ts`: `formatCOP(n: number): string` via `new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })`.
    - Types import from `@/lib/api/schemas` (Format, AreaCategory z.infer types) — pure module, no Prisma, no Date.now().
    - Must NOT read wall clock. Must NOT depend on DB.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 4, 6 | Can parallelize with: 2, 5
  References: draft assumption "Pricing matrix (COP)"; `specs/001-cine-copiloto-boletas.md:90` (rule #3: formato+zona+día); `web/src/lib/api/schemas.ts:8-15,44-49` (Format/AreaCategory enums).
  Acceptance criteria: `test -f web/src/lib/business/pricing.ts && test -f web/src/lib/format.ts && test -f web/tests/pricing.test.ts` · `cd web && FORCE_COLOR=0 pnpm test tests/pricing.test.ts 2>&1 | tee /tmp/p.log; test ${PIPESTATUS[0]} -eq 0` · `grep -q 'Date.now\|new Date()' web/src/lib/business/pricing.ts` exits 1.
  QA scenarios: happy: `cd web && pnpm test tests/pricing.test.ts` green ≥10 cases. failure: `cd web && pnpm exec tsx -e "import('./src/lib/business/pricing.ts').then(m=>{if(m.seatPrice(['IMAX'],'general','2026-08-05')>=m.seatPrice(['IMAX'],'general','2026-08-04'))process.exit(1);console.log('WED-OK')})"` → prints `WED-OK` (2026-08-05 is a Wednesday). Evidence `/Users/reiorozco/Dev/cinepais/.omo/evidence/task-3-cinepais-phase-1-ui.txt`.
  Commit: N

- [x] 4. API: shared `queries.ts` + thin route handlers + additive price fields + README - expect all Fase 0 tests still green and endpoints return prices
  What to do / Must NOT do:
    - Create `web/src/lib/api/queries.ts`: `getCities()`, `getFilms(city?)`, `getFilmDetail(id)` (null when missing), `getShowtimes(filters)` (applies existing cutoff via `isPurchasable`, computes `priceFrom = seatPrice(formats, "general", businessDate)`), `getSeats(showtimeId)` (null when missing; each seat gains `price = seatPrice(showtime.formats, seat.areaCategory, businessDate)`; summary gains `priceTable = { general, preferential, premium, wheelchair }` with that showtime's zone prices). Move the existing query/mapping logic OUT of the 5 route handlers INTO queries.ts (verbatim behavior); handlers become: parse params (existing Zod input schemas) → call query → 404/validation errors unchanged → `Schema.parse(payload)` → respond.
    - Extend `web/src/lib/api/schemas.ts` ADDITIVELY: `ShowtimeSchema` + `priceFrom: z.number().int()`, `SeatSchema` + `price: z.number().int()`, `SeatSummarySchema` + `priceTable: z.object({ general: z.number().int(), preferential: z.number().int(), premium: z.number().int(), wheelchair: z.number().int() })`. NO other shape edits.
    - Update `web/README.md` API section: add the new fields to the showtimes/seats examples with realistic values consistent with the pricing matrix (recompute by hand; `tests/schemas.test.ts` parses README examples — they MUST include the new required fields).
    - BEFORE refactoring, record a baseline: curl all 5 endpoints to `/tmp/api-baseline-*.json`; AFTER the refactor, re-curl and diff — responses must be byte-identical EXCEPT the new price fields (jq-delete the new fields and diff the rest → empty).
    - Run the FULL test suite; Fase 0 tests (determinism, orphan, cutoff, schemas) must pass. NOTE: schemas.test.ts parses README examples — updating examples with new fields is expected and required; do NOT loosen any schema to optional to dodge failures.
    - Domain guard (Oracle R1): `curl -sSf 'http://localhost:3000/api/showtimes?filmId=film-01' | jq '[.[].formats | length] | unique'` must print `[1]` (single-format showtimes; if not, the seed changed and the pricing test set must be revisited before proceeding).
    - Must NOT change response status codes, field names, or existing field types. Must NOT make new fields optional (they are always computable).
  Parallelization: Wave 1 | Blocked by: 3 | Blocks: 6, 10, 11, 12 | Can parallelize with: 5
  References: `web/src/app/api/*/route.ts` (5 handlers — READ all before refactor); `web/src/lib/api/schemas.ts:32-85`; `web/src/lib/business/cutoff.ts`; `web/README.md` §Read API (examples to update); draft decisions #1, #2, amended-decision (queries.ts rationale: Server-Component self-HTTP-fetch fails at build-time prerender).
  Acceptance criteria: `test -f web/src/lib/api/queries.ts` · `cd web && pnpm exec tsc --noEmit` exit 0 · `cd web && FORCE_COLOR=0 pnpm test 2>&1 | tee /tmp/t.log; test ${PIPESTATUS[0]} -eq 0` (ALL suites incl. Fase 0) · with dev server up: `curl -sSf 'http://localhost:3000/api/showtimes?filmId=film-01' | pnpm exec tsx -e "process.stdin.on('data',d=>{const a=JSON.parse(d);if(!a.length||typeof a[0].priceFrom!=='number')process.exit(1);console.log('PRICE-OK')})"` prints `PRICE-OK` · seats endpoint returns `summary.priceTable.general > 0`.
  QA scenarios: happy: curl showtimes + seats, save to `/Users/reiorozco/Dev/cinepais/.omo/evidence/task-4-cinepais-phase-1-ui.json`. failure: `git diff phase-0-scaffold -- web/src/lib/business/orphan.ts web/src/lib/business/cutoff.ts web/src/lib/business/quality.ts` → empty (untouched).
  Commit: N

- [x] 5. shadcn primitives: add button card badge tabs select accordion dialog skeleton sonner - expect components in `@/components/ui` and build green
  What to do / Must NOT do:
    - `cd web && pnpm exec shadcn add button card badge tabs select accordion dialog skeleton sonner --yes` (shadcn 4.16.1 is a local dep — use `pnpm exec`, not dlx; if a component name is not found in the base-nova registry, record it and install the closest equivalent, e.g. `toast`→`sonner` already mapped).
    - Wire sonner's `<Toaster />` into `layout.tsx` (per its docs).
    - Accept what the CLI writes for `base-nova` (Base UI-backed) — restyle later via tokens; do NOT hand-edit component internals in this todo.
    - Must NOT add any other component. Must NOT `pnpm add` UI libs manually.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 6, 7-12 | Can parallelize with: 2, 3, 4
  References: `web/components.json` (style base-nova, aliases); `web/package.json` (shadcn ^4.16.1, @base-ui/react present); Fase 0 plan Todo 4 notes (CLI flag drift lessons — verify with `pnpm exec shadcn --help` if `add` syntax differs).
  Acceptance criteria: `ls web/src/components/ui/ | wc -l` ≥ 8 · `test -f web/src/components/ui/button.tsx` · `grep -q 'Toaster' web/src/app/layout.tsx` · `cd web && pnpm build; echo EXIT=$?` → `EXIT=0` · `cd web && pnpm exec tsc --noEmit` exit 0.
  QA scenarios: happy: build + `ls web/src/components/ui/` listing to evidence `/Users/reiorozco/Dev/cinepais/.omo/evidence/task-5-cinepais-phase-1-ui.txt`. failure: `node -e "const p=require('/Users/reiorozco/Dev/cinepais/web/package.json'); if(p.dependencies['embla-carousel']||p.dependencies['framer-motion'])process.exit(1)"` exit 0 (absolute path — cwd-independent).
  Commit: N

- [x] 6. Selection + city state + room layout constants + reducer tests - expect selection rules enforced in pure logic with tests green + wave commit
  What to do / Must NOT do:
    - `web/src/lib/business/layout.ts`: `ROOM_LAYOUTS = { imax: { rows: 13, cols: 20, blocks: [[1,5],[6,15],[16,20]] }, "2d": { rows: 12, cols: 15, blocks: [[1,4],[5,11],[12,15]] }, premium: { rows: 9, cols: 10, blocks: [[1,10]] } }` (col ranges inclusive; blocks = visual sections separated by aisles; keys match seed room names `imax`, `2d-1`/`2d-2` (normalize: room string starting "2d" → "2d"), `premium`).
    - `web/src/lib/business/selection.ts`: PURE reducer `selectionReducer(state, action)` with actions `toggle(seat, rowSeats)`, `clear`; rules: (a) max 4 — toggling a 5th returns state + `error: "max"`; (b) orphan check per block — **EXPLICIT INDEXING CONTRACT (Oracle R1 finding #3): seed `col` is 1-based; `wouldLeaveOrphan` arrays are 0-based; blocks `[startCol, endCol]` are 1-based inclusive. Conversion, exactly:**
      ```ts
      // for each block [start, end] of the affected row:
      const slice = rowStatuses.slice(start - 1, end); // 0-based half-open == cols start..end inclusive
      const localSelection = candidateCols            // 1-based cols incl. the toggled seat
        .filter(c => c >= start && c <= end)
        .map(c => c - start);                          // block-local 0-based
      if (wouldLeaveOrphan(slice, localSelection, new Set())) return { ...state, error: "orphan" };
      ```
      **Aisles are modeled by block boundaries, NOT by `aisleCols` — `aisleCols` stays `new Set()` always** (block slice edges act as walls because `wouldLeaveOrphan` bounds its scan to the array). Document this in a JSDoc block.
      **Wheelchair exemption**: when building `rowStatuses` for the orphan check, map seats with `areaCategory === "wheelchair"` to `"Sold"` regardless of real status — a lone available wheelchair seat is NOT an orphan (it is reserved-purpose, outside adjacency economics; spec rule #4). (c) toggling off always allowed; (d) dedup by seatId. State: `{ showtimeId, selectedSeatIds: Set<string>, error }` — **seat objects are NOT part of reducer state**.
    - `web/tests/selection.test.ts` (write FIRST): max-4 block · orphan via reducer (cols c and c+2 selected → c+1 orphan → error) · deselect allowed · dedup · per-block isolation (last col of block 1 selected + first col of block 2 available ≠ orphan) · **block-edge orphan** (col = block start, col+1 Sold → selecting col+... concretely: Sold at start+1, selecting start+2 leaves start orphan against block edge → error) · **wheelchair exemption** (lone available wheelchair seat adjacent to selection → NO error) · every block-local index in range (add a `console.assert`/dev guard in selection.ts: all local indexes `>= 0 && < slice.length`).
    - `web/src/components/providers/selection-provider.tsx`: **state-only context** (Oracle R1 finding #6): holds `{ showtimeId, selectedSeatIds, error }` + derived `totalCOP` computed from the seats PROP at the call site (seats array must NOT live in context state — it stays a prop of the seat-map page); split into `SelectionStateContext` + `SelectionActionsContext` (stable dispatch identity) so seat buttons don't re-render on unrelated state. Toast on errors (sonner, Spanish: max → "Máximo 4 boletas por compra", orphan → "Esa selección dejaría una silla sola — elige sillas contiguas").
    - `web/src/components/providers/city-provider.tsx`: client context, `localStorage` key `cinepais.city`, default `"Bogotá"`, hook `useCity()`. **SINGLE city-filter policy (Oracle R1 finding #4): city filtering is CLIENT-SIDE ONLY via `useCity()` on every surface. NO `?city=` searchParam anywhere** — server renders all-cities data; client components filter. (Format filter on /films DOES use searchParams — different axis, server-filterable.) To avoid hydration mismatch, `useCity` returns the default on first render and re-reads localStorage in `useEffect` (accept one client re-render).
    - Mount both providers in `layout.tsx`.
    - Commit wave close: **pre-commit gate** — verify Todos 1–5 all complete (evidence files `task-1..5-cinepais-phase-1-ui.*` exist under `/Users/reiorozco/Dev/cinepais/.omo/evidence/` AND full `pnpm test` green AND `pnpm build` green); abort and report if any missing. Then `git add -A && git commit -m "feat(web): pricing + priced API + brand foundation + selection/city state"` (verify branch `phase-1-ui` first).
    - Must NOT duplicate orphan logic (must import `wouldLeaveOrphan`). Must NOT persist selection to localStorage (refresh loses it — accepted).
  Parallelization: Wave 1 | Blocked by: 3, 4, 5 | Blocks: 11, 12 | Can parallelize with: 7
  References: `web/src/lib/business/orphan.ts:11-15` (exact signature); README seed layout (IMAX 13×20 260, general 156/premium 100/wheelchair 2/preferential 2); draft amended-decision-2 (blocks strategy); showtime id/room format examples in `web/README.md` (`"room": "imax"`).
  Acceptance criteria: `test -f web/src/lib/business/layout.ts && test -f web/src/lib/business/selection.ts && test -f web/tests/selection.test.ts` · `cd web && FORCE_COLOR=0 pnpm test tests/selection.test.ts 2>&1; test $? -eq 0` · `grep -q 'wouldLeaveOrphan' web/src/lib/business/selection.ts` · `git log --oneline -1` starts `feat(web): pricing` · `cd web && pnpm build; echo EXIT=$?` → `EXIT=0`.
  QA scenarios: happy: full `pnpm test` green (Fase 0 + pricing + selection). failure: `grep -rn 'groupSize' web/src/lib/business/selection.ts` → empty (no copied orphan internals). Evidence `/Users/reiorozco/Dev/cinepais/.omo/evidence/task-6-cinepais-phase-1-ui.txt`.
  Commit: **Y** | `feat(web): pricing + priced API + brand foundation + selection/city state`

- [x] 7. Header + footer (screenshot 01 chrome) - expect black nav with wordmark + working city selector on every page
  What to do / Must NOT do:
    - `web/src/components/layout/header.tsx`: black bar (`bg` = brand-header token), left: Wordmark (links `/`), nav "Películas" → `/films`; right: city Select (shadcn) fed by cities passed as props from server layout (server fetch via `queries.getCities()` in `layout.tsx`, passed down; the Select itself is a client island using `useCity()`).
    - `web/src/components/layout/footer.tsx`: dark bg, "© 2026 CinePaís — Proyecto de portafolio. Datos ficticios.", dummy links (Términos, Privacidad → `#`), social icons (lucide: Facebook, Instagram, X) — non-functional `#` links.
    - Mount both in `layout.tsx` around `{children}`.
    - Must NOT hardcode cities. Must NOT use real brand names in footer.
  Parallelization: Wave 2 | Blocked by: 2, 5 | Blocks: 8-12 | Can parallelize with: 6
  References: screenshot `specs/design-reference/01-home.png` (header: logo left, nav, location + user right — we replace user greeting with nothing; keep city); session design analysis §01 Header; `queries.ts` from Todo 4.
  Acceptance criteria: `test -f web/src/components/layout/header.tsx && test -f web/src/components/layout/footer.tsx` · `grep -q 'header' web/src/app/layout.tsx` (mounted) · build green · Playwright: navigate `/`, `browser_find` text "Películas" and the city selector present.
  QA scenarios: happy: Playwright select city "Medellín" → localStorage `cinepais.city` = "Medellín" (verify via `browser_evaluate` `localStorage.getItem('cinepais.city')`); screenshot to `/Users/reiorozco/Dev/cinepais/.omo/evidence/task-7-cinepais-phase-1-ui.png`. failure: `browser_navigate` `/films` → header still present (layout-level).
  Commit: N

- [x] 8. `/` home (screenshot 01) - expect hero carousel + tabs + film grid faithful to reference
  What to do / Must NOT do:
    - Rewrite `web/src/app/page.tsx` (Server Component): fetch `getFilms()`; render: (a) hero carousel — client component `components/home/hero-carousel.tsx`, first 3 films, full-width ~340px cards with poster bg + gradient overlay + title + "Ver horarios" button (→ `/films/[id]`), CSS `scroll-snap-x` + dot indicators + prev/next buttons (no lib); the scroll CONTAINER gets `data-testid="hero-scroller"` (QA targets its `scrollLeft`, not a wrapper); (b) tabs Cartelera | Pronto | Preventa (shadcn Tabs): Cartelera → responsive grid (2/3/4/6 cols by breakpoint) of `components/films/film-card.tsx` (poster via `next/image`, badge Estreno ids 01-06 / Preventa ids 09-10, title, genres small); Pronto/Preventa → `components/ui-states/empty-state.tsx` ("Próximamente — vuelve pronto").
    - Film cards link `/films/[id]`. All copy Spanish.
    - Must NOT install carousel libs. Must NOT client-fetch films (server props down).
  Parallelization: Wave 2 | Blocked by: 7 | Blocks: 13 | Can parallelize with: 9, 10, 11
  References: `specs/design-reference/01-home.png` + session analysis §01 (hero ~300px, 6-col grid, badges top-left, bookmark icon top-right — omit bookmark, no user accounts); `queries.getFilms`; draft assumptions "Hero carousel", "Badges", "Tabs".
  Acceptance criteria: build green · Playwright: navigate `/` → `browser_find` "Cartelera" tab; snapshot shows ≥10 film cards; carousel prev/next buttons navigate (assert scroll position change via `browser_evaluate`); tab "Pronto" shows empty-state text.
  QA scenarios: happy: full-page screenshot `/Users/reiorozco/Dev/cinepais/.omo/evidence/task-8-cinepais-phase-1-ui.png` (compare vs 01 in Todo 13). failure: click a film card → lands on `/films/film-XX` (200, no error boundary).
  Commit: N

- [x] 9. `/films` catalog (screenshot 02) - expect dark-charcoal grid variant with filters
  What to do / Must NOT do:
    - `web/src/app/films/page.tsx` (Server Component, `await searchParams` — Next 16 promise-based): dark section (`surface-dark` token) containing same tabs + film grid (reuse `film-card`); "Filtrar por" button opens shadcn Dialog with FORMAT filter only, applied via searchParams (`?format=IMAX`) — formats limited to the 3 the seed emits (IMAX, 2D, Premium). **NO `?city=` param** (city policy is client-side via `useCity`, see Todo 6).
    - Filtering: format server-side — `getShowtimes({ format })` distinct filmIds → filter grid; city client-side — wrap the grid in a client component that filters by `useCity()` against a per-film city list passed from the server (derive `Map<filmId, city[]>` from showtimes server-side, pass down).
    - Empty result → empty-state ("No hay funciones con esos filtros — prueba otro formato").
    - Must NOT duplicate film-card. Must NOT break `/` (shared components stay compatible).
  Parallelization: Wave 2 | Blocked by: 7 | Blocks: 13 | Can parallelize with: 8, 10, 11
  References: `specs/design-reference/02-catalog.png` + analysis §02 (dark bg, same grid, more contrast); `queries.getFilms/getShowtimes`.
  Acceptance criteria: build green · Playwright: `/films` dark bg — executable predicate: `browser_evaluate` `() => { const el = document.querySelector('main section[data-surface="dark"]') ?? document.querySelector('main'); const m = getComputedStyle(el).backgroundColor.match(/\d+/g); if (!m) return false; const [r,g,b] = m.map(Number); return (r+g+b)/3 < 80; }` → `true` (null-guarded: transparent/unset bg returns false, never throws) (computed style resolves to rgb(), never assert oklch strings) · ≥10 cards · `/films?format=IMAX` shows subset (≥1, ≤10 cards) · `/films?format=Onyx` (format never emitted by seed) → empty-state rendered, no crash.
  QA scenarios: happy: screenshot `/Users/reiorozco/Dev/cinepais/.omo/evidence/task-9-cinepais-phase-1-ui.png`. failure: `/films?format=INVALID` → 200 with empty-state or ignored filter (no 500).
  Commit: N

- [x] 10. `/films/[id]` detail + horarios (screenshots 03-04) - expect ficha + date/format selectors + accordion with priced showtime cards
  What to do / Must NOT do:
    - `web/src/app/films/[id]/page.tsx` (Server Component; `await params`): `getFilmDetail(id)` (null → `notFound()`); hero: poster as blurred/cover bg + dark overlay + centered title + "Ver horarios" anchor button (#horarios); below: poster left (~180px `next/image`), ficha right (Director, Reparto, Duración `2h 45m` format, Género, Clasificación badge), Sinopsis block.
    - `#horarios` section (client component `showtimes-explorer.tsx` receiving showtimes prop): fetch server-side `getShowtimes({ filmId })` (ALL days), pass down; client renders: 7-day selector (HOY + `VIE 1 AGO` style, es-CO day names, from the dates present in data), format tabs (only formats existing for that film), accordion per siteName (shadcn Accordion) → showtime cards: `time` bold (12h format `8:30 PM`), sala + language format small, IMAX badge dark when applicable, "Desde {formatCOP(priceFrom)}" — card links `/showtimes/[id]`.
    - No showtimes for selected day+format combo → inline empty-state ("No hay funciones este día en este formato").
    - City filter from `useCity()` applied client-side over the showtimes prop.
    - Must NOT fetch per-accordion (one server fetch, client filters). Must NOT show non-purchasable showtimes (API already applies cutoff — trust it).
  Parallelization: Wave 2 | Blocked by: 4, 7 | Blocks: 13 | Can parallelize with: 8, 9, 11
  References: `specs/design-reference/03-movie-showtimes.png`, `04-showtimes-expanded.png` + analysis §03-04 (date carousel labels, format tabs, accordion, showtime card anatomy: time bold + sala/format small + IMAX badge); `ShowtimeSchema` fields incl. new `priceFrom`; time is `"HH:MM"` 24h → display 12h es-CO.
  Acceptance criteria: build green · Playwright: `/films/film-01` shows title, director, sinopsis; date selector has 7 entries; selecting a date+format updates cards (assert count change); a card shows "Desde $" text; clicking a card lands on `/showtimes/st-...` (200).
  QA scenarios: happy: screenshots expanded accordion `/Users/reiorozco/Dev/cinepais/.omo/evidence/task-10-cinepais-phase-1-ui.png`. failure: `/films/does-not-exist` → Next 404 page (not error boundary).
  Commit: N

- [x] 11. `/showtimes/[id]` seat map (screenshot 05) - expect interactive grid enforcing max-4 + orphan + wheelchair dialog with live total
  What to do / Must NOT do:
    - `web/src/app/showtimes/[id]/page.tsx` (Server Component): `getSeats(id)` (null → `notFound()`); renders info card (poster+title+formats badges+site+room+date/time es-CO+duration) then client `seat-map.tsx` with the full payload.
    - `components/seats/seat-map.tsx` (client): legend (5 states per reference: Silla seleccionada verde · No disponible gris · General azul · Silla de Ruedas ícono · Preferencial negro); "Pantalla" bar top; grid: rows labeled A.. (row 1 = A, closest to screen) with `ROOM_LAYOUTS` blocks rendered as grid sections separated by aisle gaps (`gap` columns); each seat = `<button>` (aria-label `"Silla A5 — disponible — $18.000"`), colors via seat tokens by `status`/`areaCategory` + selected state; wheelchair seats show lucide `Accessibility` icon; Sold disabled.
    - Interactions via `useSelection()`: toggle → reducer enforces max4/orphan (toasts from provider); wheelchair seat → shadcn Dialog first ("Esta silla está reservada para personas con movilidad reducida. La silla contigua es para su acompañante — puedes agregarla después de confirmar. ¿Deseas continuar?") confirm→toggle. (Wheelchair seats are exempt from the orphan check per Todo 6 — a lone wheelchair selection never triggers the orphan toast.)
    - Every seat button gets `data-seat-id={seatId}` and `data-status`; the bottom-bar total gets `data-testid="selection-total"` (QA hooks).
    - Zoom: 3 buttons bottom-right (0.75×/1×/1.25× CSS transform on grid container).
    - Bottom bar: selected count + seat list + running total (`formatCOP`) + "Atrás" (router.back) + "Seleccionar boletas" (→ `/checkout`, disabled if 0 selected).
    - Selecting seats from a DIFFERENT showtime than current selection → reducer `clear` first (context keyed by showtimeId).
    - Must NOT allow selecting Sold. Must NOT bypass the reducer for any state change. Must NOT canvas/svg-render the grid (buttons in CSS grid). Must NOT put the seats array into context state (seats stay page props; context holds ids only — see Todo 6 provider contract).
  Parallelization: Wave 2 | Blocked by: 4, 6, 7 | Blocks: 12, 13 | Can parallelize with: 8, 9, 10
  References: `specs/design-reference/05-seat-map.png` + analysis §05 (legend order/colors, zoom controls, buttons, info card anatomy); `layout.ts` blocks; `selection.ts` reducer; seat fields incl. new `price`; seed scenarios in Fase 0 plan Todo 8 (soldout = first `Sombras del Puente` showtime day 0 site-med-1 imax — find its id via API for QA).
  Acceptance criteria: build green · Playwright on an `optimal`-scenario showtime: select 4 seats → 5th click shows toast + not added (assert count stays 4) · **directed orphan probe (Momus R1 finding #3): fetch the seats JSON via curl first, compute (script) a row+block with ≥3 consecutive `Available` cols `c, c+1, c+2` in block interior; click seat `c` then seat `c+2` → `browser_find` toast text "dejaría una silla sola" AND seat `c+2` not selected (`data-status` unchanged)** — the reducer unit tests in Todo 6 already prove the rule; this probe proves the wiring · wheelchair seat click → dialog appears · total: `browser_evaluate` reads `[data-testid="selection-total"]` textContent and assert it equals `formatCOP(sum of selected seats' API prices)` computed by the QA script · "Seleccionar boletas" navigates `/checkout`.
  QA scenarios: happy: screenshot with 2 seats selected `/Users/reiorozco/Dev/cinepais/.omo/evidence/task-11-cinepais-phase-1-ui.png`. failure: navigate seats of the SOLD-OUT planted showtime (query `/api/showtimes?filmId=<Sombras film id>` day 0, then its seats) → all gray, CTA disabled, availableCount 0 shown.
  Commit: N

- [x] 12. `/checkout` + confirmation - expect summary with COP totals and deterministic order number + wave commit
  What to do / Must NOT do:
    - `web/src/app/checkout/page.tsx` (client): reads `useSelection()`; empty selection → guard via `useEffect(() => { if (empty) router.replace("/") })` and render `null` meanwhile — **do NOT import `redirect` from next/navigation in a client component** (server-only; Oracle R1 finding #4); renders summary card: film title + poster thumb, cine/sala/fecha/hora, seat rows (`A5 — General — $18.000` using seat row-letter + areaCategory es labels + formatCOP), subtotal, "Cargo por servicio $0 (demo)", total; button "Confirmar compra (demo)".
    - Confirm → compute `orderNumber = "CP-" + hash6(showtimeId + sortedSeatIds.join(","))` (deterministic djb2→base36 in `web/src/lib/business/order.ts`), `router.push` to `/checkout/confirmation?order=CP-XXXXXX&showtimeId=...&seatIds=1_5_3,1_5_4` — **URL payload capped to exactly these 3 params** (Oracle R1 finding #9; assert `location.search.length < 500` in QA); `/checkout/confirmation/page.tsx` is a SERVER component: `await searchParams`, re-derives film/función/seat details via `getSeats(showtimeId)` (invalid/missing ids → `notFound()`), renders success icon, "¡Boletas confirmadas!" + order number + recap + "Esto es una demo — no se realizó ningún cobro." + "Volver a la cartelera" (→ `/`; a small client island clears the selection on mount). Refresh on confirmation re-derives everything from the URL — explicitly part of acceptance.
    - Must NOT fake payment fields (no card inputs). Must NOT store orders anywhere.
  Parallelization: Wave 2 | Blocked by: 6, 11 | Blocks: 13
  References: draft assumptions "Order number", decision #9; spec `001:107` (checkout simulado in scope, no pasarela); Gherkin #3 (selection ≠ purchase — wording must say "confirmar", seats are never marked sold).
  Acceptance criteria: build green · Playwright full flow: seat map → select 2 → Seleccionar boletas → checkout shows 2 rows + total = sum of prices (assert numerically via `browser_evaluate` on rendered text vs API prices) → Confirmar → confirmation shows `CP-` order · repeat same seats → SAME order number (determinism) · direct `/checkout` visit with empty selection → redirected `/`.
  QA scenarios: happy: screenshots of both pages `/Users/reiorozco/Dev/cinepais/.omo/evidence/task-12-cinepais-phase-1-ui.png` + `browser_evaluate` `() => location.search.length` < 500. failure: refresh on confirmation → server re-derives recap from `showtimeId`+`seatIds` searchParams (assert film title still rendered); `/checkout/confirmation?order=X&showtimeId=fake&seatIds=y` → 404. Wave commit after: `feat(web): manual purchase UI — home, catalog, film detail, seat map, checkout`.
  Commit: **Y** | `feat(web): manual purchase UI — home, catalog, film detail, seat map, checkout`

- [x] 13. Visual fidelity + impeccable polish pass vs screenshots 01-05 - expect side-by-side evidence and tuned tokens
  What to do / Must NOT do:
    - Run with `load_skills: ["impeccable", "frontend"]`. For each of the 5 surfaces: capture fresh Playwright screenshot (1280×800) → compare against `specs/design-reference/0X-*.png` (spawn `multimodal-looker` subagent per pair asking for concrete layout/spacing/color/typography deltas) → fix the deltas (token tuning in globals.css, spacing, hierarchy, hover/focus states, transitions ≤200ms) → re-capture.
    - Apply impeccable review dimensions: hierarchy, spacing rhythm, contrast (WCAG AA on text), states (hover/focus/active/disabled on cards, seats, buttons), UX copy tone (es-CO natural).
    - Acceptance bar: NOT pixel-identical (different brand/fonts by design) — matched: layout structure, component anatomy, information hierarchy, color ROLES (dark header, blue interactive, green selected, gray sold).
    - Must NOT change business logic, API, or tests in this todo. Must NOT add deps.
  Parallelization: Wave 3 | Blocked by: 8-12 | Blocks: 14
  References: all 5 screenshots + session analysis; `web/src/styles/globals.css` tokens (single tuning point).
  Acceptance criteria: 5 pairs of evidence screenshots exist at `/Users/reiorozco/Dev/cinepais/.omo/evidence/task-13-<surface>-cinepais-phase-1-ui.png` · a `task-13-report.md` in evidence dir lists per-surface deltas found→fixed · `cd web && pnpm build && FORCE_COLOR=0 pnpm test; echo EXIT=$?` → `EXIT=0`.
  QA scenarios: happy: multimodal-looker verdict per pair records "structure matches reference" (verbatim quote in report). failure: grep report for unresolved "BLOCKER" entries → none.
  Commit: N

- [ ] 14. States, responsive, a11y + docs + final commit - expect polished edge states and updated README
  What to do / Must NOT do:
    - `loading.tsx` per route (`/`, `/films`, `/films/[id]`, `/showtimes/[id]`) with skeletons matching each layout; `error.tsx` (route-group level, Spanish: "Algo salió mal — vuelve a intentarlo") with reset button; verify empty states from Todos 8-12 render correctly.
    - Responsive: verify at 375×812 (mobile) and 1280×800 via Playwright `browser_resize` — no horizontal scroll on any surface (assert `document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1` — clientWidth excludes the vertical scrollbar; ≤1px sub-pixel tolerance), seat map usable via zoom-out at mobile, grids collapse to 2 cols, header collapses (nav hidden behind city selector kept visible).
    - A11y pass: seat buttons keyboard-focusable with visible focus ring; `aria-pressed` on selected seats; dialog focus-trap (Base UI default — verify); tabs keyboard navigation; images have Spanish alt.
    - Update `web/README.md`: "UI pages" section (routes map + screenshots refs), note pricing fields, how to run the flow.
    - Final commit: `feat(web): states, responsive, a11y polish + docs`.
    - Must NOT introduce new pages. Must NOT weaken tests.
  Parallelization: Wave 3 | Blocked by: 13 | Blocks: F1-F4
  References: Todos 8-12 outputs; impeccable a11y guidance; Next docs for loading/error conventions (`web/node_modules/next/dist/docs/`).
  Acceptance criteria: `ls web/src/app/**/loading.tsx | wc -l` ≥ 4 · `test -f web/src/app/error.tsx || ls web/src/app/**/error.tsx` non-empty · Playwright mobile: no horizontal scroll on `/`, `/films`, `/films/film-01`, seat map (4 asserts) · keyboard: Tab reaches a seat button and Enter toggles it (assert via snapshot state) · `cd web && pnpm build && FORCE_COLOR=0 pnpm test; echo EXIT=$?` → `EXIT=0` · `git log --oneline -1` starts `feat(web): states`.
  QA scenarios: happy: mobile screenshots ×4 to `/Users/reiorozco/Dev/cinepais/.omo/evidence/task-14-mobile-cinepais-phase-1-ui.png` (+suffixes). failure: `git status --porcelain` → empty after commit.
  Commit: **Y** | `feat(web): states, responsive, a11y polish + docs`

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit
  Delegate to `oracle`: read this plan + evidence files. Per todo 1-14 verify acceptance criteria demonstrably met. Per Must-NOT-have verify no violation: grep `web/` for `CineColombia`, `force-dynamic`, `embla|swiper|framer-motion|react-query|zustand|axios|dayjs|date-fns|luxon` in package.json, English UI strings in components (spot-check), fetch of own `/api/` inside `src/app/**/page.tsx` files (self-fetch ban), edits to `prisma/` (git diff vs phase-0-scaffold must show none). Output `APPROVE` or `REJECT: <list>`.

- [ ] F2. Code quality review
  Delegate to `oracle`: read new/changed files under `web/src/`. Check: TS strict no `any`; pricing/selection pure (no IO); reducer not bypassed (grep setState on seats outside provider); tokens not hardcoded in components; server/client component boundaries correct (`"use client"` only where needed); no console.log; Spanish copy quality (accents correct: "Máximo", "función"). Output `APPROVE` or `REJECT: <file:line — issue>`.

- [ ] F3. Real manual QA — full purchase flow
  Delegate to `unspecified-high` with Playwright MCP: seed fresh (`pnpm prisma db seed`), dev server up, then: (1) home renders carousel+grid; (2) switch city → grid consistent; (3) open film-01 → pick day 2 + IMAX → accordion → open the `optimal` planted showtime; (4) select 2 good adjacent seats → total = 2× API price; (5) attempt 5-seat selection → blocked with toast; (6) attempt orphan selection → blocked with toast; (7) wheelchair seat → dialog; (8) checkout → totals match; confirm → `CP-` order; re-run same selection → same order number; (9) sold-out planted showtime → all gray + CTA disabled; (10) `/films?format=Onyx` no-results path renders empty state. Record `/Users/reiorozco/Dev/cinepais/.omo/evidence/f3-cinepais-phase-1-ui.txt` + screenshots. Output `APPROVE` or `REJECT: <step>`.

- [ ] F4. Scope fidelity
  Delegate to `oracle`: compare against `specs/002-implementation-plan.md` §Sesión B deliverables + spec 001 Gherkin #4 (manual flow), #5 (max 4), #6 (orphan) — confirm each demonstrably covered by evidence; confirm NO Fase C/D/E artifacts (no agent code, no chat UI, no deploy). Confirm the "antes" friction is preserved (manual flow deliberately multi-step — no shortcuts skipping the flow). Output `APPROVE` or `REJECT: <item>`.

## Commit strategy
- Wave 1 (Todo 6): `feat(web): pricing + priced API + brand foundation + selection/city state`
- Wave 2 (Todo 12): `feat(web): manual purchase UI — home, catalog, film detail, seat map, checkout`
- Wave 3 (Todo 14): `feat(web): states, responsive, a11y polish + docs`
- Branch check before each: `git branch --show-current` = `phase-1-ui`. No push. No attribution lines (AGENTS.md §Workflow — "No auto-generated attribution").

## Success criteria
1. `git log --oneline phase-1-ui ^phase-0-scaffold` = exactly 3 commits above, in order.
2. `cd web && pnpm build` green; `FORCE_COLOR=0 pnpm test` green — including ALL Fase 0 suites unmodified.
3. Full manual flow (F3 steps 1-10) passes with evidence.
4. `/api/showtimes` items include integer `priceFrom`; `/api/showtimes/:id/seats` items include `price` and summary `priceTable` — verified by curl + Zod parse; no pre-existing field changed (diff of README examples shows only additions).
5. Wednesday showtimes (businessDate 2026-08-05 under default SEED_NOW) price lower than same-format Tuesday ones via API.
6. All 5 surfaces have side-by-side evidence vs reference screenshots + fidelity report with zero unresolved blockers.
7. All UI copy Spanish; zero "CineColombia" occurrences in `web/`.
8. No new runtime deps beyond shadcn-added components (package.json diff audit).
9. F1–F4 all APPROVE.
