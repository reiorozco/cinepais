# CinePaís Agent

Cinema copilot for CinePaís — answers natural-language questions in Spanish about showtimes, seat availability, and recommendations. Built with LangGraph + FastMCP + FastAPI/SSE (MatchDay pattern).

## Architecture

```
User → POST /chat (SSE) → FastAPI → LangGraph agent → FastMCP stdio → 4 read tools → web API (:3000)
```

- **LangGraph agent**: tries `langchain.agents.create_agent` (langchain 1.x), falls back to `langgraph.prebuilt.create_react_agent`
- **MCP tools**: `search_showtimes`, `seat_availability`, `adjacent_seats`, `recommend_best` (stdio transport, mcp 1.29.0)
- **SSE stream**: `token` / `tool_call` / `recommendation` / `done` / `error` events (sse-starlette 3.4.8)
- **Recommendation payload**: built only from `recommend_best` tool output — never from LLM text

## Prerequisites

- Python 3.12 + [uv](https://docs.astral.sh/uv/)
- Web server running on `:3000` with `.env.local` from Fase B:
  ```bash
  cd web && vercel env pull .env.local --yes
  ```
- Database seeded (see Seed rule below)
- `GOOGLE_API_KEY` — Gemini API key

## Install

```bash
cd agent
uv sync
```

## Environment variables

Copy `.env.example` to `.env` and fill in:

| Variable | Default | Effect |
|---|---|---|
| `GOOGLE_API_KEY` | *(required)* | Gemini API key |
| `WEB_API_BASE_URL` | `http://localhost:3000` | Web read API base URL |
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed CORS origins — **comma-separated list**, whitespace trimmed, blank entries dropped (e.g. `http://localhost:3000,https://cinepais.vercel.app`). Vercel preview branches get their own domains, so production alone is not enough |
| `MAX_OUTPUT_TOKENS` | `1024` | Max LLM output tokens (Gemini hang guard) |
| `MAX_INPUT_CHARS` | `2000` | Max user message length |
| `SESSION_QUERY_CAP` | `20` | Per-session query limit (best-effort, single-process) |
| `DAILY_REQUEST_CAP` | `40` | Global budget of accepted `/chat` requests per **UTC** day, shared by every visitor. Sized against the ~USD 2.50 LLM credit: 40 × ~3.5 Gemini calls per request ≈ 140 generation calls. **Courtesy brake, not a hard ceiling** — the counter lives in this process, so it **resets on every cold start** (Fly scales to zero). The only real spend ceiling is the Google-side hard cap |
| `AGENT_MODEL_OVERRIDE` | `gemini-3.6-flash` | Pin a specific model. Shipped pinned in `.env.example` to the validated model; clear it to use runtime discovery |
| `LANGSMITH_TRACING` | *(empty)* | Set to `true` to enable LangSmith tracing |
| `LANGSMITH_API_KEY` | *(empty)* | LangSmith API key |
| `LANGSMITH_PROJECT` | `cinepais-agent` | LangSmith project name |

## Seed rule

The agent's evals require showtimes to be **strictly future** (not today). Seed with tomorrow's date as `SEED_NOW`:

```bash
# Get tomorrow's date (bare YYYY-MM-DD — seed.ts appends T00:00:00Z itself)
SEED_NOW=$(python3 -c "from datetime import date, timedelta; print((date.today() + timedelta(days=1)).strftime('%Y-%m-%d'))")

cd web
SEED=20260801 SEED_NOW=$SEED_NOW pnpm prisma db seed
```

**Why strictly future?** The web API applies a 15-minute cutoff — showtimes starting within 15 minutes of `now` are excluded. If `SEED_NOW` is today, some showtimes may fall within the cutoff window and disappear from results, breaking evals.

**TZ requirement**: The cutoff uses server-local time. Run evals with `TZ=America/Bogota` for reproducible behavior:
```bash
TZ=America/Bogota uv run pytest tests/evals -m evals -v
```

## Run

```bash
cd agent
uv run uvicorn cinepais_agent.main:app --port 8000
```

The agent initializes on startup (MCP server probe + model discovery). If `GOOGLE_API_KEY` is missing, the server starts but `/chat` returns an error event.

## Test

```bash
cd agent

# Unit tests (no API key needed)
uv run pytest tests/ -v --ignore=tests/evals

# Eval suite (requires GOOGLE_API_KEY + web server on :3000 with fresh seed)
TZ=America/Bogota uv run pytest tests/evals -m evals -v --timeout=120

# Security evals
TZ=America/Bogota uv run pytest tests/evals/test_security.py -m evals -v --timeout=60

# All non-eval tests
uv run pytest tests/ -m "not evals" -v
```

## SSE quick example

```bash
curl -sN -X POST http://localhost:8000/chat \
  -H 'content-type: application/json' \
  -d '{"message":"¿Dónde veo La Odisea en IMAX este finde con 2 sillas juntas?","sessionId":"demo-1"}'
```

Example stream:
```
event: tool_call
data: {"type":"tool_call","tool":"recommend_best","input":{"film_query":"La Odisea","format":"IMAX","n":2}}

event: recommendation
data: {"type":"recommendation","outcome":"recommended","showtimeId":"st-...","seatIds":["2_4_7","2_4_8"],...}

event: token
data: {"type":"token","content":"Encontré"}

event: done
data: {"type":"done","sessionQueriesUsed":1,"sessionQueryCap":20}
```

See [`docs/sse-contract.md`](docs/sse-contract.md) for the full event schema and Fase D integration guide.

## Security

- **Least-privilege tools**: the agent has only 4 read-only cinema tools — no email, browse, exec, or file access. Even if jailbroken, the damage ceiling is low (mock data, no PII).
- **Scope enforcement**: the system prompt restricts the agent to cinema/booking questions only; off-topic queries are politely refused and redirected.
- **Per-IP rate limit**: 10 requests/minute (slowapi 0.1.10 decorator-only — `SlowAPIMiddleware` is intentionally omitted as it breaks SSE streaming). Keyed off the `Fly-Client-IP` header (falls back to `get_remote_address` in local dev, where the header is absent) — behind Fly's proxy the socket peer is the edge, not the visitor, so the raw remote address would collapse every visitor into one bucket.
- **Input cap**: messages > 2000 characters are rejected with a Spanish error event.
- **Session query cap**: 20 queries/session (resets after 1 hour or restart — courtesy limit, not a hard cost control).
- **Global daily request cap**: `DAILY_REQUEST_CAP` (default 40) accepted `/chat` requests per UTC day across all visitors, checked after the empty-message and length guards so malformed input never spends budget, and before the session cap so rotating a client-chosen `sessionId` cannot buy a fresh allowance. Over the cap the agent answers with a `daily_cap_exceeded` error event in Spanish. **Courtesy brake, not a hard ceiling — the counter is in-process and resets on every cold start.**
- **Bounded tool output**: `search_showtimes` accepts all-optional filters, so a bare call would match the whole catalogue and be re-sent as input on every later LLM call in the turn. Results are capped at 40 with a `truncated: true` hint.
- **Bounded agent loop**: `recursion_limit=8` on the LangGraph agent, down from the library default of 25, so a tool-error retry loop cannot multiply the ~3.5 LLM calls per request.
- **CORS**: restricted to the origins listed in `CORS_ORIGIN` (comma-separated; default: `http://localhost:3000`). Only origins named there are allowed — the list is an allowlist, not a wildcard.
- **Max tokens**: `MAX_OUTPUT_TOKENS` caps LLM output (Gemini 3.x thinking-hang guard).
- **LangSmith tracing**: opt-in via env vars — disabled by default.
- **[MANUAL — USER]** Rotate `GOOGLE_API_KEY` in Google AI Studio as a precaution if a key prefix appeared in any logs. The agent cannot execute this step automatically.

## Cost controls

Real cost defenses (active by default):
- `MAX_OUTPUT_TOKENS=1024` — caps per-request LLM spend
- `MAX_INPUT_CHARS=2000` — prevents prompt-stuffing
- `DAILY_REQUEST_CAP=40` — global per-UTC-day request budget. **Read the caveat honestly: it is an in-process counter that resets on every cold start, so it bounds a single warm machine's day, not the bill.**
- `recursion_limit=8` — bounds LLM calls per request
- `search_showtimes` capped at 40 results — bounds tool output re-sent as LLM input
- Per-IP rate limit — slows abuse
- Model selection is pinned to `gemini-3.6-flash` — reliability over raw token price (see [Model fallback chain](#model-fallback-chain) for the cost tradeoff)

**Optional hard cap (manual step, recommended for production):**

Google Cloud Console → Billing → Budgets & alerts → **Spend Cap** (Public Preview):
1. Go to [console.cloud.google.com/billing](https://console.cloud.google.com/billing)
2. Select your billing account → Budgets & alerts → Create budget
3. Enable **Spend Cap** to hard-stop API calls when the budget is reached

This is a manual, optional step — the agent does not configure it automatically.

**Measured eval cost**: see `.omo/evidence/task-8-cinepais-phase-2-agent-fixes.md` for the actual token usage from the eval suite run (estimated — usage_metadata unavailable).

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Web server not reachable` | `cd web && pnpm dev` |
| `Seed is stale` | Re-seed with tomorrow's SEED_NOW (see Seed rule) |
| `No available Gemini model found` | Check `GOOGLE_API_KEY` in `agent/.env`; verify at [aistudio.google.com](https://aistudio.google.com) |
| `MCP server exposed N tools, expected 4` | `cd agent && uv run python -c "from cinepais_agent.mcp_server import mcp; import asyncio; print([t.name for t in asyncio.run(mcp.list_tools())])"` |
| Agent starts but `/chat` returns error | Check startup logs — `GOOGLE_API_KEY` missing or MCP probe failed |
| Rate limit 429 in evals | Wait 60s or use different `sessionId` per test |

## Model fallback chain

The agent discovers the best available Gemini model at startup:
1. `AGENT_MODEL_OVERRIDE` env var — **shipped pinned to `gemini-3.6-flash`** in `.env.example`, so the default configuration is the validated one
2. `google-genai` `models.list()` → first match from: `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-1.5-flash`, `gemini-3.5-flash-lite`
3. Fallback: `init_chat_model` invoke-per-candidate (short-circuits on first success)

The chosen model is logged at startup as `Using model: <id>` (or `Using AGENT_MODEL_OVERRIDE: <id>`) and recorded in eval evidence. `main.py` calls `logging.basicConfig(level=logging.INFO)` at import so these records survive under uvicorn, which otherwise configures only its own `uvicorn.*` loggers — that line is what makes "which model is this box running?" answerable from the Fly.io logs.

**Why 3.6 and not 3.5?** `gemini-3.6-flash` is the newest full Flash model and was validated end-to-end here (live `/chat` run emitting a `recommendation` event with the soldout tradeoff — `.omo/evidence/task-17-cinepais-phase-2-agent-fixes.md`). `gemini-3.5-flash` remains directly behind it as the previously proven fallback. Promoting a new model to the head of the chain requires its own E2E proof; presence in `models.list()` is not evidence that it calls tools.

**Why Flash and not Lite?** `gemini-3.5-flash-lite` broke tool-calling — it never called `recommend_best`, so no `recommendation` event was emitted (2/2 reproducible). It stays in the chain only as a last-resort tail entry. The 2.5 Lite variant was removed entirely: it appears in `models.list()` but every call returns 404, and step 2 would select it and return before step 3 could recover.

**Cost tradeoff.** Flash is roughly 5× Lite on output tokens. That is a deliberate reliability-over-cost choice: a copilot that does not call its tools has no value at any price. For a low-traffic portfolio demo the volume is expected to stay inside the Gemini free tier, and `MAX_OUTPUT_TOKENS` caps the per-request ceiling regardless. The real cost lever is removing the LLM from the hot path with a deterministic intent parser (Camino C) — parked for a future phase, not a Fase C concern.
