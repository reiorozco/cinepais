# CinePaís — web

Mock cinema-ticketing read API + placeholder UI. Portfolio project. Next.js 16 + Prisma 7 + Neon Postgres.

## Prerequisites

- Node 20 LTS
- pnpm 9
- Neon free-tier account (provisioned via Vercel Marketplace)
- Vercel CLI (`npm i -g vercel`)

## Install

```bash
pnpm install
```

## Environment

Env vars are injected by the Vercel Marketplace Neon integration. Never fill them by hand.

```bash
# Link the Vercel project (once)
vercel link --project cinepais

# Pull Neon vars to .env.local
vercel env pull .env.local --yes
```

See `web/.env.example` for the full variable list:
- `DATABASE_URL` — Neon pooled URL (app runtime)
- `DATABASE_URL_UNPOOLED` — Neon direct URL (migrations + seed)
- `SEED` — PRNG seed (default: `20260801`)
- `SEED_NOW` — Reference time for showtimes (default: `2026-08-01T00:00:00-05:00`)

## Database

```bash
# Apply migrations (fresh env)
pnpm prisma migrate deploy

# Or in dev (creates migration if schema changed)
pnpm prisma migrate dev

# Seed deterministic data (672 showtimes, 119,280 seats, 4 planted scenarios)
pnpm prisma db seed
```

## Run dev

```bash
pnpm dev
# → http://localhost:3000
```

## Run tests

```bash
pnpm test
```

## Read API contract

All endpoints return JSON. No auth required (mock data, portfolio demo).

### GET /api/cities

Returns the 2 cities with cinema sites.

```bash
curl http://localhost:3000/api/cities
```

```json
[
  {"id":"city-1","name":"Bogotá"},
  {"id":"city-2","name":"Medellín"}
]
```

### GET /api/films

Returns all 10 films. Optional `?city=Medellín` filter.

```bash
curl http://localhost:3000/api/films
```

```json
[
  {
    "id": "film-01",
    "title": "La Odisea",
    "posterUrl": "https://placehold.co/300x450?text=Film+01",
    "durationMin": 165,
    "rating": "PG-13",
    "genres": ["Aventura", "Drama"],
    "status": "cartelera"
  }
]
```

`status` is one of `cartelera` (showing now) · `pronto` (no showtimes yet) · `preventa` (showtimes only in the last 2 days of the window).

### GET /api/films/:id

Returns full film detail including synopsis, director, and cast.

```bash
curl http://localhost:3000/api/films/film-01
```

```json
{
  "id": "film-01",
  "title": "La Odisea",
  "posterUrl": "https://placehold.co/300x450?text=Film+01",
  "durationMin": 165,
  "rating": "PG-13",
  "genres": ["Aventura", "Drama"],
  "status": "cartelera",
  "synopsis": "Un viaje épico por los siete mares en busca del hogar.",
  "director": "Sofía Restrepo",
  "cast": ["Carlos Vega", "María Ospina", "Andrés Cano"]
}
```

### GET /api/showtimes

Returns purchasable showtimes (cutoff: 15 min before start). Filters: `filmId`, `city`, `date` (YYYY-MM-DD), `format`.

```bash
curl "http://localhost:3000/api/showtimes?filmId=film-01"
```

```json
[
  {
    "id": "st-site-bog-3-imax-4-2245",
    "filmId": "film-01",
    "siteId": "site-bog-3",
    "siteName": "CinePaís Bogotá Norte",
    "city": "Bogotá",
    "businessDate": "2026-08-04",
    "time": "22:45",
    "room": "imax",
    "formats": ["IMAX"],
    "priceFrom": 32000
  }
]
```

### GET /api/showtimes/:id/seats

Returns all seats for a showtime with availability summary.

```bash
curl http://localhost:3000/api/showtimes/st-site-bog-3-imax-4-2245/seats
```

```json
{
  "showtime": {
    "id": "st-site-bog-3-imax-4-2245",
    "filmId": "film-01",
    "siteId": "site-bog-3",
    "siteName": "CinePaís Bogotá Norte",
    "city": "Bogotá",
    "businessDate": "2026-08-04",
    "time": "22:45",
    "room": "imax",
    "formats": ["IMAX"],
    "priceFrom": 32000
  },
  "seats": [
    {
      "seatId": "1_1_1",
      "row": 1,
      "col": 1,
      "area": 1,
      "status": "Available",
      "areaCategory": "general",
      "qualityTier": "low",
      "price": 32000
    }
  ],
  "summary": {
    "totalCount": 260,
    "availableCount": 260,
    "byArea": {
      "general": {"total": 156, "available": 156},
      "premium": {"total": 100, "available": 100},
      "wheelchair": {"total": 2, "available": 2},
      "preferential": {"total": 2, "available": 2}
    },
    "priceTable": {
      "general": 32000,
      "preferential": 37000,
      "premium": 43000,
      "wheelchair": 32000
    }
  }
}
```

## Business rules encoded

- **Orphan rule** (`src/lib/business/orphan.ts`): selecting seats must not leave exactly 1 available seat isolated between sold/aisle/edge on both sides.
- **Cutoff rule** (`src/lib/business/cutoff.ts`): showtimes starting within 15 minutes of `now` are excluded from `/api/showtimes`.
- **Quality rule** (`src/lib/business/quality.ts`): rows 1–3 = `low`, rows 4–8 = `optimal`, rows 9+ = `high` (proportional for smaller rooms).

## Copiloto (Fase D)

A floating chat bubble that lets moviegoers ask natural-language questions ("¿dónde veo X en IMAX este finde con 2 sillas juntas?") and get back a recommendation card — with a human-in-the-loop (HITL) CTA that pre-selects the recommended seats on the seat map, so the person still reviews and confirms before buying.

The widget talks **directly to the agent** (`agent/` on `:8000`), with no Next.js proxy in between. One line why: a proxy would collapse the agent's per-IP rate limit into a single global limit (every request would appear to come from the web server's IP) and would hit Vercel's ~25s streaming response cap against tool turns that can take up to 45s (see `agent/docs/sse-contract.md` §latency expectations).

### Environment

| Variable | Default | Effect |
|---|---|---|
| `NEXT_PUBLIC_AGENT_URL` | `http://localhost:8000` | Base URL the widget calls directly for `POST /chat` (SSE) |

In Fase E (deploy), `NEXT_PUBLIC_AGENT_URL` gets repointed at the Fly.io host, and — on the agent side — `CORS_ORIGIN` (see `agent/README.md` §Environment variables) must be repointed at the Vercel domain. Both sides need updating together or CORS will reject the widget's requests.

### Run both halves locally

```bash
# Terminal 1 — web on :3000
pnpm dev

# Terminal 2 — agent on :8000
cd agent && uv run uvicorn cinepais_agent.main:app --port 8000
```

Seed with tomorrow's date as `SEED_NOW` — the agent's tool calls need showtimes that are strictly future, not today (today's date can fall inside the 15-minute cutoff window and disappear from results). Never hardcode a date literal; recompute it:

```bash
SEED_NOW=$(python3 -c "from datetime import date, timedelta; print((date.today()+timedelta(days=1)).strftime('%Y-%m-%d'))")
TZ=America/Bogota SEED=20260801 SEED_NOW=$SEED_NOW pnpm prisma db seed
```

### `?preselect=` URL contract

The recommendation card's CTA (`Ver y confirmar sillas`) navigates to `/showtimes/[id]?preselect=<comma-separated-seatIds>`, which pre-selects those seats on load. Worked example (depends on the current seed — this pair is layout-stable across re-seeds because it's the first IMAX showtime and IMAX row 1 cols 10–11 are always in block `[1,5]`):

```
http://localhost:3000/showtimes/st-site-med-3-imax-0-1930?preselect=1_1_10,1_1_11
```

This loads the seat map with seats `1_1_10` and `1_1_11` already selected and a banner reading:

> Tienes N sillas pre-seleccionadas por el copiloto. Revísalas y confirma — aún no se ha comprado nada.

Pre-selection runs through the same business rules as manual selection, so a seat can be silently dropped from the recommendation if it's already sold, would create an orphan seat, would push the selection past the max of 4, or is a wheelchair/accessibility seat — the banner tells the person this happened, in Spanish, so they always know why fewer seats than requested ended up marked.

## Determinism

The seed uses `SEED` (PRNG seed) and `SEED_NOW` (reference time) env vars. Same values → same DB state on any machine.

```bash
SEED=20260801 SEED_NOW=2026-08-01T00:00:00-05:00 pnpm prisma db seed
```

## Stack

Next.js 16 + React 19 + Tailwind 4 + shadcn 2.3 new-york + Prisma 7.9 + @prisma/adapter-pg + Vitest 2

## UI pages

| Route | Description |
|---|---|
| `/` | Home — hero carousel + film grid (Cartelera / Pronto / Preventa tabs) |
| `/films` | Catalog — dark-charcoal grid, format filter |
| `/films/[id]` | Film detail — backdrop hero, ficha, 7-day date selector, showtime accordion |
| `/showtimes/[id]` | Seat map — interactive grid, max-4 rule, orphan rule, wheelchair dialog, accepts `?preselect=` (see §Copiloto) |
| `/checkout` | Order summary — seat list with COP prices, confirm button |
| `/checkout/confirmation` | Confirmation — deterministic order number (CP-XXXXXX), demo notice |

### Run the full purchase flow

1. `SEED=20260801 SEED_NOW=2026-08-06 pnpm prisma db seed` (re-seed with today's date as SEED_NOW)
2. `pnpm dev` (or `pnpm build && pnpm start` for stable QA)
3. Open http://localhost:3000
4. Click a film → pick a date + format → open a showtime → select seats → checkout → confirm

### Pricing fields (API additions in Fase 1)

- `GET /api/showtimes` items now include `priceFrom: number` (COP, cheapest general seat)
- `GET /api/showtimes/:id/seats` items now include `price: number` (COP, per seat)
- `GET /api/showtimes/:id/seats` summary now includes `priceTable: { general, preferential, premium, wheelchair }` (COP)
- Pricing matrix: IMAX $32.000 / Premium $24.000 / 2D $18.000 × zone multiplier × Wednesday ×0.6, rounded to $500
