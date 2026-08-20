---
slug: cinepais-phase-6-posters
intent: clear
review_required: false
status: plan-written-ready-for-handoff
self_check: "3 defect classes swept. 1 vacuous criterion (Todo 7 FILM_TABS line-count already passed), 3 unquoted zsh globs, 1 over-broad grep — all fixed. See the plan's §Review record."
explorer_claim_corrected: "An explorer said pronto films leak into Cartelera on /films. Wrong: FilmGridClient drops them via filmCityMap (they have no showtimes), so they are invisible in EVERY tab. The preventa pair is what leaks."
plan: .omo/plans/cinepais-phase-6-posters.md
phase: Fase G / Fase 6 — portadas generadas y coherencia del catálogo
created: 2026-08-20
planner: Prometheus (ulw-plan)
trigger: user's hands-on QA of /films after Fase F shipped
---

# Draft — CinePaís Fase G (`cinepais-phase-6-posters`)

Planning-only artifact. The planner does not touch product code.

## Origin

The user browsed the shipped site and found two things on `https://cinepais.vercel.app/films`:
the Pronto and Preventa tabs do nothing, and the film presentation is weak because every poster is
an external placeholder reading "Film 06".

Both are **gaps in the Fase F plan, not executor failures.** Fase F's Todo 17 named
`web/src/app/page.tsx` and `film-card.tsx` explicitly; `/films` was never in scope, so F1 audited
against criteria that never mentioned it and correctly passed. A gap in the plan is invisible to
every downstream check.

Momus grazed it during the high-accuracy review — it asked whether `web/src/app/films/page.tsx`
could leak statuses — and the planner folded that into O-M3 as a schedule-semantics issue and never
landed the second page. **It was in the report and was not acted on.**

---

## VERIFIED FINDINGS (measured this session)

### G1 — `/films` tabs are hardcoded empty states · CONFIRMED

`web/src/app/films/page.tsx:155-167`:
```tsx
<TabsContent value="pronto">
  <EmptyState title="Próximamente — vuelve pronto" … />
</TabsContent>
<TabsContent value="preventa">
  <EmptyState title="Preventa en camino" … />
</TabsContent>
```
Unconditional. Identical in shape to the home-page defect Fase F's Todo 17 fixed.
`grep status web/src/app/films/` → **zero matches** (positive control: `grep status web/src/app/page.tsx`
→ many). The page never reads `film.status`.

### G2 — Two films are invisible, and two leak · CONFIRMED, corrected mid-analysis

Live `/api/films` (verified): 6 `cartelera`, 2 `pronto` (*Espejo Roto*, *Vientos del Sur*),
2 `preventa` (*El Guardián de Nubes*, *Marea Alta*).

- `pronto` films have **no showtimes** ⇒ absent from `filmCityMap` ⇒ `FilmGridClient` drops them
  client-side (`film-grid-client.tsx:48-55`). They appear in **no tab at all** — silently invisible.
- `preventa` films **do** have showtimes (last two days of the window) ⇒ they appear under
  **Cartelera**, mixed in with actual cartelera films.

The planner initially told the user all four leaked into Cartelera. That was wrong and was corrected:
the `pronto` pair vanishes, the `preventa` pair leaks.

### G3 — The format filter works; it only looks broken · CONFIRMED

`films/page.tsx:66` `getShowtimes({ format })` and `:76-78` genuinely filter. But the filter only
feeds the Cartelera tab, and the other two are fixed `EmptyState`s, so changing format while on them
does nothing observable. Worse, applying a format **accidentally hides** non-cartelera films (they
have no showtimes in any format), so the filter appears to behave inconsistently.

### G4 — The poster is the page, and it is a placeholder · CONFIRMED

Seed (`web/prisma/seed.ts:171-175`):
```ts
return `https://placehold.co/300x450?text=Film+${num}`;
```
Live API returns `{"title":"Cielo Vacío","posterUrl":"https://placehold.co/300x450?text=Film+06"}` —
**the image contradicts the title next to it.** The titles, genres, duration, rating, director and
cast are all real and good; only the art is placeholder.

Design reference `specs/design-reference/README.md` row `02-catalog.png` specifies
*"Grid de **pósters**, tabs (Cartelera/Pronto/Preventa), **filtros**"* — so both of the user's
observations are the project's own spec, unmet. Inspecting the reference screenshot confirms the
poster carries essentially all of the page's visual weight; titles sit below, small.

Every card also costs a **network request to a third party** (`placehold.co`). If it is slow or down,
the catalogue looks broken on the one URL that gets shown to recruiters.

### G5 — Poster consumer map (what a change touches)

| Consumer | File:line | How |
|---|---|---|
| Film card | `film-card.tsx:60-67` | `next/image`, `fill`, `priority` for first 6 |
| Film detail backdrop | `films/[id]/page.tsx:83-91` | `next/image`, blurred via Tailwind, `priority` |
| Film detail ficha | `films/[id]/page.tsx:127-133` | `next/image` |
| Showtime sidebar | `showtimes/[id]/page.tsx:172-178` | `next/image` |
| Hero carousel | `hero-carousel.tsx:109-116` | `next/image`, `priority` on slide 0 |

All five use `next/image` inside an `aspect-[2/3]` wrapper. **No component needs changing** if the
field keeps its name and type.

- `web/prisma/schema.prisma:66` — `posterUrl String`, **non-nullable**.
- `web/src/lib/api/schemas.ts:22` — `posterUrl: z.string()`, required.
- `agent/src/cinepais_agent/models.py:22` — `posterUrl: str` exists but is **never used** by any tool,
  prompt, or the recommendation payload (`grep posterUrl agent/src` → 1 hit, the model; positive
  control `grep durationMin agent/src` → several). Not in `agent/docs/sse-contract.md`.
- Documented in `web/README.md:94` and `:117`. Not in the root README.
- Test fixtures: `web/tests/schemas.test.ts:23,36,149`, `agent/tests/test_mcp_server.py:20`,
  `agent/tests/test_api_client.py:19,29`.
- `web/next.config.ts` allowlists `placehold.co` in `remotePatterns` **and already sets
  `dangerouslyAllowSVG: true`** with CSP `default-src 'self'; script-src 'none'; sandbox;`.
- No `placeholder="blur"` anywhere (`grep "placeholder=" web/src` → 0). Skeletons live in `loading.tsx`.

### G6 — The reference implementation already exists on the home page

- `page.tsx:23-45` `FILM_TABS` — status + label + per-status empty copy.
- `page.tsx:97-98` — `films.filter((film) => film.status === tab.status)`.
- `page.tsx:66-68` — the hero carousel filters to `cartelera` **only**, deliberately, so nobody is sent
  to a detail page with nothing to buy.
- `film-card.tsx:32-39` `STATUS_BADGE` — exported as the single source of truth, typed as a total
  `Record` so adding an enum value breaks the build instead of silently rendering no badge.

`/films` needs to adopt this, not invent it.

---

## USER DECISIONS (answered at the gate — binding)

| # | Topic | Decision |
|---|---|---|
| E1 | Scope | **One short phase covering both** the `/films` coherence fix and the generated posters. The seed must be touched for the posters anyway, so splitting would pay the destructive re-seed twice for no reason. |
| E2 | Poster direction | **Typographic minimal with a genre-driven palette.** Title in the lower third, dark cinematic field, grain and vignette. Not generative-abstract shapes. |

### Adopted defaults (announced, not asked)

1. **Slug** `cinepais-phase-6-posters`; branch `phase-6-posters` off `main`.
2. **Delivery: static SVG files** at `web/public/posters/film-XX.svg`, with `posterUrl` = `/posters/film-01.svg`.
   Wins on every axis: all five consumers unchanged, CDN-cacheable with zero function invocations,
   lets `remotePatterns` be deleted, and the agent's `str` stays valid. The alternative — an
   `/api/posters/[id]` route — would pay a serverless invocation per card to serve something that
   never changes.
3. **A deterministic generator script writes the SVGs; the output is committed.** Reproducible *and*
   reviewable — a visitor to the repo can open the art.
4. **Zero LLM spend.** This phase does not touch agent logic, only a test fixture.
5. Same gates as Fase F, including the **mandatory re-seed after `pnpm test`** (§The fourth rule).

---

## RISKS the plan must handle explicitly

1. **🔴 SVG text does not inherit page fonts.** An SVG referenced from `<img>`/`next/image` renders in
   an isolated context: web fonts and page CSS do **not** apply. Only fonts on the viewer's system, or
   fonts embedded in the file, resolve. A naive `font-family="Inter"` will silently fall back and the
   layout will differ per OS. Must be pinned.
2. **🔴 The re-seed is destructive and hits the live database.** §The fourth rule from Fase F carries
   over unchanged: one database, `pnpm test` wipes the catalogue, every gate must re-seed.
3. **Title/art desync.** The SVG embeds the title; a future title edit without regeneration would ship
   a poster that lies. Needs a guard that fails, not a convention.
4. **`posterUrl` is `NOT NULL`.** If the generator misses one film, the seed dies.
5. **`next/image` + local SVG** needs empirical confirmation that it renders, not just returns 200.
6. Removing `remotePatterns` must be preceded by proving nothing else fetches `placehold.co`.

## Planned wave order

1. **W1 — Build.** Poster generator + committed art + seed + `next.config` + `/films` tabs + tests +
   gate + re-seed.
2. **W2 — Ship.** Merge, push, re-seed production, redeploy, verify live, update docs and the demo script.

## Next workflow action

Approved by the user. Write `.omo/plans/cinepais-phase-6-posters.md`.
Execution belongs to a separate `/start-work` session.
