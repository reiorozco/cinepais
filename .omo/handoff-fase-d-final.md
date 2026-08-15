# Handoff: CinePaís Fase D (Phase 3 Integration) — FINAL, implementation complete

**Date:** 2026-08-14
**Branch:** `phase-3-integration` (verified with `git branch --show-current`)
**Plan:** `.omo/plans/cinepais-phase-3-integration.md`
**Commit (this wave):** `docs(web): copilot integration guide, preselect URL contract, agent env var`
Resolve the SHA with — never hardcoded here, because this file is committed *inside* that same commit:
```bash
git log --oneline -1
git log --oneline --grep='copilot integration guide' -1   # stable lookup after later commits
```
**Remote:** none configured (`git remote -v` is empty). Nothing was pushed. No `main` branch exists.

> **Status: all 18 implementation todos are DONE.** Only the final verification wave (F1–F4)
> remains, and it is the orchestrator's job, not the executor's. **F1–F4 require zero further
> LLM spend — no lane starts the agent.**

---

## 1. Wave status table

| Todo | Title (verbatim from the plan) | Status |
|---|---|---|
| 1 | Repo prep: branch, env var, and the real SSE fixtures moved into the test tree | done |
| 2 | Zod schemas for the five SSE event types | done |
| 3 | WHATWG-compliant SSE frame parser | done |
| 4 | Streaming client: `POST /chat` → typed event callbacks | done |
| 5 | Wave 1 close: gate + commit + handoff | done |
| 6 | `preselect` action on `selectionReducer` | done |
| 7 | `?preselect=` URL contract wired into the seat map | done |
| 8 | Playwright proof of the pre-selection contract (4 scenarios) | done |
| 9 | Wave 2 close: gate + commit + handoff | done |
| 10 | Copilot shell: floating bubble + panel, mounted globally | done |
| 11 | Conversation streaming + tool-activity indicator | done |
| 12 | Recommendation card + HITL CTA navigation | done |
| 13 | Graceful limits and error handling | done |
| 14 | Fixture-replay E2E tests (zero LLM spend) | done |
| 15 | Wave 3 close: gate + commit + handoff | done |
| 16 | Live end-to-end proof against the real agent | done |
| 17 | Documentation: `web/README.md` copilot section + env var + preselect URL contract | done |
| 18 | Wave 4 close: commit + write `.omo/handoff-fase-d-final.md` + hand off to the final verification wave | done (this file) |
| F1 | Plan compliance audit | **pending — orchestrator** |
| F2 | Code quality review | **pending — orchestrator** |
| F3 | Hands-on QA (fixtures only) | **pending — orchestrator** |
| F4 | Scope fidelity | **pending — orchestrator** |

Todo titles above are quoted from the plan; no invented numbering (handoff correctness rule #3).

---

## 2. What was actually built

Authoritative source for this section: `git diff --name-status phase-2-agent -- web/`, then each
file opened and re-read to confirm the description matches the shipped code (handoff correctness
rule #2 — the Wave 1 handoff shipped a §4 that described implementations QA had already rejected).

### Added (`A`)

| Path | Purpose | LOC |
|---|---|---|
| `web/src/lib/agent/config.ts` | Single source of the agent base URL: `process.env.NEXT_PUBLIC_AGENT_URL ?? "http://localhost:8000"` | 8 |
| `web/src/lib/agent/sse.ts` | WHATWG-compliant SSE frame parser (chunk-boundary safe) | 90 |
| `web/src/lib/agent/events.ts` | Zod schemas for the five SSE event types | 133 |
| `web/src/lib/agent/client.ts` | `POST /chat` streaming client → typed event callbacks | 161 |
| `web/src/components/copilot/copilot-widget.tsx` | Shell, panel and composer; mounted once in the root layout | 550 |
| `web/src/components/copilot/use-copilot-chat.ts` | Conversation state machine, session id, rate-limit/cap handling | 354 |
| `web/src/components/copilot/recommendation-card.tsx` | Recommendation card, outcome branches, HITL CTA | 386 |
| `web/tests/agent-sse.test.ts` | Parser unit tests (27) | — |
| `web/tests/agent-events.test.ts` | Schema unit tests (27) | — |
| `web/tests/agent-client.test.ts` | Client unit tests (12) | — |
| `web/tests/copilot-chat.test.ts` | `toolLabel()` unit tests (4) | — |
| `web/tests/selection-preselect.test.ts` | `preselect` reducer action tests (13) | — |
| `web/tests/fixtures/agent-sse/README.md` | Fixture index; marks which fixtures are real captures vs synthetic | — |
| `web/tests/fixtures/agent-sse/real-broad.txt` | Real captured SSE stream | — |
| `web/tests/fixtures/agent-sse/real-date-range.txt` | Real captured SSE stream | — |
| `web/tests/fixtures/agent-sse/real-narrow-two-recommendations.txt` | Real capture, two recommendation payloads (last-wins proof) | — |
| `web/tests/fixtures/agent-sse/synthetic-tool-only-no-tokens.txt` | Synthetic: tool turn with zero tokens | — |
| `web/tests/fixtures/agent-sse/synthetic-no-availability.txt` | Synthetic: `no_availability` outcome | — |
| `web/tests/fixtures/agent-sse/synthetic-error-midstream.txt` | Synthetic: `error` event mid-stream | — |
| `web/tests/fixtures/agent-sse/synthetic-tokens-only.txt` | Synthetic: tokens only, no tool calls | — |

### Modified (`M`)

| Path | Change | Re-read confirmation |
|---|---|---|
| `web/src/lib/business/selection.ts` | Added a `preselect` action to `SelectionAction` + `applyPreselect`; assigns instead of toggling, still routed through the existing business rules | `selection.ts:33` declares `type: "preselect"`; `:93` dispatches to `applyPreselect` |
| `web/src/app/showtimes/[id]/page.tsx` | Parses and sanitises `?preselect=`, incl. a hostile-input cap and the `string \| string[]` searchParams shape | `page.tsx:44-71`, comments name the cap and the repeated-key case |
| `web/src/app/layout.tsx` | Mounts `<CopilotWidget />` globally | import at `:9`, mount at `:52` |
| `web/src/components/seats/seat-map.tsx` | Consumes the preselect request via a one-time ref guard; removed an unused `row` param from `SeatRow` | `SeatRow` declared at `:436` |
| `web/src/components/providers/city-provider.tsx` | `useState`+`useEffect` → `useSyncExternalStore` (authorized lint-baseline repair) | `useSyncExternalStore` imported at `:6`, used at `:44` — this is the SHIPPED fix, **not** the lazy-`useState` attempt that `.omo/handoff-fase-d-wave-1.md` §4 wrongly documented |
| `web/src/components/films/showtimes-explorer.tsx` | `useEffect` **retained** with two justified `eslint-disable-next-line` comments (authorized lint-baseline repair) | `useEffect` at `:197`, disables at `:198` and `:200` — again the SHIPPED fix, not the rejected key-based reset |
| `web/README.md` | New `## Copiloto (Fase D)` section (`:208`) with `### Environment` (`:214`), `### Run both halves locally` (`:222`), `### ?preselect= URL contract` (`:239`), `### Known contract gap (advisory for Fase E)` (`:253`); UI-pages table row updated | headings verified by `grep -n '^#\{2,4\} ' web/README.md` |

### Not touched

`agent/` — zero files, across the entire phase: `git diff --name-only phase-2-agent -- agent/ | wc -l` → `0`.
`web/package.json` — `git diff phase-2-agent -- web/package.json` is **empty**: no new runtime
dependency, no jsdom, no @testing-library, no Playwright npm package.

---

## 3. Decisions taken during execution (Todo 18 only)

Earlier waves' decisions are recorded in `.omo/handoff-fase-d-wave-1.md` / `-wave-2.md` / `-wave-3.md`
and are not restated here. Todo 18 itself made three decisions:

1. **Reported the wave-commit-count criterion as a deviation instead of making it true.**
   The plan's criterion `git log --oneline phase-2-agent..HEAD | wc -l` → `4` now returns `9`.
   The four *executor* wave commits exist exactly as promised; the extra five are the
   orchestrator's own `chore(omo):` bookkeeping commits, which the plan's count never
   anticipated. Squashing them would have destroyed real orchestrator state to cosmetically
   satisfy a number. Full enumeration and the superseding check are in §7 and in
   `.omo/evidence/task-18-cinepais-phase-3-integration.txt` §7.
2. **Force-added `task-15-cinepais-phase-3-integration.txt` too.** It was left uncommitted at the
   Wave 3 close. It belongs to this plan, so it ships now.
   Explicitly *excluded*: `task-15/16/17-cinepais-phase-2-agent-fixes.md` — same numeric prefix,
   **different plan**, not this phase's artifacts.
3. **Placed `Fase E inputs` as §9, after `Resume instruction`.** The plan's template fixes the
   order of sections 1–8; appending keeps that order literally intact.

No other ambiguity arose. Nothing else was resolved unilaterally.

---

## 4. Verification evidence

Full gate, run from `/Users/reiorozco/Dev/cinepais/web`. Raw capture:
`.omo/evidence/task-18-cinepais-phase-3-integration.txt`.

| # | Command | Exit | Result |
|---|---|---|---|
| 1 | `pnpm test` (full suite, no exclusions) | **0** | 131 tests / 11 files / 196.92s (wall clock 210s) |
| 2 | `pnpm lint` | **0** | no errors, no warnings |
| 3 | `npx tsc --noEmit` | **0** | no output = no type errors |
| 4 | `pnpm build` | **0** | 12 routes, 10/10 static pages in 1434ms |

`pnpm test` was launched **detached with an exit-code-file poll**, never under a short shell
timeout — a SIGTERM mid-run would corrupt the shared Neon DB:

```bash
nohup zsh -c 'cd web && pnpm test > /tmp/omo-t18/test.log 2>&1; echo $? > /tmp/omo-t18/test.exit' &
# poll until /tmp/omo-t18/test.exit exists, then read it
```

`pnpm build` ran **strictly after** `pnpm test` finished — the two must never overlap; both hit the
same shared Neon DB and concurrent runs produce spurious, code-unrelated failures.

196.4s of the 196.9s total belongs to `seed-determinism.test.ts` alone (3 tests, one full re-seed
each). Slow is normal here; it is not a hang and must not be excluded from the gate.

### Scope checks

| Check | Command | Result |
|---|---|---|
| agent frozen | `git diff --name-only phase-2-agent -- agent/ \| wc -l` | `0` |
| no new deps | `git diff phase-2-agent -- web/package.json` | empty |
| no `main` branch | `git rev-parse --verify main` | `fatal: Needed a single revision`, exit `128` |
| nothing pushed | `git remote -v` | empty |
| live spend | `grep -c '"POST /chat' .omo/evidence/task-16-agent.log` | `2` |

### Evidence force-added in this commit

`.gitignore:26` ignores `.omo/evidence/`, so `git add -f` is required, and plain
`git status --porcelain` will not reveal these — use `git status --porcelain --ignored`.

`task-15-…txt`, `task-16-…txt`, `task-16-agent.log`, `task-16-live-hitl.png`,
`task-16-live-query1-card.png`, `task-16-live-query2-card.png`, `task-17-…txt`, `task-18-…txt`
(all suffixed `-cinepais-phase-3-integration` except the `.log`/`.png` captures).

---

## 5. What remains

**No implementation work remains.** The final verification wave runs next, executed by the
orchestrator:

| Lane | Scope | First concrete action |
|---|---|---|
| F1 | Plan compliance audit | Re-run every acceptance criterion in Todos 1–18 from a clean shell, pairing each negative-result grep with a positive control |
| F2 | Code quality review | `git diff phase-2-agent -- web/package.json` (expect empty), then sweep `web/src/lib/agent/` and `web/src/components/copilot/` for dead exports and `any` |
| F3 | Hands-on QA, fixtures only | Start the web dev server, re-seed if the day rolled over, drive the Fase B purchase-flow regression first |
| F4 | Scope fidelity | `git diff --name-only phase-2-agent -- agent/` (expect empty), then enumerate and classify every changed line of the plan file |

Shared-state rules for the wave (a Fase B review round was lost to violating them): **no lane
switches branches, no lane re-seeds concurrently with another lane, only one lane at a time drives
a browser, and no lane starts the agent.** All four must APPROVE.

Inputs F1/F4 will need immediately: §7 below (the wave-commit-count deviation and the two
authorized-exception files that must NOT be filed as violations), and §9 (Fase E inputs).

---

## 6. Context the next chat needs

### Running servers
**None.** Both were killed at the end of Todo 16 and the ports were confirmed free
(`lsof -i :3000 -sTCP:LISTEN` and `lsof -i :8000 -sTCP:LISTEN` both empty). Nothing needs to be
running for F1, F2 or F4; F3 starts its own web dev server and must **not** start the agent.

### Database seed state
Last seeded with `SEED=20260801` and `SEED_NOW=2026-08-15` (which was *tomorrow* at seed time).
**Do not copy that literal date forward** — the 15-minute cutoff silently empties `/api/showtimes`
once it is in the past, and that failure looks exactly like a code bug (handoff correctness rule #1;
this exact mistake was shipped by the Wave 1 handoff). Always recompute:

```bash
cd /Users/reiorozco/Dev/cinepais/web
SEED_NOW=$(python3 -c "from datetime import date, timedelta; print((date.today()+timedelta(days=1)).strftime('%Y-%m-%d'))")
TZ=America/Bogota SEED=20260801 SEED_NOW=$SEED_NOW pnpm prisma db seed
```

Pre-flight before trusting any UI or agent result (requires the dev server on `:3000`):

```bash
curl -s "http://localhost:3000/api/showtimes?filmId=film-01" | head -c 200
```

`[]` means the seed is stale → re-seed with the command above. A healthy seed reports
`Seed complete: 119280 seats across 672 showtimes`.

### Branch, commits, remote
- Branch `phase-3-integration`, cut from `phase-2-agent` in Todo 1.
- Four wave commits (subjects verbatim from the plan's §Commit strategy) + five `chore(omo):`
  orchestrator commits. See §7.
- No remote. No `main`. Nothing pushed. Fase E owns publishing.

### Useful ids (stable planted scenarios)
- Sold-out: `st-site-med-1-imax-0-1400` (`availableCount: 0` of 260).
- Layout-stable preselect example (the README's worked example):
  `st-site-med-3-imax-0-1930?preselect=1_1_10,1_1_11`.
- Live Todo 16 example: `st-site-med-2-imax-5-1930?preselect=1_4_1`.
- Showtime ids encode a **day offset** from `SEED_NOW`, not an absolute date, so the same id's
  `businessDate` shifts when `SEED_NOW` changes. Expected, not a bug.

### Environment quirk
`pnpm build` prints a Postgres `sslmode` deprecation warning from the pg driver. Pre-existing,
unrelated to this phase, exit code still 0.

---

## 7. Traps and advisories

### A. Wave-commit-count criterion is unsatisfiable as literally written (for F1 and F4)
Todo 18's criterion `git log --oneline phase-2-agent..HEAD | wc -l` → `4` actually returns `9`.
Four are the executor's wave commits, exactly as the plan's §Commit strategy promises; five are
`chore(omo):` orchestrator bookkeeping commits the count never anticipated. Oldest first:

```
34e57d1  feat(web): agent SSE transport — WHATWG parser, Zod event schemas, streaming client     WAVE 1
34c67dc  chore(omo): mark Wave 1 todos complete in plan checkboxes                                orchestrator
82b65da  chore(omo): mark Todo 6 blocked pending fresh-chat wave boundary                         orchestrator
3972186  chore(omo): planner amendments — lint-baseline exception, handoff correctness rules…     planner
994c36e  feat(web): HITL seat pre-selection — preselect reducer action + ?preselect= URL contract  WAVE 2
7451ca1  chore(omo): mark Wave 2 todos complete in plan checkboxes                                orchestrator
a82412c  feat(web): CinePaís copilot widget — SSE chat, recommendation card, HITL preselect CTA    WAVE 3
acf6669  chore(omo): mark Wave 3 todos complete in plan checkboxes                                orchestrator
<this>   docs(web): copilot integration guide, preselect URL contract, agent env var               WAVE 4
```

Superseding check that matches the plan's actual intent:
```bash
git log --oneline phase-2-agent..HEAD --invert-grep --grep='^chore(omo)' | wc -l   # expect 4
```
No history was rewritten. Do not squash the orchestrator's commits to make the literal number match.

### B. `.omo/handoff-fase-d-wave-1.md` §4 is WRONG about two files (for F2 and F4)
It documents the two implementations QA **rejected**, not the ones that shipped. The shipped code is
`useSyncExternalStore` in `city-provider.tsx` (verified: import `:6`, call `:44`) and a **retained**
`useEffect` with two justified disables in `showtimes-explorer.tsx` (verified: `:197`, `:198`, `:200`).
The plan's §Authorized scope exception already flags this; §2 of this file is the corrected record.

### C. Three Fase B files were modified under an authorized exception — NOT scope violations
`city-provider.tsx`, `showtimes-explorer.tsx`, `seat-map.tsx` were touched in Wave 1 to repair a
**pre-existing** lint baseline that made the mandated `pnpm lint` gate unreachable. The plan
retroactively authorized exactly these three rows and closed the exception. **F4 must not file them
as violations**, but must still confirm each change is limited to what that table describes.

### D. `priceFrom` nullability: real, open doc/code drift (Fase E action)
Verified first-hand, read-only: `agent/src/cinepais_agent/events.py:47` is `priceFrom: int | None`,
while `agent/docs/sse-contract.md`'s recommendation schema shows `"priceFrom": 32000` with no
nullability annotation — even though sibling nullable fields (`showtimeId`, `filmId`) *are* marked
`"string | null"`. The Python implementation is correct; the **contract doc** under-specifies.
The contract file was deliberately **not** edited (`agent/` is frozen for this phase). Also recorded
in `web/README.md:253` under "Known contract gap (advisory for Fase E)".

### E. Full test suite is slow, not broken
5–12 minutes (measured this session: 196.92s; earlier sessions: 307s–730s), essentially all of it
`seed-determinism.test.ts` re-seeding the shared Neon DB three times. Launch detached with an
exit-code-file poll. Never exclude it from the gate. Never run two `pnpm test` runs concurrently,
and never overlap `pnpm test` with `pnpm build` — the shared DB yields spurious FK failures.

### F. Session-cap copy was deliberately corrected against the plan's literal text
The plan's literal copy ("reloading starts a new session") is factually false — `sessionStorage`
survives a reload, measured (`sessionIdBefore === sessionIdAfterReload`). Shipped copy names the two
real escapes (new tab, or come back later). Evidence-backed correction, not scope creep; F4 must not
flag it.

### G. Browser-level console errors from 429 / aborted requests are expected
`Failed to load resource: … 429` and `net::ERR_FAILED` are the browser reporting a deliberately
induced failed network resource. Any "zero console errors" assertion must exclude
`Failed to load resource` and assert on uncaught exceptions / React error boundaries instead.

### H. Evidence is gitignored
`.gitignore:26` ignores `.omo/evidence/`. Committing evidence needs `git add -f`, and plain
`git status --porcelain` will **not** show missing evidence — use `--ignored` when auditing.

### I. Fixtures are CRLF-terminated
Intentional: it matches the real SSE wire format. Git may warn about LF conversion. Do not "fix" it.

### J. Two live queries only — do not spend more
The whole phase spent exactly 2 `POST /chat` calls. F1–F4 must reproduce nothing that starts the
agent. Todo 16's card outcomes were recorded as *observed*, never *asserted* — they are
LLM-trajectory-dependent, so no F-lane should assert an `outcome` enum value against them.

---

## 8. Resume instruction

Fase D implementation is **complete**. The literal next step is the final verification wave, run by
the orchestrator in this repo:

```bash
cd /Users/reiorozco/Dev/cinepais
git branch --show-current      # must print: phase-3-integration
git log --oneline -1           # must print the wave-4 subject: docs(web): copilot integration guide, …
git status --porcelain         # must be empty
```

Then start at **F1 (Plan compliance audit)** and run F1–F4 — all four must APPROVE, results are
surfaced to the user for the final okay. **Zero LLM spend: no lane starts the agent.**

Do **not** start at a numbered todo — Todos 1–18 are all done. If a fresh chat is opened, feed it
this file:

```bash
cat /Users/reiorozco/Dev/cinepais/.omo/handoff-fase-d-final.md
```

If F3 runs on a later calendar day, re-seed first with the recompute command in §6 (never the
literal `2026-08-15`).

---

## 9. Fase E inputs

Everything Fase E (deploy + demo video) needs, gathered in one place.

### 9.1 Environment variables that MUST move at deploy time

| Variable | Side | Current value | Fase E target |
|---|---|---|---|
| `NEXT_PUBLIC_AGENT_URL` | web (`web/src/lib/agent/config.ts:8`, default fallback) | `http://localhost:8000` | the **Fly.io** agent host |
| `CORS_ORIGIN` | agent (`agent/.env.example:3`) | `http://localhost:3000` | the **Vercel** web domain |

**Both must change together.** The widget calls the agent **directly** — there is no Next.js route
handler proxy (deliberate: a proxy collapses the agent's per-IP rate limit into one global bucket and
imposes Vercel's streaming duration cap on a path that can legitimately take 45s). If only one side
is repointed, the browser's cross-origin `POST /chat` is rejected and the copilot silently fails.
Documented for humans at `web/README.md:218-220`.

### 9.2 Money-shot screenshots for the demo video

| Path | What it shows |
|---|---|
| `.omo/evidence/task-14-hitl-money-shot.png` | **Fixture-replay** version: conversation → recommendation card → seat map, zero LLM spend |
| `.omo/evidence/task-16-live-hitl.png` | **Real live-agent** version: seat `1_4_1` pre-selected on `st-site-med-2-imax-5-1930`, copilot panel still open, Spanish banner "Tienes 1 silla pre-seleccionada por el copiloto…" visible |

Supporting live captures: `.omo/evidence/task-16-live-query1-card.png`,
`.omo/evidence/task-16-live-query2-card.png`. All are committed (force-added past `.gitignore:26`).

### 9.3 Confirmed model id

**`gemini-3.6-flash`** — agreed by two independent sources in `.omo/evidence/task-16-agent.log`:

- the app's own startup log:
  `INFO:cinepais_agent.llm:Using AGENT_MODEL_OVERRIDE: gemini-3.6-flash`
  `INFO:cinepais_agent.llm:Using model: gemini-3.6-flash`
- the `httpx` wire request line:
  `INFO:httpx:HTTP Request: POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:streamGenerateContent?alt=sse "HTTP/1.1 200 OK"`

Self-report and wire agree. Reproduce with:
```bash
grep -m2 'Using model\|AGENT_MODEL_OVERRIDE' .omo/evidence/task-16-agent.log
grep -m1 'httpx:HTTP Request: POST https://generativelanguage' .omo/evidence/task-16-agent.log
```

### 9.4 Total live-query spend for the ENTIRE phase

**Exactly 2** `POST /chat` calls. Every other verification in this phase ran on fixture replay.

```bash
grep -c '"POST /chat' .omo/evidence/task-16-agent.log   # -> 2
```

Note for cost modelling: the same log holds **7** `httpx` calls to the Gemini endpoint. That is not
a contradiction — one agentic turn issues several internal LLM calls in its ReAct loop. The
budget-gate metric is the `POST /chat` count (2); the token-cost metric is the httpx count (7).

### 9.5 Advisories carried into Fase E

1. **`priceFrom` nullability gap in `agent/docs/sse-contract.md`** *(the flagged one)* —
   `agent/src/cinepais_agent/events.py:47` is `priceFrom: int | None`; the contract's recommendation
   schema shows `"priceFrom": 32000` with no `| null`, while marking sibling nullable fields
   explicitly. Implementation correct, doc under-specified. Not edited here (`agent/` frozen).
   **Fase E action:** annotate the field in the contract.
2. **`NEXT_PUBLIC_AGENT_URL` is baked at build time.** It is a `NEXT_PUBLIC_*` var, so it is inlined
   into the client bundle — changing it on Vercel requires a **rebuild**, not just an env edit.
3. **CORS is only ever proven live.** Playwright `route.fulfill` satisfies a request without a real
   preflight (measured: `preflight: 0`), so no fixture test can catch a CORS misconfiguration. The
   only real proof in this phase is Todo 16's two live responses carrying
   `access-control-allow-origin: http://localhost:3000`. After repointing, re-prove it against the
   deployed pair.
4. **Streaming behind a CDN.** Fixtures deliver a whole stream in one reader chunk
   (`readerChunks: 1`, measured), so incremental rendering is only ever observable live. Verify token
   streaming survives Vercel/Fly buffering after deploy.
5. **Fly.io scale-to-zero cold start vs the widget's error copy.** Tool turns already run 5–45s; a
   cold start adds to that. Check the widget's unreachable/timeout path against a cold agent.
6. **Budget cap + spend alerts must exist before the demo is public** (AGENTS.md §Abuse & cost
   controls). Per-session query cap and per-IP rate limiting are implemented; a hard LLM budget cap
   is a deploy-time concern.
7. **`agent/.env` holds a real `GOOGLE_API_KEY`.** Verified by presence-grep only; the value was
   never printed into any evidence file. Keep it out of Vercel/Fly logs and out of git.
8. **Contract-doc ownership.** `agent/docs/sse-contract.md` was frozen for all of Fase D. Whoever
   owns it next inherits item 1 above.
9. **Session-cap copy** deliberately diverges from the plan's literal (false) wording — see §7.F.
   If Fase E rewrites copy, keep the correction.
10. **Showtime ids encode day offsets**, so a hardcoded `businessDate` in any demo script drifts
    after a re-seed. Recompute, never hardcode (§6).

### 9.6 Fase C loose ends still open (inherited, deliberately NOT touched in Fase D)

Copied forward from `.omo/handoff-fase-c.md` §"Known loose ends (non-blocking, park for Fase E
polish)" so Fase E inherits a complete picture rather than only this phase's own advisories:

- `checkout/page.tsx` client fetch lacks error handling (infinite skeleton on network fail).
- `preload` prop on `<Image>` in film-card/hero-carousel (likely meant `priority`).
- Wheelchair dialog title copy conflates preferential/wheelchair.
- `f3-step-*.png` (9 files) untracked at repo root → move to `.omo/evidence/`.
- Optional hardening: recompute order server-side on confirmation; Zod-gate `?format=`.
- Missing minor tests: reducer showtime-switch branch; Onyx pricing case.

Status: all six were still open at the end of Fase D. None were addressed — they were out of this
phase's scope, and the plan's guardrails forbade unrelated changes.

Also inherited from Fase C, a process lesson worth keeping: **serialize review lanes that mutate
shared state** (DB seeding, branch checkouts). Parallel reviewers colliding on `git checkout` and
double-seeding produced false FAILs in Fase B's review. F1–F4 already carry this rule.

---

**Fase D status: implementation COMPLETE (Todos 1–18).**
**Next: final verification wave F1–F4, run by the orchestrator, zero further LLM spend.**
