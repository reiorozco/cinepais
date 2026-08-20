# Handoff — Fase F, Ola 3 (Todos 15–18)

Branch `phase-5-refinement`, third commit. Web-only wave: no file under `agent/` was touched.
Wave 1 shipped the agent half of D1 (the formatting constraint in `prompts.py`) and of F2 (`main.py`
accepting `city`); this wave ships the **web halves of both**, plus D4's consumer.

---

## 1. What shipped

### D1 web half — a dependency-free Markdown renderer (Todo 15)

`web/src/components/copilot/markdown-lite.tsx` (new, 166 lines) renders exactly the subset Wave 1's
prompt constrains the model to: **prose, `**negrita**`, and `- ` bullet lists**. Nothing else. Headings,
tables, horizontal rules, code fences and emoji are not parsed — they degrade to literal text rather than
being mangled or dropped.

The renderer returns **React elements**, never an HTML string. There is no `dangerouslySetInnerHTML`
anywhere in the component, and React's own child escaping is therefore the sanitiser — XSS is structurally
impossible rather than filtered. Measured on this branch:

```
grep -rl "dangerouslySetInnerHTML" web/src --exclude-dir=generated | wc -l   →   0
```

**Streaming safety** is the non-obvious part. The bold pattern `/\*\*([\s\S]+?)\*\*/g` requires a closing
`**`, so a half-arrived `**Cine` renders as the literal characters `**Cine` and *self-heals* into
`<strong>` the moment the closing marker streams in. The regex is constructed per call rather than held at
module scope, because a shared `/g` regex carries `lastIndex` between renders and would silently skip
matches on the second pass. Every prefix of a streamed message is asserted, not just the final string.

**13 tests** in `web/tests/markdown-lite.test.tsx`: 5 supported-subset, 3 streaming-safety, 5 hostile-input
(script injection, `img onerror`, unsupported table/heading/rule/fence, empty content).

**Four devDependencies were added** — `jsdom`, `@testing-library/react`, `@testing-library/dom`,
`@vitejs/plugin-react` — and **zero runtime dependencies**. This is D6, and it is the whole reason the XSS
test can exist: `vitest.config.ts` ran in the `node` environment with an `include` matching only `.ts`, so
before this wave no React component could be rendered in a test at all. `@vitejs/plugin-react` is pinned to
`^4.7.0` deliberately: the default resolution (6.1.0) requires vite ^8, which this Vitest 2 line does not
carry. `@testing-library/dom` is an explicit peer of `@testing-library/react@16` that pnpm's strict store
does not hoist for you.

`vitest.config.ts` keeps `environment: "node"` — the 11 pre-existing suites are faster without a DOM — and
the component suite opts in per-file with a `// @vitest-environment jsdom` docblock. Only `include` widened,
from `tests/**/*.test.ts` to `tests/**/*.test.{ts,tsx}`.

### F2 web half — the selected city reaches the agent (Todo 16)

The city the user picked in the header now travels to `POST /chat`, so the copilot stops assuming Bogotá.

`city-provider.tsx` gains an exported **`useOptionalCity(): CityContextValue | null`** — a non-throwing
read. `useCity()` now delegates to it and still throws, so no existing caller changed behaviour. The copilot
widget can live outside a `CityProvider` (it does, on some routes) without crashing the app.

`use-copilot-chat.ts` reads the city **at send time**, not at mount, so switching city mid-conversation
affects the next message. `client.ts` gains an exported `buildChatRequestBody()` which **omits the key
entirely** rather than sending `null`:

| Situation | Body actually sent |
|---|---|
| City selected | `{"message":"…","sessionId":"…","city":"Medellín"}` |
| No `CityProvider` above the hook | `{"message":"…","sessionId":"…"}` — key absent |
| Stored city is whitespace only | `{"message":"…","sessionId":"…"}` — key absent |
| `"  Bogotá  "` | `"city":"Bogotá"` — trimmed |

The "absent, not null" distinction is asserted rather than eyeballed: the tests check that the substrings
`city` and `null` appear in **none** of the five no-city bodies, so the body is byte-identical to
pre-Wave-1 behaviour and Pydantic on the agent side sees `city=None` down the untouched path.

**13 tests** in `web/tests/copilot-city.test.ts`: 2 happy, 1 UTF-8 survival (accented city name, no U+FFFD),
2 failure, 5 `buildChatRequestBody` unit cases, 1 key-order stability, 2 offline agent-conformance
integrations. The integration cases parse the real body through the agent's own `ChatRequest` model with no
network and no LLM call.

### D4 consumer — the three tabs read the real `Film.status` (Todo 17)

Wave 2 added the `Film.status` column, seeded it, and exposed it through both API projections, but left the
tabs still guessing from the film id. This wave removes the guess.

`film-card.tsx` **deletes `badgeForFilmId()`**, which parsed `id.slice(-2)` and mapped `01–06 → "Estreno"`,
`09–10 → "Preventa"`, `07–08 → null`. In its place is a total
`Record<Film["status"], { label, variant }>` map — so adding a fourth status value becomes a **compile
error in this file** instead of a card silently rendering with no badge.

`page.tsx` collapses three hand-written `<TabsContent>` blocks into one `FILM_TABS` array driving both the
triggers and the panels, filtering on a single field: `films.filter(f => f.status === tab.status)`. There is
no longer a second literal that can drift from the first. Each tab keeps its own Spanish `EmptyState` copy.
An LCP guard was added — `priority={tabIndex === 0 && index < 6}` — because Base UI mounts only the active
panel and marking all 10 posters high-priority would have fought the hero image.

Measured against the **freshly re-seeded** database in this gate:

```
total_films=10
  cartelera: 6  ["film-01","film-02","film-03","film-04","film-05","film-06"]
  pronto:    2  ["film-07","film-08"]
  preventa:  2  ["film-09","film-10"]
```

Disjoint, and the union is the full catalogue. Identical to Todo 17's screenshots — which is the point of
running the re-seed before the build: this is the first time the tab logic has been proven against a
catalogue produced by a *clean* seed run rather than the one it was developed against.

**Grep receipts:**

```
grep -rl "badgeForFilmId" web/src --exclude-dir=generated | wc -l   →   0
grep -rl "slice(-2)"      web/src --exclude-dir=generated | wc -l   →   0
```

---

## 2. Files in this commit

```
.omo/handoff-fase-f-wave-3.md                      (new — this file)
.omo/plans/cinepais-phase-5-refinement.md          (todo checkboxes 15–18)
web/package.json                                   (+4 devDependencies, 0 dependencies)
web/pnpm-lock.yaml
web/vitest.config.ts                               (include → .tsx, react plugin)
web/src/app/page.tsx                               (D4 — data-driven tabs)
web/src/components/copilot/copilot-widget.tsx      (D1 — renders MarkdownLite)
web/src/components/copilot/markdown-lite.tsx       (new — D1 renderer)
web/src/components/copilot/use-copilot-chat.ts     (F2 — reads city at send time)
web/src/components/films/film-card.tsx             (D4 — status→badge map)
web/src/components/providers/city-provider.tsx     (F2 — useOptionalCity)
web/src/lib/agent/client.ts                        (F2 — buildChatRequestBody)
web/tests/copilot-city.test.ts                     (new — 13 tests)
web/tests/markdown-lite.test.tsx                   (new — 13 tests)
```

---

## 3. The gate — measured, in order, never overlapping

Every step below ran in the literal order of the plan's §THE GATE. `(d)` and `(e)` were launched
**detached with exit-code files** and polled, never blocked on synchronously.

| Step | Command | Exit | Measured |
|---|---|---|---|
| (a1) | `uv run ruff check .` | **0** | `All checks passed!` |
| (a2) | `uv run basedpyright` | **0** | `0 errors, 0 warnings, 0 notes` |
| (a3) | `uv run pytest tests/ -m "not evals" -q` | **0** | `159 passed, 15 deselected in 11.26s` |
| (b) | `pnpm lint` | **0** | clean |
| (c) | `npx tsc --noEmit` | **0** | clean |
| (d) | `pnpm test` (detached) | **0** | `Test Files 13 passed (13)` · `Tests 166 passed (166)` · `445.39s` |
| — | catalogue immediately after (d) | — | **`[]`** — the wipe, as designed |
| (e) | `bash web/scripts/reseed.sh` (detached) | **0** | 84 s · 672 showtimes · 119 280 seats · `2026-08-21 → 2026-08-27` |
| (f) | `curl …/api/showtimes?filmId=film-01` | **0** | **non-empty**, 87 showtimes |
| (g) | `pnpm build` | **0** | `/ ○ (Static)` · 10/10 static pages in 1126 ms |

**Test count reconciles:** Wave 2 closed at 140 tests. 140 + 13 (markdown-lite) + 13 (copilot-city) = **166**.
No pre-existing test was deleted or weakened.

### (f) — the non-empty catalogue check, quoted verbatim

```
$ curl -s "http://localhost:3000/api/showtimes?filmId=film-01" | head -c 200
[{"id":"st-site-med-1-2d-2-0-1400","filmId":"film-01","siteId":"site-med-1","siteName":"CinePaís El Poblado","city":"Medellín","businessDate":"2026-08-21","time":"14:00","room":"2d-2","formats":["2D
```

`showtimes_for_film-01 = 87`, `non_empty = true`.

### (e) — the re-seed, quoted verbatim

```
reseed: OK — demo data refreshed.
  businessDate range: 2026-08-21 -> 2026-08-27  (7 days)
  showtimes:          672
  Refresh again in about a week, before 2026-08-27 falls into the past.
```

### (g) — the prerender was checked, not assumed

`/` is statically prerendered and now depends on `Film.status`, so a build over a wiped catalogue would
have produced an empty homepage that looked exactly like a Todo 17 bug. It was verified against
`.next/server/app/index.html` (108 101 bytes on disk), with `<script>` blocks stripped so the RSC flight
payload could not be mistaken for rendered DOM:

```
rendered DOM (scripts stripped)  = 57 775 bytes
tab triggers                     = ["Cartelera","Pronto","Preventa"]
film links in rendered DOM       = film-01 … film-06   (6 — cartelera only)
default tabpanel badges          = Estreno ×6, Pronto ×0, Preventa ×0
hero carousel badges             = Estreno ×3
EmptyState (role="status")       = false      ← catalogue non-empty at build time
"badgeForFilmId" in payload      = false
"slice(-2)" in payload           = false
dangerouslySetInnerHTML in DOM   = false
```

The dev server was **stopped before `pnpm build`** (Wave 1's gotcha — dev and build share `.next`) and
restarted afterwards, so the local demo is left running on :3000.

---

## 4. LLM budget

**0 `/chat` calls this wave. Cumulative: 0 of the 4-call ceiling.**

`.omo/evidence/llm-spend-cinepais-phase-5-refinement.txt` does not exist, which is the honest record: no
live call has been made in this phase. Todo 15's browser proof used Playwright
`page.route('**/chat')` to fulfil the widget's POST with a canned SSE body, and Todo 16's agent-conformance
tests parse the request body through the agent's Pydantic model **offline**. Both exercise the real code
path without a network request or a token.

Wave 5 is where the budget actually gets spent.

---

## 5. Deviations

**None.** Every gate step ran in the plan's literal order, `(d)→(e)→(f)` stayed a unit, `pnpm build` ran
only after the catalogue was confirmed non-empty, and no runtime dependency was added.

For the record, two things that are *not* deviations:

- `web/package.json` gained four entries, all under **`devDependencies`**. The Must-NOT-Have bans the
  **`dependencies`** block, and D6 explicitly permits these four. Verified with the plan's own command:
  `git diff main -- web/package.json` shows additions only inside `devDependencies`.
- `pnpm test` wiped the live catalogue at step (d). That is the documented, expected consequence of
  `seed-determinism.test.ts`'s fixed `SEED_NOW` (§Scope-OUT's qualifier), and step (e) is precisely the
  remedy the plan mandates for it.

---

## 6. Traps the next worker will hit

1. **`pnpm test` still empties the live database.** One database, dev *is* production (D5). Never run it
   without running `bash web/scripts/reseed.sh` straight after — and never run `pnpm build` between the two,
   because `/` is statically prerendered from that data.
2. **`getFilms(city)` silently drops every `pronto` film.** It filters on
   `{ showtimes: { some: { site: { city } } } }`, and a `pronto` film has zero showtimes by construction.
   `page.tsx` calls `getFilms()` with **no argument**, which is correct; a docblock comment now names the
   trap. Adding a city filter to the homepage would empty the Pronto tab without any error.
3. **The hero carousel is `films.slice(0, 3)` and is *not* status-filtered.** Today the first three
   title-sorted films happen to be cartelera, so it is correct by luck. A `pronto` film with an
   early-alphabet title would put a film nobody can buy into the hero. One-line fix, deliberately left
   outside Todo 17's scope — a candidate for the Impeccable pass.
4. **`@vitejs/plugin-react` must stay on `^4.x`.** Version 6 requires vite ^8; this project's Vitest 2 line
   does not carry it. Do not let a lockfile refresh float it.
5. **`markdown-lite.tsx`'s comments deliberately avoid spelling out the forbidden prop name.** An earlier
   draft mentioned it in prose and broke the `grep` that proves it is never used. Keep the guard measuring
   the code, not the commentary.
6. **`pronto` films now render a "Pronto" badge** where the old id-suffix hack rendered none. Intentional,
   but it is a visible change from every screenshot taken before Wave 3.

---

## 7. Repo state at handoff

- Branch `phase-5-refinement`, **3 commits ahead of `main`**, none of them `chore(omo)`.
- `git status --porcelain` — empty.
- Nothing pushed. `main` untouched.
- Local dev server running on `:3000` against a fresh catalogue (`2026-08-21 → 2026-08-27`).
- The agent is **not** running locally; nothing in this wave needs it.
- Deployed demo unaffected — this wave never touched Vercel or Fly.

---

## 8. Literal next step

**Ola 4, Todos 19–21.** Start it in a **fresh chat** — starting the next wave is the orchestrator's action,
never the executor's (§Wave boundaries rule 3).

```
/start-work cinepais-phase-5-refinement
```

Todo 19 must first assert that `.omo/evidence/wave-3-closed-cinepais-phase-5-refinement.txt` exists, and
STOP if it does not.
