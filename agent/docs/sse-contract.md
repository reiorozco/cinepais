# SSE Contract — CinePaís Agent

## Endpoint

`POST /chat`

## Request

**Request body** (JSON):
```json
{
  "message": "¿Dónde veo La Odisea en IMAX este finde con 2 sillas juntas?",
  "sessionId": "user-session-abc123",
  "city": "Medellín"
}
```

`sessionId`: 1-128 characters. Shorter is better for memory efficiency.

`city`: optional, top-level, sibling of `message`/`sessionId`. On the wire it is either a JSON string
or the key is absent entirely — never `null`, never `""`. When present it anchors the search to that
city (the web widget sends the header's currently selected city automatically); the agent turns it
into `[contexto: ciudad seleccionada = Medellín]` prepended to the user turn. Validated server-side by
`sse.sanitize_city` (≤64 characters, letters only) — there is no client-side re-validation.

## Response

**Response**: `text/event-stream` (Server-Sent Events)

Each event follows the SSE format:
```
event: <event-type>
data: <json-payload>

```

---

### token

Emitted for each LLM token as the agent streams its response.

**Schema:**
```json
{
  "type": "token",
  "content": "string"
}
```

**Wire example:**
```
event: token
data: {"type": "token", "content": "Encontré"}

event: token
data: {"type": "token", "content": " una"}
```

---

### tool_call

Emitted when the agent invokes a cinema tool.

**Schema:**
```json
{
  "type": "tool_call",
  "tool": "string",
  "input": {}
}
```

**Wire example:**
```
event: tool_call
data: {"type": "tool_call", "tool": "recommend_best", "input": {"film_query": "La Odisea", "city": "Bogotá", "n": 2, "format": "IMAX"}}
```

---

### recommendation

Emitted ONCE per conversation turn when the `recommend_best` tool returns. The payload is built ONLY from the tool output — never from LLM text.

**Schema:**
```json
{
  "type": "recommendation",
  "outcome": "recommended | degraded | no_availability",
  "showtimeId": "string | null",
  "filmId": "string | null",
  "seatIds": ["area_row_col", "..."],
  "requestedN": 2,
  "siteName": "string | null",
  "city": "string | null",
  "businessDate": "YYYY-MM-DD | null",
  "time": "HH:MM | null",
  "formats": ["IMAX"],
  "priceFrom": "int | null",
  "qualityTier": "low | optimal | high | null",
  "reasoning": "string",
  "alternatives": ["<Alternative>", "..."]
}
```

**Outcome branch contract:**
- `recommended`: `showtimeId` non-null AND `len(seatIds) == requestedN`
- `degraded`: `showtimeId` non-null AND `1 <= len(seatIds) < requestedN`
- `no_availability`: `showtimeId` is null AND `seatIds == []` (alternatives SHOULD be populated)

**seatIds format**: verbatim `area_row_col` strings from the API (e.g., `"1_4_7"`). Pass these directly to `SelectionProvider` — no transformation needed.

**Wire example (recommended):**
```
event: recommendation
data: {"type": "recommendation", "outcome": "recommended", "showtimeId": "st-site-bog-3-imax-4-2245", "filmId": "film-01", "seatIds": ["1_4_7", "1_4_8"], "requestedN": 2, "siteName": "CinePaís Bogotá Norte", "city": "Bogotá", "businessDate": "2026-08-08", "time": "22:45", "formats": ["IMAX"], "priceFrom": 32000, "qualityTier": "optimal", "reasoning": "Encontré 2 sillas juntas en fila 4 (zona óptima) en CinePaís Bogotá Norte.", "alternatives": [{"showtimeId": "st-site-bog-1-imax-4-1900", "filmId": "film-01", "siteName": "CinePaís Bogotá Centro", "businessDate": "2026-08-08", "time": "19:00", "formats": ["IMAX"], "priceFrom": 32000, "qualityTier": "optimal", "reason": "horario alternativo"}]}
```

---

### Alternative payload

The `alternatives` array in `recommendation` events contains objects with this schema:

**Schema:**
```json
{
  "showtimeId": "string",
  "filmId": "string",
  "siteName": "string",
  "businessDate": "YYYY-MM-DD",
  "time": "HH:MM",
  "formats": ["IMAX"],
  "priceFrom": 32000,
  "qualityTier": "low | optimal | high | null",
  "reason": "string (Spanish)"
}
```

`qualityTier` is `null` when the entry has no ratable seats (soldout tradeoff entries — see below). Fase D must handle the null case.

**reason examples**: `"mejor calidad de silla"`, `"más económica"`, `"horario alternativo"`, `"otro formato disponible"`, `"disponible en otra ciudad"`, `"otra fecha disponible"`, `"esta función está agotada"`

### Widening (outcomes `no_availability` / `degraded`)

When the outcome is `no_availability` or `degraded` and fewer than 3 alternatives were found in the original candidate pool, the agent relaxes the query to keep offering options: hasta 3 intentos secuenciales de relajación (formato → ciudad → fechas); se detiene en el primer intento que produce ≥1 alternativa; un solo intento puede producir hasta 3.

Consequences for Fase D:
- Widening appends at most 3 entries. A soldout tradeoff entry may be appended on top of them (see below), so `alternatives` carries at most 3 widened entries + 1 soldout tradeoff.
- Showtimes already present in the original candidate pool are never re-added by widening, and widened entries are deduped by `showtimeId`.
- Because the loop stops at the first productive step, a `no_availability` payload may carry alternatives from only one relaxation dimension (e.g. only "otro formato disponible") even when other dimensions also had options.

### Soldout tradeoff entries

Whenever the queried candidate pool contains a soldout showtime that is **not** the primary `showtimeId`, one extra alternative is appended with:
- `qualityTier: null` (no ratable seats)
- `reason: "esta función está agotada"`

**This is outcome-agnostic**: the entry surfaces on `recommended`, `degraded` AND `no_availability` alike — the queried function being sold out is worth telling the user about whether or not a primary recommendation was found. It is skipped only when the pool holds no soldout showtime, or when the soldout showtime IS the primary result.

On `no_availability` / `degraded` the tradeoff is appended **after** widening, so the payload still carries at least one actionable non-soldout option next to the informational entry. This is the one entry allowed past the widening cap of 3.

**Dedupe rule — the tradeoff wins**: if an alternative for that same `showtimeId` was already present (the scorer emits soldout candidates as ordinary `"horario alternativo"` entries), it is REMOVED and replaced by the soldout tradeoff entry. Each `showtimeId` therefore appears at most once in `alternatives`, and for a soldout showtime it is always the honest `qualityTier: null` / `"esta función está agotada"` version.

Fase D should render soldout alternatives as disabled/informational (e.g., greyed out with a "Agotada" badge) on every outcome — including `no_availability`, where the actionable widened entries remain clickable alongside it.

---

### done

Emitted once at the end of the stream.

**Schema:**
```json
{
  "type": "done",
  "sessionQueriesUsed": 3,
  "sessionQueryCap": 20
}
```

**Wire example:**
```
event: done
data: {"type": "done", "sessionQueriesUsed": 3, "sessionQueryCap": 20}
```

---

### error

Emitted when an error occurs. The stream closes after this event.

**Schema:**
```json
{
  "type": "error",
  "code": "string",
  "message": "string (Spanish)"
}
```

**Wire example:**
```
event: error
data: {"type": "error", "code": "rate_limit_exceeded", "message": "Has superado el límite de solicitudes. Intenta de nuevo en un momento."}
```

---

## Event ordering

### Tool turns (when `recommend_best` is called)
```
event: tool_call       ← agent invokes the tool
event: recommendation  ← tool result parsed into structured payload
event: token           ← agent narrates (may be absent on tool-only turns)
event: done
```

**Important for Fase D**: `token` events may be absent on tool-only turns — render the recommendation card without waiting for preceding text.

### Non-tool turns (conversational responses)
```
event: token  ← agent streams its response
event: done
```

Both patterns are valid. Fase D must handle BOTH.

---

## Latency

- **Non-tool turns**: typically 1-5s
- **Tool turns with `recommend_best`**: 5-45s depending on query breadth (parallel seat fetches bounded at 8 concurrent; at ~10ms per seat fetch, a 6-showtime query runs the seat-fetch phase in ~10ms)
- **Timeout**: the agent enforces 45s per `recommend_best` call, 10s for other tools; a `timeout` error event is emitted if exceeded

---

## Error codes

| code | When emitted | message (Spanish) |
|---|---|---|
| `rate_limit_exceeded` | >10 req/min per IP | "Has superado el límite..." |
| `session_cap_exceeded` | >20 queries/session (resets after 1h) | "Has alcanzado el límite..." |
| `input_too_long` | message > 2000 chars | "El mensaje es demasiado largo..." |
| `empty_message` | message is blank/whitespace | "El mensaje no puede estar vacío." |
| `empty_reply` | agent produced only thinking parts, no text | "No pude generar una respuesta..." |
| `too_broad` | date range >1 day with no film or city | "Especifica una película o ciudad..." |
| `bad_date_range` | unrecognized date_range format | "YYYY-MM-DD, YYYY-MM-DD..YYYY-MM-DD, hoy\|mañana\|finde\|semana" |
| `timeout` | tool call exceeded timeout | "La consulta tardó demasiado..." |
| `agent_unavailable` | agent failed to initialize | "El agente no está disponible..." |
| `internal_error` | unexpected exception | "Ocurrió un error interno..." |

---

## SelectionProvider handoff note

When the `recommendation` event arrives with `outcome: "recommended"` or `"degraded"`:

1. Extract `seatIds` — these are verbatim `area_row_col` strings (e.g., `"1_4_7"`)
2. Pass them directly to `SelectionProvider` to pre-select seats on the seat map
3. Display inline fields without a second API call: `siteName`, `city`, `businessDate`, `time`, `formats`, `priceFrom`, `qualityTier`
4. Show `alternatives` as clickable options — each has enough data to render "Bogotá Norte · 22:45 · $32.000"

For `outcome: "no_availability"`, show `alternatives` as the primary options.
