# CinePaís — project instructions

Mock cinema-ticketing replica + AI copilot agent. Portfolio project. **Read this before doing anything.**

## Read first (context)
1. `specs/001-cine-copiloto-boletas.md` — the spec (what & why, business rules, acceptance criteria).
2. `specs/002-implementation-plan.md` — phased plan + ready-to-paste prompt per session (A–E).
3. `specs/design-reference/README.md` + screenshots `01`–`05` — visual guide + mock data model.

## What this is
A visually-inspired replica of a Colombian cinema portal (fictional brand **CinePaís**), backed by **mock data**, reproducing the ticket-buying flow — plus an **AI copilot** that answers natural-language queries ("where can I watch X in IMAX this weekend with 2 good seats together?") balancing availability + adjacency + **seat quality** + **business conversion** (never discourages the sale).

## Stack
- **`web/`** — Next.js (lean, App Router) + TypeScript + Tailwind + **Prisma** (SQLite in dev → Neon Postgres in deploy). Deploys to Vercel.
- **`agent/`** — Python + **LangGraph + MCP** + FastAPI/SSE (MatchDay pattern). Deploys to Fly.io. Consumes the web read API via MCP tools. **LLM: Gemini Flash** (cheap/fast), provider-agnostic via `init_chat_model` (swap/fallback in one line).

## Repo structure
```
web/     # Next.js app: UI + read API + Prisma + seed
agent/   # Python LangGraph + MCP + FastAPI
specs/   # spec, plan, design-reference/
```

## Read API contract (lets UI and agent be built in parallel)
The web app exposes a read API consumed by both the UI and the agent:
- `GET /api/cities` · `GET /api/films` · `GET /api/films/:id`
- `GET /api/showtimes?filmId&city&date&format`
- `GET /api/showtimes/:id/seats` → `seatId` (`area_row_col`), `status`, `areaCategory`, `qualityTier`, `summary`

## Conventions (must follow)
- **Code, filenames, identifiers, comments → English.** **UI copy and the agent's replies → Spanish.**
- **Mock only:** deterministic seed data. **Never** call the real CineColombia / Vista API, no live scraping.
- **Fictional brand (CinePaís)** — never use CineColombia's real name, logo, or endpoints in the repo.
- The agent **never invents data** — it answers only from the mock via its tools.
- Respect the **core business rules** (see spec §Reglas de negocio): max **4 seats/purchase**, **no orphan seats**, pricing by format/zone/discount-day, accessibility seats handled with care, time cutoff.
- Seat **quality** heuristic: front rows = low, middle = optimal, back/upper = high (see design-reference).

## Security & hardening (treat the demo like production)
- **Least-privilege tools:** the agent has *only* cinema read tools — no email/browse/exec/file access. Even if jailbroken, the damage ceiling is low. Mock data → no PII.
- **Tight scope (system prompt):** answers only cinema/booking questions; **politely refuses off-topic** (prevents "free LLM" abuse); never reveals the system prompt or internals; stays **grounded** in tool data (never invents).
- **Input/output validation:** validate tool args; moderate + length-cap responses.
- **Abuse & cost controls:** rate-limit per IP/session (slowapi); max input/output tokens; per-session query cap with a friendly message; **hard LLM budget cap + spend alerts**; CORS restricted to the web origin; agent scales to zero.
- **Observability:** LangSmith tracing; log refusals to spot abuse patterns.
- Ref: OWASP LLM01 (prompt injection) / OWASP Top-10 for Agentic Applications 2026.

## Deploy & cost (portfolio demo → ~free)
- `web/` → **Vercel** (Hobby, free) · `db` → **Neon** free tier (or seed data in-repo) · `agent/` → **Fly.io** scale-to-zero.
- LLM → **Gemini Flash**; set a **budget cap** so curious traffic can't blow the bill. Expected cost: ~free to a few USD/mo.

## Workflow
- For each phase, **start in plan mode** (analyze/validate) and implement after approval.
- **Commits:** only when asked; if on the default branch, branch first; **don't push** unless asked.
- **No auto-generated attribution** in commits or docs (no "Generated with…" / "Co-Authored-By").
- This is a **multi-chat** project: phases run in fresh sessions (see `specs/002`). Use a handoff note between sessions to carry context.
