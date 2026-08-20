# Fase F — final handoff (phase `cinepais-phase-5-refinement`)

**Status: implementation complete.** All 27 todos across 5 waves are done, merged to `main`, pushed,
deployed, and proven live. Only the Final Verification Wave (F1–F5) and one human step — recording the
demo video — remain.

- **Branch:** everything merged into `main`; `phase-5-refinement` retained, as are all six phase branches.
- **Live:** <https://cinepais.vercel.app> (200) · <https://cinepais-agent.fly.dev/health> (200, `{"status":"ok"}`)
- **LLM spend for the whole phase: 2 of the 4-call ceiling.**
- **Deviations across the phase: 3, all recorded below, none silently absorbed.**

---

## 1. What this phase was for

Fase E left a deployed but *hollow* demo: the copilot recommended front-left-corner seats, every room was
empty, the catalogue tabs guessed a film's status from its id suffix, the copilot's Markdown rendered as
raw asterisks, and the README described a seat-quality rule the code did not implement. This phase made
the shipped product match the story told about it — and made the demo video worth recording.

---

## 2. What shipped, wave by wave

| Wave | Todos | Commit | Subject |
|---|---|---|---|
| 1 | 1–6 | `6c9f424` | `fix(agent): recommend centred seats, constrain response formatting, accept the user's city` |
| 2 | 7–14 | `dbd3f9a` | `feat(web): film status, realistic seeded occupancy, and scenario integrity` |
| 3 | 15–18 | `50fc3cf` | `feat(web): render copilot markdown, send the selected city, wire the catalogue tabs` |
| 4 | 19–21 | `77e6029` | `style(web): UX polish pass within the existing design language` |
| 5 | 22–27 | *this commit* | `docs: demo script, API contract, and seat-quality documentation` |

### Wave 1 — recommendation quality and prompt discipline

- **D2 "best seats" = room centre.** `agent/src/cinepais_agent/seating.py` `find_adjacent` sort key
  rewritten to lexicographic `(-tier, horizontal, vertical, row, col)`, where
  `horizontal = abs((first_col + last_col)/2 - (1 + cols)/2)`.
  Room centres: **IMAX 10.5 · 2D 8.0 · Premium 5.5**. Band centres: low 2.0 · optimal 6.0 ·
  high 11.0/10.5/9.0 by layout.
  Old behaviour returned IMAX columns **1–2** (front-left corner); it now returns the centre block.
  The discriminating test shows shipped order `[[6,7], [4,5], [1,2]]` against the rejected
  `[[1,2], [4,5], [6,7]]` — fully inverted.
- **D1 agent half.** `prompts.py` §"Estilo de respuesta" 45 → 53 lines. Allowed: prose, `**negrita**`,
  `- ` bullets. Forbidden: headings, tables, rules, code fences, emoji. Lines 1–39 byte-identical
  (sha256 `556a50c369f3…`).
- **F2 agent half.** `ChatRequest.city: str | None = None`; `sse.py` gains `MAX_CITY_CHARS = 64`,
  `sanitize_city()`, `build_user_content()`. City travels on the **user turn** as
  `[contexto: ciudad seleccionada = Medellín]`, never in the system prompt.
- **Tests:** `test_seating.py` 16 → 25; full non-eval agent suite 149 → **158**.
  One retirement: `test_tier_boundaries_match_proportional_code` (asserted `row_to_tier(3, 13) == "optimal"`,
  zero production call sites), replaced by `test_fixed_cutoff_tiers_match_production_seed`.

### Wave 2 — the data layer

- **D4 `Film.status` is a real column.** Migration `20260820041341_add_film_status` (5 lines) applied to
  the shared Neon database with `migrate deploy` — `prisma migrate dev` was **banned** and never run.
  `DEFAULT 'cartelera'` is load-bearing (Postgres cannot add a `NOT NULL` column without a default to a
  populated table).
  Status comes from a **fixed lookup table keyed by film id, never the PRNG** — one extra `rand()` call
  would shift every downstream showtime→film assignment.
  Live distribution: `cartelera` film-01…06 (87 · 89 · 108 · 104 · 117 · 110 showtimes) ·
  `pronto` film-07, film-08 (**0 each**, which is what `pronto` means) ·
  `preventa` film-09, film-10 (19 · 38, all in the last two days of the window).
- **D3 realistic occupancy.** Before this wave, `computeSeatStatus()` returned `Available` for every seat
  when no scenario applied — **99.4% of rooms were completely empty**. Now sold seats cluster from the
  centre outward as a function of weekday × time band.
  Measured spread (available fraction, 668 normal showtimes):
  **min 25.0% · median 70.7% · max 96.7% · 217 distinct values**, digest `82d624ac273850de`.
  Read as *sold*: busiest 75.0%, median 29.3%, quietest 3.3%.
  Three floors hold: `optimal-band <15% available: 0` · `100% sold: 0` · `100% empty: 0`.
  The busiest room of each layout sits at exactly **16.0%** optimal-band availability.
- **Scenario integrity.** `scenarioFor()` re-keyed off `SCENARIO_ANCHORS` by `(site, room, dayIndex, HHmm)`
  instead of the drift-prone `slotIdx`. All four negative controls report **0/668** normal showtimes
  wrongly passing.
- **Determinism tests un-faked.** `seed-determinism.test.ts` had been finding two scenarios *positionally*;
  the `front-only` lookup resolved to a **normal** showtime, so the suite passed while testing nothing.
  Ids are now literals in `SCENARIO_IDS`. Assertions strengthened, **zero deleted**.
  Web tests 136 → **140**.

### Wave 3 — rendering, city awareness, tabs

- **D1 web half.** `markdown-lite.tsx` (166 lines, new) renders exactly the subset Wave 1's prompt
  constrains, returning **React elements, never an HTML string**.
  `grep -rl "dangerouslySetInnerHTML" web/src --exclude-dir=generated | wc -l` → **0**.
  Streaming-safe: bold requires its closing `**`, so a half-arrived `**Cine` renders literally and
  self-heals. 13 tests, including 5 hostile-input cases.
  **Four devDependencies added, zero runtime dependencies** (D6): `jsdom`, `@testing-library/react`,
  `@testing-library/dom`, `@vitejs/plugin-react` (pinned `^4.7.0` — v6 needs vite ^8).
- **F2 web half.** `useOptionalCity()` (non-throwing) lets the widget live outside `CityProvider`.
  `buildChatRequestBody()` **omits the key entirely** rather than sending `null`. 13 tests, two of which
  parse the real body through the agent's own Pydantic model offline.
- **D4 consumer.** `badgeForFilmId()` (which parsed `id.slice(-2)`) **deleted**; replaced by a total
  `Record<Film["status"], …>` map, so a fourth status becomes a compile error rather than a silent
  missing badge. `page.tsx` collapsed three hand-written `<TabsContent>` blocks into one `FILM_TABS` array.
  Receipts: `grep -rl "badgeForFilmId" web/src … | wc -l` → **0**; same for `slice(-2)`.
  Tabs verified disjoint against a clean seed: cartelera 6 · pronto 2 · preventa 2, union = full catalogue.
  Web tests 140 → **166** (+13 markdown-lite, +13 copilot-city; none removed).

### Wave 4 — the Impeccable UX pass

- **Audit scored 14/20**, with **Responsive at 1/4** — the finding. On a 390×844 phone the seat map,
  the densest screen and the one the demo video shows, was measurably broken:
  **0 of 260 seats** appeared in the first viewport (first seat at document offset **896 px** against
  **721 px** usable); horizontally only **130 of 260** were reachable and the hidden half was the
  **centre block** — exactly the seats Wave 1 had just taught the agent to recommend.
  Every seat was a **24 × 24 px** tap target.
- **31 findings, all 31 fixed** (0 P0 · 9 P1 · 15 P2 · 7 P3) across **17 files**, 543 insertions /
  162 deletions. Four items explicitly left out of scope (O-01…O-04).
- After: seats in first screen **0 → 20**; first seat offset **896 → 610 px**; scroller opens at
  `scrollLeft: 251` — the exact centre of the 502 px scrollable width; tap targets **24 → 32 px**
  on mobile.
- Contrast repaired: copilot placeholder **3.19 → 6.16:1**, film-card meta **3.23 → 4.74:1**,
  date-chip month **4.36 → 7.34:1**, sold-seat ghost numbers **1.48:1** fixed. Primary CTAs
  `151.7 × 32` → `255 × 44`.
- Selection now survives a refresh via `sessionStorage` (`cinepais.selection`), re-validated against the
  business rules on hydrate so a restored basket cannot resurrect an orphan or a 5-seat selection.
- Honesty fixes: the hero carousel had hardcoded the badge **"Estreno"** on every slide and sourced from
  an unfiltered `films.slice(0, 3)` — position 3 was a `preventa` film and position 4 a `pronto` one, so a
  re-seed could have promoted a film with zero showtimes into the hero. Now filtered to `cartelera` and
  reading `STATUS_BADGE[film.status]`.
- **33 lines of dead `.dark { … }` CSS deleted** (no `ThemeProvider` exists anywhere).
  `@custom-variant dark` kept deliberately — shadcn primitives still emit `dark:` utilities that must compile.
- **Zero packages added this wave**: `git diff HEAD -- web/package.json web/pnpm-lock.yaml` was empty.

### Wave 5 — production, live proof, and the truth pass

- **Todo 22** — merged to `main`, curation verified, `migrate deploy` reported **`No pending migrations
  to apply`** (Wave 2 had already applied it; one database), then pushed.
- **Todo 23** — production re-seeded. The single riskiest operation of the phase: `seed.ts` deletes the
  whole catalogue across ~24 unbatched `createMany` calls with **no transaction** — the exact operation
  that stalled in Fase E and cost 10+ hours. It completed normally.
- **Todo 24** — both halves redeployed; Fly cost controls (`min_machines_running = 0`, `hard_limit = 5`)
  confirmed untouched.
- **Todo 25** — the only money spent in the phase. See §4.
- **Todo 26** — documentation truth pass. See §5.
- **Todo 27** — this close.

---

## 3. Key measurements (the ones worth quoting)

### Wave 5 close — the standard gate, all seven steps

| Step | Command | Exit | Measured |
|---|---|---|---|
| 0 | unset + `rm web/.env.production.local` + hash | 0 | hash `ec264e7be82e` via `.env.local` |
| (a) | `uv run ruff check .` | **0** | All checks passed! |
| (a) | `uv run basedpyright` | **0** | 0 errors, 0 warnings, 0 notes |
| (a) | `uv run pytest -m "not evals" -q` | **0** | **158 passed, 1 skipped, 15 deselected**, 10.65 s |
| (b) | `pnpm lint` | **0** | clean |
| (c) | `npx tsc --noEmit` | **0** | clean |
| (d) | detached `pnpm test` | **0** | **13 files / 166 tests**, **452.16 s** |
| (e) | `bash web/scripts/reseed.sh` | **0** | **90 s** · 672 showtimes · 119 280 seats · `2026-08-21 → 2026-08-27` |
| (f) | `curl` **deployed** `…/api/showtimes?filmId=film-01` | **0** | **non-empty**, 87 showtimes, 19 127 bytes |
| (g) | `pnpm build` | **0** | 10/10 static pages, 12 routes, `/` prerendered after the re-seed |

Re-seed timings across the phase: **W1 35 s · W2 49 s · W3 84 s · W4 74 s · W5 90 s.** All far inside the
15-minute ceiling; the Fase E stall signature never recurred.

`pnpm test` durations: **W1 191 s · W2 238 s · W3 445 s · W4 397 s · W5 452 s.** The variance is the three
in-test re-seeds contending with Neon, not a regression.

### Occupancy spread (the headline data change)

```
showtimes=672  normal=668
Available=81317  Sold=37963
per-showtime availability digest (sha256/16) = 82d624ac273850de

min    = 25.0% available   (75.0% sold — the busiest room)
median = 70.7% available   (29.3% sold)
max    = 96.7% available   ( 3.3% sold — the quietest room)
distinct values = 217
```

**Always state which `SEED_NOW` produced an occupancy figure.** Occupancy is a function of weekday, and
`reseed.sh` recomputes `SEED_NOW` as *tomorrow*, so the window slides. Todo 10 measured
`26.5 / 70.0 / 96.7`, digest `733aba55f6c8f573`, 208 distinct at `SEED_NOW=2026-08-20`; the figures above
are `SEED_NOW=2026-08-21`. That is **not** a determinism failure — determinism is
*same `SEED` + same `SEED_NOW` ⇒ same database*, and the three in-test re-seeds (all pinned to
`2026-08-01`) passed.
Corollary: **day indices are stable, weekdays are not. Never assert a weekday in a test.**

### The four planted scenarios (ids are literals on purpose)

| Scenario | Showtime id | Measured |
|---|---|---|
| `soldout` | `st-site-med-1-imax-0-1930` | `availableCount = 0/260` |
| `front-only` | `st-site-med-2-imax-1-2100` | `40/260`, non-`low` tier = **0** |
| `optimal` | `st-site-med-2-imax-2-1700` | optimal band **100/100 (100.0%)** vs normal max 94.0% |
| `no-adjacent` | `st-site-bog-1-2d-1-3-2100` | `96/180`, adjacent available pairs = **0** |

Negative controls: **0/668** normal showtimes wrongly pass any of the four.

### Live copilot behaviour (Todo 25 — the money shots)

| # | Query | Result |
|---|---|---|
| 1 | IMAX / Bogotá / 2 seats / evening — the user's original failing query, verbatim | showtime `st-site-bog-3-imax-4-2245`, seats `1_7_10, 1_7_11` (**G10, G11**) — **distance 0.0 from room centre**, city anchored correctly, room **95.0% available** |
| 2 | 2D / Medellín / 3 seats / weekend afternoon, fresh session | showtime `st-site-med-3-2d-1-2-2245`, seats `1_6_9, 1_6_10, 1_6_11` (**F9, F10, F11**), city anchored correctly, room **75.6% available** |

Both returned 200 (~28 s and ~31 s, warm). The HITL CTA was confirmed working end-to-end.

Call 1's seats landing at **distance 0.0** is the direct, live proof that Wave 1's D2 change worked: the
same shaped query previously returned the front-left corner.

### Cold-start and cost baselines (carried forward from Fase E, still true)

- First `/chat` after idle: **~9.5 s** to first byte, **~25 s** to finish streaming. Warm: **~180 ms** to
  first byte. Idle window before Fly stops the machine: **~2 to ~9 minutes** (Fly sweeps on a periodic
  tick, not a per-machine countdown).
- Fly upcoming invoice measured at **$0.01** with the agent live, held there by
  `min_machines_running = 0`. Bounded worst case if scale-to-zero ever broke: ~USD 2/month.

---

## 4. LLM spend — exact, with reproduction

**Phase total: 2 live `POST /chat` calls, against a ceiling of 4.** Both in Todo 25, both announced to
the user beforehand, both HTTP 200. Waves 1–4 and Todos 22–24, 26, 27 spent **zero**.

Ledger: `.omo/evidence/llm-spend-cinepais-phase-5-refinement.txt` (2 lines, one per call).

```
2026-08-20T08:10:53Z | todo-25 | POST /chat | cinepais-agent.fly.dev | WARM | q1 … city=Bogotá
  | 200 | ~28s | outcome=recommended
  | showtime=st-site-bog-3-imax-4-2245 seats=1_7_10,1_7_11 (G10,G11)
2026-08-20T08:16:27Z | todo-25 | POST /chat | cinepais-agent.fly.dev | WARM | q2 … city=Medellín
  | 200 | ~31s | outcome=recommended
  | showtime=st-site-med-3-2d-1-2-2245 seats=1_6_9,1_6_10,1_6_11 (F9,F10,F11)
```

Reproduction command for call 1 — **note that running it spends a call**:

```bash
curl -sN -X POST 'https://cinepais-agent.fly.dev/chat' \
  -H 'content-type: application/json' \
  -d '{"message":"Me quiero ver La Odisea en una sala IMAX, dos puestos, en un horario de noche.","sessionId":"demo-1","city":"Bogotá"}'
```

Waves 1–4 achieved zero spend without weakening their proofs: Todo 15 used Playwright
`page.route('**/chat')` with a canned SSE body; Todo 16 parsed request bodies through the agent's real
Pydantic model offline; Todo 19 proved zero spend three ways — structurally (agent not running,
`curl :8000/health` refused), by enforcement (route guard aborting `**/chat`, `localhost:8000/**`,
`**://*.fly.dev/**`), and by measurement (`chatAttemptCount: 0`).

---

## 5. The row-tier correction (worth its own section)

The repository asserted a **proportional** seat-quality rule in three places. All three were wrong, and
all three are now gone.

The shipped truth: `web/prisma/seed.ts:179-213` `getSeatMeta()` uses **fixed cutoffs** —
rows 1–3 `low`, rows 4–8 `optimal`, rows 9+ `high` — with `_maxRow` deliberately unused. The data does
**not** scale with room size.

Removed in Todo 26:

1. `web/src/lib/business/quality.ts` `rowToTier()` — **file deleted**. Dead code, zero call sites.
2. `agent/src/cinepais_agent/seating.py:66` `row_to_tier()` — its Python port, also zero production call
   sites, kept alive only by its own tests.
3. `seating.py`'s module docstring, which claimed *"The CODE is canonical … row 3/13 ≈ 0.2308 > 0.23, so
   row 3 is 'optimal', not 'low'."* — **false**, and the most persuasive statement of the error anywhere
   in the repo. The agent never computes tiers; it receives `seat.qualityTier` over the wire.

Both READMEs kept the fixed cutoffs (correct) and lost the "scaled proportionally" clause.

**The chain of error is worth remembering:** an exploration subagent reported the proportional rule as
canonical because it read `quality.ts` and never checked call sites; the planner accepted it; the adversarial
review caught it by grepping for callers. **Reading a function is not evidence that anything calls it.**

---

## 6. Deviations across the whole phase

Three, all recorded rather than absorbed. **Waves 1, 2, 3 and 4 each closed with zero deviations** — every
gate step ran in order, once, exit 0, with no retry and no diagnostic ladder entered.

1. **Todo 11 — the dev server was restarted, though the brief said not to stop it.**
   Unavoidable: the running process had a pre-`status` Prisma client cached in its module registry, and
   Prisma emits explicit column lists (never `SELECT *`), so `f.status` was `undefined` and every request
   returned HTTP 500 from Zod. Next.js recompiled the route but cannot evict an already-required module.
   Contained to **2 seconds** of downtime (04:50:43Z → 04:50:45Z), relaunched with an identical command and
   health-gated on the `/api/cities` **body**, not merely a 200.
   *Generalises to:* after any `prisma migrate` or `prisma generate`, restart the dev server before
   trusting an API response.
2. **Todo 19 — the `impeccable` skill's `PRODUCT.md` precondition was deliberately not satisfied.**
   `init` writes `PRODUCT.md`/`DESIGN.md` into the repo, and Todo 19's MUST-NOT list forbids touching
   product code. The repo's own committed context (`AGENTS.md`, `specs/001`, `specs/002`,
   `specs/design-reference/README.md`) was substituted — which is what the blocker exists to guarantee.
   The audit methodology itself was `reference/audit.md` verbatim, not improvised.
   Also noted, not acted on: the skill is one major version behind (installed **v3.8.0**, latest **v4.1.1**).
3. **Todo 27 — two handoff files written instead of one.** Todo 27 names
   `.omo/handoff-fase-f-final.md`; plan §Wave boundaries rule 5 requires every wave to write
   `.omo/handoff-fase-f-wave-<N>.md`, and **F1 checks that count is 5**. Only 4 existed. Writing only the
   `-final` file would have caused F1 to report a false breach — the exact failure Fase E suffered. Both
   files are committed.

Two things that are explicitly **not** deviations, recorded so F5 does not misfile them:

- **`web/package.json` gained four entries** — all under `devDependencies`, all the D6 set. The
  Must-NOT-Have bans the **`dependencies`** block, which is byte-identical to its pre-phase state.
- **Five `SEED_NOW: "2026-08-01"` literals remain** in `web/tests/seed-determinism.test.ts`. They are
  **pre-existing**; the determinism contract requires a fixed reference time. Scope-OUT bans
  *introducing* a hardcoded date, and this phase introduced none. They are also the reason `pnpm test`
  wipes the catalogue.

---

## 7. Findings logged for a future phase (deliberately NOT fixed)

- **Finding A — the scoring formula prefers emptier rooms.** `agent/.../scoring_helpers.py:43` carries a
  `5 · availability_ratio` term. It was inert when every room was empty; now that occupancy genuinely
  spreads (~3% to ~75% sold) it has become a live discriminator among same-tier showtimes, so the agent
  will systematically recommend the emptiest room. Visible in Todo 25 call 1, which chose a room at
  **95.0% available**. Frozen this phase by scope; recorded as a measurement, not a bug fixed in flight.
- **Finding B — `applyPreselect` can reject a legal multi-seat set.**
  `web/src/lib/business/selection.ts:183-220` folds seats **one at a time** through the orphan-checking
  reducer, so a 3-seat set that is only legal as a whole can be refused seat-by-seat. Found in Todo 25,
  not fixed.
- **N-01 — seat-map zoom above ~1.25× paints seats outside reachable scroll area.** `transform: scale()`
  does not grow a scroll container's `scrollWidth`. This is why F-03 was fixed by raising the base tap
  target instead of extending `ZOOM_LEVELS`.
- **N-02 — the copilot launcher still overlaps ~2 seats** on `/showtimes/*`. Pre-existing and separate
  from F-16, which was about the legend.
- **`getFilms(city)` silently drops every `pronto` film** — it filters on
  `{ showtimes: { some: { site: { city } } } }`, and a `pronto` film has zero showtimes by construction.
  `page.tsx` correctly calls `getFilms()` with **no argument**; adding a city filter to the homepage would
  empty the Pronto tab with no error.
- **Out of scope and untouched (0 of 4):** O-01 global 44 px target sweep through shadcn's `button` size
  scale · O-02 replacing the hand-rolled carousel/seat map with a library · O-03 predictive orphan
  feedback · O-04 real posters instead of `placehold.co`.

---

## 8. Traps a future worker must not re-discover

1. **🔴 There is exactly ONE Neon database — dev *is* production.** `DATABASE_URL_UNPOOLED` sha256
   → `ec264e7be82e` for both. Any `pnpm test` wipes the live catalogue; **(d) → (e) → (f) is one unit**,
   and `pnpm build` must never run between (d) and (e), because `/` is statically prerendered from that data.
2. **🔴 `prisma migrate dev` is banned here.** Author SQL with `--create-only`, review it, apply with
   `migrate deploy`.
3. **🔴 `rm -f web/.env.production.local` when done with it.** Next.js loads `.env.$(NODE_ENV).local` at
   *highest* precedence, so leaving it behind silently repoints every future local production build.
   It is gitignored, so this is about precedence, not leakage.
4. **The re-seed is destructive and un-transactioned.** One attempt, 15-minute ceiling, diagnostic ladder.
   An empty catalogue is a **suspected stall**, not a reason to relaunch — and note that `reseed.sh`'s own
   failure message says to re-run it. Ignore the script; the plan wins.
5. **Never spend PRNG draws casually in `seed.ts`.** `rand` is shared between `pickFourSlots()` and the
   film draw; one extra `rand()` call silently rewrites the entire schedule.
6. **`film-01` and `film-02` are pinned `cartelera` by `SCENARIO_ANCHORS`.** Changing either deletes the
   planted scenarios.
7. **Scenario ids are literals on purpose — do not "improve" them into queries.** Both previous indirect
   lookups resolved to the wrong row, and one made the suite pass while testing nothing.
8. **Never assert a weekday.** Anchors are day-*index* based (see §3).
9. **`SYSTEM_PROMPT` is an f-string** — never introduce a literal `{` or `}` into prompt copy. `ruff`
   line-length is 100 with `E` selected.
10. **Keep the six `web/scripts/*-check.ts` files.** They are the only way to re-prove the occupancy floors
    and scenario distinguishability after any future re-seed. `occupancy-check.ts` runs the generator in
    memory with no database; `occupancy-db-check.ts` reads the live one.
11. **`@vitejs/plugin-react` must stay on `^4.x`** — v6 requires vite ^8, which the Vitest 2 line does not
    carry. Do not let a lockfile refresh float it.
12. **`markdown-lite.tsx`'s comments deliberately avoid naming the forbidden prop.** An earlier draft
    mentioned it in prose and broke the grep that proves it is never used. Keep the guard measuring code,
    not commentary.
13. **The demo catalogue spans 7 days and goes stale on its own.** `GET /api/showtimes` returning `[]` is a
    *correct* answer for a stale seed, not a bug. Refresh weekly with `bash web/scripts/reseed.sh`
    (~70–90 s). There is deliberately no cron: the seed is destructive and un-transactioned, and a job that
    died at 3am would leave the live database empty with nobody watching.

---

## 9. State at the moment of handoff

- **Branch `main`**, working tree clean, `origin/main..main` = 0.
- **Database:** freshly seeded, window `2026-08-21 → 2026-08-27`, 672 showtimes, 119 280 seats.
- **Deployed and verified live:** web 200, agent `/health` 200.
  `GET /api/showtimes?filmId=film-01` on production returns **87 showtimes** (19 127 bytes).
- **Publication curation intact:**
  `git log --oneline main -- '.omo/evidence/*' '.omo/run-continuation/*' '.omo/notepads/*' | wc -l` → **0**
  (positive control `.omo/plans/*` → 16).
- **All six phase branches intact**, no history rewritten.
- **Test totals:** web **166**, agent **158 passed + 1 skipped** (15 evals deselected, never run).
- **Spend:** 2 of 4 `/chat`.

---

## 10. The literal next step

**Record the demo video. It is now unblocked.**

Todo 26 removed the recording block from `specs/003-demo-script.md` and updated the script for the new
reality — centred seat recommendations, rooms with genuine partial occupancy, and three working catalogue
tabs. `specs/003-demo-script.md` is the shot list.

The site is live, seeded, and proven working end-to-end. Everything the video needed to stop
misrepresenting the product has shipped.

Before recording, note two things:

- The catalogue window closes **2026-08-27**. Re-seed before recording if that date has passed.
- The copilot's **first** question after an idle period pays a **~9.5 s** cold start. Send one throwaway
  warm-up question before rolling — but remember that costs a `/chat` call against whatever budget the
  next phase sets. This phase's ceiling does not carry over.

Running in parallel with the video, and separately from it: the **Final Verification Wave (F1–F5)** —
plan compliance audit, code quality review, security review, hands-on deployed QA (browsing only, zero
spend), and scope fidelity. That is the orchestrator's job, not the executor's.
