---
slug: cinepais-phase-4-deploy
intent: clear
review_required: true
status: plan-written-reviewed-and-repaired
reviews: Metis (3 BLOCKER + 5 MAJOR + 3 MINOR) → repaired · Momus + Oracle high-accuracy, both REJECT (~28 findings) → repaired
gate_decisions_round_2: anti-rot = documented manual refresh (no cron) · alert-only Google cap = STOP the wave
plan: .omo/plans/cinepais-phase-4-deploy.md
metis_review: 3 BLOCKER + 5 MAJOR + 3 MINOR — all repaired in place; see the plan's §Review record
phase: Fase E / Fase 4 — pulido + deploy + demo + post
created: 2026-08-14
planner: Prometheus (ulw-plan)
---

# Draft — CinePaís Fase E (`cinepais-phase-4-deploy`)

Planning-only artifact. No product code is touched by the planner.

## Sources read

- `.omo/handoff-fase-e.md` (planning handoff, 172 lines)
- `.omo/handoff-fase-d-final.md` (execution handoff, 452 lines — esp. §9 Fase E inputs)
- `specs/002-implementation-plan.md` §Sesión E
- `AGENTS.md`, root `.gitignore`, `web/package.json`, `web/prisma.config.ts`,
  `web/prisma/schema.prisma`, `web/.env.example`, `agent/.env.example`,
  `agent/pyproject.toml`, `agent/src/cinepais_agent/{config,main}.py`,
  `agent/docs/sse-contract.md` (lines 70–134)

## Intent verdict

`intent: clear` — the outcome is defined by `specs/002` §Sesión E and the Fase E handoff.
`review_required: false` — the user did not request a high-accuracy review modifier.
Open items are owner-decisions (publishing, hosting, demo longevity), asked at the gate.

---

## VERIFIED FACTS (measured this session — do not re-derive)

### Repo / git state

| Fact | Value | How verified |
|---|---|---|
| Current branch | `phase-3-integration`, 65 commits | `git branch --show-current`, `git log --oneline \| wc -l` |
| Branches | `phase-0-scaffold` 6c1d505 · `phase-1-ui` 578d832 · `phase-2-agent` dff2c46 · `phase-3-integration` 9303bbf | `git branch -a --format` |
| `main` / `master` | Neither exists (exit 128) | `git rev-parse --verify main` |
| Remote | None configured | `git remote -v` empty |
| HEAD commit | `9303bbf chore(omo): Final Verification Wave complete — F1-F4 all APPROVE` | `git log --oneline -3` |
| Working tree | Clean except untracked `.omo/handoff-fase-e.md` | `git status --porcelain` |
| Git author | `reiorozco <rfoc15@gmail.com>` | `git config --get user.email` |
| Tracked under `.omo/` | **125 files, 3.7 MB** (54 in `evidence/`, 35 in `run-continuation/`, 5 plans, 5 drafts, 20 notepads/handoffs) | `git ls-files .omo` |
| Secrets in tracked tree | **NONE.** Only `agent/.env.example` tracked; no `.env` ever committed. One regex hit in `.omo/evidence/f4-wave-*.md` is a *synthetic* control string, not a real key | `git ls-files \| grep .env`, `git grep -lI` + positive control |
| `f3-step-*.png` | **Already resolved** — 10 files (not 9) live in `.omo/evidence/`, never tracked | `find` + `git log --all` |

### Deploy platform state

| Fact | Value | How verified |
|---|---|---|
| Vercel team | `reiorozcos-projects` / `team_ALTbdfOZXZBgvcmPRv7bjwyF` | Vercel API |
| Vercel project | **`cinepais` EXISTS** — `prj_sdPm0YinaSZyn2N9jMDC0vRd3KLS`, framework `nextjs`, node `24.x` | Vercel API |
| Deployments so far | **ZERO**, `live: false`, no domains | Vercel API `list_deployments` → count 0 |
| **Deployment protection** | **`ssoProtection.enabled = true`, `all_except_custom_domains`** | Vercel API `get_project_deployment_protection` |
| Neon Postgres | Already provisioned via **Vercel Marketplace** on this project; dev pulls it with `vercel env pull` | `web/README.md`, `web/.env.example` |
| `web/.vercel/` | Exists locally (gitignored) | filesystem |

> ⚠️ **Contradiction resolved by direct measurement.** External docs (and the Vercel MCP tool
> description) claim new projects have Vercel Authentication *disabled*. This project measurably has
> it **ENABLED**. Direct measurement wins. Left as-is, every `*.vercel.app` URL returns a Vercel
> login wall — fatal for a portfolio demo linked from LinkedIn.

### Quality baselines

| Surface | Baseline | How verified |
|---|---|---|
| `agent/` ruff | exit 0 — "All checks passed!" | `uv run ruff check .` |
| `agent/` basedpyright | exit 0 — 0 errors, 0 warnings | `uv run basedpyright` |
| `agent/` pytest (non-eval) | exit 0 — 105 passed, 1 skipped, 15 deselected, 10.76s | `uv run pytest -m "not evals"` |
| `web/` gate | Green at end of Fase D: `pnpm test` (131 tests, ~197s), `pnpm lint`, `tsc --noEmit`, `pnpm build` all exit 0 | `handoff-fase-d-final.md` §4 |

`agent/` is GREEN at baseline — a green gate is safe to mandate. `web/`'s `pnpm test` takes 5–12 min
and re-seeds the shared Neon DB three times; never run it concurrently with `pnpm build`.

---

## BLOCKERS FOUND (not in any handoff — new this session)

### B1 — Vercel build WILL FAIL on a clean checkout · CONFIRMED

- Root `.gitignore:20` ignores `web/src/generated/`; `git ls-files web/src/generated | wc -l` → **0**;
  `git check-ignore -v` confirms the rule; `git log --all -- 'web/src/generated/*'` → never committed.
- `web/package.json` scripts are exactly `dev/build/start/lint/test/test:watch` — **no `postinstall`,
  no `prebuild`, no `prisma generate`** anywhere (`grep -rn "prisma generate" web/ --exclude-dir=node_modules` → no output).
- `web/src/lib/db/client.ts:1` imports `@/generated/prisma/client`; `web/src/lib/api/queries.ts:3`
  imports `@/generated/prisma/enums`.
- ⇒ On Vercel, `pnpm install && next build` fails with `Cannot find module '@/generated/prisma/client'`.
- Fix: explicit `prisma generate` before build.
- Note: `web/prisma.config.ts` reads `DATABASE_URL_UNPOOLED` at config load, and `schema.prisma`'s
  `datasource db` block has **no `url`** — so Prisma CLI steps on Vercel need that env var present.

### B2 — The public demo ROTS after 7 days · CONFIRMED

- `web/prisma/seed.ts` showtime loop is `for (let day = 0; day < 7; day++)` — exactly **7 days** from `SEED_NOW`.
- `web/src/lib/business/cutoff.ts` `isPurchasable()` excludes anything starting within 15 minutes.
- Applied in `web/src/lib/api/queries.ts` to every `/api/showtimes` result.
- ⇒ Seed once on day X, and from ~day X+7 `GET /api/showtimes` returns `[]` for everything: empty
  catalogue, and an agent with nothing to recommend. A LinkedIn post drives traffic for weeks.

### B3 — Vercel SSO deployment protection is ON

See table above. Must be disabled (or a custom domain attached) or the demo is unreachable.

### B4 — CORS is single-origin; Vercel preview domains will be rejected

- `agent/src/cinepais_agent/main.py:73-78` → `allow_origins=[settings.cors_origin]` (one string).
- `agent/src/cinepais_agent/config.py:9` → `cors_origin: str = "http://localhost:3000"`.
- No comma-separated parsing anywhere. Production + preview domains cannot both work today.

### B5 — Fly.io no longer has a free tier for new organizations

- `AGENTS.md` and `specs/002` both assume "Fly.io scale-to-zero (free)". Research says the free
  allowance is grandfathered-only; new orgs require a credit card and pay per-second (~USD 1.94/mo
  for a 24/7 shared-cpu-1x 256MB machine; less with scale-to-zero). Treated as a CLAIM to re-confirm
  at execution time before any account is created.

---

## Polish backlog — VERIFIED current status (code is the truth, not the handoff)

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | `checkout/page.tsx` fetch lacks error handling → infinite skeleton | **STILL OPEN** | `web/src/app/checkout/page.tsx:79-85`, no `.catch()`, skeleton at `:142-152` |
| 2 | `preload` prop on `<Image>` (meant `priority`) | **STILL OPEN** | `film-card.tsx:41`, `hero-carousel.tsx:113`; positive control: `films/[id]/page.tsx:89` uses `priority` correctly |
| 3 | Wheelchair dialog copy conflation | **ALREADY FIXED** | `seat-map.tsx:268-272` reads correctly |
| 4 | Recompute order server-side | **ALREADY FIXED** | `checkout/confirmation/page.tsx:57-69` recomputes from server data |
| 5 | Zod-gate `?format=` | **ALREADY FIXED** | `api/showtimes/route.ts:6-13` uses `z.enum([...])` |
| 6 | Reducer showtime-switch test | **STILL OPEN** | branch at `selection.ts:97-100`; not covered in `tests/selection.test.ts`; `clear` action also untested |
| 7 | Onyx pricing test | **STILL OPEN** | `pricing.ts:17` `Onyx: 28000`; `tests/pricing.test.ts` covers only IMAX/2D/Premium |
| 8 | `f3-step-*.png` at repo root | **ALREADY FIXED** | all 10 are in `.omo/evidence/` |
| 9 | `priceFrom` nullability in SSE contract | **STILL OPEN — line 90 ONLY** | see correction below |

### ⚠️ Planner correction to a subagent claim (`priceFrom`)

A subagent recommended annotating `priceFrom` as nullable at **both** `sse-contract.md:90` and `:125`.
Read directly: `:90` is the **`recommendation`** schema (`events.py:47` → `priceFrom: int | None`) →
genuinely under-specified. `:125` is the **`Alternative`** schema (`events.py:30` → `priceFrom: int`)
→ already correct. **Only line 90 changes.** Editing line 125 would introduce a NEW doc bug.

---

## Seed scenarios (specs §Sesión E item 1) — already satisfied

`web/prisma/seed.ts:232` defines `type Scenario = "soldout" | "front-only" | "optimal" | "no-adjacent"`,
forced-assigned at `:255-271` so all four are guaranteed to exist. `specs/002` §Sesión E item (1) is
therefore largely DONE; Fase E only needs to confirm they still surface post-deploy, not invent more.

---

## Containerization inputs (if the agent is deployed)

- `requires-python = ">=3.12"`; `agent/.python-version` = `3.12`; `agent/uv.lock` exists (298 KB).
- Start command: `uv run uvicorn cinepais_agent.main:app --port 8000`.
- `GET /health` already exists (`main.py:100-102`) → usable as a container health check.
- **MCP runs as a stdio subprocess of the agent process**: `agent.py:83-97` spawns
  `sys.executable -m cinepais_agent.mcp_server`. No hardcoded paths, no cwd dependence — container-safe
  *provided* uvicorn is started from inside the uv venv so `sys.executable` resolves there.
- No `Dockerfile`, `fly.toml`, `.dockerignore`, or `vercel.json` exists anywhere in the repo (glob → no files).

## Web config facts

- `web/next.config.ts` declares `images.remotePatterns` for `placehold.co` (matches seeded
  `posterUrl`s) — production images are fine. No `output`, no `outputFileTracingRoot`.
- Seed invoked via `prisma.config.ts` → `seed: "tsx prisma/seed.ts"`; needs `DATABASE_URL_UNPOOLED`,
  `SEED`, `SEED_NOW`.

## The two env vars that must move together (from handoff §9.1)

| Variable | Side | Now | Target |
|---|---|---|---|
| `NEXT_PUBLIC_AGENT_URL` | web (`web/src/lib/agent/config.ts:8`) | `http://localhost:8000` | agent host |
| `CORS_ORIGIN` | agent (`agent/.env.example:3`) | `http://localhost:3000` | Vercel domain |

`NEXT_PUBLIC_*` is **inlined at build time** → changing it on Vercel requires a **rebuild**, not just
an env edit. Highest-probability "why doesn't prod work" trap of the phase.

---

## Adopted defaults (NOT asked — recorded per the two-filter rule)

1. **Slug** `cinepais-phase-4-deploy` (handoff's suggestion; keeps the phase-N pattern).
2. **Polish scope = every verified-open item** (#1, #2, #6, #7, #9). All are small, and three of them
   are visible in a repo a recruiter reads. Full-scope default; no MVP reduction.
3. **Video/GIF recording is a `[MANUAL — USER]` step** — an agent cannot record the user's screen.
   The plan ships an exact shot-list + scripted queries + pre-flight checks instead of pretending to record.
4. **`agent/` gate = `ruff check` + `basedpyright` + `pytest -m "not evals"` all exit 0** (verified green
   at baseline). **Never** run `tests/evals` — it spends real money.
5. **No live LLM spend beyond an explicitly budgeted, counted allowance**, carrying Fase D's discipline
   (whole phase = 2 `POST /chat`). Budget metric = `POST /chat` count; token metric = httpx count.
6. **Do not re-seed with a hardcoded date.** Every seed step emits the recompute one-liner + a `curl`
   pre-flight (`[]` ⇒ stale).
7. **Keep the no-proxy architecture** (widget → agent directly). Rationale still holds on the rate-limit
   bucket argument even though Vercel Hobby's function ceiling is now higher than the docs' 25s claim.

## Owner-decisions taken to the user (survive both filters)

- **Q1** Publishing posture: public vs private repo, and whether the 125 tracked `.omo/` files (3.7 MB
  orchestration trail) ship with it.
- **Q2** `main` strategy: squash the 4 phase branches into a clean `main`, or merge preserving all 65 commits.
- **Q3** Agent hosting, given B5 (Fly.io no longer free) — including the option of NOT deploying the agent
  publicly and letting the recorded video carry the copilot story (removes all abuse/spend risk).
- **Q4** Demo longevity, given B2 (7-day rot).

## USER DECISIONS (answered at the gate — binding)

| # | Decision | Answer | Consequence for the plan |
|---|---|---|---|
| Q1 | Publishing posture | **Public repo, `.omo/` curated** | `plans/`, `drafts/`, handoffs SHIP. `evidence/` (54 tracked) and `run-continuation/` (35 tracked) are REMOVED from the published history and added to `.gitignore`. |
| Q2 | `main` strategy | **Squash into a clean `main`** | One commit per phase (scaffold · UI · agent · integration · deploy). The 4 phase branches stay intact locally as a backup and are never deleted. Composes cleanly with Q1 — curation happens as part of building `main`, not as a history rewrite afterwards. |
| Q3 | Agent hosting | **Fly.io** (user's EXISTING org, card already on file, believed grandfathered/legacy free allowance) | Keeps `AGENTS.md` + `specs/002` accurate — zero documentation debt. Billing status is NOT verifiable by the planner ⇒ `[MANUAL — USER]` confirmation gate BEFORE any deploy. B5 is downgraded from blocker to a user-confirmed precondition. |
| Q3b | Exposure posture | **Hard Google spend cap + global daily cap in `agent/`** | (a) `[MANUAL — USER]` hard spend cap that STOPS calls (not an alert). (b) New global daily request budget in `agent/`, replacing reliance on the client-supplied `sessionId` cap. Friendly Spanish "cupo demo agotado" message so the site degrades gracefully instead of erroring. |
| Q4 | Demo longevity | **Automated daily re-seed** | Cron → token-protected route re-seeding with `SEED_NOW` = tomorrow. **Seed duration against Neon is MEASURED FIRST**; a documented plan B is mandatory if it does not fit the platform's function ceiling. |

### Fly.io account recon (measured via the user's authenticated `flyctl v0.4.83` — read-only)

| Fact | Value |
|---|---|
| Identity / org | `rfoc15@gmail.com`, org `personal`, `Type: PERSONAL`, role admin |
| **Org created** | **2026-07-26 — three weeks old** |
| Plan flags | `EnablePaidHobby: false`, `PaidPlan: false`, `Billable: false` |
| Existing app | `matchday-agent` → `matchday-agent.fly.dev`, region `iad`, **1 machine, state `stopped`** |
| Proven `fly.toml` shape | `primary_region: iad` · `build.dockerfile: Dockerfile` · `http_service.internal_port: 8080` · `force_https: true` · `auto_stop_machines: true` · `auto_start_machines: true` · **`min_machines_running: 0`** · concurrency `requests` soft 10 / hard 20 · health check `GET /health` every 30s, timeout 5s, grace 15s |
| Proven VM size | `shared-cpu-1x` with a `memory = "1gb"` override — a Python LangGraph agent already runs on this |
| Secrets on that app (names only) | includes **`ALLOWED_ORIGINS`** (plural) — the user has already solved multi-origin CORS elsewhere; reuse the naming for B4 |
| Regions | 18 listed; **no `bog`**, no `mia`. Nearest to Colombia: `gru`, `dfw`, `iad` |
| Billing verifiability | `fly billing` does NOT exist in v0.4.83; `fly orgs --help` exposes nothing billing-related |

#### ⚠️ Planner self-corrections (recorded so the plan is not built on a false premise)

1. **The "grandfathered legacy free allowance" hypothesis is FALSE.** The org is 3 weeks old, created
   long after Fly removed free allowances. The user is on pay-as-you-go.
   **The real reason their bill is ~$0 is `min_machines_running: 0` + no volumes** ⇒ usage stays under
   the minimum billing threshold. ⇒ Scale-to-zero is a **cost requirement**, not an optimization, and
   the `[MANUAL — USER]` billing check becomes MORE important. Fly.io remains viable on this basis.
2. **There is no Fly region in Bogotá.** Earlier planner claim retracted.
3. **Region choice inverts the subagent's advice.** It optimized browser→agent latency (ONE streamed
   connection). The hot path is **agent → Vercel read API → Neon**, traversed several times per ReAct
   turn. ⇒ Co-locate with Vercel/Neon. Default **`iad`** (also where the user's working app lives),
   with a plan step to confirm the actual Neon/Vercel function region before committing.
4. **Subagent's `performance-2x` (2 CPU / 4 GB) sizing REJECTED** — over-provisioning is exactly what
   turns $0 into a real invoice. Default to the user's own proven `shared-cpu-1x` + 1 GB.
5. **Port detail:** the precedent app serves on `8080`; our agent's documented command uses `8000`.
   The Dockerfile/`fly.toml` must agree on one port; `/health` already exists at `main.py:100-102`.
6. **App name `cinepais-agent` cannot be reserved read-only** — availability is only provable by
   creating it. The plan must handle a name collision gracefully.

### Proven precedent: `/Users/reiorozco/Dev/matchday-agent` (user's own live Fly.io Python agent)

Public repo `reiorozco/matchday-agent`, live at `matchday-agent.fly.dev`. Read directly.

#### 🔴 N1 — NEW BLOCKER: the per-IP rate limit silently breaks behind Fly

`agent/src/cinepais_agent/main.py:34` uses `Limiter(key_func=get_remote_address)`. Behind Fly's proxy
that does NOT resolve the visitor's IP. `matchday-agent` explicitly solved this by keying on the
**`Fly-Client-IP`** header (`README.md` §What's inside; `decisions.md` §8.11). ⇒ Undeployed, our 10/min
per-IP limit collapses into a shared bucket — **the one control we told the user "really binds" would
not bind at all.** Mandatory fix, and it makes the global daily cap (Q3b) more important, not less.

#### N2 — Dockerfile: adapt, do not copy

Four fixes already paid for in `matchday-agent/Dockerfile`, all transferable:
1. `useradd` + `chown` the WORKDIR **before** `uv sync` — otherwise `.venv/` is root-owned and the
   container crash-loops on permission errors (their comment records 10 consecutive crashes).
2. `ENV PATH="/app/.venv/bin:${PATH}"`.
3. Two-step `uv sync`: `--no-dev --frozen --no-install-project` after copying only
   `pyproject.toml`+`uv.lock` (cached dep layer), then a full `uv sync --no-dev --frozen` AFTER copying
   source — their first deploy died with `ModuleNotFoundError` for want of step 2.
4. `CMD ["/app/.venv/bin/uvicorn", ...]` — **never** `uv run uvicorn`, which re-syncs on every start.
   Plus `HEALTHCHECK` hitting `/health` via `urllib`.

**Key divergence — do NOT copy the Node stage.** `matchday-agent` needs `node:20-slim` because its MCP
server is an external npm package (`npx matchday-mcp`). **CinePaís's MCP is an in-repo Python module**
(`agent.py:83-97` spawns `sys.executable -m cinepais_agent.mcp_server`) ⇒ single-stage
`python:3.12-slim`, smaller and simpler. Bonus: starting via `/app/.venv/bin/uvicorn` makes
`sys.executable` resolve inside the venv, which is exactly the precondition the MCP spawn needs.

`.dockerignore` precedent already excludes `.env*` (keeping `.env.example`), `.venv/`, caches, `.omo/`,
`docs/`, and the deploy artifacts themselves.

#### N3 — Measured production numbers from the same platform + shape of app

| Metric | Value | Source |
|---|---|---|
| Cold start on `/health` | **20.79 s** | `matchday-agent/README.md` §Deploy |
| Warm request | 0.41 s | idem |
| Auto-stop fires | **≈ 4 min** after last inbound request | idem |
| Unlisted CORS origin | HTTP 400, no `Access-Control-Allow-Origin` | idem |

⇒ CinePaís's 5–45 s tool turns **stack on top of a ~21 s cold start**: a visitor's first question can
plausibly take **~65 s**. The widget's unreachable/timeout copy must be checked against that, not
against warm local latency.

#### N4 — RISK: an idle SSE stream does NOT keep a Fly machine awake

`matchday-agent/fly.toml:42-44` documents it verbatim: Fly Proxy scores load on **inbound HTTP only**.
They accepted it because their anchor cases finish in < 30 s. **CinePaís turns reach 45 s**, so this is
a live risk for us, not an inherited non-issue. The plan must probe it explicitly against a cold agent.

#### N5 — `fly.toml` knobs proven by the user

`primary_region = 'iad'` (chosen to sit near both the DB and Vercel's edge — same reasoning we applied)
· `[build] dockerfile` · `[env] PORT = '8080'` · `[http_service] internal_port = 8080`,
`force_https = true`, **`auto_stop_machines = 'stop'`**, `auto_start_machines = true`,
`min_machines_running = 0` · `[http_service.concurrency] type='requests'`, soft 10 / hard 20 ·
`[[http_service.checks]]` `GET /health`, interval 30s, timeout 5s, grace 15s ·
`[[vm]] size='shared-cpu-1x', memory='1gb'`.
Note: `fly config show` renders `auto_stop_machines` as `true`, but the authored TOML uses the string
`'stop'` — write the string form.
Secrets split precedent: real secrets via `fly secrets set --stage`; non-secret runtime defaults in
`fly.toml [env]`.

#### N6 — CORS multi-origin implementation to mirror (closes B4)

`matchday-agent/src/matchday_agent/app.py:125-127`:
```python
def _resolve_origins() -> list[str]:
    raw = os.environ.get("ALLOWED_ORIGINS", "")
    return [o.strip() for o in raw.split(",") if o.strip()]
```
used at `:282-283`. Env documented as comma-separated in their README and `.env.example`.

#### N7 — Documentation/marketing precedents for W6

`matchday-agent/README.md` structure is directly reusable: a "Live demo (60 s copy-paste)" curl block,
"What's inside", a measured "Deploy" section, and a **"Known limitations"** section written for
reviewer honesty. `matchday-agent/docs/marketing/linkedin.md` is an existing LinkedIn-post format of
the user's own. W6 should follow these rather than invent a format.

### GitHub account state (read-only `gh` v2.97.0)

| Fact | Value |
|---|---|
| Login | `reiorozco` (Rei Orozco), Free tier, 36 repos — **20 public / 16 private** |
| Token scopes | includes `repo`, `workflow` ⇒ sufficient to create and push |
| **`cinepais` repo** | **DOES NOT EXIST — name available** (negative grep paired with a positive `matchday` control) |
| Default branch | `main` (global `init.defaultBranch`) |
| Remote style precedent | `matchday-agent` → `git@github.com:reiorozco/matchday-agent.git` (**SSH**), branch `main` |
| Description precedent | Rich one-liner + stack + "Live at <url>" |
| `cinepais` local | `git remote -v` empty — ready to publish |

### Security facts established with the user (must be reflected in the plan)

- CORS is browser-enforced; it does **not** stop `curl`/scripted abuse. The locked origin is not a spend control.
- `main.py:97` takes `sessionId` from the client ⇒ the 20-query session cap is trivially bypassed by
  rotating the id. Only the 10/min per-IP limit currently binds (~14,400 req/day/IP).
- Cost multiplier: 2 `POST /chat` produced **7** httpx calls to Gemini (Fase D measurement). Budget by httpx.
- `GOOGLE_API_KEY` stays server-side as a Fly secret; it is never exposed by the direct-call architecture.

## KEY SEQUENCING INSIGHT (avoids the phase's #1 trap)

`NEXT_PUBLIC_AGENT_URL` is inlined at **build** time, so the naive order (deploy web → deploy agent →
repoint → rebuild) forces an extra rebuild and risks a silently dead copilot. Both hostnames are
**choosable in advance**: the Fly app name determines `<app>.fly.dev`, and the Vercel project name
determines `<project>.vercel.app`. ⇒ **Reserve/confirm both names FIRST, set both env vars BEFORE
either deploy, then deploy.** The rebuild trap disappears.

## Planned wave order

1. **W1 — Polish + blocking fixes, fully local.** Branch `phase-4-deploy`; B1 (Prisma generate wired into
   the build); B4 (multi-origin CORS); global daily cap in `agent/`; verified-open polish items
   (#1 checkout error handling, #2 `preload`→`priority`, #6 reducer test, #7 Onyx test, #9 `sse-contract.md:90` ONLY).
2. **W2 — Anti-rot re-seed.** Measure the real seed duration against Neon FIRST, then implement the
   token-protected re-seed route + daily schedule, with a documented plan B.
3. **W3 — `main` + publication.** Squash to `main`, curate `.omo/`, create the GitHub remote (`[MANUAL — USER]`), push.
4. **W4 — Web deploy (Vercel).** Names reserved, env vars pre-set, **SSO protection disabled (B3)**,
   migrations + seed against prod, first deployment.
5. **W5 — Agent deploy (Fly.io).** Dockerfile + `fly.toml` + secrets; then the three proofs that ONLY
   exist live: real CORS preflight, token streaming behind the CDN, and cold-start behaviour vs the
   widget's timeout copy.
6. **W6 — Demo + post.** Shot-list and scripted queries, recording (`[MANUAL — USER]`), LinkedIn draft.

## Next workflow action

Approval brief presented; `status: awaiting-approval`. **Wait for the user's explicit okay**, then write
`.omo/plans/cinepais-phase-4-deploy.md` (script-scaffolded, todos APPENDed), run Metis per the project's
proven workflow, and hand off. Execution belongs to a separate `/start-work` session.
