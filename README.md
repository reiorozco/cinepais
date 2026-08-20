# CinePaís

A mock cinema-ticketing site for Colombia, plus an AI copilot that answers questions like
*"¿dónde veo La Odisea en IMAX este finde con 2 sillas juntas?"* and pre-selects the seats it recommends —
without ever taking the buying decision away from the person.

**Live**: <https://cinepais.vercel.app> · **Copilot API**: <https://cinepais-agent.fly.dev> · **License**: MIT

> **CinePaís is a fictional brand.** It is not affiliated with, endorsed by, or connected to any real
> cinema chain, and no real cinema API is ever called — nothing is scraped either. Every film, site,
> showtime, seat and price in this repo is deterministic mock data produced by a seeded PRNG. No tickets
> are sold and no money moves: checkout ends on a confirmation screen that says exactly that.

---

## Live demo

Open <https://cinepais.vercel.app>, pick a film, choose a date and format, open a showtime, select seats, check out.
That is the whole manual flow, and it works without the copilot.

Then open the chat bubble and ask it something in Spanish:

> ¿Dónde veo La Odisea en IMAX este finde con 2 sillas juntas?

It streams back a recommendation card. The CTA (`Ver y confirmar sillas`) navigates to the seat map with
those seats **pre-selected but not purchased** — you still review and confirm. If a seat gets dropped on
the way (already sold, would orphan a neighbour, would exceed the 4-seat maximum, or is an accessibility
seat), a banner says so in Spanish rather than silently marking fewer seats.

The copilot API is also reachable directly over SSE:

```bash
curl -sN -X POST 'https://cinepais-agent.fly.dev/chat' \
  -H 'content-type: application/json' \
  -d '{"message":"¿Dónde veo La Odisea en IMAX este finde con 2 sillas juntas?","sessionId":"demo-1"}'
```

First request wakes the machine from `stopped` — see [Known limitations](#known-limitations) for what that costs you.

---

## What's inside

Two halves that talk to each other over HTTP, deployed separately, and buildable in isolation.

### `web/` — Next.js app, read API, and the mock database

- **Catalogue and purchase flow** — home carousel, film catalogue, film detail with a 7-day date
  selector, an interactive seat map, checkout and confirmation. UI copy is Spanish; the code is English.
- **Business rules, encoded and unit-tested** — max **4 seats** per purchase; **no orphan seats** (a
  selection may not strand a single available seat between sold seats, an aisle, or a wall); a **15-minute
  cutoff** that removes showtimes about to start; pricing by format × zone with a Wednesday discount;
  accessibility seats gated behind a confirmation dialog.
- **Seat quality tiers** — rows 1–3 `low`, rows 4–8 `optimal`, rows 9+ `high`, fixed cutoffs written by
  `getSeatMeta()` in the seed. This is what lets the copilot argue about *good* seats rather than merely
  free ones.
- **Realistic occupancy** — each showtime's sold fraction is drawn from a day/time-band table (quiet on a
  Tuesday matinee, close to full on Friday prime), never 0% or 100%, and every room keeps a guaranteed
  run of adjacent optimal-band seats so there is always a decent pair on offer. Four scenarios are
  planted on top of that baseline (a sold-out room, a front-rows-only trap, and so on) so the copilot has
  something interesting to reason about.
- **Deterministic seed** — 10 films, 2 cities, 672 showtimes and 119 280 seats, reproducible from `SEED`
  and `SEED_NOW`.
- **Status-driven catalogue** — the home page splits the film grid into `Cartelera` / `Pronto` / `Preventa`
  tabs, each one a pure projection of `film.status`; a film can never appear under a tab its badge
  contradicts.
- **Read API** — five JSON endpoints, no auth, consumed by both the UI and the agent. See
  [Read API](#read-api) below.

### `agent/` — LangGraph copilot over MCP, streamed with SSE

- **LangGraph ReAct agent** bound to **4 read-only MCP tools** over stdio — `search_showtimes`,
  `seat_availability`, `adjacent_seats`, `recommend_best`, defined in
  `agent/src/cinepais_agent/mcp_server.py` — which are the agent's *only* capabilities. No email, no
  browsing, no shell, no filesystem: even a successful jailbreak reaches nothing but public mock data.
- **Grounded by construction** — the `recommendation` event is built from `recommend_best`'s tool output,
  never parsed out of model text, so the card cannot show a showtime or a seat the database does not have.
- **SSE contract** — `token`, `tool_call`, `recommendation`, `done`, `error`. Full field shapes in
  [`agent/docs/sse-contract.md`](agent/docs/sse-contract.md).
- **Provider-agnostic** — Gemini Flash through LangChain's `init_chat_model`, with a documented model
  fallback chain; swapping providers is a config change, not a code change.
- **Optional tracing** — LangSmith is off by default; set `LANGSMITH_TRACING=true` with a key and runs
  land in the `cinepais-agent` project, refusals included, which is how abuse patterns become visible.
- **Abuse and cost controls** — per-IP rate limit (keyed off `Fly-Client-IP` so it survives the proxy),
  a 2 000-character input cap, a per-session query cap, a global daily request cap, `recursion_limit=8`
  on the agent loop, and a 40-item ceiling on tool output so a bare `search_showtimes` cannot re-send the
  whole catalogue as LLM input on every turn. Off-topic questions are politely refused in Spanish, which
  also keeps the endpoint from being used as somebody's free LLM.

The widget calls the agent **directly**, with no Next.js proxy in between — deliberately. A proxy would
collapse the per-IP rate limit into one shared bucket (every request would arrive from the web server's
IP) and would run tool turns that can take ~45 s into Vercel's ~25 s streaming cap.

---

## Stack

| Half | Runtime | Key libraries | Hosting |
|---|---|---|---|
| `web/` | Node 20+, pnpm 10 | Next.js 16 · React 19 · Tailwind 4 · shadcn/ui · Prisma 7 + `@prisma/adapter-pg` · Vitest 2 | Vercel + Neon Postgres |
| `agent/` | Python 3.12+, uv | LangGraph · FastMCP (stdio) · FastAPI + `sse-starlette` · slowapi · Gemini Flash via `init_chat_model` | Fly.io (scale-to-zero) |

```
browser ──► web (Vercel) ──► Neon Postgres
   │                            ▲
   └── SSE ──► agent (Fly.io) ──┘
                 └── LangGraph ReAct ──► 4 MCP tools (stdio) ──► the read API
```

---

## Run it locally

**Prerequisites**: Node 20+, [pnpm](https://pnpm.io) 10, Python 3.12+, [uv](https://docs.astral.sh/uv/),
a Postgres database (Neon free tier works), and a `GOOGLE_API_KEY` if you want the copilot to answer.
The site itself runs fine without an API key — only `/chat` needs one.

```bash
git clone https://github.com/reiorozco/cinepais.git
cd cinepais
```

### 1. Install both halves

```bash
cd web && pnpm install
cd ../agent && uv sync
```

### 2. Configure

```bash
cp web/.env.example web/.env.local
cp agent/.env.example agent/.env
```

Fill in `DATABASE_URL` and `DATABASE_URL_UNPOOLED` in `web/.env.local` (pooled and direct Neon URLs — the
direct one is what migrations and the seed use), and `GOOGLE_API_KEY` in `agent/.env`. Every other
variable ships with a working default; each one is documented inline in the example files and in
[`agent/README.md`](agent/README.md#environment-variables).

### 3. Create and seed the database

```bash
cd web
pnpm prisma migrate deploy
bash scripts/reseed.sh
```

`reseed.sh` recomputes the seed window instead of hardcoding a date, which matters more than it sounds —
see [refreshing the demo data](#demo-data).

### 4. Run both halves

```bash
# Terminal 1 — web on :3000
cd web && pnpm dev

# Terminal 2 — agent on :8000
cd agent && uv run uvicorn cinepais_agent.main:app --port 8000
```

Then open <http://localhost:3000>. Check both halves are up:

```bash
curl -s http://localhost:3000/api/cities
curl -s http://localhost:8000/health
```

### 5. Tests

```bash
cd web && pnpm test                              # Vitest — business rules, API, seed determinism
cd agent && uv run pytest tests/ -m "not evals"  # pytest — tools, SSE, abuse controls
```

The agent's `evals` suite is excluded on purpose: it makes real LLM calls and spends real money. Run it
only when you mean to (`uv run pytest tests/evals -m evals`).

---

## Read API

Five JSON endpoints, no auth (it is mock data). Consumed by the UI and by the agent's MCP tools alike,
which is what let both halves be built in parallel against one contract.

| Method | Path | Returns |
|---|---|---|
| `GET` | `/api/cities` | The cities that have sites |
| `GET` | `/api/films` | The film catalogue; optional `?city=` |
| `GET` | `/api/films/:id` | One film with synopsis, director and cast |
| `GET` | `/api/showtimes` | Purchasable showtimes; filters `filmId`, `city`, `date`, `format` |
| `GET` | `/api/showtimes/:id/seats` | Every seat for a showtime, plus a `summary` |

Seats come back as `seatId` (`area_row_col`), `status`, `areaCategory` (`general` · `preferential` ·
`premium` · `wheelchair`), `qualityTier` (`low` · `optimal` · `high`) and `price` in COP; the `summary`
carries per-area totals and a `priceTable`.

`GET /api/showtimes` applies the 15-minute cutoff, so an empty array is a correct answer for a stale
database — not a bug. Full request/response examples for every endpoint:
[`web/README.md`](web/README.md#read-api-contract).

The copilot adds one endpoint of its own, on the agent: `POST /chat`, streaming SSE
([contract](agent/docs/sse-contract.md)).

---

## Demo data

The catalogue is deterministic mock data — no real cinema API is ever called. A seed run writes a rolling
**seven-day window** of showtimes starting from the day it runs, so the demo goes stale on its own: once
that window slides into the past, `GET /api/showtimes` correctly returns `[]` and the site looks empty.

Refreshing it is one command, and takes **about 70 seconds**:

```bash
bash web/scripts/reseed.sh
```

It recomputes the window's start date (always tomorrow — never a hardcoded date), reruns the seed, and
prints back the `businessDate` range the database actually ended up holding. It refuses to run at all if
`DATABASE_URL_UNPOOLED` is missing, rather than half-wiping the catalogue.

**Refresh roughly once a week.** There is deliberately no cron job and no admin endpoint: the seed deletes
the whole catalogue before reinserting it and is not wrapped in a transaction, so a run killed halfway
leaves the database empty rather than merely stale. That is an acceptable risk for a command a human runs
and watches, and an unacceptable one for a scheduled job firing unattended at 3am.

Last refreshed: **2026-08-15**.

---

## Known limitations

Written down rather than papered over.

- **Everything is mock data.** No real cinema API, no scraping, no real inventory, no payment. Seats are
  "sold" by the seed, not by other people; two browsers can select the same seat, because there is no
  reservation system behind the flow. The confirmation screen issues a deterministic order number and says
  plainly that nothing was bought.
- **The mock catalogue only spans seven days at a time,** starting the day it was seeded. Past that
  horizon the site correctly renders an empty catalogue, so the demo needs a manual refresh roughly weekly
  — one command, about 70 seconds, described under [refreshing the demo data](#demo-data). This is a
  deliberate trade against a scheduled job: the seed is destructive and un-transactioned, and a cron that
  died mid-run at 3am would leave the live database empty with nobody watching. During Wave 1 of the
  deploy phase a re-seed did stall partway through, which is exactly that failure — caught because a human
  was watching it.
- **Cold start on the copilot's first request: ~9.5 s to the first response byte, ~25 s until the turn
  finishes streaming** (measured live against the deployed pair — warm requests came back in ~180 ms to
  the first byte). The `cinepais-agent` machine runs on Fly.io with `min_machines_running = 0` and stops
  itself once it has gone idle, so the first question after an idle period pays for waking the machine,
  loading Python and spawning the MCP subprocess. Measured live, that idle window ran anywhere from
  **~2 to ~9 minutes** after the last request — Fly
  Proxy sweeps idle machines on a periodic tick rather than counting down from each one, so the exact
  moment it stops is not something to plan around. Warm requests are far quicker. The site itself is
  unaffected — only `/chat` waits. This is a cost trade for a portfolio demo; raising
  `min_machines_running` to `1` removes it and changes the bill.
- **The copilot is capped at 40 `/chat` requests per UTC day, and that cap is a courtesy brake, not a
  spend guarantee.** The counter lives in the agent process, and the process stops when the machine
  scales to zero — so a cold start resets it. It bounds one warm machine's day, not the invoice. The only
  real ceiling is the provider-side hard spend cap configured outside this repo. Over the cap the agent
  answers in Spanish that it is out of queries for today and points you at the rest of the site, which
  keeps working.
- **Session limits are best-effort.** The per-session query cap keys off a client-supplied `sessionId`, so
  rotating it defeats it. It exists to stop accidental loops, not determined abuse; the per-IP rate limit
  and the daily cap are the controls that actually bind.
- **The agent answers only cinema questions.** Anything else gets a polite Spanish refusal. That is
  intentional — an open-ended chat endpoint on a public URL is somebody else's free LLM.
- **Single locale and currency.** Spanish (Colombia) and COP only. Nothing is internationalised.

---

## Repo layout

```
web/     # Next.js app: UI, read API, Prisma schema, deterministic seed, reseed.sh
agent/   # Python: LangGraph agent, MCP tools, FastAPI/SSE app, sse-contract.md
specs/   # The written spec, the phased implementation plan, and the design reference
```

Each half has its own README with the detail this one deliberately leaves out:
[`web/README.md`](web/README.md) · [`agent/README.md`](agent/README.md).

---

## License

MIT — see [LICENSE](LICENSE).
