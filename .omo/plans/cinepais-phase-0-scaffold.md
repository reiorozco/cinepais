# cinepais-phase-0-scaffold - Work Plan

## TL;DR (For humans)

**What you'll get:** A working `web/` project (Next.js 16 + Prisma 7 + Neon Postgres) that exposes 5 typed read API endpoints backed by 119,280 deterministically-seeded seats across 672 showtimes, including 4 planted scenarios designed to make the AI copilot demo shine. No UI page yet, no agent yet — those are the next two phases.

**Why this approach:** Neon Postgres from day 1 (Option B) eliminates the SQLite → Postgres dialect surprises that Prisma 7's per-motor migrations would otherwise create. Everything else is the current stable stack (Next 16.2, Tailwind v4 CSS-first, shadcn 2.3 new-york, Prisma 7.9). The seed's planted scenarios are the load-bearing decision: they let Fase C's agent evals and Fase E's demo recording work without further seed changes.

**What it will NOT do:** No home/catalog/seat-map UI. No Python agent. No deployment config. No shadcn UI components installed beyond the CSS tokens. No `proxy.ts`, no auth, no rate-limit. Never touches the real CineColombia API. Never commits or pushes to main.

**Effort:** Medium
**Risk:** Low — the only externality is the Neon provisioning step (Todo 5): the executor links the Vercel project and pauses while you create the Neon database from the Vercel dashboard (your usual flow), then pulls the env vars automatically.
**Decisions to sanity-check:** (all recorded in the draft, all reversible except IDs)
- Option B (Neon from day 1) — confirmed by you.
- Neon provisioned **via Vercel Marketplace** on a linked Vercel project (`cinepais`), env vars pulled with `vercel env pull` — confirmed by you. Bonus: project is pre-linked for Fase E deploy.
- Seed reference time defaults to `2026-08-01T00:00:00-05:00` (override with env `SEED_NOW`).
- 4 planted scenarios: `soldout`, `front-only`, `optimal`, `no-adjacent`.
- 3 suggested commits (end of each wave), never pushed.

Your next move: cerrar este chat, abrir uno nuevo, y ejecutar `/start-work` — Atlas leerá este plan y arrancará. Full execution detail follows below.

---

> TL;DR (machine): Medium effort, Low risk. Delivers Next.js 16 + Prisma 7 + Neon scaffold with 5 Zod-typed read endpoints, deterministic seed (672 showtimes / 119,280 seats) with 4 planted demo scenarios, Vitest coverage for determinism/orphan/cutoff/schemas, and README with curl examples. 13 todos across 3 waves + 4-task final verification wave. 3 suggested commits, no push. Dual high-accuracy review (Momus + Oracle) round 1: REJECT → all 8 blockers + 6 nits fixed in this revision.

## Scope

### Must have
1. Git repo initialized at `/Users/reiorozco/Dev/cinepais/` with branch `phase-0-scaffold` (never commit to `main` in this phase).
2. Root-level `.gitignore` (Node + Next.js + Prisma + `.env*` + `.vercel/` + `.omo/evidence/`) and `web/.env.example` documenting `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `SEED`, `SEED_NOW` (real values come from `vercel env pull`, never hand-written).
3. `web/` scaffolded via `create-next-app@latest` with Next 16.2.x, App Router, TypeScript strict, Tailwind CSS, `src/` directory, `@/*` import alias, ESLint flat config, pnpm, Turbopack (default in Next 16).
4. Tailwind v4 CSS-first setup: `postcss.config.mjs` uses `@tailwindcss/postcss`, `src/styles/globals.css` has `@import "tailwindcss"` + `@import "tw-animate-css"` + `@custom-variant dark (&:is(.dark *))` + `@theme inline { ... }` mapping tokens, OKLCH palette in `:root` and `.dark`. NO `tailwind.config.js`.
5. shadcn 2.3 initialized with `style: "new-york"`, `rsc: true`, `cssVariables: true`, `iconLibrary: "lucide"`, empty `tailwind.config`. Writes `components.json` and adds `cn` helper — no components added.
6. Prisma 7.9.x installed with `prisma-client` generator + `@prisma/adapter-pg` + `prisma.config.ts` referencing `web/prisma/schema.prisma` and `web/prisma/seed.ts`.
7. `web/prisma/schema.prisma` with models `Site`, `Film`, `Showtime`, `Seat`, `SiteFormat`, `ShowtimeFormat` and enums `SeatStatus`, `AreaCategory`, `QualityTier`, `Format`.
8. Vercel project `cinepais` linked from `web/` (`vercel link`), Neon Postgres provisioned via Vercel Marketplace integration, and env vars pulled to `web/.env.local` (gitignored) via `vercel env pull` — pooled `DATABASE_URL` for the app, `DATABASE_URL_UNPOOLED` for migrations.
9. Initial migration `0000_init` applied via `prisma migrate dev --name init`; `Prisma Client` generated via `prisma-client`.
10. `web/prisma/seed.ts` (TypeScript, executed via `tsx`) writing deterministic data: 2 cities, 6 sites, 24 rooms, 10 films, exactly 672 showtimes (4 per room per day), exactly 119,280 seats, with 4 planted demo scenarios (`soldout`, `front-only`, `optimal`, `no-adjacent`). Determinism via `mulberry32` PRNG seeded from `SEED` env (default `20260801`). Inserts chunked ≤5,000 rows via the UNPOOLED connection.
11. `src/lib/api/schemas.ts` Zod schemas for every response + `z.infer` type exports.
12. `src/lib/api/errors.ts` typed error responses: 404 `{ error: "not_found" }` + 400 `{ error: "validation_error", details: ZodIssue[] }`.
13. `src/lib/business/{orphan,cutoff,quality}.ts` pure functions covering orphan detection, 15-min cutoff, and row → tier mapping.
14. `src/lib/db/client.ts` singleton `PrismaClient` wired with `PrismaPg` adapter.
15. 5 Route Handlers under `src/app/api/`:
    - `cities/route.ts` → `GET /api/cities`
    - `films/route.ts` → `GET /api/films?city`
    - `films/[id]/route.ts` → `GET /api/films/:id`
    - `showtimes/route.ts` → `GET /api/showtimes?filmId&city&date&format`
    - `showtimes/[id]/seats/route.ts` → `GET /api/showtimes/:id/seats`
16. Vitest 2.x installed and configured for the `web/` workspace with `pnpm test` mapped.
17. `web/tests/seed-determinism.test.ts` — running the seed twice yields identical row counts and identical sampled seatIds.
18. `web/tests/orphan-rule.test.ts` — 6+ pure-function tests covering aisle-as-edge, sold-as-edge, row-edge, non-orphan-happy-path.
19. `web/tests/cutoff.test.ts` — filters out showtimes starting within 15 minutes of `now`.
20. `web/tests/schemas.test.ts` — every Zod schema parses its README example JSON without error.
21. `web/README.md` with sections: prerequisites, install, env vars, Neon setup, migrate + seed, run dev, run tests, endpoint contract with one curl example per endpoint.
22. Placeholder `src/app/page.tsx` that renders "CinePaís — read API ready. UI comes in Fase B." (server component, no client JS).
23. Three suggested commits (Y flagged in todos 4, 9, 13) with conventional messages; never push, never touch `main`.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- **NO UI beyond the placeholder** — no `Header`, no `MovieCard`, no `SeatMap`, no design tokens beyond what `shadcn init` writes. All of that is Fase B.
- **NO agent code** — no `agent/` directory, no Python, no LangGraph, no FastAPI, no MCP tools. Fase C.
- **NO shadcn UI components installed** — do not run `pnpm dlx shadcn@latest add <anything>`. Only `init` runs.
- **NO `middleware.ts` or `proxy.ts`** — not needed until Fase D.
- **NO auth, session, cookies, CSRF, rate-limit, CORS beyond Next default.** Portfolio demo, mock data.
- **NO Vercel/Fly deploys or deploy config** — `vercel link` + Marketplace Neon + `vercel env pull` ARE allowed (Todo 5); but NO `vercel deploy`, NO `vercel --prod`, no `vercel.json`, no `fly.toml`, no GitHub Actions. All deploy work is Fase E.
- **NO SQLite fallback code paths** — Postgres only (Option B). Do not add `@prisma/adapter-better-sqlite3`.
- **NO calls to CineColombia, Vista OCAPI, or any real cinema API.** Do not import their logos, marks, or endpoint URLs anywhere in code or docs.
- **NO real cinema brand strings** — the word "CineColombia" must not appear anywhere in `web/` files except as an explicit anti-reference comment if unavoidable (prefer to omit entirely).
- **NO commits to `main`** — the branch check must pass at every `Commit: Y` step; if HEAD is `main` at that moment, create `phase-0-scaffold` first.
- **NO `git push`** at any point in this plan.
- **NO arbitrary dependencies** — the only allowed additions are those explicitly listed in a todo's References or Acceptance Criteria (`next`, `react`, `react-dom`, `typescript`, `tailwindcss@^4`, `@tailwindcss/postcss`, `tw-animate-css`, `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `prisma`, `@prisma/client`, `@prisma/adapter-pg`, `pg`, `zod`, `tsx`, `vitest`, `@vitest/coverage-v8`).
- **NO Prisma `prisma-client-js` generator** — use the new `prisma-client` generator only (Prisma 7 way).
- **NO auto-seed on `migrate dev`** — Prisma 7 removed it; the seed runs explicitly via `pnpm prisma db seed` and is documented that way in the README.
- **NO shadcn `default` style** — must be `new-york`.
- **NO HSL colors** — palette must be OKLCH (Tailwind v4 + shadcn 2.3 convention).
- **NO Node <20 or Bun** in this phase — pnpm + Node 20.
- **NO speculative endpoints or fields** beyond what the read-API contract in AGENTS.md § "Read API contract" lists. If a field is unclear, ask the user via task tools before shipping it.

## Verification strategy
> Zero human intervention — all verification is agent-executed.

- **Test decision:** Mixed strategy.
  - Scaffolding + config tasks (1–7, 15): **tests-after via smoke commands** (dev server starts, prisma validates, build succeeds).
  - Business rules (Todo 11): **TDD-lite** — write Vitest tests first, then implement until green.
  - API endpoints (Todo 12): **tests-after** — verified via a curl-per-endpoint transcript that is then parsed by the Zod schema and asserted equal (Todo 13).
  - Seed determinism (Todo 9): **assertion-based** — run seed twice, diff counts and sampled seatIds.
- **Test framework:** Vitest 2.x with `@vitest/coverage-v8`, executed via `pnpm test`.
- **LSP diagnostics:** every implementation todo must end with `mcp_Lsp_diagnostics` reporting zero errors in the affected files.
- **Evidence:** `.omo/evidence/task-<N>-cinepais-phase-0-scaffold.<ext>` (create the directory on first write). Ext varies by task (`.txt` for command output, `.json` for API responses, `.sql` for migration output).

## Execution strategy

### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

**Wave 1 — Repo + framework scaffolding (Todos 1–4):**
- 1 → 2 are strictly sequential (need repo before scaffold).
- 3 and 4 can be parallelized *after* 2 completes (both edit only `web/` config files; 3 touches `postcss.config.mjs` + `globals.css`, 4 touches `components.json` + `lib/utils.ts` + `globals.css` OKLCH block — coordinate via 3 finishing the base `globals.css` first).
- Wave-close commit at Todo 4.

**Wave 2 — Data layer (Todos 5–9):**
- Strictly sequential. Requires Wave 1 done.
- Todo 5 pauses to ask user for Neon URL.
- Wave-close commit at Todo 9.

**Wave 3 — API + business rules + tests + docs (Todos 10–13):**
- 10 (Zod schemas) and 11 (business rules + their unit tests) run in parallel — different files, no dependency.
- 12 (route handlers) depends on both 10 and 11.
- 13 (README + tests + smoke curls) depends on 12.
- Wave-close commit at Todo 13.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | — | 2 | — |
| 2 | 1 | 3, 4 | — |
| 3 | 2 | 4 (partial), 5+ | — (touches globals.css first) |
| 4 | 2, 3 | 5+ | — |
| 5 | 4 | 6 | — |
| 6 | 5 | 7 | — |
| 7 | 6 | 8, 9 | — |
| 8 | 7 | 9 | — |
| 9 | 8 | 10 | — |
| 10 | 9 | 12 | 11 |
| 11 | 9 | 12 | 10 |
| 12 | 10, 11 | 13 | — |
| 13 | 12 | F1–F4 | — |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [x] 1. Repo root: initialize git, create `phase-0-scaffold` branch, write `.gitignore` - expect clean `git status` on the new branch
  What to do / Must NOT do:
    - Run `git init` if `git rev-parse --is-inside-work-tree` reports false.
    - Configure `git config init.defaultBranch main` for consistency, then create and switch to `phase-0-scaffold` via `git checkout -b phase-0-scaffold` if HEAD is not already there.
    - Write `/Users/reiorozco/Dev/cinepais/.gitignore` covering: `node_modules/`, `.next/`, `.turbo/`, `.env`, `.env.local`, `.env*.local`, `.vercel/`, `web/prisma/*.db*`, `coverage/`, `.omo/evidence/`, `.DS_Store`, `*.log`, `.pnpm-store/`.
    - **Must NOT create `web/` or any file inside it** — `create-next-app`'s `isFolderEmpty` check rejects a target dir containing anything outside its allowlist (`.env.example` is NOT allowlisted); `web/.env.example` is written in Todo 2 AFTER the scaffold. (Momus review finding #1.)
    - Must NOT touch `main`. Must NOT run `git remote add`. Must NOT push.
  Parallelization: Wave 1 | Blocked by: — | Blocks: 2
  References (executor has NO interview context — be exhaustive):
    - Repo root: `/Users/reiorozco/Dev/cinepais/`
    - Current entries confirmed: `AGENTS.md`, `CLAUDE.md`, `specs/`, `.claude/`, `.omo/`. No `.gitignore`, no `.git/`, no `web/`.
    - AGENTS.md `:50-53` — commit/branch discipline.
    - `.omo/drafts/cinepais-phase-0-scaffold.md` — decision #18 (git init + branch).
  Acceptance criteria (agent-executable):
    - `git rev-parse --abbrev-ref HEAD` outputs `phase-0-scaffold`.
    - `git status --porcelain` shows only untracked additions of `.gitignore` (plus any pre-existing files that were already tracked or ignored).
    - `cat .gitignore` includes at least `node_modules/`, `.next/`, `.env.local`, `.vercel/`, `.omo/evidence/`.
    - `test ! -d web` (web/ must NOT exist yet — Todo 2 creates it).
  QA scenarios (name the exact tool + invocation):
    - happy: `bash -c "git rev-parse --abbrev-ref HEAD && ls -la .gitignore && test ! -d web && echo NO-WEB-OK"` → prints `phase-0-scaffold` and `NO-WEB-OK`. Evidence `.omo/evidence/task-1-cinepais-phase-0-scaffold.txt`.
    - failure: `bash -c "grep -F 'CineColombia' .gitignore || echo OK"` → prints `OK` (must not leak brand). Evidence appended to same file.
  Commit: N | (bundle into wave-close commit at Todo 4)

- [x] 2. `web/`: bootstrap Next.js 16.2.x with create-next-app - expect `pnpm dev` to serve `http://localhost:3000` with default page
  What to do / Must NOT do:
    - From repo root, run non-interactively: `pnpm create next-app@latest web --typescript --tailwind --app --src-dir --import-alias "@/*" --use-pnpm --eslint --skip-install --disable-git`. If the CLI rejects `--disable-git` as unknown, drop the flag and run `rm -rf web/.git` right after the scaffold completes (do NOT try `--no-git` — it does not exist in create-next-app); if it rejects `--skip-install`, drop it and let install run.
    - Then `cd web && pnpm install` (if not already run by the scaffold).
    - AFTER the scaffold succeeds, write `web/.env.example` with commented placeholders: `DATABASE_URL="postgresql://..."` (Neon pooled — injected by Vercel, pulled via `vercel env pull`), `DATABASE_URL_UNPOOLED="postgresql://..."` (Neon direct, for migrations), `SEED=20260801` (optional determinism override), `SEED_NOW=2026-08-01T00:00:00-05:00` (optional time-reference override). Header comment: "Do not fill by hand — run `vercel env pull .env.local --yes` (see Todo 5 / README)." This file is written HERE (not Todo 1) because create-next-app requires an empty target dir.
    - Verify `web/package.json` has `"next": "^16.2.0"` (or newer 16.x — reject anything <16 or ≥17). If create-next-app installed a version outside `16.x`, pin explicitly by editing `package.json` and rerunning install.
    - Verify `web/tsconfig.json` has `"strict": true` and paths alias `"@/*": ["./src/*"]`.
    - Verify `web/next.config.ts` exists (TypeScript config is Next 16 default).
    - Verify `web/eslint.config.mjs` exists (Flat Config is Next 16 default).
    - Overwrite `web/src/app/page.tsx` with a minimal server component: `export default function Home() { return <main style={{padding:"2rem",fontFamily:"system-ui"}}><h1>CinePaís — read API ready.</h1><p>UI comes in Fase B.</p></main>; }`. Keep `layout.tsx` as generated.
    - Must NOT use `--webpack` (Turbopack is Next 16 default and required for our stack).
    - Must NOT initialize a nested git repo (`--disable-git` flag handles it).
    - Must NOT commit yet.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 3, 4
  References:
    - Next.js 16 blog (2025-10-21): https://nextjs.org/blog/next-16
    - Next.js 16 upgrade guide: https://nextjs.org/docs/app/guides/upgrading/version-16
    - shadcn Next.js install docs: https://ui.shadcn.com/docs/installation/next
    - AGENTS.md `:14` — Next.js lean App Router + TS + Tailwind + Prisma.
    - `.omo/drafts/cinepais-phase-0-scaffold.md` — decisions #2, #6, #17 (repo layout).
  Acceptance criteria:
    - `test -f web/package.json && node -e "const p=require('./web/package.json'); if(!/^\\^?16\\./.test(p.dependencies.next)) process.exit(1)"` exits 0.
    - `test -f web/tsconfig.json && test -f web/next.config.ts && test -f web/eslint.config.mjs && test -d web/src/app && test -f web/src/app/page.tsx`.
    - `cd web && pnpm exec next --version` prints a `16.x` version.
    - `grep -q "read API ready" web/src/app/page.tsx`.
    - `test -f web/.env.example && grep -q 'DATABASE_URL_UNPOOLED' web/.env.example && grep -q 'SEED' web/.env.example`.
  QA scenarios:
    - happy: `bash -c "cd web && (timeout 15s pnpm dev > /tmp/nextdev.log 2>&1 &) && sleep 10 && curl -sS -o /dev/null -w '%{http_code}\\n' http://localhost:3000 && pkill -f 'next dev' || true"` → prints `200`. Evidence `.omo/evidence/task-2-cinepais-phase-0-scaffold.txt` (append `/tmp/nextdev.log`).
    - failure: `bash -c "cd web && pnpm exec tsc --noEmit"` → exits 0 (baseline TypeScript strict passes with only the placeholder page).
  Commit: N

- [x] 3. `web/`: configure Tailwind v4 CSS-first (postcss.config.mjs, globals.css, tw-animate-css) - expect dev server still 200 with Tailwind classes rendering
  What to do / Must NOT do:
    - Confirm Tailwind v4 was installed by create-next-app (`web/package.json` should have `"tailwindcss": "^4"` and `"@tailwindcss/postcss": "^4"`). If not, `cd web && pnpm add -D tailwindcss@^4 @tailwindcss/postcss@^4`.
    - Add `tw-animate-css`: `cd web && pnpm add -D tw-animate-css`.
    - Ensure `web/postcss.config.mjs` exports exactly `{ plugins: { "@tailwindcss/postcss": {} } }` (create if missing, replace if present).
    - Delete `web/tailwind.config.ts` or `web/tailwind.config.js` if create-next-app scaffolded one — Tailwind v4 is CSS-first, that file must not exist.
    - Move CSS file to `web/src/styles/globals.css` (create the `styles/` dir). If create-next-app put it at `web/src/app/globals.css`, move it and update the import in `web/src/app/layout.tsx` from `./globals.css` to `@/styles/globals.css`.
    - Write `web/src/styles/globals.css` with exactly (in this order):
      ```css
      @import "tailwindcss";
      @import "tw-animate-css";

      @custom-variant dark (&:is(.dark *));

      @theme inline {
        --color-background: var(--background);
        --color-foreground: var(--foreground);
        --color-primary: var(--primary);
        --color-primary-foreground: var(--primary-foreground);
        --color-muted: var(--muted);
        --color-muted-foreground: var(--muted-foreground);
        --color-border: var(--border);
        --color-ring: var(--ring);
        --font-sans: var(--font-geist-sans);
        --font-mono: var(--font-geist-mono);
        --radius-sm: calc(var(--radius) - 4px);
        --radius-md: calc(var(--radius) - 2px);
        --radius-lg: var(--radius);
      }

      :root {
        --radius: 0.625rem;
        --background: oklch(1 0 0);
        --foreground: oklch(0.145 0 0);
        --primary: oklch(0.205 0 0);
        --primary-foreground: oklch(0.985 0 0);
        --muted: oklch(0.97 0 0);
        --muted-foreground: oklch(0.556 0 0);
        --border: oklch(0.922 0 0);
        --ring: oklch(0.708 0 0);
      }

      .dark {
        --background: oklch(0.145 0 0);
        --foreground: oklch(0.985 0 0);
        --primary: oklch(0.985 0 0);
        --primary-foreground: oklch(0.205 0 0);
        --muted: oklch(0.269 0 0);
        --muted-foreground: oklch(0.708 0 0);
        --border: oklch(0.269 0 0);
        --ring: oklch(0.556 0 0);
      }

      body { background: var(--background); color: var(--foreground); font-family: var(--font-sans, ui-sans-serif, system-ui); }
      ```
    - Must NOT use `hsl(var(--X))` anywhere — always `var(--X)` directly (documented v3→v4 breakage).
    - Must NOT install `tailwindcss-animate` (v3-only; broken in v4).
    - Must NOT create a `tailwind.config.js/ts`.
  Parallelization: Wave 1 | Blocked by: 2 | Blocks: 4 (partial — 4 also edits globals.css)
  References:
    - crea.mba 2026-05-22 "Next.js 16 styling guide: Tailwind v4 + shadcn done right in 2026": https://crea.mba/en/blog/nextjs-16-styling-guide-tailwind-v4-shadcn
    - crea.mba 2026-05-29 "shadcn/ui 2.3.0 and Tailwind v4": https://crea.mba/en/blog/shadcn-2-3-0-tailwind-v4-support
    - shadcn Tailwind v4 docs: https://ui.shadcn.com/docs/tailwind-v4
    - `.omo/drafts/cinepais-phase-0-scaffold.md` — decision #3 (Tailwind v4 CSS-first).
  Acceptance criteria:
    - `test ! -f web/tailwind.config.ts && test ! -f web/tailwind.config.js`.
    - `test -f web/src/styles/globals.css && test -f web/postcss.config.mjs`.
    - `grep -Fq '@import "tailwindcss"' web/src/styles/globals.css`.
    - `grep -Fq '@custom-variant dark' web/src/styles/globals.css`.
    - `grep -Fq 'oklch(' web/src/styles/globals.css`.
    - `grep -q 'hsl(var(' web/src/styles/globals.css` returns exit code 1 (no HSL leftovers).
    - `grep -Fq '@/styles/globals.css' web/src/app/layout.tsx`.
  QA scenarios:
    - happy: `bash -c "cd web && (timeout 20s pnpm dev > /tmp/nextdev.log 2>&1 &) && sleep 12 && HTML=\$(curl -sS http://localhost:3000) && echo \"\$HTML\" | grep -qi 'read API ready' && CSSURL=\$(echo \"\$HTML\" | grep -o 'href=\"/_next/[^\"]*\\.css[^\"]*\"' | head -1 | cut -d'\"' -f2) && curl -sS -o /dev/null -w '%{content_type}\\n' \"http://localhost:3000\$CSSURL\" | grep -q 'text/css'; pkill -f 'next dev' || true"` → page renders + real stylesheet URL (extracted from the HTML `<link>` tag, not a guessed internal path) serves `text/css`. Evidence `.omo/evidence/task-3-cinepais-phase-0-scaffold.txt`.
    - failure: `bash -c "cd web && pnpm exec next build"` → exits 0. (NOTE: `--no-lint` was REMOVED in Next 16 — linting no longer runs during build at all; never pass that flag.)
  Commit: N

- [x] 4. `web/`: initialize shadcn 2.3 `new-york` (writes components.json + cn helper + palette tokens) - expect components.json valid + wave-close commit
  What to do / Must NOT do:
    - Ensure `web/src/styles/globals.css` from Todo 3 exists and is non-empty (shadcn 4.10 crashes on empty CSS — known bug #10856).
    - First run `pnpm dlx shadcn@latest --version` and record it in the evidence file.
    - Run `cd web && pnpm dlx shadcn@latest init --yes --defaults`. **Do NOT pass `--style` or `--base-color` — those flags no longer exist in the current shadcn CLI** (Momus review finding #2: current flags are `-t/--template`, `-b/--base`, `-p/--preset`, `-y/--yes`, `-d/--defaults`, `--css-variables`; for Tailwind v4 projects the CLI auto-selects style `new-york` and baseColor `neutral` in its minimal-config path).
    - If interactive prompts appear despite `--defaults`, answer per current CLI flow: template=next, base=base (default), accept preset default, monorepo=no.
    - After init, verify `web/components.json`: `"rsc": true`, `"tailwind": { "css": "src/styles/globals.css", "cssVariables": true }`. If `tailwind.css` points to a different path (init may have detected another file), edit `components.json` to `src/styles/globals.css` and move any CSS the init wrote into that file. If `style` key exists it should be `new-york`-family; if the CLI wrote a different default AND no `--preset` can force new-york in the installed version, record the actual value in evidence and continue — the token variables (OKLCH palette) are what Fase B depends on, not the style label.
    - Verify `web/src/lib/utils.ts` exports `cn(...inputs)` using `clsx` + `tailwind-merge`.
    - Verify `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge` are in `web/package.json` dependencies.
    - Verify `web/src/styles/globals.css` now contains the full shadcn 2.3 OKLCH palette (init should have merged/extended). Reconcile with the base written in Todo 3 — the shadcn tokens are the source of truth; keep our custom `body { ... }` block at the bottom.
    - Must NOT run `pnpm dlx shadcn@latest add <anything>` — components are Fase B.
    - Must NOT switch style to `default`.
    - Must NOT enable Tailwind config file (`config: ""` stays empty).
    - Commit at end of wave: `git add -A && git commit -m "chore(web): scaffold Next.js 16 + Tailwind v4 + shadcn 2.3 new-york"` ONLY after verifying HEAD is `phase-0-scaffold`.
  Parallelization: Wave 1 | Blocked by: 2, 3 | Blocks: 5+
  References:
    - shadcn init docs: https://ui.shadcn.com/docs/installation/next
    - Known bug #10856 (empty globals.css): https://github.com/shadcn-ui/ui/issues/10856
    - `.omo/drafts/cinepais-phase-0-scaffold.md` — decision #4, #7 (shadcn new-york).
  Acceptance criteria:
    - `test -f web/components.json && node -e "const c=require('./web/components.json'); if(c.tailwind.cssVariables!==true) process.exit(1); if(c.style && !/new-york/.test(c.style)) process.exit(2)"` exits 0 (cssVariables mandatory; style checked only if the key exists — current CLI versions may manage style via preset instead).
    - `test -f web/src/lib/utils.ts && grep -q 'cn' web/src/lib/utils.ts` (the `cn` helper exists; exact export syntax may vary by CLI version).
    - Gate ALL four deps explicitly (init adds them in most versions; install any missing ones — they are required by Fase B): run `node -e "const p=require('./web/package.json'); const deps={...(p.dependencies||{}),...(p.devDependencies||{})}; const missing=['clsx','tailwind-merge','lucide-react','class-variance-authority'].filter(d=>!deps[d]); if(missing.length){console.log('MISSING:',missing.join(' ')); process.exit(1)}"` — if it exits 1, run `cd web && pnpm add <missing packages>` and re-run until exit 0.
    - `git log --oneline -1 phase-0-scaffold` prints a commit whose message starts with `chore(web): scaffold Next.js 16`.
  QA scenarios:
    - happy: `bash -c "cd web && pnpm exec next build; echo EXIT=\$?"` → prints `EXIT=0` (rely on exit code, NOT on output-text greps — build wording drifts across Next versions and Turbopack). Evidence `.omo/evidence/task-4-cinepais-phase-0-scaffold.txt` (include `shadcn --version` output).
    - failure: `bash -c "git branch --show-current"` → prints `phase-0-scaffold` (commit went to correct branch).
  Commit: **Y** | `chore(web): scaffold Next.js 16 + Tailwind v4 + shadcn 2.3 new-york`

- [x] 5. `web/`: install Prisma 7.9 + adapter-pg + prisma.config.ts + link Vercel project + provision Neon via Marketplace + env pull - expect `pnpm prisma validate` succeeds with pulled env vars
  What to do / Must NOT do:
    - `cd web && pnpm add -D prisma@^7.9 tsx && pnpm add @prisma/client@^7.9 @prisma/adapter-pg@^7.9 pg@^8 && pnpm add -D @types/pg`.
    - Create `web/prisma/schema.prisma` scaffold minimum (models filled in Todo 6, but the datasource/generator blocks are needed for `prisma validate`). **Prisma 7 notes (Oracle review findings #1, #2, #11): there is NO `directUrl` field in the v7 datasource — pooled-vs-direct routing is done via `prisma.config.ts` (CLI ops → unpooled) + the driver adapter (app runtime → pooled). Do NOT set `moduleFormat` — let the generator infer it from tsconfig:**
      ```prisma
      generator client {
        provider = "prisma-client"
        output   = "../src/generated/prisma"
      }

      datasource db {
        provider = "postgresql"
        url      = env("DATABASE_URL_UNPOOLED")
      }
      ```
      (The schema-level `url` is what CLI operations — migrate/validate — resolve, so it MUST be the UNPOOLED direct URL: Neon's PgBouncer pooled URL cannot run migrations. The app runtime never reads this field — it connects via `PrismaPg` with the pooled `DATABASE_URL` in Todo 7.)
    - Create `web/prisma.config.ts` — NOTE 1: `dotenv/config` alone loads `.env` but NOT `.env.local`; only Next.js auto-loads `.env.local`, so Prisma CLI + tsx need the explicit path. NOTE 2 (Oracle finding #1): **`seed` lives INSIDE `migrations`, not at top level** — a top-level `seed` key is silently ignored and `prisma db seed` fails with "No seed command configured":
      ```ts
      import { config } from "dotenv";
      import { defineConfig } from "prisma/config";
      config({ path: ".env.local" });
      config(); // fallback to .env if present
      export default defineConfig({
        schema: "prisma/schema.prisma",
        migrations: {
          path: "prisma/migrations",
          seed: "tsx prisma/seed.ts",
        },
      });
      ```
      If `pnpm prisma validate` or `pnpm prisma db seed` later reports a config-shape error, consult the installed version's types (`node_modules/prisma/config.d.ts` or `@prisma/config`) and adapt — the executor must verify the shape against the INSTALLED version, not assume.
    - `cd web && pnpm add -D dotenv`.
    - **Link the Vercel project** (this is the user's preferred flow — Neon via Vercel Marketplace):
      1. `cd web && vercel whoami` — confirm CLI is authenticated. If not, PAUSE and ask the user to run `vercel login`.
      2. `cd web && vercel link --yes --project cinepais` — creates/links the Vercel project `cinepais` with `web/` as its root. If the CLI prompts for a team scope and cannot resolve it non-interactively, PAUSE and ask the user which team to use.
    - **Provision Neon via Vercel Marketplace** — PAUSE with an `mcp_Question` call telling the user: "El proyecto `cinepais` ya está linkeado en Vercel. Crea la base Neon desde el dashboard como sueles hacer: vercel.com → tu team → Storage → Create Database → Neon (free) → conéctala al proyecto `cinepais` con todos los environments (Development, Preview, Production). Avísame cuando esté." Alternatively the executor MAY try `vercel integration add neon` first — but if it requires browser interaction, fall back to the user-dashboard pause above. Do NOT proceed until the user confirms.
    - **Pull env vars**: `cd web && vercel env pull .env.local --yes` — this writes `web/.env.local` with the Neon-injected vars. Then verify names: `grep -q '^DATABASE_URL=' web/.env.local` and `grep -q '^DATABASE_URL_UNPOOLED=' web/.env.local`. If the integration injected only legacy names (`POSTGRES_URL` / `POSTGRES_URL_NON_POOLING`), append two mapping lines to `web/.env.local` copying those values into `DATABASE_URL=` / `DATABASE_URL_UNPOOLED=` respectively (copy the literal values — `.env` files do not support `$VAR` interpolation reliably).
    - Verify `pnpm prisma validate` exits 0 (schema is well-formed and datasource resolves both env vars).
    - Must NOT commit `web/.env.local` or `web/.vercel/`.
    - Must NOT run `vercel deploy` / `vercel --prod` — linking and env pull only; deploys are Fase E.
    - Must NOT use `@prisma/adapter-better-sqlite3`. Must NOT set `provider = "sqlite"`.
    - Must NOT use `provider = "prisma-client-js"` (v6 legacy — deprecated in v7).
  Parallelization: Wave 2 | Blocked by: 4 | Blocks: 6
  References:
    - Prisma v7 upgrade guide: https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7
    - Prisma 7.9.0 release notes: https://github.com/prisma/prisma/releases/tag/7.9.0
    - Vercel Marketplace storage (Neon): https://vercel.com/docs/storage — provisioning injects env vars into the linked project; `vercel env pull .env.local --yes` brings them local. Skill `vercel:vercel-storage` confirms this is the preferred path over manual Neon console.
    - dotenv caveat: only Next.js auto-loads `.env.local`; Prisma CLI/tsx scripts need `config({ path: ".env.local" })` explicitly (documented in skill `vercel:vercel-storage`).
    - `.omo/drafts/cinepais-phase-0-scaffold.md` — decisions #1, #5 (Option B, Prisma 7.9 + adapter-pg, Vercel Marketplace provisioning).
  Acceptance criteria:
    - `test -f web/prisma/schema.prisma && test -f web/prisma.config.ts`.
    - `node -e "const p=require('./web/package.json'); ['prisma','@prisma/client','@prisma/adapter-pg','pg','tsx','dotenv'].forEach(d=>{const in_deps=(p.dependencies||{})[d]||(p.devDependencies||{})[d]; if(!in_deps) process.exit(1)})"` exits 0.
    - `grep -Eq '^\s*provider\s*=\s*"postgresql"' web/prisma/schema.prisma` (whitespace-tolerant — `prisma format` realigns `=` columns; NEVER use exact-whitespace greps on .prisma files — Momus finding #3).
    - `grep -Eq '^\s*provider\s*=\s*"prisma-client"' web/prisma/schema.prisma`.
    - `grep -Eq 'DATABASE_URL_UNPOOLED' web/prisma/schema.prisma` (CLI datasource uses the direct URL).
    - `grep -q 'directUrl' web/prisma/schema.prisma` returns exit 1 (no v6-only field).
    - `test -d web/.vercel && node -e "const p=require('./web/.vercel/project.json'); if(!p.projectId) process.exit(1)"` exits 0 (project linked).
    - `cd web && pnpm prisma validate` exits 0.
    - `test -f web/.env.local && grep -q '^DATABASE_URL=' web/.env.local && grep -q '^DATABASE_URL_UNPOOLED=' web/.env.local`.
    - `git check-ignore web/.env.local` exits 0 and `git check-ignore web/.vercel` exits 0 (both gitignored).
  QA scenarios:
    - happy: `bash -c "cd web && pnpm prisma validate 2>&1"` → prints "The schema at prisma/schema.prisma is valid". Evidence `.omo/evidence/task-5-cinepais-phase-0-scaffold.txt`.
    - failure: `bash -c "git status --porcelain web/.env.local web/.vercel"` → prints nothing (env + link files not staged).
  Commit: N

- [x] 6. `web/prisma/schema.prisma`: define Site, Film, Showtime, Seat + join tables + enums - expect `prisma validate` still 0 with 6 models + 4 enums
  What to do / Must NOT do:
    - Extend the scaffold from Todo 5 with the full model set. Exact schema:
      ```prisma
      enum Format {
        IMAX
        Onyx
        TwoD    @map("2D")
        Doblada
        Subtitulada
        Premium
      }

      enum SeatStatus {
        Available
        Sold
      }

      enum AreaCategory {
        general
        premium
        wheelchair
        preferential
      }

      enum QualityTier {
        low
        optimal
        high
      }

      model Site {
        id        String       @id
        name      String
        city      String
        lat       Float
        lng       Float
        formats   SiteFormat[]
        showtimes Showtime[]

        @@index([city])
      }

      model SiteFormat {
        siteId String
        format Format
        site   Site   @relation(fields: [siteId], references: [id], onDelete: Cascade)

        @@id([siteId, format])
      }

      model Film {
        id          String     @id
        title       String
        posterUrl   String
        synopsis    String
        durationMin Int
        rating      String
        director    String
        cast        Json       // string[] as jsonb — native PG type, no manual parse
        genres      Json       // string[] as jsonb — Fase C agent can filter server-side
        showtimes   Showtime[]
      }

      model Showtime {
        id           String           @id
        filmId       String
        siteId       String
        businessDate DateTime         @db.Date
        time         String           // "HH:MM" 24h Bogota-local
        room         String
        formats      ShowtimeFormat[]
        seats        Seat[]
        film         Film             @relation(fields: [filmId], references: [id], onDelete: Cascade)
        site         Site             @relation(fields: [siteId], references: [id], onDelete: Cascade)

        @@index([filmId, businessDate])
        @@index([siteId, businessDate])
      }

      model ShowtimeFormat {
        showtimeId String
        format     Format
        showtime   Showtime @relation(fields: [showtimeId], references: [id], onDelete: Cascade)

        @@id([showtimeId, format])
      }

      model Seat {
        showtimeId    String
        seatId        String        // "area_row_col" e.g. "1_10_8"
        row           Int
        col           Int
        area          Int
        status        SeatStatus
        areaCategory  AreaCategory
        qualityTier   QualityTier
        showtime      Showtime      @relation(fields: [showtimeId], references: [id], onDelete: Cascade)

        @@id([showtimeId, seatId])
        @@index([showtimeId, status])
      }
      ```
    - Run `cd web && pnpm prisma format` to normalize formatting.
    - Run `cd web && pnpm prisma validate` to confirm the schema parses.
    - Must NOT use array types (`String[]`, `Int[]`) for FORMATS — those go through join tables (SiteFormat/ShowtimeFormat) per decision #10. `cast`/`genres` use `Json` (jsonb): they are not relations to real entities, and jsonb keeps them queryable for the Fase C agent (Oracle review finding #14 — reversed the earlier String-encoded decision).
    - Must NOT JSON-encode into `String` columns — Postgres-only stack (Option B) makes `Json` the correct type.
    - Must NOT add `updatedAt` / `createdAt` — not required for read API + demo scope.
  Parallelization: Wave 2 | Blocked by: 5 | Blocks: 7
  References:
    - `specs/design-reference/README.md:14-31` — data model shape from real portal.
    - `specs/001-cine-copiloto-boletas.md:82` — `seatId = area_fila_columna` format.
    - `.omo/drafts/cinepais-phase-0-scaffold.md` — decisions #10, #11 (join tables, materialized seats).
  Acceptance criteria:
    - `cd web && pnpm prisma format` exits 0.
    - `cd web && pnpm prisma validate` exits 0.
    - `grep -c '^model ' web/prisma/schema.prisma` prints `6` (Site, SiteFormat, Film, Showtime, ShowtimeFormat, Seat).
    - `grep -c '^enum ' web/prisma/schema.prisma` prints `4`.
    - No `[]` at end of a scalar type declaration: `grep -E '^\\s+\\w+\\s+String\\[\\]' web/prisma/schema.prisma` returns exit 1.
  QA scenarios:
    - happy: `bash -c "cd web && pnpm prisma format && pnpm prisma validate 2>&1"` → both exit 0. Evidence `.omo/evidence/task-6-cinepais-phase-0-scaffold.txt`.
    - failure: `bash -c "cd web && pnpm prisma format --check 2>&1"` → exits 0 (idempotent format).
  Commit: N

- [x] 7. `web/`: apply `0000_init` migration to Neon and generate Prisma Client + wire client singleton - expect `SELECT 1` succeeds and Prisma Client imports type-check
  What to do / Must NOT do:
    - Run `cd web && pnpm prisma migrate dev --name init` — this creates `web/prisma/migrations/<timestamp>_init/migration.sql`, applies it to Neon (schema datasource `url` = `DATABASE_URL_UNPOOLED` per Todo 5), and generates the `prisma-client` at `web/src/generated/prisma/`.
    - **Inspect the generated output BEFORE writing imports** (Oracle finding #4): the v7 `prisma-client` generator emits FLAT files at the output root — `client.ts`, `models.ts`, `enums.ts`, plus `models/` and `internal/` — there is NO `client/index.js` subdirectory. Run `ls web/src/generated/prisma/` and record the actual layout in evidence; adjust the import below if the installed version differs.
    - Create `web/src/lib/db/client.ts` (import resolves `client.ts` at output root under Next's `moduleResolution: "bundler"`):
      ```ts
      import { PrismaClient } from "@/generated/prisma/client";
      import { PrismaPg } from "@prisma/adapter-pg";

      const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
      const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
      export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });
      if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
      ```
    - Verify connectivity with a throwaway ESM script (the generated client is ESM — `require()` will fail; use tsx): write `web/scripts/smoke-db.mts` containing:
      ```ts
      import { config } from "dotenv";
      config({ path: ".env.local" });
      const { PrismaClient } = await import("../src/generated/prisma/client");
      const { PrismaPg } = await import("@prisma/adapter-pg");
      const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
      console.log(JSON.stringify(await p.$queryRaw`SELECT 1 AS ok`));
      await p.$disconnect();
      ```
      Run `cd web && pnpm exec tsx scripts/smoke-db.mts` → expected output includes `"ok":1`. Keep the script (it is reused by F3 and useful for debugging); add `web/scripts/` to the repo (committed).
    - Ensure `web/src/generated/` is in `.gitignore` (edit `.gitignore` if needed to add `web/src/generated/`).
    - Must NOT commit `web/src/generated/`.
    - Must NOT run `prisma db push` (we want migrations, not push).
    - Must NOT modify the generated migration SQL after apply.
  Parallelization: Wave 2 | Blocked by: 6 | Blocks: 8, 9
  References:
    - Prisma driver adapters: https://www.prisma.io/docs/orm/overview/databases/database-drivers
    - dev.to article on Prisma 7 adapters: https://dev.to/edriso/what-is-a-database-adapter-and-why-does-prisma-7-need-one-334
    - `.omo/drafts/cinepais-phase-0-scaffold.md` — decision #5 (adapter-pg wiring).
  Acceptance criteria:
    - `ls -d web/prisma/migrations/*_init/ && ls web/prisma/migrations/*_init/migration.sql` both succeed (glob-safe — `ls` expands the timestamped dir name; do not use `test -d` with globs).
    - `test -f web/src/lib/db/client.ts && grep -Fq 'PrismaPg' web/src/lib/db/client.ts`.
    - `test -d web/src/generated/prisma && (test -f web/src/generated/prisma/client.ts || test -f web/src/generated/prisma/client.js)` (flat layout — the v7 generator emits `client.ts` at output root, NOT `client/index.js`).
    - `grep -q '^web/src/generated/' .gitignore`.
    - `cd web && pnpm exec tsc --noEmit` exits 0 (client singleton type-checks).
  QA scenarios:
    - happy: `bash -c "cd web && pnpm exec tsx scripts/smoke-db.mts"` → prints JSON containing `"ok":1`. Evidence `.omo/evidence/task-7-cinepais-phase-0-scaffold.txt` (include `ls web/src/generated/prisma/` output).
    - failure: `bash -c "cd web && pnpm prisma migrate status 2>&1 | tee -a /tmp/prisma-status.log && grep -qi 'in sync' /tmp/prisma-status.log"` → exits 0 (schema is up to date).
  Commit: N

- [x] 8. `web/prisma/seed.ts`: write deterministic seed with 4 planted scenarios - expect exactly 672 showtimes and 119,280 seats after one run
  What to do / Must NOT do:
    - Write `web/prisma/seed.ts` implementing:
      - `mulberry32(seed)` PRNG (inline, ~10 lines).
      - Read `SEED_NOW` env (default `2026-08-01T00:00:00-05:00`) and `SEED` env (default `20260801`).
      - Data volumes per draft decisions (FIXED counts — Oracle finding #8 corrected the earlier "3–5 variable" math): 2 cities (`Medellín`, `Bogotá`), 6 sites (3/city, deterministic IDs `site-med-1`..`site-bog-3`), each with 4 rooms (`imax`, `2d-1`, `2d-2`, `premium`), 10 films (deterministic IDs `film-01`..`film-10`, one titled `La Odisea` as IMAX headliner, one titled `Sombras del Puente` as sold-out candidate), 7 days rolling from `SEED_NOW` (`businessDate` = `SEED_NOW` date + 0..6 days), **exactly 4 showtimes per room per day** (deterministically pick 4 of the 5 slots `["14:00","17:00","19:30","21:00","22:45"]` via PRNG — which 4 varies per room/day, the count never does), seats materialized per showtime.
      - **Exact expected totals** (acceptance depends on these): showtimes = 6 sites × 4 rooms × 7 days × 4 slots = **672**. Seats per site-day = 4 slots × (260 + 180 + 180 + 90) = 2,840 → total = 6 × 7 × 2,840 = **119,280**.
      - Room seat layouts: IMAX = 13 rows × 20 cols (260), 2D standard = 12 rows × 15 cols (180), Premium = 9 rows × 10 cols (90). One `area` per room (area=1 for all seats in the room; wheelchair area=2 for the accessibility slots).
      - Row → zone/quality per draft mapping: rows 1–3 = `general` + `low`; rows 4–8 = `general` + `optimal` (row 5 col 1..2 gets `preferential` + `optimal`); rows 9–13 (or 9–12/10 for smaller rooms) = `premium` + `high`. Accessibility: 2 seats at row 6, cols (max-1, max) marked `wheelchair` + `general` + `optimal`; 2 companion seats immediately adjacent (row 6, cols max-3, max-2) marked `general` + `optimal`.
      - Seat `status` default `Available`, then apply the 4 planted scenarios:
        1. **`scenario-soldout`**: pick showtime with id containing `sold-` (specifically the first `Sombras del Puente` showtime on day 0 at site `site-med-1` room `imax`) → set ALL seats to `Sold`.
        2. **`scenario-front-only`**: pick the second showtime for `La Odisea` day 1 at site `site-med-2` room `imax` → set ALL seats to `Sold` except rows 1–2 (front rows) which stay `Available`.
        3. **`scenario-optimal`**: pick `La Odisea` day 2 at site `site-med-2` room `imax` → mark ~30% of seats `Sold` deterministically, ensuring rows 4–8 have wide availability.
        4. **`scenario-no-adjacent`**: pick any 2D showtime day 3 at site `site-bog-1` room `2d-1` → set seats in checkerboard pattern (even col idx = Sold, odd col idx = Available) so no 3 contiguous are found.
      - **Connection + bulk-insert discipline (Oracle finding #8):** the seed client MUST connect via `process.env.DATABASE_URL_UNPOOLED` (Neon's PgBouncer pooled URL kills long transactions; direct URL only). Do NOT wrap the whole seed in one `$transaction` — instead: run the 6 `deleteMany` calls first (children before parents: Seat → ShowtimeFormat → Showtime → SiteFormat → Site → Film), then insert with `createMany` in **chunks of ≤ 5,000 rows** (Postgres bind-parameter limit is 65,535 params/statement; Seat has 8 columns → 5,000 × 8 = 40k params, safe). Log progress per chunk.
      - Do a `SELECT 1` warmup query first (absorbs Neon free-tier cold start of 1–3s).
    - Do NOT add a `"prisma"` key to `package.json` — **Prisma 7 ignores it entirely** (Oracle finding #3); the seed command lives ONLY in `prisma.config.ts` → `migrations.seed` (wired in Todo 5).
    - **Export contract (consumed by Todo 9's tests — do not deviate):** structure `seed.ts` as `export async function main(opts?: { SEED?: string; SEED_NOW?: string }): Promise<void>` reading env vars as defaults, plus a bottom self-invocation guard (`if (process.argv[1] && import.meta.url.endsWith(...)) main()`) so `pnpm prisma db seed` still works standalone AND Todo 9 can `import { main }` without spawning a subprocess.
    - Run `cd web && pnpm prisma db seed` once and record output + duration.
    - Must NOT use `Math.random()` anywhere — only `mulberry32(seed)`.
    - Must NOT hardcode current wall-clock time — always derive from `SEED_NOW`.
    - Must NOT create movies/sites/formats not listed in the draft (`Format` enum values only).
    - Must NOT insert accessibility seats without their companion.
  Parallelization: Wave 2 | Blocked by: 7 | Blocks: 9
  References:
    - `specs/001-cine-copiloto-boletas.md:80-92, 108` — data model + business rules + volume.
    - `specs/design-reference/README.md:14-31` — Seat/Site/Film shape + quality heuristic.
    - `.omo/drafts/cinepais-phase-0-scaffold.md` — assumptions block + decisions #12, #13.
  Acceptance criteria:
    - `test -f web/prisma/seed.ts && grep -q 'mulberry32' web/prisma/seed.ts && grep -q 'scenario-soldout' web/prisma/seed.ts && grep -q 'scenario-front-only' web/prisma/seed.ts && grep -q 'scenario-optimal' web/prisma/seed.ts && grep -q 'scenario-no-adjacent' web/prisma/seed.ts`.
    - `cd web && pnpm prisma db seed` exits 0 within 180s (budget absorbs Neon cold start + chunked inserts).
    - After seed, write a throwaway `web/scripts/count-check.mts` (same dotenv + import pattern as `scripts/smoke-db.mts` from Todo 7) that prints `JSON.stringify({ sites, films, showtimes, seats })` from Prisma counts, run `cd web && pnpm exec tsx scripts/count-check.mts` → prints exactly `{"sites":6,"films":10,"showtimes":672,"seats":119280}`.
  QA scenarios:
    - happy: the seed run above → exits 0 with expected counts. Evidence `.omo/evidence/task-8-cinepais-phase-0-scaffold.txt`.
    - failure: rerun `cd web && pnpm prisma db seed` a second time immediately → still exits 0 (idempotent — no unique-constraint errors).
  Commit: N

- [x] 9. `web/`: install Vitest + write seed determinism test + wave-close commit - expect `pnpm test` green
  What to do / Must NOT do:
    - `cd web && pnpm add -D vitest@^2 @vitest/coverage-v8@^2`.
    - Add scripts to `web/package.json`: `"test": "vitest run"`, `"test:watch": "vitest"`.
    - Write `web/vitest.config.ts`:
      ```ts
      import { defineConfig } from "vitest/config";
      import path from "node:path";
      export default defineConfig({
        test: { environment: "node", include: ["tests/**/*.test.ts"], testTimeout: 120000 },
        resolve: { alias: { "@": path.resolve(__dirname, "src") } },
      });
      ```
    - Write `web/tests/seed-determinism.test.ts` — **timeout discipline (Momus round-2 blocker): each seed run costs up to 180s on Neon, so the reseeding test MUST carry an explicit per-test timeout**:
      - Test 1: run the seed twice programmatically by importing `main` from `prisma/seed.ts` (Todo 8 already exports `main(opts?)` — do not refactor, just import) → assert `site.count`, `film.count`, `showtime.count`, `seat.count` are identical. Declare it as `test("seed is deterministic", { timeout: 480_000 }, async () => { ... })` — 480s covers 2×180s seed budget + count queries; the config-level 120s timeout stays for every other test.
      - Test 2: sample 10 seats via `prisma.seat.findMany({ take: 10, orderBy: [{ showtimeId: "asc" }, { seatId: "asc" }] })` after each run → assert identical arrays (JSON.stringify equality).
      - Test 3: verify each planted scenario is present — count seats where showtime is scenario-soldout target and all are `Sold`; similar for front-only, no-adjacent.
    - Run `cd web && pnpm test` and confirm exit 0.
    - Commit at wave close: `git add -A && git commit -m "feat(web): Prisma 7 schema + deterministic seed with 4 planted scenarios + determinism test"` after verifying HEAD is `phase-0-scaffold`.
    - Must NOT commit `.env.local`, `node_modules`, `web/src/generated/`, `coverage/`, `.next/`.
  Parallelization: Wave 2 | Blocked by: 8 | Blocks: 10, 11
  References:
    - Vitest docs: https://vitest.dev/guide/
    - `.omo/drafts/cinepais-phase-0-scaffold.md` — decision #14 (Vitest + tests).
  Acceptance criteria:
    - `test -f web/vitest.config.ts && test -f web/tests/seed-determinism.test.ts`.
    - `cd web && FORCE_COLOR=0 pnpm test 2>&1 | tee /tmp/vitest.log; test ${PIPESTATUS[0]} -eq 0` — rely on the exit code as primary gate; `FORCE_COLOR=0` strips ANSI codes so any log grep (`grep -E 'Test Files.*1 passed'`) is secondary and non-blocking (Momus finding #4: colored output breaks whitespace-only regexes).
    - `git log --oneline -1 phase-0-scaffold` → message starts with `feat(web): Prisma 7 schema`.
    - `git status --porcelain` → empty.
  QA scenarios:
    - happy: `bash -c "cd web && pnpm test"` → exits 0. Evidence `.omo/evidence/task-9-cinepais-phase-0-scaffold.txt`.
    - failure: `bash -c "cd web && SEED=99999 SEED_NOW=2027-01-15T00:00:00-05:00 pnpm test 2>&1 | tail -20"` → still exits 0 (seed is deterministic under any seed, not just default).
  Commit: **Y** | `feat(web): Prisma 7 schema + deterministic seed with 4 planted scenarios + determinism test`

- [x] 10. `web/src/lib/api/`: write Zod schemas + error helpers - expect `pnpm exec tsc --noEmit` clean and schemas exportable
  What to do / Must NOT do:
    - `cd web && pnpm add zod@^4` (Zod 4 is the stable major since mid-2025 — Oracle finding #7; do NOT pin ^3 for a greenfield project).
    - Create `web/src/lib/api/schemas.ts` exporting:
      - `CitySchema` — `z.object({ id: z.string(), name: z.string() })`.
      - `FormatSchema` — `z.enum(["IMAX","Onyx","2D","Doblada","Subtitulada","Premium"])`.
      - `FilmSummarySchema` — `{ id, title, posterUrl, durationMin, rating, genres: z.array(z.string()) }`.
      - `FilmDetailSchema` — FilmSummary + `{ synopsis, director, cast: z.array(z.string()) }`.
      - `ShowtimeSchema` — `{ id, filmId, siteId, siteName, city, businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^\d{2}:\d{2}$/), room, formats: z.array(FormatSchema) }`.
      - `AreaCategorySchema` — `z.enum(["general","premium","wheelchair","preferential"])`.
      - `QualityTierSchema` — `z.enum(["low","optimal","high"])`.
      - `SeatStatusSchema` — `z.enum(["Available","Sold"])`.
      - `SeatSchema` — `{ seatId: z.string(), row: z.number().int(), col: z.number().int(), area: z.number().int(), status: SeatStatusSchema, areaCategory: AreaCategorySchema, qualityTier: QualityTierSchema }`.
      - `AreaCountSchema` — `z.object({ total: z.number().int(), available: z.number().int() })`.
      - `SeatSummarySchema` — `{ totalCount: z.number().int(), availableCount: z.number().int(), byArea: z.object({ general: AreaCountSchema, premium: AreaCountSchema, wheelchair: AreaCountSchema, preferential: AreaCountSchema }) }` — **explicit object with all 4 keys always present** (rooms without a category report `{ total: 0, available: 0 }`). Do NOT use `z.record(enum, ...)`: its semantics flipped between Zod 3 (partial) and Zod 4 (exhaustive) — Oracle finding #7 — and an explicit object is unambiguous in both.
      - `ShowtimeSeatsResponseSchema` — `{ showtime: ShowtimeSchema, seats: z.array(SeatSchema), summary: SeatSummarySchema }`.
    - Export `z.infer` types: `City`, `Film`, `FilmDetail`, `Showtime`, `Seat`, `SeatSummary`, `ShowtimeSeatsResponse`.
    - Create `web/src/lib/api/errors.ts`:
      ```ts
      import { NextResponse } from "next/server";
      import type { ZodIssue } from "zod";
      export const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404 });
      export const validationError = (details: ZodIssue[]) => NextResponse.json({ error: "validation_error", details }, { status: 400 });
      ```
    - Must NOT `export default` — every schema and helper is a named export.
    - Must NOT reintroduce HSL or numeric qualityTier.
  Parallelization: Wave 3 | Blocked by: 9 | Blocks: 12 | Can parallelize with: 11
  References:
    - AGENTS.md `:24-28` — read API contract shape.
    - `.omo/drafts/cinepais-phase-0-scaffold.md` — decisions #8, #9 (Zod, qualityTier enum).
  Acceptance criteria:
    - `test -f web/src/lib/api/schemas.ts && test -f web/src/lib/api/errors.ts`.
    - `cd web && pnpm exec tsc --noEmit` exits 0.
    - `cd web && pnpm exec tsx -e "import('./src/lib/api/schemas.ts').then(m => { const keys = ['CitySchema','FilmSummarySchema','FilmDetailSchema','ShowtimeSchema','SeatSchema','SeatSummarySchema','ShowtimeSeatsResponseSchema']; keys.forEach(k => { if (!m[k]) { console.error('missing', k); process.exit(1); } }); })"` exits 0 (tsx, NOT `node --experimental-strip-types` — that flag requires Node ≥ 22.6 and our floor is Node 20 — Oracle finding #9).
  QA scenarios:
    - happy: `bash -c "cd web && pnpm exec vitest run tests/schemas.test.ts 2>&1 || echo 'test file not written yet — OK for this task'"` — informational only.
    - failure: `grep -q 'z.number().min(0).max(100)' web/src/lib/api/schemas.ts` → exits 1 (no numeric qualityTier leaked in). Evidence `.omo/evidence/task-10-cinepais-phase-0-scaffold.txt`.
  Commit: N

- [x] 11. `web/src/lib/business/`: write orphan + cutoff + quality pure functions with Vitest unit tests (TDD-lite) - expect all business tests green
  What to do / Must NOT do:
    - **Write tests first** (TDD-lite). Create `web/tests/orphan-rule.test.ts` with these cases first:
      - "row `_A_S_ _ _`  selecting col 2 → NOT orphan" (S=Sold, A=Available, _=candidate selection).
      - "row `_ _ _ _ S` selecting cols 1..3 → col 4 becomes orphan → INVALID".
      - "row starts `A _ _ ...` selecting col 2 → col 1 becomes orphan against left edge → INVALID".
      - "row ends `... _ _ A` selecting the second-to-last → last becomes orphan against right edge → INVALID".
      - "row with aisle at col 5 `_ _ _ _ | _ _ A` selecting col 6 → col 7 becomes orphan against aisle → INVALID".
      - "single seat selection with all `Available` neighbors on both sides → NOT orphan".
      - "selection of 4 contiguous with S on both sides → NOT orphan".
    - Then create `web/tests/cutoff.test.ts`:
      - "showtime starting 14 min from now → filtered out".
      - "showtime starting 16 min from now → kept".
      - "showtime starting 5h from now → kept".
      - "showtime that already started → filtered out".
    - Then create `web/src/lib/business/orphan.ts` exporting `wouldLeaveOrphan(rowAvailability: SeatStatus[], selection: number[], aisleCols: Set<number>): boolean`. Contract: given a row (0-indexed) with each cell `"Available" | "Sold"`, a proposed selection (0-indexed col numbers within that row), and the set of column indexes that are aisles or row-edges, return `true` if the selection would create exactly one `Available` seat that is trapped between `Sold`/aisle/edge on both sides.
    - Create `web/src/lib/business/cutoff.ts` exporting `isPurchasable(showtimeStart: Date, now: Date, marginMinutes = 15): boolean`.
    - Create `web/src/lib/business/quality.ts` exporting `rowToTier(row: number, maxRow: number): "low"|"optimal"|"high"` using the mapping from draft (rows 0-2 low, 3-7 optimal, 8+ high, adjusted proportionally for smaller rooms).
    - Iterate implementation until `pnpm test` is green.
    - Must NOT put any business logic inside route handlers.
    - Must NOT use module-scope `new Date()` — always pass `now` explicitly.
  Parallelization: Wave 3 | Blocked by: 9 | Blocks: 12 | Can parallelize with: 10
  References:
    - `specs/001-cine-copiloto-boletas.md:87-92` — max 4, no orphan, cutoff 15 min.
    - `.omo/drafts/cinepais-phase-0-scaffold.md` — decisions #12 (planted scenarios), assumption "Orphan rule".
  Acceptance criteria:
    - `test -f web/src/lib/business/orphan.ts && test -f web/src/lib/business/cutoff.ts && test -f web/src/lib/business/quality.ts`.
    - `test -f web/tests/orphan-rule.test.ts && test -f web/tests/cutoff.test.ts`.
    - `cd web && FORCE_COLOR=0 pnpm test tests/orphan-rule.test.ts tests/cutoff.test.ts 2>&1 | tee /tmp/business-tests.log; test ${PIPESTATUS[0]} -eq 0` — exit code is the gate; secondary check `grep -E 'Test Files.*2 passed' /tmp/business-tests.log`.
    - `cd web && pnpm exec tsc --noEmit` exits 0.
  QA scenarios:
    - happy: `bash -c "cd web && pnpm test tests/orphan-rule.test.ts"` → prints "N passed" for at least 7 cases. Evidence `.omo/evidence/task-11-cinepais-phase-0-scaffold.txt`.
    - failure: `grep -q 'new Date()' web/src/lib/business/cutoff.ts` → exits 1 (no wall-clock inside module).
  Commit: N

- [x] 12. `web/src/app/api/`: implement 5 route handlers using schemas + business + Prisma - expect each endpoint returns 200 with Zod-valid JSON
  What to do / Must NOT do:
    - Create the 5 route handlers exactly as listed in Scope §Must-have 15. Each handler:
      1. Parses query params with a per-endpoint Zod input schema (define inline or in a per-file `paramsSchema`).
      2. On invalid params returns `validationError(zodResult.error.issues)` from `errors.ts`.
      3. Reads from `prisma` (client singleton from Todo 7).
      4. Applies `isPurchasable(showtimeStart, new Date())` filter in `showtimes/route.ts`.
      5. For `films/[id]/route.ts` and `showtimes/[id]/seats/route.ts`, returns `notFound()` if the record does not exist.
      6. Casts the `Json` fields (`cast`, `genres`) through `z.array(z.string())` at the API boundary (jsonb comes back as `unknown` from Prisma — parse, don't assert).
      7. Response is validated with the corresponding Zod schema via `Schema.parse(payload)` before returning — this catches drift at runtime.
    - Do NOT add `export const dynamic = "force-dynamic"` — Route Handlers reading a database are dynamic by default in Next 16, and that export ERRORS at build time if `cacheComponents` gets enabled in Fase B (Oracle finding #6). No route-segment config exports at all in these handlers.
    - Where the response needs `siteName` + `city`, join via Prisma `include: { site: true }`.
    - For `showtimes/:id/seats`, compute `SeatSummary` in-handler: `totalCount = seats.length`, `availableCount = seats.filter(s => s.status === "Available").length`, `byArea` = explicit object with all 4 `AreaCategory` keys, `{ total: 0, available: 0 }` for categories absent in the room (matches `SeatSummarySchema` from Todo 10).
    - Must NOT bypass Zod parsing on responses (drift protection).
    - Must NOT accept unknown query params silently (`z.object({...}).strict()` on inputs).
    - Must NOT return raw jsonb values without Zod validation — `cast`/`genres` come back from Prisma as parsed `JsonValue` (NOT strings; never call `JSON.parse` on them), and must pass through `z.array(z.string())` before inclusion in the response.
    - Must NOT re-implement `wouldLeaveOrphan` in the endpoint layer — that rule lives in business/, unused here (needed by Fase B).
  Parallelization: Wave 3 | Blocked by: 10, 11 | Blocks: 13
  References:
    - Next.js Route Handlers: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
    - AGENTS.md `:24-28` — endpoint contract.
    - `web/src/lib/api/schemas.ts` (from Todo 10) — every response shape.
    - `web/src/lib/business/cutoff.ts` (from Todo 11) — showtimes filter.
  Acceptance criteria:
    - All 5 route files exist under `web/src/app/api/` at the exact paths in Scope §Must-have 15.
    - `cd web && pnpm exec tsc --noEmit` exits 0.
    - `cd web && pnpm build` exits 0 (Next 16 catches route handler errors at build).
    - Smoke test (dev server up, then curl):
      - `curl -sSf http://localhost:3000/api/cities | jq '. | length'` prints `2`.
      - `curl -sSf http://localhost:3000/api/films | jq '. | length'` prints `10`.
      - `curl -sSf http://localhost:3000/api/films/film-01 | jq '.id'` prints `"film-01"`.
      - `curl -sS http://localhost:3000/api/films/does-not-exist -o /dev/null -w '%{http_code}'` prints `404`.
      - `curl -sSf 'http://localhost:3000/api/showtimes?filmId=film-01' | jq '. | length'` prints a number > 0.
      - `curl -sSf http://localhost:3000/api/showtimes/<any-real-id>/seats | jq '.summary.totalCount'` prints a number > 0.
  QA scenarios:
    - happy: `bash -c "cd web && pnpm build && (timeout 30s pnpm start > /tmp/nextstart.log 2>&1 &) && sleep 12 && curl -sS http://localhost:3000/api/cities | tee /Users/reiorozco/Dev/cinepais/.omo/evidence/task-12-cinepais-phase-0-scaffold.json && pkill -f 'next start' || true"` → returns valid JSON array (`pnpm build` MUST run before `pnpm start` — start serves build artifacts; evidence path is absolute to survive any cwd). Evidence `.omo/evidence/task-12-cinepais-phase-0-scaffold.json`.
    - failure: `bash -c "curl -sS 'http://localhost:3000/api/showtimes?filmId=INVALID%20BAD' -o /dev/null -w '%{http_code}'"` → prints `400`.
  Commit: N

- [x] 13. `web/README.md` + `tests/schemas.test.ts` + curl smoke: document setup + verify examples parse - expect wave-close commit + all tests green
  What to do / Must NOT do:
    - Write `web/README.md` with sections in this order:
      1. **CinePaís — web** (one-line description).
      2. **Prerequisites**: Node 20 LTS, pnpm 9, Neon free-tier account.
      3. **Install**: `pnpm install`.
      4. **Environment**: `vercel link --project cinepais` (once), then `vercel env pull .env.local --yes` — Neon vars (`DATABASE_URL` pooled + `DATABASE_URL_UNPOOLED` direct) are injected by the Vercel Marketplace integration; never fill them by hand. See `web/.env.example` for the full variable list.
      5. **Database**: `pnpm prisma migrate deploy` (in fresh env) or `pnpm prisma migrate dev` (in dev), then `pnpm prisma db seed`.
      6. **Run dev**: `pnpm dev` → http://localhost:3000.
      7. **Run tests**: `pnpm test`.
      8. **Read API contract**: for each of the 5 endpoints, print: HTTP method + path + example curl + example JSON response. Response examples MUST match the actual Zod schema in `src/lib/api/schemas.ts` — copy real payloads from Todo 12 smoke runs, do not fabricate.
      9. **Business rules encoded**: 3-line summary of orphan/cutoff/quality with pointers to `src/lib/business/`.
      10. **Determinism**: seed uses `SEED` and `SEED_NOW` env vars; same values → same DB.
      11. **Stack**: Next 16 + React 19.2 + Tailwind 4 + shadcn 2.3 new-york + Prisma 7.9 + adapter-pg + Vitest 2.
    - Write `web/tests/schemas.test.ts`: parse each example JSON block from the README (via a small helper that extracts fenced ```json code blocks by heading) through the matching Zod schema — assert no throw.
    - Run `cd web && pnpm test` (all suites) — expect green.
    - Suggested wave-close commit: `git add -A && git commit -m "feat(web): read API endpoints (5) + Zod schemas + business rules + README + tests"`.
    - Must NOT put deploy instructions in README (that's Fase E).
    - Must NOT write example JSON that does not parse through the schema.
    - Must NOT include CineColombia name/logo anywhere in the README.
  Parallelization: Wave 3 | Blocked by: 12 | Blocks: F1-F4
  References:
    - `web/src/lib/api/schemas.ts` (from Todo 10).
    - Actual curl outputs captured in `.omo/evidence/task-12-cinepais-phase-0-scaffold.json`.
    - AGENTS.md — brand guardrails.
  Acceptance criteria:
    - `test -f web/README.md && test -f web/tests/schemas.test.ts`.
    - `wc -l web/README.md` prints > 60 lines.
    - `cd web && FORCE_COLOR=0 pnpm test 2>&1 | tee /tmp/vitest-all.log; test ${PIPESTATUS[0]} -eq 0` — exit code is the gate; secondary non-blocking check `grep -E 'Test Files.*4 passed' /tmp/vitest-all.log` (determinism + orphan + cutoff + schemas; FORCE_COLOR=0 strips ANSI).
    - `grep -Fi 'CineColombia' web/README.md` returns exit 1.
    - `git log --oneline -3 phase-0-scaffold | head -3` shows three commits (the wave-close commits from Todos 4, 9, 13) with proper conventional prefixes.
    - `git status --porcelain` → empty.
  QA scenarios:
    - happy: `bash -c "cd web && pnpm test"` → all 4 test files pass. Evidence `.omo/evidence/task-13-cinepais-phase-0-scaffold.txt`.
    - failure: `bash -c "cd web && pnpm build; echo EXIT=\$?"` → prints `EXIT=0` (exit code, not output-text grep — build wording drifts).
  Commit: **Y** | `feat(web): read API endpoints (5) + Zod schemas + business rules + README + tests`

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [x] F1. Plan compliance audit
  Delegate to `oracle`: read this plan file + every acceptance criteria evidence file under `.omo/evidence/task-*-cinepais-phase-0-scaffold.*`. For each of Todos 1–13, verify the acceptance criteria are demonstrably met by the recorded evidence. For each Scope §Must-NOT-have item, verify the codebase does NOT violate it (grep for `CineColombia`, `sqlite`, `middleware.ts`, `hsl(var(`, `tailwind.config`, `prisma-client-js`, `Math.random`). Output: `APPROVE` or `REJECT: <numbered list of violations>`.

- [x] F2. Code quality review
  Delegate to `oracle`: read every file under `web/src/**/*.ts` + `web/prisma/*.ts` + `web/tests/*.ts` created by this plan. Check: TypeScript strict compliance (no `any`, no `!.` unless justified), no dead code, no leaked secrets, no unhandled promises, imports use `@/` alias not relative deep paths, error responses always typed, business rules are pure functions, no console.log in production code paths. Output: `APPROVE` or `REJECT: <file:line — issue>`.

- [x] F3. Real manual QA
  Delegate to `unspecified-high`: run this exact sequence and record the output at `.omo/evidence/f3-cinepais-phase-0-scaffold.txt`:
    1. `cd web && pnpm install && pnpm prisma migrate deploy && pnpm prisma db seed` — reset environment.
    2. `pnpm dev &` — start dev server, wait 12s.
    3. `curl -sSf http://localhost:3000/api/cities` → assert 2 items.
    4. `curl -sSf http://localhost:3000/api/films` → assert 10 items.
    5. Pick a film ID from step 4, `curl -sSf http://localhost:3000/api/showtimes?filmId=<id>` → assert ≥ 1 item.
    6. Pick a showtime ID from step 5, `curl -sSf http://localhost:3000/api/showtimes/<id>/seats` → assert `summary.totalCount ≥ 90` and `Array.isArray(seats)`.
    7. `curl -sSf 'http://localhost:3000/api/showtimes/<soldout-id>/seats' | jq '.summary.availableCount'` → assert `0` (planted scenario present).
    8. Kill dev server.
  Output: `APPROVE` if all assertions pass, else `REJECT: <step-N failure>`.

- [x] F4. Scope fidelity
  Delegate to `oracle`: compare this plan's outputs against `specs/002-implementation-plan.md` §"Sesión A — Fase 0" deliverables (repo running, schema, seed, endpoints, README). Confirm every listed deliverable is present, and confirm NO Fase B/C/D/E deliverable snuck in (no home page components, no agent, no deploy config). Output: `APPROVE` or `REJECT: <spec item — missing/extra>`.

## Commit strategy
- **Wave 1 close (after Todo 4):** `chore(web): scaffold Next.js 16 + Tailwind v4 + shadcn 2.3 new-york`
- **Wave 2 close (after Todo 9):** `feat(web): Prisma 7 schema + deterministic seed with 4 planted scenarios + determinism test`
- **Wave 3 close (after Todo 13):** `feat(web): read API endpoints (5) + Zod schemas + business rules + README + tests`
- Before every `Commit: Y`: `git rev-parse --abbrev-ref HEAD` must print `phase-0-scaffold`. If it prints `main`, create the branch first (`git checkout -b phase-0-scaffold`) — never commit to `main` in this phase.
- **No `git push` at any point.** Pushing is the user's decision at end of phase.
- No auto-generated attribution ("Generated with…", "Co-Authored-By: …") per AGENTS.md `:53` and root CLAUDE.md.

## Success criteria
1. `git log --oneline phase-0-scaffold ^main` prints exactly 3 commits with the messages above (in order).
2. `cd web && pnpm test` prints 4 passing test files, all green, under 10 minutes (the determinism suite reseeds Neon twice — network-bound).
3. `cd web && pnpm build` succeeds.
4. `cd web && pnpm dev` serves the placeholder page at `/` and all 5 API endpoints return valid JSON matching their Zod schemas.
5. `cd web && pnpm prisma db seed` is idempotent (safe to re-run any number of times).
6. Running the seed with `SEED=20260801 SEED_NOW=2026-08-01T00:00:00-05:00` produces byte-identical row counts and sampled seat IDs on any machine.
7. Neon database contains exactly 6 sites, 10 films, 672 showtimes, 119,280 seats, with the 4 planted scenarios verifiable by API.
8. No file references CineColombia, Vista OCAPI, or the real cinema's endpoints.
9. `web/.env.local` and `web/.vercel/` exist locally but are NOT tracked by git; the Vercel project `cinepais` is linked and has the Neon integration attached (visible in `vercel env ls`).
10. The final verification wave (F1–F4) all report APPROVE.
