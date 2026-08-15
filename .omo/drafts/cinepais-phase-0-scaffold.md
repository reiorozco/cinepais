---
slug: cinepais-phase-0-scaffold
status: review-passed
intent: clear
review_required: true
pending-action: user runs /start-work in a fresh chat to activate Atlas on this plan
plan_path: .omo/plans/cinepais-phase-0-scaffold.md
review:
  momus:
    status: complete
    target: .omo/plans/cinepais-phase-0-scaffold.md
    session: ses_0310fb7faffeCUk04AzEXpQneQ
    rounds: 3
    result: "R1 REJECT (3 blockers: env.example sequencing, shadcn phantom flags, whitespace greps + 3 nits) → R2 REJECT (1 new blocker: vitest testTimeout vs seed budget + 4 nits) → R3 OKAY: 'Plan is executable. Ready for handoff to Atlas.'"
  independent:
    status: complete
    target: .omo/plans/cinepais-phase-0-scaffold.md
    session: ses_0310f6146ffeOYIOPiAegv3sa8
    rounds: 2
    result: "R1 REJECT (8 blockers: prisma.config seed shape, directUrl removed in v7, package.json prisma key dead, generator flat layout, --no-lint removed, force-dynamic conflict, zod v3/v4 record semantics, seed math/pooled-URL/chunking) → R2 APPROVE: 'Ship it. All BLOCKERs resolved with grep-verifiable line evidence.'"
approach: Scaffold Next.js 16 monorepo web/ app with Tailwind v4 + shadcn 2.3 (new-york), Prisma 7 with @prisma/adapter-pg wired to Neon Postgres from day 1 (Option B), deterministic seed producing planted demo scenarios (sold-out, front-row-only, optimal, no-N-adjacent), and read API endpoints typed with Zod. No UI. No agent. No deploy config.
---

# Draft: cinepais-phase-0-scaffold

## Components (topology ledger)
<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->
| id | outcome | status | evidence |
| --- | --- | --- | --- |
| repo-bootstrap | git initialized, feature branch created, monorepo root layout in place | active | git status + tree |
| web-scaffold | `web/` Next.js 16 app (App Router, TS, Tailwind v4, shadcn 2.3 new-york, ESLint flat, pnpm) boots on `pnpm dev` | active | dev server logs |
| prisma-schema | `web/prisma/schema.prisma` models Site/Film/Showtime/Seat + join tables for formats, provider=postgresql, driver=adapter-pg | active | `prisma validate` + `prisma format` |
| prisma-seed | Deterministic seed script produces 2 cities × 3 sites × 4 rooms × 7 days × ~4 showtimes × ~260 seats with 4 planted scenarios | active | seed run + row counts + repeatability test |
| read-api | 5 endpoints exposed under `/api/*` with Zod-typed responses matching contract | active | curl transcripts + Zod parse tests |
| tests | Vitest suite for seed determinism + business rules (orphan, cutoff) + Zod schema validation | active | `pnpm test` output |
| docs | `web/README.md` documents setup, env vars, seed command, endpoint shapes with JSON examples | active | file exists + curl matches examples |

## Open assumptions (announced defaults)
<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
<!-- assumption | adopted default | rationale | reversible? -->
| assumption | adopted default | rationale | reversible? |
| --- | --- | --- | --- |
| Timezone | `America/Bogota` for all showtime `businessDate` + `time` | matches Colombian cinema realism | yes (config) |
| Currency | COP (Colombian pesos), integer minor units | matches setting; agent uses this in "más económica" queries | yes |
| Discount day | Wednesday (`miércoles`) | Colombian cinema convention (real cinemas do this) | yes (seed constant) |
| Cities | Medellín, Bogotá | spec §"~2 ciudades"; Medellín is the reference source | yes |
| Sites per city | 3 (6 total) | spec §"~6 cines" | yes |
| Rooms per site | 4 (1 IMAX, 2 2D standard, 1 premium) | matches referent volume + gives format variety | yes |
| Room seat counts | IMAX 260 (13×20), 2D 180 (12×15), Premium 90 (9×10) | matches referent (screenshot 05 was ~13×20) | yes |
| Films | 10 titles (mix of formats/genres, incl. 1 IMAX-headliner and 1 sold-out candidate) | spec §"~8–10 pelis" upper bound for richer agent demo | yes |
| Window | 7 days starting `today` at seed run | rolling window; determinism achieved by seeding `Math.random` + fixing `now` reference | yes |
| Showtimes per room/day | 3–5 varied by format | spec §"~3–5 funciones" | yes |
| Row → zone/quality mapping | A–C: general/low · D–H: general/optimal (+ 1 sub-row preferential) · I–L: premium/high | matches design-reference heuristic | yes |
| Accessibility seats | 2 wheelchair + 2 companion at end of one middle row per room | spec §"silla acompañante" | yes |
| Orphan rule | Selection invalid if it leaves exactly 1 Available seat between the selection and a Sold seat OR row/aisle edge | formalizes spec §"no huérfanas" | yes |
| Cutoff | Showtimes starting < 15 min from `now` are not returned in `/api/showtimes` | spec §"cutoff" | yes |
| ID scheme | `seatId = area_row_col` (e.g. `1_10_8`), showtimeId = ULID | matches spec §"design-reference" | no |
| API error shape | 404 `{ error: "not_found" }` · 400 `{ error: "validation_error", details: ZodIssue[] }` | REST-idiomatic + Zod-native | yes |
| Font | Geist Sans via `next/font` | Vercel default, no license fuss, premium feel | yes |
| shadcn style | `new-york` | closer to referent's cleaner card treatment | yes |

## Findings (cited - path:lines)
- Spec: `specs/001-cine-copiloto-boletas.md:87-92` — business rules (max 4, orphan, cutoff, accessibility, pricing).
- Spec: `specs/001-cine-copiloto-boletas.md:104-111` — resolved decisions (fictional brand, HITL, killer feature, mock scope).
- Plan: `specs/002-implementation-plan.md:19-24` — read API contract shape.
- Design: `specs/design-reference/README.md:14-31` — data model (Site/Film/Showtime/Seat) + quality tier heuristic.
- AGENTS.md `:30-36` — code English / UI Spanish, mock-only, fictional brand.
- Next.js 16 upgrade guide (2026-05-13): `middleware.ts` → `proxy.ts`, `experimental.ppr` → `cacheComponents`, ESLint Flat Config, Turbopack default, React 19.2, parallel routes need `default.js`. Latest stable 16.2.12.
- Tailwind v4 + shadcn 2.3 (crea.mba 2026-05-22 & 2026-05-29): CSS-first config in `globals.css` via `@import "tailwindcss"` + `@theme inline`, OKLCH tokens, `@custom-variant dark`, `tw-animate-css` (not `tailwindcss-animate`), `@tailwindcss/postcss` plugin. shadcn CLI `bunx shadcn@latest` with `style: "new-york"`, `rsc: true`, empty `tailwind.config`.
- Prisma 7 upgrade guide + release 7.9.0 (2026): driver adapters mandatory (`@prisma/adapter-pg` for Postgres), new `prisma-client` generator replaces `prisma-client-js`, migrations are per-provider (SQLite migrations ≠ Postgres migrations), auto-seed on `migrate dev` removed — must run `prisma db seed` explicitly, `prisma.config.ts` is the new config surface.
- OMO orchestration doc: Atlas is Plan Executor, activated by `/start-work`; Prometheus writes plans in `.omo/plans/`; canonical flow Prometheus → `/start-work` → Atlas → Sisyphus-Junior.
- Repo state (`ls -la`): only `specs/`, `AGENTS.md`, `CLAUDE.md`, `.claude/` exist. No git init, no `web/`, no `agent/`, no `.gitignore`. Env reports "Is directory a git repo: no".

## Decisions (with rationale)
1. **Option B for database from Fase A**: Neon Postgres in dev AND prod via `@prisma/adapter-pg`. Single dialect, one migration path, no per-motor surprises. Neon free tier + scale-to-zero → $0 cost. (User approved.) **Provisioning via Vercel Marketplace** (user's preferred flow, confirmed by skill `vercel:vercel-storage` as the official preferred path): `vercel link --project cinepais` from `web/` → user creates Neon DB in Vercel dashboard (Storage → Neon) → `vercel env pull .env.local --yes` injects `DATABASE_URL` (pooled) + `DATABASE_URL_UNPOOLED` (direct). Prisma `directUrl` maps to `DATABASE_URL_UNPOOLED`. Caveat handled: Prisma CLI/tsx do NOT auto-load `.env.local` — `prisma.config.ts` must `config({ path: ".env.local" })` explicitly. Bonus: Vercel project pre-linked for Fase E.
2. **Next.js 16.2.12 stable** with App Router + Turbopack default + React 19.2. Renamed `middleware.ts` → `proxy.ts` in mind (though Fase A does not use one).
3. **Tailwind v4 CSS-first** — no `tailwind.config.js`. `globals.css` holds `@import "tailwindcss"`, `@import "tw-animate-css"`, `@custom-variant dark (&:is(.dark *))`, `@theme inline { ... }` block.
4. **shadcn 2.3 style `new-york`** with `cssVariables: true` and OKLCH palette in `:root` and `.dark`. In Fase A we only run `pnpm dlx shadcn@latest init` (writes the tokens); components come in Fase B.
5. **Prisma 7.9.x with `prisma-client` generator + `@prisma/adapter-pg`**. `provider = "postgresql"`. Use `prisma migrate dev` for schema changes, `prisma db seed` explicitly (v7 removed auto-seed).
6. **pnpm 9 + Node 20 LTS.**
7. **Design fidelity to references** (screenshots 01-05) — carry palette/typography/layout DNA over; identity = "CinePaís" wordmark + simple SVG icon. Impeccable skill invoked in Fase B (not applicable here).
8. **Zod schemas** in `web/src/lib/api/schemas.ts`, exported types via `z.infer`, README shows one JSON example per endpoint (the Python agent in Fase C will mirror these as Pydantic).
9. **`qualityTier` = string enum** `"low" | "optimal" | "high"`.
10. **Formats via join tables** (`SiteFormat`, `ShowtimeFormat`) — no arrays/JSON columns even though Postgres supports them, for cleaner relational querying.
11. **Materialize seats per showtime** (~175k rows across all seed showtimes; Postgres eats this for breakfast). One `Seat` row per showtime × physical position with `status`.
12. **Seed with 4 planted scenarios**:
    - `scenario-soldout`: one showtime fully sold, for the "sold-out" agent path.
    - `scenario-front-only`: showtime with only rows A-B available (low quality) — agent recommends alternative + explains.
    - `scenario-optimal`: showtime with plenty of D-H availability — agent's happy path.
    - `scenario-no-adjacent`: showtime with checkerboard availability so no 3 contiguous exist — agent explains + offers alt.
13. **Deterministic seed**: seeded PRNG (`seedrandom` or handcrafted mulberry32), fixed `NOW` reference read from `process.env.SEED_NOW` (defaults to `2026-08-01T00:00:00-05:00`), all IDs are deterministic hashes.
14. **Test framework: Vitest** (Next.js 16 friendly, fast). Minimum coverage:
    - `seed-determinism.test.ts`: run seed twice → identical `site.count`, `showtime.count`, `seat.count`, and sample seatIds.
    - `orphan-rule.test.ts`: pure function tests for `wouldLeaveOrphan(selection, rowAvailability)` covering aisle-as-edge, sold-as-edge, edge-of-row.
    - `cutoff.test.ts`: pure function test that `/api/showtimes` filters out shows within 15 min of `now`.
    - `schemas.test.ts`: each Zod schema parses its README example JSON.
15. **API endpoints** (all under `web/src/app/api/`, Route Handlers, no server actions):
    - `GET /api/cities` → `City[]`
    - `GET /api/films` → `FilmSummary[]` (optional `?city` filter)
    - `GET /api/films/:id` → `FilmDetail`
    - `GET /api/showtimes?filmId=&city=&date=&format=` → `Showtime[]` (with cutoff filter applied)
    - `GET /api/showtimes/:id/seats` → `{ seats: Seat[], summary: SeatSummary }`
16. **Env vars documented**: `DATABASE_URL` (Neon direct connection string, pooled + non-pooled), `SEED_NOW` (optional test override).
17. **Repo layout finalized**:
    ```
    cinepais/
      .gitignore
      .env.example
      AGENTS.md, CLAUDE.md
      specs/
      web/
        package.json, tsconfig.json, next.config.ts, eslint.config.mjs, postcss.config.mjs
        prisma/
          schema.prisma
          seed.ts
          migrations/
        src/
          app/
            layout.tsx, page.tsx (placeholder)
            api/
              cities/route.ts
              films/route.ts
              films/[id]/route.ts
              showtimes/route.ts
              showtimes/[id]/seats/route.ts
          lib/
            api/
              schemas.ts
              errors.ts
            business/
              orphan.ts
              cutoff.ts
              quality.ts
            db/
              client.ts
          styles/globals.css
        tests/
          seed-determinism.test.ts
          orphan-rule.test.ts
          cutoff.test.ts
          schemas.test.ts
        README.md
      .omo/
    ```
18. **Git**: `git init` at repo root if not already, working on branch `phase-0-scaffold` off `main`. No push, no commit unless the plan step says so.
19. **Skills to load per todo**: `programming` for TypeScript work, `nextjs` for Next 16 specifics, `git-master` only at the commit step. `impeccable` / `frontend` / `shadcn` deferred to Fase B.
20. **NOT in Fase A**: no UI page implementation (only a placeholder `page.tsx` that says "CinePaís API ready"), no agent, no Vercel/Fly deploy config, no shadcn components beyond `init`, no auth, no proxy.ts.

## Scope IN
- Repo bootstrap + git branch + `.gitignore` + `.env.example`.
- `web/` scaffolded via `create-next-app@latest` (or equivalent manual) with Next 16.2.x, TS strict, Tailwind v4, App Router, ESLint flat, `src/` dir, `@/*` import alias, pnpm.
- shadcn 2.3 init (`new-york` style, `cssVariables: true`, `iconLibrary: lucide`) — tokens installed, NO components yet.
- Prisma 7.9 install + `schema.prisma` (Postgres provider, `prisma-client` generator, adapter) + Prisma Client wired to `@prisma/adapter-pg` in `src/lib/db/client.ts`.
- Neon Postgres connection: pull URL via `neonctl` or ask user, write to `.env.example` (placeholder) + `.env.local` (real, gitignored).
- Initial migration `0000_init` created via `prisma migrate dev --name init`.
- `prisma/seed.ts` with deterministic seeding + 4 planted scenarios; `prisma db seed` wired via `prisma.config.ts`.
- Zod schemas + `/api/*` route handlers + typed error responses.
- Vitest tests: determinism + orphan + cutoff + schemas.
- `web/README.md` with setup, env, seed command, curl examples per endpoint.
- `AGENTS.md` addendum (optional, only if pattern gaps found) — otherwise unchanged.

## Scope OUT (Must NOT have)
- **No UI pages, components, or styling beyond a placeholder `page.tsx`.** No home, no catalog, no seat map — all belong to Fase B.
- **No agent code.** No `agent/` directory. No Python. That is Fase C.
- **No `proxy.ts`, no middleware.** Not needed until Fase B/D.
- **No shadcn components installed** beyond what `init` writes. Adding `button`, `card`, etc. is Fase B.
- **No auth, no session, no cookies, no CSRF, no rate limiting.** Portfolio demo, mock data, no PII.
- **No deploy config** (`vercel.json`, GitHub Actions, `fly.toml`). All deploy work is Fase E.
- **No LangSmith / observability wiring.** Fase C when agent exists.
- **No real cinema API calls, no scraping, no CineColombia branding/logo/name.** Enforced by AGENTS.md.
- **No commit or push** unless a specific todo says "Commit: Y" and user approves.
- **No `main` branch commits** — always work on `phase-0-scaffold`.
- **No arbitrary dependencies** — every added package must appear in a todo's References.

## Open questions
> None survived exploration + user answers. All decisions locked in Decisions section above.

## Approval gate
status: awaiting-approval
approach: See frontmatter `approach:` + Decisions above.
next action after approval: append task batches into `.omo/plans/cinepais-phase-0-scaffold.md` (~10-14 todos across 2-3 waves), then present the handoff explanation.
<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->
