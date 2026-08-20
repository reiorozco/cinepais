# Handoff — Fase F, Ola 4 (Todos 19–21)

Branch `phase-5-refinement`, fourth commit. Web-only wave: no file under `agent/` was touched, and no
test was authored — `pnpm test` still reports **166/166**, byte-identical to Wave 3.

This is the **Impeccable UX pass**, and it is the last wave before Wave 5 touches production. Waves 1–3
changed what the app *knows* (centred seats, `Film.status`, real occupancy, Markdown, city plumbing).
This one changed what a visitor *sees* — specifically, what a visitor arriving **from a phone, from
LinkedIn** sees in the first screenful, which is the traffic this portfolio project actually expects.

---

## 1. The audit (Todo 19) — 14/20, and the weak dimension was not the one we assumed

The `impeccable` skill audited the app as a first-time mobile visitor at **390 × 844**, corroborated at
**1440 × 900**. Result:

| Dimension | Score | What decided it |
|---|---|---|
| Accessibility | 2/4 | 24 px seat targets, 3.19:1 placeholder, 3.23:1 card meta, a broken `aria-controls` |
| Performance | 4/4 | Server Components, `priority` scoped to the LCP poster, nothing animating layout properties, 0 console errors |
| **Responsive design** | **1/4** | **The seat map is desktop-first** — see below |
| Theming | 3/4 | A complete, consistently used OKLCH token system; one dead `.dark` block |
| Anti-patterns | 4/4 | No AI tells — PASS |
| **Total** | **14/20** | Good, but hollow in exactly the place the demo lives |

**Responsive at 1/4 is the finding of the wave.** The seat map is the densest screen in the product and
the one the demo video shows, and on a phone it was measurably broken:

- **0 of 260 seats** appeared in the first mobile viewport. The first seat sat at document offset
  **896 px** against **721 px** of usable first screen (844 minus the 123 px fixed bottom bar). A visitor
  landing on the seat map saw a poster and some metadata, and had to scroll to discover there *was* a
  seat map.
- Horizontally, **130 of 260** seats were reachable without scrolling and the scroller opened at
  `scrollLeft: 0` — `scrollWidth 652` vs `clientWidth 294`, **358 px hidden**, and the hidden half was
  the **centre block**, i.e. precisely the seats Wave 1 taught the agent to recommend.
- Every one of the 260 seats was a **24 × 24 px** tap target. Maximum zoom (1.25×) reached 30 px.
  WCAG 2.5.5 asks for 44.

**31 findings, all 31 in scope** — 0 P0 blocking, **9 P1**, **15 P2**, **7 P3**. Four further items were
recorded as explicitly out of scope (O-01 a global 44 px target sweep through shadcn's `button` size
scale; O-02 replacing the hand-rolled carousel/seat map with a library — a new dependency; O-03
predictive orphan feedback, a behaviour redesign; O-04 real posters instead of `placehold.co`), and four
suspected issues were verified and dismissed rather than filed.

**Zero LLM spend, triple-confirmed.** Two states could not be reached without paying — the daily-cap
state (needs `DAILY_REQUEST_CAP=40` exhausted) and the rate-limit cooldown (needs ≥ 11 requests/minute
against `limiter.limit("10/minute")`). Both were recorded as **`[code-path]`: not visually audited,
reviewed by code path**, then exercised from a locally-fulfilled SSE `error` frame using Todo 15's
fixture-replay technique. The proof that nothing was spent is structural (the agent was never running —
`curl :8000/health` refused), enforced (a Playwright route guard aborting `**/chat`, `localhost:8000/**`
and `**://*.fly.dev/**`), and measured (a session-wide `page.on('request')` listener reporting
`chatAttemptCount: 0`, `chatAttempts: []`).

22 screenshots under `.omo/evidence/task19-shots/` and `task20-shots/`, paired before/after at both
viewports. Fixed elements were captured with non-`fullPage` `-viewport` shots and corroborated by
`getBoundingClientRect()` and `elementsFromPoint()` geometry, because a full-page screenshot lies about
anything `position: fixed`.

---

## 2. What shipped (Todo 20) — all 31 in-scope findings, 17 files

### The mobile-fit cluster — the seat map now has seats in it

`seat-map.tsx` and `showtimes/[id]/page.tsx` were compacted for mobile: the poster is hidden below `sm:`,
secondary metadata fields become `sr-only` (still announced, no longer occupying 200 px of the first
screen), and vertical spacing tightens.

| Measure (390 × 844) | Before | After |
|---|---|---|
| Seats visible in the first screen | **0** | **20** (3 rows, cols 7–14) |
| First seat document offset | 896 px | **610 px** |
| Scroller `scrollLeft` on mount | 0 | **251 px** — the exact centre of 502 px of scrollable width |
| Columns visible | the left half | **cols 6–15 of 1–20** — the centre block |
| Seat tap target | 24 × 24 | **32 × 32** (`sm:` keeps 24 × 24) |

The horizontal fix is the one that matters for the demo's coherence: the agent recommends centre seats
(Wave 1, D2), and until this wave the phone opened the seat map looking at the wall. An `EdgeFade`
signals the remaining horizontal overflow rather than leaving it silent.

**F-03 was fixed by raising the base size, not by extending the zoom range,** and the rejected route is
worth carrying forward: `transform: scale()` does **not** grow a scroll container's `scrollWidth`, so
zooming past ~1.25× paints the outer columns outside the scroller with no way to scroll to them. That is
recorded as a new, pre-existing finding **N-01** — not fixed here, not caused here.

### Selection now survives a refresh

`selection-provider.tsx` persists `{ showtimeId, seatIds[] }` to **`sessionStorage` under
`cinepais.selection`** (matching the existing `cinepais.*` convention). A `hydrate` effect reads it on
mount and re-validates it against the business rules before restoring — a restored selection cannot
resurrect an orphan or a 5-seat basket. A `hydrated` flag gates the `/checkout` guard, because React
commits child effects before parent ones and the guard would otherwise fire on the empty initial state
and bounce the visitor home before the restore landed. `SelectionClearer` wipes the key on confirmation.

Before this, refreshing on `/checkout` silently destroyed the selection and dumped the visitor on the
homepage. The end-to-end re-check below exercises exactly that path.

**`web/src/app/checkout/layout.tsx` is new (23 lines) and exists for one reason:** `checkout/page.tsx`
is a `"use client"` component, and a client component **cannot export `metadata`** in the App Router. A
segment layout is the only mechanism available. It returns `children` unchanged and carries nothing but
the title. `/checkout/confirmation` is a Server Component and overrides it with its own
("Boletas confirmadas").

### The copilot's first impression

`copilot-widget.tsx:227` gained `if (messages.length === 0) return;` inside the auto-scroll effect. The
effect is deliberately dependency-array-free so it runs every render; the guard stops it scrolling a
panel that has nothing to scroll to. On open, the welcome message, the avatar and the first suggestion
chip were being pushed out of view — **157 px hidden on mobile, 104 px on desktop**. Measured after:
`body.scrollTop` 173 → **0** on mobile, 104 → **0** on desktop, with `welcomeVisible` and
`firstChipVisible` both flipping false → true.

The daily-cap state (`DAILY_CAP_CODE` + a `dailyCapped` flag in `use-copilot-chat.ts`) now disables the
composer instead of rendering as an ordinary retryable error, and pressing Enter during a rate-limit
cooldown is no longer a silent no-op — the placeholder says what is happening.

### Contrast and targets

| Element | Before | After | Cause removed |
|---|---|---|---|
| Copilot composer placeholder | **3.19:1** | **6.16:1** | `placeholder:text-white/35` → `/55` |
| Film-card metadata (`R · 122 min`) | **3.23:1** | **4.74:1** | dropped the `/80` opacity modifier |
| Date-chip month label (`AGO`) | **4.36:1** | **7.34:1** | `text-muted-foreground` → `text-foreground/70` |

Sold seats were rendering ghost numbers at **1.48:1** — a `text-transparent` intent defeated by a child
span hardcoding `text-white/85`. Fixed.

Touch targets raised to 44 px across the primary CTAs (`151.7 × 32` → `255 × 44`), the copilot close
(28 × 28 → 44 × 44) and send (36 × 36 → 44 × 44), the hero dots (8 × 8 → 24 × 32, active 40 × 32) and
arrows (36 × 36 → 44 × 44), both tab rows (24–25 px → 44 px), the footer links and social icons, the
header nav link, and the confirmation screen's forward action, which was a **127.5 × 20** text link and
is now a **180 × 44** button. The city selector gained `min-w-24 sm:min-w-32` and stopped truncating
**"Bogotá"** to **"Bog"** (67.5 px → 96 px).

### Honesty fixes

`hero-carousel.tsx` hardcoded the badge **"Estreno"** on every slide, ignoring `film.status` — the
column Wave 2 added and Wave 3 wired into the tabs. It now reads
`STATUS_BADGE[film.status].label`, exported from `film-card.tsx` so there is exactly one map, not two.
Cartelera → "Estreno", Pronto → "Pronto", Preventa → "Preventa";
`everyBadgeMatchesStatus: true` holds by construction. Only `.label` is reused — `.variant` encodes
light-surface styling that is meaningless over a photographic backdrop.

The hero also stopped sourcing from `films.slice(0, 3)` over an unfiltered, title-sorted list. Position 3
was a `preventa` film and position 4 a `pronto` one, so a re-seed could have promoted a film with zero
showtimes into the hero. It now filters to `cartelera`. The `h1` "Cartelera" was contradicting the
section it labelled — that section holds all three tabs — and became **"Películas"**; hero slide titles
dropped from `h2` to `p`, fixing a heading order measured as `2,2,2,1,3,3,3,3,3,3`.

`aria-controls="hero-scroller"` had been pointing at an id that did not exist (the scroller carried a
`data-testid`, not an `id`). The id now exists.

### Dead code

**33 lines deleted** from `globals.css` — the entire `.dark { … }` block (lines 101–133). Nothing applies
the `dark` class; there is no `ThemeProvider` anywhere in the repo. It was deleted rather than wired,
because adding a theme switcher is a product change and explicitly out of scope. `@custom-variant dark`
on line 5 was **kept deliberately**: shadcn's vendored primitives still emit `dark:` utilities that must
compile, and removing it breaks the build.

### Files touched (17)

```
web/src/app/checkout/confirmation/page.tsx      F-19, F-20
web/src/app/checkout/layout.tsx        (NEW)    F-19
web/src/app/checkout/page.tsx                   F-06, F-07, F-19
web/src/app/page.tsx                            F-14, F-26
web/src/app/showtimes/[id]/page.tsx             F-01, F-19
web/src/components/copilot/copilot-widget.tsx   F-04, F-08, F-15, F-18, F-29
web/src/components/copilot/use-copilot-chat.ts  F-18
web/src/components/films/film-card.tsx          F-09, F-13
web/src/components/films/showtimes-explorer.tsx F-27, F-28
web/src/components/home/hero-carousel.tsx       F-10, F-11, F-12, F-13, F-25
web/src/components/layout/city-selector.tsx     F-05
web/src/components/layout/footer.tsx            F-23
web/src/components/layout/header.tsx            F-05, F-24
web/src/components/providers/selection-provider.tsx  F-06, F-31
web/src/components/seats/seat-map.tsx           F-01, F-02, F-03, F-07, F-16, F-17, F-31
web/src/components/ui/tabs.tsx                  F-21, F-22
web/src/styles/globals.css                      F-30
```

543 insertions, 162 deletions. **No file outside Todo 19's list was touched.**

---

## 3. The gate (Todo 21) — every step exit 0

Full receipt with verbatim output: `.omo/evidence/wave-4-closed-cinepais-phase-5-refinement.txt`.

| Step | Command | Exit | Note |
|---|---|---|---|
| (a1) | `uv run ruff check .` | **0** | All checks passed! |
| (a2) | `uv run basedpyright` | **0** | 0 errors, 0 warnings, 0 notes |
| (a3) | `uv run pytest tests/ -m "not evals" -q` | **0** | 159 passed, 15 deselected in 11.38s |
| (b) | `pnpm lint` | **0** | eslint, no findings |
| (c) | `npx tsc --noEmit` | **0** | clean |
| (d) | `pnpm test` (detached) | **0** | 13 files, **166/166**, 396.95 s |
| (e) | `bash web/scripts/reseed.sh` (detached) | **0** | 74 s — baseline ≈ 73 s |
| (f) | `curl .../api/showtimes?filmId=film-01` | **0** | **non-empty, 87 showtimes** |
| (g) | `pnpm build` | **0** | 10/10 static pages, all 12 routes |

(d) and (e) were launched detached with exit-code files and polled — one attempt each, no blind retry,
both far inside the 15-minute ceiling. `pnpm build` was **not** run between them; the dev server was
stopped for (g) and relaunched after (up in 2 s, `GET /` → **HTTP 200**).

### The catalogue check, quoted

```
[{"id":"st-site-med-1-2d-2-0-1400","filmId":"film-01","siteId":"site-med-1","siteName":"CinePaís El Poblado","city":"Medellín","businessDate":"2026-08-21","time":"14:00","room":"2d-2","formats":["2D
```

`BYTES=19127 · ARRAY_LENGTH=87 · IS_NON_EMPTY_ARRAY=true`

### The fresh occupancy check

Re-seed produced `businessDate range: 2026-08-21 -> 2026-08-27 (7 days)`, **672 showtimes**,
**119 280 seats**. Sampled across the new window:

```
2026-08-21 (vie) 14:00 2D       Medellín  sold   76/ 180 =  42.2%
2026-08-22 (sáb) 17:00 2D       Bogotá    sold   91/ 180 =  50.6%
2026-08-23 (dom) 22:45 2D       Bogotá    sold   49/ 180 =  27.2%
2026-08-25 (mar) 17:00 2D       Bogotá    sold   35/ 180 =  19.4%
2026-08-27 (jue) 22:45 Premium  Medellín  sold    7/  90 =   7.8%

spread: 7.8% .. 50.6%   — none at 0%, none at 100%
```

D3 holds after a clean data run: occupancy varies by timeslot and weekday, Saturday prime time is the
fullest, a Thursday late Premium show the emptiest. This is also what proves the seat-map rework renders
against **real mixed occupancy**, not against a conveniently empty room.

**One process note.** The first occupancy probe used lowercase `"sold"`/`"available"` and reported 0%
everywhere. The API returns capitalised `"Sold"`/`"Available"`. It was diagnosed by dumping the raw
payload — nothing was re-run blindly and nothing was re-seeded twice.

### End-to-end purchase flow, re-verified after the changes

Mobile 390 × 844: `/` → Pronto/Preventa tabs → `/films/film-01` → IMAX →
`/showtimes/st-site-bog-2-imax-0-1700` → select A8 + A9 → bar reads `SILLAS (2/4) · A8, A9 · TOTAL
$ 64.000` → `/checkout` → **`page.reload()` — still on `/checkout`, total intact, both rows present** →
confirm → order `CP-4W0N8P`, storage cleared → "Volver a la cartelera" → `/`. The loop closes.

Business rules unchanged: orphan seat `1_5_18` still refused with its Spanish toast and the count stays
0; the 4-seat maximum still reads `(n/4)`; pricing still formats `$ 64.000` with the es-CO NBSP; the
wheelchair dialog path was not touched. **0 console errors** on every route.

### Dependencies — still none

`git diff main -- web/package.json` shows exactly four additions, all inside **`devDependencies`**, all
of them Wave 3's D6 set: `@testing-library/dom`, `@testing-library/react`, `@vitejs/plugin-react`,
`jsdom`. The **`dependencies` block is byte-identical to `main`**. Wave 4's own contribution is **zero** —
`git diff HEAD -- web/package.json web/pnpm-lock.yaml` was empty before the commit. A UX pass that adds
no package is the point of D1.

---

## 4. Carried forward — findings recorded, not fixed

Neither is a regression; both are pre-existing and both are written down so Wave 5 does not rediscover
them as if they were new.

- **N-01** — seat-map zoom above ~1.25× paints seats outside the reachable scroll area, because
  `transform: scale()` does not grow `scrollWidth`. This is why F-03 was fixed by raising the base target
  size instead of extending `ZOOM_LEVELS`.
- **N-02** — the copilot launcher still overlaps ~2 seats on `/showtimes/*`. F-16 was about the *legend*,
  and the legend now has right-padding that clears the launcher; the seat overlap is a separate,
  pre-existing item.

Out of scope and untouched by instruction: **O-01–O-04**, 0 of 4. The four verified-and-dismissed items
were not re-litigated.

Also unchanged and still true from Wave 2's handoff: `scoring_helpers.py:43` remains frozen this phase.
Now that occupancy genuinely spreads from ~8% to ~51% sold, its `5 · availability_ratio` term has become
a live discriminator among same-tier showtimes, so **the agent will systematically prefer the emptiest
one**. Todo 25 asks for that to be *recorded as a measurement*, not fixed here.

---

## 5. State at the end of this wave

- Branch `phase-5-refinement`, **4 commits** ahead of `main`, nothing pushed.
- Working tree clean; `.omo/evidence/`, `notepads/`, `run-continuation/` and `boulder.json` remain
  git-ignored and have never reached `main`.
- The local database holds a fresh **2026-08-21 → 2026-08-27** window; the demo is **left working**.
- **LLM spend: 0 `/chat` calls this wave, 0 of 4 for the phase.** No spend ledger file exists yet,
  because nothing has been spent.
- Dev server left running on `:3000`. The agent is **not** running on `:8000` and does not need to be.

---

## 6. 🔴 What Wave 5 is, and why it is different

Wave 5 is **Todos 22–27**, and it breaks every comfortable assumption the previous four waves ran on.

1. **Todo 22** — merge to `main`, verify Fase E's publication curation survived the merge
   (`git log --oneline main -- '.omo/evidence/*' … | wc -l` → `0`), point `DATABASE_URL_UNPOOLED`
   **explicitly at production** via `vercel env pull .env.production.local --environment=production`,
   run `prisma migrate deploy` (expect **`No pending migrations to apply`** — Wave 2 already applied it,
   because there is one database), and only **then** push.
2. **Todo 23** — re-seed **production**. The single riskiest operation in the phase: `seed.ts:349-356`
   deletes the whole catalogue across ~24 unbatched `createMany` calls with **no transaction**. This is
   the exact operation that stalled at ~seat 110 000 in Fase E and cost 10+ hours. If it exceeds 15
   minutes, **walk the diagnostic ladder — do not relaunch.** The script's own failure message tells you
   to re-run it. **Ignore the script; the plan wins.** Healthy baseline ≈ 73 s (74 s measured today).
3. **Todo 24** — redeploy both halves; confirm the Fly cost controls are untouched.
4. **Todo 25** — **the only todo in the phase that spends money.** 2 live `POST /chat` calls.
5. **Todo 26** — documentation truth pass, including killing the proportional-row-tier lie in three
   places (`quality.ts`, `seating.py:66`, and `seating.py`'s module docstring, which is false and is the
   most persuasive statement of the error in the repo).
6. **Todo 27** — Wave 5 close + phase handoff.

**WAVE 5 IS THE ONLY WAVE THAT TOUCHES PRODUCTION DELIBERATELY, AND THE ONLY ONE THAT SPENDS MONEY —
2 LIVE `POST /chat` CALLS IN TODO 25, WHICH MUST BE ANNOUNCED TO THE USER BEFORE THEY ARE MADE.**

Todo 22's precondition asserts `.omo/evidence/wave-4-closed-cinepais-phase-5-refinement.txt` exists.
It does. Wave 5 opens against a populated database and a working demo — which is the entire reason
rule 3 makes the re-seed mandatory at every gate.
