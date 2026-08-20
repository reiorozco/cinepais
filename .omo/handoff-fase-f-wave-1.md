# Handoff — Fase F (`cinepais-phase-5-refinement`), Ola 1 CERRADA

**Branch:** `phase-5-refinement` (cut from `main`, **not pushed**)
**Wave:** 1 of 5 — *Recommendation quality and prompt discipline* (agent only, zero LLM spend)
**Todos:** 1–6 complete. **Next: Wave 2, Todos 7–14 — in a FRESH chat.**
**Closed:** 2026-08-20 (UTC)
**Commit:** `fix(agent): recommend centred seats, constrain response formatting, accept the user's city`

---

## 1. What shipped

Three decisions landed, all inside `agent/` — **no web code was touched in this wave.**

### D2 — "Best seats" now means the centre of the *room* (Todos 2 + 3)

`agent/src/cinepais_agent/seating.py` · `find_adjacent` sort key:

```python
# BEFORE
(-_TIER_PREF[...], group[0].row, group[0].col)          # tier DESC, row ASC, col ASC
# AFTER
(-_TIER_PREF.get(tier, 0), horizontal_distance, vertical_distance, row, first_col)
```

- `horizontal_distance = abs((first_col + last_col) / 2 - room_centre_col)`
  where `room_centre_col = (1 + cols) / 2` via `_room_centre_col(layout_key)` — the **ROOM** centre,
  read from `ROOM_LAYOUTS`, never hardcoded.
- `vertical_distance = abs(row - band_centre_rows.get(tier, float(row)))`
  where `_band_centre_rows(seats)` = `(min_row + max_row) / 2` per `qualityTier`, derived from the
  rows **present in the `seats` argument** (all callers pass sold + available, so the bounds do not
  drift with occupancy).
- Lexicographic, **not** a weighted sum, so two executors cannot produce different orderings.

Old behaviour returned IMAX columns **1–2** — the front-left corner. It now returns the centre block.

**Verified runtime constants** (never written as literals in tests — always derived):

| Room | dims | blocks | room centre | band centres (full room, fixed cutoffs) |
|---|---|---|---|---|
| IMAX | 13×20 | `[(1,5),(6,15),(16,20)]` | **10.5** | low 2.0 · optimal 6.0 · high 11.0 |
| 2D | 12×15 | `[(1,4),(5,11),(12,15)]` | **8.0** | low 2.0 · optimal 6.0 · high 10.5 |
| Premium | 9×10 | `[(1,10)]` — **one block** | **5.5** | low 2.0 · optimal 6.0 · **high 9.0** |

The **rejected** block-centre formulation is recorded in the plan (Todo 2) — it re-creates the very
bug this wave fixes. `test_room_centre_beats_block_centre_when_centre_block_is_nearly_sold_out`
is the single test that discriminates the two; an empty room does **not**:

```
SHIPPED  (room-centre)  order: [[6,7], [4,5], [1,2]]
REJECTED (block-centre) order: [[1,2], [4,5], [6,7]]   <- fully inverted
```

### D1 (agent half) — prompt formatting discipline (Todo 4)

`agent/src/cinepais_agent/prompts.py` · §"Estilo de respuesta", **one hunk**, 45 → 53 lines.

- Allowed: plain prose, `**negrita**`, `- ` bullets. Forbidden: `#` headings, tables, `---` rules,
  code fences, emoji.
- Three lines that told the model to **restate what the card already renders** were rewritten:
  line 41 (cinema/hora/precio/calidad), lines 42–43 (the alternatives template), line 44 (`reasoning`).
  `recommendation-card.tsx:138-323` renders all of it. Prose now carries judgement; the card carries data.
- Lines 1–39 are **byte-for-byte identical** (sha256 `556a50c369f3…` before and after) — every
  behavioural rule (Spanish, scope refusal, never invent data, max 4 seats, never discourage the sale,
  accessibility seats) survived untouched.
- `grep -c "SENTINEL"` → **6** before, **6** after (matches Todo 1's baseline).
  `grep -c "Máximo 4 sillas"` → **1**.

⚠️ **Formatting compliance is NOT assertable without spending LLM budget.** It is verified live in
**Todo 25** and recorded as an *observation*, never an assertion.

### F2 (agent half) — the agent accepts the user's city (Todo 5)

- `main.py` · `ChatRequest` gains `city: str | None = None` (deliberately **unconstrained at the
  Pydantic layer** — see D5.1 in `decisions.md`: a `max_length` would 422 the whole request and break
  chat once Wave 3's web app starts sending the field).
- `sse.py` · new public surface: `MAX_CITY_CHARS` (64) · `CITY_CONTEXT_PREFIX` ·
  `sanitize_city(city) -> str | None` · `build_user_content(message, city) -> str` ·
  `stream_agent(..., city: str | None = None)`.
- The city travels on the **user turn**, not the system prompt:
  `[contexto: ciudad seleccionada = Medellín]\n¿Dónde veo La Odisea?`
  (`SYSTEM_PROMPT` is a module-level f-string bound once in `build_agent()` — there is no per-request
  prompt hook, and a `{city}` placeholder would break at import.)
- Validation hardened **beyond** the plan's sketch, on purpose (D5.2):
  ```python
  _CITY_PATTERN = re.compile(r"[A-Za-zÀ-ÖØ-öø-ÿ]+(?: [A-Za-zÀ-ÖØ-öø-ÿ]+)*")
  ```
  literal space (never `\s`), `fullmatch` (never `^...$`), `À-ÖØ-öø-ÿ` (carves out `×`/`÷`).
  The plan's literal sketch **would have admitted newline injection** — the exact hole the todo exists
  to close (OWASP LLM01).
- **Backwards compatible:** no `city` (or an invalid one) returns the message **byte-identical**, so
  the currently deployed web app is bit-for-bit unaffected until Wave 3.
- `mcp_widening.py` **not modified** — `git diff --name-only` on it is empty, as required.

---

## 2. Files in this commit

| File | +/- | Todo |
|---|---|---|
| `agent/src/cinepais_agent/seating.py` | +76 / −3 | 2 |
| `agent/src/cinepais_agent/prompts.py` | +23 / −4 | 4, 5 |
| `agent/src/cinepais_agent/sse.py` | +56 / −2 | 5 |
| `agent/src/cinepais_agent/main.py` | +6 / −1 | 5 |
| `agent/tests/test_seating.py` | +313 / −62 | 3 |
| `agent/tests/test_scoring.py` | +2 / −3 | 3 |
| `agent/tests/test_city_context.py` | **new**, 176 lines | 5 |
| `.omo/plans/cinepais-phase-5-refinement.md` | new (728 lines) | 1 |
| `.omo/drafts/cinepais-phase-5-refinement.md` | new (223 lines) | 1 |
| `.omo/plans/cinepais-phase-4-deploy.md` | +17 | 1 |
| `.omo/handoff-fase-f-wave-1.md` | this file | 6 |

**Test count: 16 → 25 in `test_seating.py` (net +9).** Full non-eval suite **149 → 158**.
One retirement, recorded not silent: `test_tier_boundaries_match_proportional_code` (which asserted
`row_to_tier(3, 13) == "optimal"`) encoded a rule with **zero production call sites**. Replaced by
`test_fixed_cutoff_tiers_match_production_seed`. The `row_to_tier` import went with it, so
**`row_to_tier` now has zero test coverage — Todo 26 deletes it.**

---

## 3. The gate — measured, in order, never overlapping

| # | Step | Exit | Measurement |
|---|---|---|---|
| a | `uv run ruff check .` | **0** | `All checks passed!` |
| a | `uv run basedpyright` | **0** | `0 errors, 0 warnings, 0 notes` |
| a | `uv run pytest tests/ -m "not evals" -q` | **0** | **158 passed, 1 skipped, 15 deselected** in 10.73 s |
| b | `pnpm lint` | **0** | eslint, no findings |
| c | `npx tsc --noEmit` | **0** | no output |
| d | `pnpm test` (detached) | **0** | **11 files / 136 tests**, 190.01 s (191 s wall) ⚠️ *wiped the catalogue* |
| e | `bash web/scripts/reseed.sh` | **0** | **672 showtimes / 119 280 seats**, **35 s wall**, window `2026-08-20 → 2026-08-26` |
| f | `curl …/api/showtimes?filmId=film-01` | **0** | **non-empty**, 10 210 bytes |
| g | `pnpm build` | **0** | ~10 s, 10/10 static pages, `/` prerendered **after** the re-seed |

Step (f) actual output, first 200 bytes:

```json
[{"id":"st-site-med-3-premium-1-1400","filmId":"film-01","siteId":"site-med-3","siteName":"CinePaís Envigado","city":"Medellín","businessDate":"2026-08-21","time":"14:00","room":"premium","formats":
```

**`pnpm test` took 190 s, not the ~558 s recorded historically, and the re-seed 35 s, not the ~70 s the
README quotes.** Nothing hung, nothing was retried, no diagnostic ladder was entered. Likely cause of
the speed-up: nothing else was contending for Neon — `lsof` confirmed **no dev server on :3000 and
nothing on :8000** before launch, and the dev server was stopped again before `pnpm build`. Keep doing
that: contention, not the seed itself, is what stalled a Fase E re-seed for 10+ hours.

**The order is the whole point.** `web/src/app/page.tsx` is a Server Component with no
`dynamic`/`revalidate`, so `next build` statically prerenders it against the database. Building
between (d) and (e) would have baked an empty homepage into the output. (d)→(e)→(f) is one unit.

---

## 4. LLM budget

**0 `/chat` calls this wave. Cumulative 0 of 4.** The 15 `evals` tests are deselected by
`-m "not evals"` precisely because they spend real money. No
`.omo/evidence/llm-spend-cinepais-phase-5-refinement.txt` exists yet — correct, nothing to log.

---

## 5. Deviations

**None.** Every gate step ran in order, once, exit 0. No retry, no ladder, no wall-clock lost to
looping. The commit is a **single** commit by explicit plan mandate (Todo 6's Accept requires
`git log --oneline main..HEAD --invert-grep --grep='^chore(omo)' | wc -l` → `1`), which overrides the
default atomic-commit preference — recorded here so it is a decision, not an oversight.

---

## 6. Traps the next worker will hit

1. **🔴 There is exactly ONE Neon database.** `DATABASE_URL_UNPOOLED` sha256 → `ec264e7be82e` for both
   dev and prod. Dev **is** production. Every `pnpm test` and every seed hits the live demo.
   Wave 2 does this repeatedly and on purpose.
2. **🔴 `prisma migrate dev` is BANNED** (Todo 8). It needs a shadow database, targets *this* database,
   and on drift offers to **reset** — i.e. drop the demo. Use `--create-only` to author the SQL, review
   it, then apply with `migrate deploy`. Only `migrate deploy` has ever run against this database.
3. **Never `pnpm build` between the test run and the re-seed.** See §3.
4. **Quality tiers are FIXED cutoffs, not proportional.** `row ≤ 3 → low`, `row ≥ 9 → high`, else
   `optimal` — from `web/prisma/seed.ts:179-213` `getSeatMeta()` (its `_maxRow` param is
   underscore-prefixed because it is deliberately unused).
   `web/src/lib/business/quality.ts` `rowToTier()` is **dead code** (`grep -rn "rowToTier" web/` → 1 hit,
   its own definition). Premium is where they diverge hardest: fixed leaves **row 9 alone** in `high`;
   proportional would say rows 6–9. An IMAX-only test suite never catches it.
5. **The orphan rule runs upstream of ranking.** Do not assert "the most central run always wins" —
   2D n=4: `[6,7,8,9]` is 0.5 from centre 8.0 and would win, but it strands col 5 in block (5,11) and is
   filtered out. Assert the **surviving order**.
6. **2D centre is 8.0, an integer**, but an n=2 midpoint is always a half-column, so the best achievable
   distance is **0.5, not 0**. Assert `<= 1`, never `== 0`.
7. **`SYSTEM_PROMPT` is an f-string** — never introduce a literal `{` or `}` into prompt copy.
   `ruff` line-length is **100** with `E` selected; new prompt lines need `\` source continuations.
8. **Todo 4 owns §"Estilo de respuesta"; Todo 5 added §"La ciudad del usuario"** between
   §"Cómo usar tus herramientas" and §"Estilo de respuesta". Keep future additions out of each other's
   sections.
9. **`test_service.py` / `test_sse_stream.py`'s `["1_4_7","1_4_8"]` are parsing/transport fixtures**, read
   and confirmed — `find_adjacent` never runs there (the agent is a `MagicMock`). They pass under any
   ranking. Verdict recorded so nobody re-investigates.
10. **Planted scenarios are keyed by `(site, room, day)` + `slotIdx`** and are fragile under
    `pickFourSlots()`. Todo 10 re-keys them; Todo 12 recalibrates them against the new occupancy.

---

## 7. Repo state at handoff

- Branch `phase-5-refinement`, **one** non-`chore(omo)` commit ahead of `main`.
- `git status --porcelain` → **empty**.
- `git ls-remote --heads origin phase-5-refinement | wc -l` → **`0`** — nothing pushed. Deliberate.
- Live demo **restored and verified**: 672 showtimes, window `2026-08-20 → 2026-08-26`.
- Receipt: `.omo/evidence/wave-1-closed-cinepais-phase-5-refinement.txt` — Todo 7 asserts it exists
  and STOPs if it does not.

---

## 8. Literal next step

Open a **NEW chat** and paste:

```
/start-work cinepais-phase-5-refinement
```

Wave 2 = **Todos 7–14** — *Data layer: film status (D4), realistic occupancy (D3), scenario integrity*.
It touches the live database from its first todo. Todo 7 re-confirms the database hash
(expect **`ec264e7be82e`**) and starts the dev server; it does **not** re-open the shared-database
question, which Fase E already answered in writing.
