# Handoff — Planning Fase E (pulido + deploy + demo + post)

> For the Prometheus planning session that follows. Read this FIRST, then `.omo/handoff-fase-d-final.md`
> (execution handoff, especially §9 "Fase E inputs"), then `specs/001` + `specs/002` §Sesión E.
> Everything here is verified fact as of 2026-08-14, not aspiration.
> Companion to `.omo/handoff-fase-c.md`, which served the same role one phase earlier.

## Project state

| Fase | Estado | Plan | Branch |
|---|---|---|---|
| 0 — scaffold + read API + seed | ✅ done + dual-review PASSED | `.omo/plans/cinepais-phase-0-scaffold.md` | `phase-0-scaffold` |
| B / 1 — UI compra manual | ✅ done + 5-lane review PASSED | `.omo/plans/cinepais-phase-1-ui.md` | `phase-1-ui` |
| C / 2 — agente LangGraph + MCP | ✅ done, 7 review rounds, F-wave 4/4 APPROVE | `.omo/plans/cinepais-phase-2-agent.md` (+ `-fixes`) | `phase-2-agent` |
| D / 3 — integración copiloto ↔ UI | ✅ done, 18/18 todos + F1–F4 APPROVE | `.omo/plans/cinepais-phase-3-integration.md` | `phase-3-integration` |
| E / 4 — pulido + deploy + demo + post | **planning (this one)** | — | — |

**Branch topology is LINEAR and cumulative:** `phase-0-scaffold → phase-1-ui → phase-2-agent → phase-3-integration`.
Each was branched off its predecessor at the same SHA (verified in `.git/logs/HEAD`), so
**`phase-3-integration` contains the entire project**. Nothing has ever been pushed; **no remote is configured**.

## ⚠️ The decision that is now DUE: `main` and publishing

There is still **no `main` branch**, nothing is pushed, and no remote exists. Every prior phase legitimately
deferred this — Fase D's plan explicitly parked it ("`main` is a Fase E decision, alongside deploy + push").

**Fase E is the phase where it can no longer be deferred**, because this phase deploys to Vercel + Fly.io and
turns the repo into a public portfolio artifact. This is an owner-decision (irreversible-ish, public-facing,
cross-cutting) and MUST survive the two filters as a question to the user, not a default. It forks:

- whether to squash the 4 phase branches into a clean `main` or merge them preserving history;
- whether the repo goes public, and under what name (the fictional-brand rule still applies);
- whether Vercel deploys from git (needs a remote) or via CLI from local.

Related, already verified: `.gitignore:26` ignores `.omo/evidence/`, and there are ~169 evidence files plus
4 handoffs and 4 plans under `.omo/`. **Whether that orchestration trail ships in a public portfolio repo is
itself a question for the user** — it is either an impressive engineering-process artifact or noise, and that
is not the planner's call to make silently.

## What Fase E is (from `specs/002` §Sesión E + `specs/001`)

1. **Seed scenarios that make the agent shine** — the planted ones already exist and are used by the demo:
   `soldout`, `front-only`, `no-adjacent`, `optimal` (ids and locations in `.omo/handoff-fase-c.md:28-33`).
   Assess whether more are needed or whether the existing four suffice.
2. **The "antes vs. después" walkthrough**, recordable: manual flow (tedious) vs one question to the copilot.
3. **Video/GIF** of that contrast.
4. **LinkedIn post draft** — skill-story angle (Fleet AI: replicating web apps to train agents → here, a cinema
   replica plus a copilot fixing a real UX pain), with the client↔business balance as the business point.
5. **Deploy:** `web/` → Vercel (Hobby), `db` → Neon free tier, `agent/` → Fly.io scale-to-zero, with an LLM
   **budget cap**.
6. Plus the polish backlog below.

## What is verified working (do not re-verify from scratch — cite it)

**Full stack, end to end, proven live in Fase D Todo 16** (2 real Gemini queries, the phase's entire spend):
browser → widget → `POST :8000/chat` → agent → MCP tools → web read API → recommendation card → CTA →
`/showtimes/<id>?preselect=<ids>` → seats pre-selected through the real business rules, copilot panel still open.
Screenshots: `.omo/evidence/task-16-live-hitl.png` (live) and `task-14-hitl-money-shot.png` (fixture).

- **Read API** (5 endpoints, Zod-validated, priced) — contract in `web/README.md`.
- **UI** — home, catálogo, detalle, mapa de sillas, checkout simulado (Fase B).
- **Agent** — 4 MCP read tools, LangGraph, SSE, `gemini-3.6-flash` (confirmed by app log + httpx wire),
  rate limit 10/min per IP, 20 queries/session, 2000-char input cap, `MAX_OUTPUT_TOKENS=1024`, CORS-locked.
- **Copilot widget** — `web/src/components/copilot/{copilot-widget.tsx,use-copilot-chat.ts,recommendation-card.tsx}`
  and transport `web/src/lib/agent/{config,events,sse,client}.ts` (hand-rolled WHATWG SSE parser, zero new deps).
- **HITL preselect** — `preselect` reducer action in `web/src/lib/business/selection.ts` (idempotent, enforces
  max-4 + orphan + wheelchair skip) and the `?preselect=` URL contract on `/showtimes/[id]`.

## Deploy-critical facts already gathered — READ `handoff-fase-d-final.md` §9 BEFORE PLANNING

Do not re-derive these; they were measured, not guessed. Highlights the planner must build the plan around:

1. **Two env vars must move TOGETHER or the copilot silently dies:** `NEXT_PUBLIC_AGENT_URL` (web → the Fly.io
   host) and `CORS_ORIGIN` (agent → the Vercel domain). The widget calls the agent **directly**; there is no
   proxy, deliberately (a proxy collapses the per-IP rate limit into one global bucket and imposes Vercel's
   streaming cap on a path that legitimately takes 45s).
2. **`NEXT_PUBLIC_AGENT_URL` is inlined at BUILD time.** Changing it on Vercel requires a **rebuild**, not just
   an env edit. This is the most likely "why doesn't it work in prod" trap in the whole phase.
3. **CORS can only ever be proven live.** Playwright `route.fulfill` satisfies a request without a real preflight
   (measured `preflight: 0`), so no fixture can catch a CORS misconfiguration. Re-prove after repointing.
4. **Streaming must be re-verified behind the CDN.** Fixtures deliver a whole stream in one reader chunk
   (measured `readerChunks: 1`), so incremental token rendering is only observable live. Vercel/Fly buffering
   could break it.
5. **Fly.io scale-to-zero cold start** stacks on top of 5–45s tool turns. Check the widget's unreachable/timeout
   copy against a genuinely cold agent.
6. **Hard LLM budget cap + spend alerts are still NOT implemented** (AGENTS.md §Abuse & cost controls). Per-IP
   rate limiting and the session cap exist; the budget cap is a deploy-time concern and belongs in this phase.
7. **`agent/.env` holds a real `GOOGLE_API_KEY`.** Never let it reach Vercel/Fly logs or git.

## Polish backlog (inherited, all still open)

From Fase C, deliberately untouched by Fase D (which forbade unrelated changes):
- `checkout/page.tsx` client fetch lacks error handling (infinite skeleton on network failure).
- `preload` prop on `<Image>` in film-card/hero-carousel (likely meant `priority`).
- Wheelchair dialog title copy conflates preferential/wheelchair.
- `f3-step-*.png` (9 files) untracked at repo root → move to `.omo/evidence/`.
- Optional hardening: recompute order server-side on confirmation; Zod-gate `?format=`.
- Missing minor tests: reducer showtime-switch branch; Onyx pricing case.

From Fase D:
- **`priceFrom` nullability gap**: `agent/src/cinepais_agent/events.py:47` is `int | None`, but
  `agent/docs/sse-contract.md` shows `"priceFrom": 32000` unannotated while marking sibling nullable fields.
  Implementation correct, doc under-specified. `agent/` was frozen in Fase D; **Fase E owns this fix**.
- `.omo/handoff-fase-d-wave-1.md` §4 documents two REJECTED implementations; its ADDENDUM §C2 corrects it.
  Anyone reading that file must read the addendum.

## Conventions (non-negotiable, AGENTS.md)

Code/identifiers/filenames/comments **English** · UI copy + agent replies **Spanish** · fictional brand
**CinePaís**, never CineColombia's name/logo/endpoints · mock data only, no real API, no live scraping ·
commits only when asked, branch first, **no push unless asked** · **no attribution lines** ("Generated with…",
"Co-Authored-By") anywhere · phases run in fresh chats.

## Cost posture (the user is budget-constrained — respect it)

Gemini credit is limited (~COP 10.000) and Claude tokens are scarce. **Fase D's entire live spend was 2 queries.**
Carry that discipline: prefer deterministic verification, and **announce explicitly before anything that spends
money, time, or tokens, with a justification.** Note for cost modelling: one `POST /chat` is NOT one LLM call —
Fase D measured 2 `/chat` calls producing 7 httpx calls to Gemini (ReAct loop). Budget by the httpx metric.

Deploy targets are free-tier by design (Vercel Hobby, Neon free, Fly.io scale-to-zero), but account creation and
a real budget cap are user actions the planner cannot perform — surface them as `[MANUAL — USER]` steps.

## Proven workflow (repeat it)

1. Prometheus: explore → draft (`.omo/drafts/<slug>.md`) → brief → **user's explicit ok** → plan
   (`.omo/plans/<slug>.md`). Run **Metis** before delivering — it caught 1 BLOCKER + 3 MAJOR in Fase D's plan,
   including a precondition that halted the plan at step zero and four `grep`s that could never have failed.
2. **De-risk the plan's most fragile assumption empirically before handing off.** In Fase D a ~2-minute
   Playwright probe validated the fixture-replay mechanism AND invalidated two criteria I had already written
   (they depended on timing that `route.fulfill` makes unobservable). Cheaper and more decisive than review.
3. User runs `/start-work <slug>` in a fresh chat per wave.
4. **`.omo/plans/**` is planner-only.** The executor flips checkboxes and commits boulder/drafts/notepads —
   never plan prose or acceptance criteria.
5. Post-implementation F-wave, lanes parallel but **serialized on shared state** (DB seeding, branch checkouts)
   — parallel lanes collided in Fase B and produced false FAILs.

## Hard-won lessons the Fase E plan MUST encode

- **Acceptance criteria must be deterministically satisfiable.** Never assert on which trajectory the LLM took
  in an E2E test; that guarantee belongs in unit tests. This cost Fase C four rounds. Fase D's Todo 16 handled
  it correctly by *recording* the `outcome` enum as observed and never asserting it.
- **Never hardcode a date-derived value.** The Wave 1 handoff hardcoded `SEED_NOW=2026-08-01`; two weeks later
  that seeds every showtime into the past and the 15-min cutoff empties the API, which looks exactly like a code
  bug. Always emit the recompute one-liner plus a pre-flight `curl` check.
- **A "Verification" section that disagrees with the shipped code is worse than none** — it is what reviewers
  cite. Re-read the actual files before writing one.
- **Pair every negative-result grep with a positive control**, and never `grep` a directory without `-r`.
- **Check the lint/test baseline before mandating a green gate.** Fase D's plan required `pnpm lint` exit 0
  without verifying it was green at baseline; it wasn't, which forced three unplanned Fase B file edits.
- **Express process rules as verifiable acceptance criteria, not prose.** Fase D's "stop and continue in a fresh
  chat" was written as prose; the executor classified it a "session-architecture preference" and overrode it for
  two of three wave boundaries. If the user wants a hard stop, it needs to be a checkable gate.
- **Count rows, never estimate them**, when reporting a plan's shape.
- **Commit-count criteria must anticipate orchestrator bookkeeping commits.** Fase D's `wc -l → 4` returned 9;
  the fix is `--invert-grep --grep='^chore(omo)'`, never squashing history to match a number.

## Suggested slug

`cinepais-phase-4-deploy` (keeps the phase-N pattern; specs call it Sesión E / Fase 4).

## Open questions Prometheus should resolve in Fase E planning (explore first, ask only owner-decisions)

- **`main` + publishing + whether `.omo/` ships** — the big one, see above. Genuine owner-decision, must be asked.
- Deploy order and coupling: which side goes first given the two-env-var interdependency and the build-time
  inlining of `NEXT_PUBLIC_AGENT_URL`.
- Neon: reuse the existing free-tier DB (already used in dev via `web/.env.local`) or provision a fresh one; and
  how the deterministic seed is run against prod.
- Budget cap mechanism for Gemini (Google Cloud Spend Cap is Public Preview and is a `[MANUAL — USER]` step).
- Demo recording: tooling, scripted scenario, and whether the video is in-repo or external.
- LinkedIn post: how much to reveal about the orchestration process — ties back to the `.omo/` question.
- How much of the polish backlog is in scope vs parked (default: scope only what the demo shows on camera).
