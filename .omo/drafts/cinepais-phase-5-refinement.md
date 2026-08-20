---
slug: cinepais-phase-5-refinement
intent: clear
review_required: true
status: reviewed-and-repaired-ready-for-handoff
high_accuracy_review: "Momus + Oracle, parallel independent. 32 findings (10 BLOCKER / 10 MAJOR / 12 MINOR). Both verdicts REQUEST-CHANGES. All repaired in place; see the plan's second §Review record."
worst_finding: "O-B1 — Todo 2's 'distance to the block centre' RE-CREATED the front-left-corner bug it was written to fix (side-block pair scores 1.5 vs centre-block pair 4.0). Metric changed to distance to the ROOM centre."
architectural_finding: "M-B1 — dev and production are ONE Neon database, proven by SHA-256 in Fase E's own handoff (§9). The plan's local-vs-production wave separation was fiction. New §The fourth rule governs it."
self_inflicted: "O-B5 — the previous pass's production-targeting repair left DATABASE_URL_UNPOOLED exported into Todo 27, where pnpm test would wipe production. A repair created a blocker."
new_decisions: "D5 accept demo downtime (personal project, unannounced) + mandatory re-seed at all 5 gates. D6 test-only devDependencies permitted (jsdom, testing-library, plugin-react); the ban was always about runtime dependencies."
plan: .omo/plans/cinepais-phase-5-refinement.md
metis_review: 5 BLOCKER + 5 MAJOR + 2 MINOR — all repaired in place; see the plan's §Review record
key_correction: quality.ts's rowToTier is DEAD CODE (zero call sites). Real tiers come from seed.ts getSeatMeta() with FIXED cutoffs. The plan originally pointed at the dead rule, and Todo 26 would have "corrected" the READMEs to describe it.
phase: Fase F / Fase 5 — calidad de recomendación, realismo de datos y pulido de UX
created: 2026-08-15
planner: Prometheus (ulw-plan)
trigger: user's own hands-on QA of the live site after Fase E shipped
---

# Draft — CinePaís Fase F (`cinepais-phase-5-refinement`)

Planning-only artifact. The planner does not touch product code.

## Origin

Fase E shipped and the user did their own QA against `https://cinepais.vercel.app` — the one thing
43 review findings could not do, because every prior review verified **correctness**, never
**experience**. Six issues came back. Four were confirmed as real defects, one is unimplemented
rather than broken, and one is a design gap.

---

## VERIFIED FINDINGS (measured this session)

### F1 — Seat recommendation picks the front-left corner · CONFIRMED, worse than reported

`agent/src/cinepais_agent/seating.py:212`:
```python
return (-_TIER_PREF.get(group[0].qualityTier, 0), group[0].row, group[0].col)
```
Tier DESC, **row ASC, col ASC**. There is **no notion of horizontal centrality anywhere in the repo**
(negative grep paired with a positive control on `qualityTier`).

IMAX layout (`seating.py:36`): `{"rows": 13, "cols": 20, "blocks": [(1,5), (6,15), (16,20)]}`.
The **centre block is columns 6–15**; the algorithm returns block 1, columns 1–2.

**Two ordering defects, not one:**
1. `col ASC` → the extreme left edge of the leftmost block.
2. `row ASC` → the **front** of the optimal band (row 4 of 13 ≈ 31% back), when the sweet spot is
   further back within the band.

Scoring (`scoring_helpers.py:43`): `score = 100.0 + 10 * tier_score + 5 * availability_ratio`.
Tier weights (`seating.py:41`): `{"optimal": 3, "high": 2, "low": 1}`.

**Row tier rule — ⚠️ THIS PARAGRAPH WAS WRONG WHEN FIRST WRITTEN. Corrected after the Metis pass; kept
visible rather than silently overwritten, because the error itself is the lesson.**

~~`web/src/lib/business/quality.ts:6-14` is a proportional formula (`pct = row/maxRow`), and the READMEs'
"rows 1–3 low, 4–8 optimal, 9+ high" is doc drift.~~ **False, and backwards.**

`quality.ts`'s `rowToTier()` is **DEAD CODE** — `grep -rn "rowToTier" web/` returns exactly one hit, its
own definition, and **zero call sites**. The `qualityTier` actually written to the database, returned by
the API and sorted on by `_TIER_PREF` comes from `web/prisma/seed.ts:179-213` `getSeatMeta()`, which uses
**FIXED cutoffs regardless of room size** (its `_maxRow` parameter is underscore-prefixed precisely
because it is unused):

```
row <= 3        → low
row >= 9        → high
otherwise (4–8) → optimal
```

So the READMEs' prose is **correct** and the orphaned code is what disagrees with reality. The two rules
diverge badly on small rooms: Premium has 9 rows, where the fixed rule marks **only row 9** `high` while
the proportional rule would mark rows 6–9.

**How this got in:** an exploration subagent read `quality.ts`, assumed it was live, and reported it as
canonical; the planner accepted the claim without checking callers. **Reading a function is not evidence
that anything calls it.**

### F2 — The agent is city-blind · CONFIRMED, and it is BOTH causes

- `web/src/lib/agent/client.ts:110` sends literally `JSON.stringify({ message, sessionId })`.
- `agent/src/cinepais_agent/main.py` `ChatRequest` accepts only `message` + `sessionId`. Pydantic v2
  **ignores** extra fields by default, so a client-side-only change would silently do nothing.
- `agent/src/cinepais_agent/prompts.py` never mentions city or location.
- `city-provider.tsx`: localStorage key `cinepais.city`, default `"Bogotá"`, exposed via `useCity()`.
  The copilot widget **never calls it**.
- **But `mcp_widening.py:69-73` already implements deliberate widening**, with an ordered ladder:
  `("otro formato disponible", drop format)` → `("disponible en otra ciudad", drop format+city)` →
  `("otra fecha disponible", …)`, breaking at the first productive step.

⇒ The architecture for "anchor locally, widen deliberately" **already exists**. What is missing is the
anchor. Cross-city results are not the widening misfiring — the search is unanchored from the start.

### F3 — Preventa is not broken; it was never implemented · CONFIRMED

`web/src/app/page.tsx` renders `<EmptyState />` **unconditionally** for the Pronto and Preventa tabs,
with a Fase 1 comment admitting it. The badge comes from `film-card.tsx:78-83`:
```ts
function badgeForFilmId(id: string): "Estreno" | "Preventa" | null {
  const suffix = id.slice(-2);
  if (["01","02","03","04","05","06"].includes(suffix)) return "Estreno";
  if (["09","10"].includes(suffix)) return "Preventa";
  return null;
}
```
An **id-suffix hack**. `web/prisma/schema.prisma` `model Film` has **no** status or releaseDate field,
and `GET /api/films` exposes nothing that could drive the distinction. The badge and the tab read
different sources — which is exactly the incoherence the user saw.

### F4 — 99.4% of showtimes are 100% empty · CONFIRMED live

`web/prisma/seed.ts:278-300` `computeSeatStatus()` returns `SeatStatus.Available` for **every** seat
when no scenario applies. `scenarioFor()` plants exactly **4** scenarios; total showtimes **672**
⇒ **668/672 (99.4%) are completely empty.**

Verified against production:

| Showtime | availableCount / totalCount |
|---|---|
| `st-site-med-3-imax-0-1930` (no scenario) | **260 / 260** |
| `st-site-med-2-imax-1-1930` (`front-only`) | 40 / 260 |
| `st-site-med-2-imax-2-1400` (`optimal`) | 170 / 260 |

⇒ **F1 and F4 are the same story.** An empty room makes "first adjacent pair in the optimal tier"
identical to "the leftmost pair". The emptiness does not cause the centring bug — **it exposes it**.
Fixing only the seed would *mask* the bug; fixing only the centring would still look deserted.

### F5 — Markdown: root cause is the prompt, and the prose duplicates the card · CONFIRMED

- Render path `web/src/components/copilot/copilot-widget.tsx:498-509`: `{message.content}` inside a
  `<p className="… whitespace-pre-wrap …">` — plain React text child. Markdown is shown literally.
- `web/package.json` runtime deps contain **zero** Markdown/sanitiser libraries. Fase D deliberately
  shipped the whole copilot with no new runtime dependency (it hand-rolled a WHATWG SSE parser).
- `agent/src/cinepais_agent/prompts.py` §"Estilo de respuesta" constrains **content** but says
  **nothing about formatting** — no "plain text", no "no Markdown", no "no emoji". The model free-styles.
- `recommendation-card.tsx:138-323` **already renders** siteName, city, businessDate, time, formats,
  qualityTier, seat count, priceFrom, reasoning and the full alternatives list.
  ⇒ The Markdown table in the prose is **duplicating the card**. The real defect is duplication, and
  rendering it more prettily would only make the duplication prettier.
- Streaming: `use-copilot-chat.ts:278-284` concatenates each `token` event onto `content`. A
  general-purpose Markdown renderer would re-parse a **syntactically incomplete** document on every
  token.
- Security: **no `dangerouslySetInnerHTML` anywhere in `web/src`** (negative grep + positive control).
  Today the output is safe by construction; any Markdown→HTML path would create an XSS surface for
  LLM-generated content on a public endpoint.

### F6 — Bonus defects found while exploring (not in the user's list)

1. **`scenarioFor()` keys on `slotIdx`**, which is an index into the slot array *after* `pickFourSlots()`
   randomly drops one of five slots off the shared PRNG. So a planted scenario lands on whichever time
   happens to occupy that index — the times drift with the seed. Fragile and unintended.
2. **The planted scenarios were calibrated against an all-empty baseline.** The `optimal` scenario's
   comment says "rows 4–8 kept wide open (10% sold), rest ~40%" — if normal showtimes gain ~40%
   occupancy, `optimal` **stops standing out**. Changing the baseline forces recalibrating the scenarios.
3. **Doc drift on the quality tiers** (see F1).

---

## USER DECISIONS (answered at the gate — binding)

| # | Topic | Decision |
|---|---|---|
| D1 | Markdown | **Constrained prompt + a hand-rolled minimal renderer.** Prompt restricts output to a small subset (bold + bullets; no headings, tables, rules or emoji) and forbids repeating what the card shows. A ~40-line renderer builds **React elements** for that subset — zero dependencies, XSS structurally impossible, streaming-safe. |
| D2 | "Best seats" | **Centre of the block + centre of the optimal band.** Distance to the **block** centre becomes the dominant criterion after tier (IMAX centre block = cols 6–15, centre ≈ 10.5), and within the optimal band prefer the middle row rather than the first. Respects aisles. |
| D3 | Seed occupancy | **Varied by timeslot and weekday.** Weeknight late shows sparse (~10%), Friday/Saturday prime busy (~70%), the rest in between. Must stay deterministic under the same `SEED`. The 4 planted scenarios still win where they apply. |
| D4 | Preventa | **Real `status` field on `Film`** (`cartelera` / `pronto` / `preventa`), seeded, exposed through the API, and all three tabs filter on it. Kills the id-suffix hack; badge and tab read one source. Requires a Prisma migration against the live database. |

### Adopted defaults (announced, not asked)

1. **Slug** `cinepais-phase-5-refinement`; branch `phase-5-refinement` off `main`.
2. **Impeccable UX pass is IN SCOPE**, bounded: audit and fix within the existing design language —
   no visual redesign, no new component library, no change to the brand.
3. **Fix F6's three bonus defects** while in the same files; they are small and adjacent.
4. ~~**Row-tier doc drift corrected** in both READMEs to match `quality.ts`'s proportional formula.~~
   **SUPERSEDED — this default was built on the false premise corrected in F1 above.** The READMEs'
   fixed-cutoff prose is right; `quality.ts` is dead code. Plan Todo 26 now **deletes `quality.ts`** and
   strips the false "scaled proportionally in smaller rooms" claim from the READMEs instead.
5. **The demo video stays blocked** until this phase ships (see the risk below).
6. Same gates as Fase E: `agent` → ruff + basedpyright + pytest (non-eval); `web` → lint + tsc +
   detached `pnpm test` + build, never overlapping.
7. **LLM budget: 4 live `POST /chat` calls, announced before each.** Fase E spent 2 of 6.

---

## RISKS the plan must handle explicitly

1. **🔴 The video must not be recorded before this ships.** Recording now captures the copilot
   recommending the left edge of an empty room. `specs/003-demo-script.md` also needs updating once
   occupancy and recommendations change.
2. **🔴 Re-seeding production is the destructive, un-transactioned path** that stalled at ~seat 110,000
   in Fase E Wave 1. D3 and D4 both require a production re-seed, and D4 adds a **schema migration**
   on top. This is the riskiest work in the phase and needs the §Two rules discipline (one attempt,
   15-minute ceiling, diagnostic ladder — never blind retries).
3. **Planted-scenario recalibration** — see F6.2. Verifying the four scenarios still behave is a
   required acceptance criterion, not an afterthought.
4. **Test churn.** `seed-determinism.test.ts` re-seeds three times and dominates the ~200 s suite;
   changing occupancy changes its expectations. Agent-side, `test_seating.py` / `test_scoring.py`
   assert ranking behaviour and will need updating. Note that `test_service.py` and
   `test_sse_stream.py`'s `["1_4_7","1_4_8"]` are **parsing fixtures**, not algorithm assertions —
   they should survive, and must be confirmed rather than assumed.
5. **A client-only city change is a silent no-op.** Pydantic ignores unknown fields, so the web and
   agent halves must move together — the same "two env vars" trap in a new costume.
6. **Live re-verification costs money.** Only the budgeted calls, announced.

## Planned wave order

1. **W1 — Recommendation quality (agent, local).** Block-centre + band-centre ranking; prompt rewritten
   for formatting discipline, no-duplication and city anchoring; unit tests for the new ordering.
2. **W2 — Data layer.** `Film.status` + migration; timeslot-varied occupancy; `scenarioFor` slot fix;
   scenario recalibration; determinism tests updated.
3. **W3 — Web.** Minimal Markdown renderer; city plumbing end-to-end (widget → `ChatRequest` → prompt →
   tools); Preventa/Pronto tabs wired to `status`.
4. **W4 — Impeccable UX pass**, bounded to the existing design language.
5. **W5 — Deploy, live verification, docs, and unblocking the video.** Migration + re-seed against
   production under the diagnostic discipline, redeploy both halves, budgeted live checks, update
   `specs/003-demo-script.md`, correct the doc drift.

## Next workflow action

Approval brief presented; `status: awaiting-approval`. **Wait for the user's explicit okay**, then write
`.omo/plans/cinepais-phase-5-refinement.md`. Execution belongs to a separate `/start-work` session.
