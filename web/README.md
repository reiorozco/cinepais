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
    "genres": ["Aventura", "Drama"]
  }
]
```

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
    "formats": ["IMAX"]
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
    "formats": ["IMAX"]
  },
  "seats": [
    {
      "seatId": "1_1_1",
      "row": 1,
      "col": 1,
      "area": 1,
      "status": "Available",
      "areaCategory": "general",
      "qualityTier": "low"
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
    }
  }
}
```

## Business rules encoded

- **Orphan rule** (`src/lib/business/orphan.ts`): selecting seats must not leave exactly 1 available seat isolated between sold/aisle/edge on both sides.
- **Cutoff rule** (`src/lib/business/cutoff.ts`): showtimes starting within 15 minutes of `now` are excluded from `/api/showtimes`.
- **Quality rule** (`src/lib/business/quality.ts`): rows 1–3 = `low`, rows 4–8 = `optimal`, rows 9+ = `high` (proportional for smaller rooms).

## Determinism

The seed uses `SEED` (PRNG seed) and `SEED_NOW` (reference time) env vars. Same values → same DB state on any machine.

```bash
SEED=20260801 SEED_NOW=2026-08-01T00:00:00-05:00 pnpm prisma db seed
```

## Stack

Next.js 16 + React 19 + Tailwind 4 + shadcn 2.3 new-york + Prisma 7.9 + @prisma/adapter-pg + Vitest 2
