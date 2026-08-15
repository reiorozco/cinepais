# CinePaís Agent SSE Fixtures

Real Server-Sent Events (SSE) captures from the CinePaís agent, used for testing the web UI's streaming response parser and recommendation display.

## Fixtures

### real-broad.txt

**Source:** `.omo/evidence/f3-fixes-r6-qa1.txt`

**Query:** "Sombras del Puente" in Medellín (broad search, single seat)

**Description:** Agent recommends a single seat for the film "Sombras del Puente" in Medellín. Demonstrates basic recommendation flow with one primary option and multiple alternatives.

**Event counts:**
- `tool_call`: 1
- `recommendation`: 1
- `token`: 11
- `done`: 1

---

### real-narrow-two-recommendations.txt

**Source:** `.omo/evidence/f3-fixes-r6-qa2.txt`

**Query:** "Sombras del Puente" in IMAX format on 2026-08-14, requesting 2 seats (narrow search with date/format constraints)

**Description:** Agent performs multiple tool calls to search showtimes, check seat availability, and recommend adjacent seats. Returns two recommendations: one for the same day (Premium format) and one for IMAX on a different date. Includes a ping event (server heartbeat).

**Event counts:**
- `tool_call`: 5
- `recommendation`: 2
- `token`: 12
- `done`: 1

---

### real-date-range.txt

**Source:** `.omo/evidence/f3-fixes-r6-qa3.txt`

**Query:** "Sombras del Puente" for the weekend ("finde") — date range search

**Description:** Agent recommends a single seat for the weekend. Demonstrates date-range filtering and returns one primary recommendation with multiple alternatives across different cities and formats.

**Event counts:**
- `tool_call`: 1
- `recommendation`: 1
- `token`: 9
- `done`: 1

---

### synthetic-tool-only-no-tokens.txt

**Source:** none — **SYNTHETIC**, authored for Todo 11. Not a captured agent run.

**Derived from:** `agent/docs/sse-contract.md` §Event ordering (tool turns), which states "`token` events may be absent on tool-only turns — render the recommendation card without waiting for preceding text". None of the three real captures above exercises that shape (all carry 9-12 `token` events), so it had to be authored.

**Description:** A tool turn that ends with a recommendation and **zero** `token` events. Payload fields follow §recommendation and §Alternative; the ids, site names and prices mirror the planted `front-only` seed scenario (La Odisea / film-01, site-med-2, imax, only rows 1-2 available) and the planted `soldout` scenario (`st-site-med-1-imax-0-1400`) for the sold-out alternative. Carries a leading `:`-prefixed SSE comment block naming itself synthetic, per the plan's fixture-labelling rule.

**Event counts:**
- `tool_call`: 1
- `recommendation`: 1
- `token`: 0
- `done`: 1

Used by `tests/copilot-chat.test.ts` (wire-shape assertion) and by the Todo 11 fixture-replay run, which asserts the copilot renders the card **without** an empty assistant text bubble.

---

### synthetic-no-availability.txt

**Source:** none — **SYNTHETIC**, authored for Todo 14. Not a captured agent run.

**Derived from:** `agent/docs/sse-contract.md` §recommendation (outcome branch contract: "`no_availability`: `showtimeId` is null AND `seatIds == []` (alternatives SHOULD be populated)"), §Widening (at most 3 widened entries) and §Soldout tradeoff entries (the `qualityTier: null` / `"esta función está agotada"` entry is outcome-agnostic and is the one entry allowed past the widening cap of 3). All four fixtures above carry `outcome: "recommended"` only — verified with `grep -o '"outcome":"[a-z_]*"' *.txt` — so this shape had to be authored.

**Description:** A `no_availability` turn: `showtimeId`, `filmId`, `siteName`, `city`, `businessDate`, `time`, `priceFrom` and `qualityTier` are all `null`, `seatIds` is `[]`, `formats` is `[]`. Carries the contract's worst-case alternatives payload — **3 actionable entries + 1 sold-out tradeoff** — so it also exercises "the layout must not break at 4". Every `showtimeId` is a real currently-seeded id (each resolves HTTP 200 on `GET /api/showtimes/<id>/seats`); `st-site-med-1-imax-0-1400` is the planted `soldout` scenario and really reports `summary.availableCount === 0`.

**Event counts:**
- `tool_call`: 1
- `recommendation`: 1 (`outcome: "no_availability"`)
- `token`: 3
- `done`: 1

---

### synthetic-error-midstream.txt

**Source:** none — **SYNTHETIC**, authored for Todo 14. Not a captured agent run.

**Derived from:** `agent/docs/sse-contract.md` §Error codes (the `timeout` row) and §error ("Emitted when an error occurs. The stream closes after this event."). The message is verbatim from `agent/src/cinepais_agent/sse.py:96-97`. No real capture contains an `error` frame (`grep -c '^event: error' *.txt` → 0 on all of them) and every real capture ends with `done`, so a stream that terminates on `error` with **no** trailing `done` had to be authored.

**Description:** A tool turn that streams two partial `token` frames and then fails: `tool_call` → `token` × 2 → `error` (`code: "timeout"`) → stream closes. There is deliberately **no** `done` event.

**Event counts:**
- `tool_call`: 1
- `token`: 2
- `error`: 1
- `done`: 0

---

### synthetic-tokens-only.txt

**Source:** none — **SYNTHETIC**, authored for Todo 14. Not a captured agent run.

**Derived from:** `agent/docs/sse-contract.md` §Event ordering → "Non-tool turns (conversational responses)", which documents `event: token` … `event: done` with no `tool_call` and no `recommendation`, and states "Both patterns are valid. Fase D must handle BOTH." Every other fixture in this directory carries at least one `tool_call` (`grep -c '^event: tool_call' *.txt`), so the pure conversational shape had to be authored.

**Description:** A conversational turn with prose only — no tool activity and no recommendation card.

**Event counts:**
- `token`: 4
- `done`: 1
- `tool_call`: 0
- `recommendation`: 0

---

## Wire Format

Each fixture is a verbatim SSE stream. Lines follow the Server-Sent Events specification:

```
event: <event-type>
data: <JSON-payload>

```

**Event types observed:**
- `tool_call`: Agent invokes a tool (search, seat check, recommendation)
- `recommendation`: Agent returns a structured recommendation object
- `token`: Streaming text token (part of the natural-language response)
- `done`: Stream termination with session metadata
- (ping): Server heartbeat (not prefixed with `event:`)

## Usage

These fixtures are used by the web UI's SSE parser tests to verify:
1. Correct parsing of event boundaries
2. Proper JSON deserialization of payloads
3. Streaming token accumulation and display
4. Recommendation extraction and rendering
5. Session state tracking (query cap, usage)
