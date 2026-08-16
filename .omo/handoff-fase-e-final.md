# Handoff — Fase E (deploy) final

Plan: `.omo/plans/cinepais-phase-4-deploy.md` · written at Todo 38 (Wave 6 close, hard gate)
Date: 2026-08-16 (UTC) · 2026-08-15 evening America/Bogota

> Scope of this document: what actually shipped, where it lives, what it cost, what a human still
> owes, and everything that deviated from the plan. Written by re-reading the files, not from memory —
> every claim below is traceable to a file path, a command, or an evidence file in `.omo/evidence/`.

---

## 1. Where it is live

| Half | URL | Verified at Todo 38 |
|---|---|---|
| `web/` — Next.js on Vercel | <https://cinepais.vercel.app> | **200** in 0.490 s |
| `agent/` — FastAPI on Fly.io | <https://cinepais-agent.fly.dev/health> | **200** in 9.090 s (cold wake), body `{"status":"ok"}` |
| Repo | <https://github.com/reiorozco/cinepais> | public |

Verified with `env -i /usr/bin/curl` — an empty environment and the system curl binary, so no Vercel
session, cookie jar or `VERCEL_*`/`FLY_*` token could enter the request. Negative controls returned
404 (`/nonexistent-route-xyz` on the agent, an unknown showtime id on the web API), so the 200s are
falsifiable rather than merely absent-of-failure.

The 9.09 s on `/health` is a **cold wake**, not latency to be alarmed by — the machine was `stopped`
and auto-started to serve the probe. That is scale-to-zero working. It is also the third independent
corroboration of the ~9.5 s cold-start figure (Todo 31 measured 9,499 ms; Todo 33's close measured
9.070 s; this one 9.090 s — three different runs).

---

## 2. What shipped

Re-read at Todo 38 to write this section: `README.md`, `web/README.md`, `agent/README.md`,
`agent/fly.toml`, `agent/Dockerfile`, `specs/003-demo-script.md`, `specs/004-linkedin-post.md`.

### The deployed pair

- **`web/`** — Next.js 16 / React 19 / Tailwind 4 / Prisma 7 + `@prisma/adapter-pg`, on Vercel with
  Neon Postgres. 12 routes (10 prerendered static, the rest server-rendered on demand). Ships the
  manual purchase flow end to end — home carousel, catalogue, film detail with a 7-day date selector,
  interactive seat map, checkout, confirmation — plus the five-endpoint read API that both the UI and
  the agent consume.
- **`agent/`** — Python 3.12 / LangGraph ReAct over **4 read-only MCP tools** (`search_showtimes`,
  `seat_availability`, `adjacent_seats`, `recommend_best`) on stdio, FastAPI + `sse-starlette`,
  Gemini Flash via `init_chat_model`. On Fly.io: app `cinepais-agent`, region `iad`,
  `shared-cpu-1x` / 1 GB, `min_machines_running = 0`, `auto_stop_machines = 'stop'`,
  `soft_limit = 3` / `hard_limit = 5`.

The widget calls the agent **directly**, with no Next.js proxy — deliberate: a proxy would collapse the
per-IP rate limit into one shared bucket (every request arriving from the web server's IP) and would
run tool turns that can take ~45 s into Vercel's ~25 s streaming cap.

### Deployment artefacts added by this phase

`agent/Dockerfile` (single-stage Python image) · `agent/.dockerignore` · `agent/fly.toml` ·
`LICENSE` (MIT) · production env wiring on both sides (`NEXT_PUBLIC_AGENT_URL` → the Fly host,
`CORS_ORIGIN` → the Vercel origin; both must move together or CORS rejects the widget).

### Spend and abuse controls in the shipped agent

Per-IP rate limit 10 req/min keyed off **`Fly-Client-IP`** (behind Fly's proxy the socket peer is the
edge, not the visitor, so the raw remote address would collapse every visitor into one bucket) ·
`MAX_INPUT_CHARS=2000` · `SESSION_QUERY_CAP=20` · `DAILY_REQUEST_CAP=40` accepted `/chat` requests per
UTC day · `recursion_limit=8` on the agent loop · `search_showtimes` results capped at 40 so a bare
call cannot re-send the whole catalogue as LLM input on every turn · CORS as a comma-separated
allowlist, never a wildcard · off-topic questions politely refused in Spanish.

**Stated honestly in the shipped docs:** `DAILY_REQUEST_CAP` is a *courtesy brake, not a spend
guarantee* — the counter lives in the agent process and the process stops when the machine scales to
zero, so a cold start resets it. It bounds one warm machine's day, not the invoice. The only real
ceiling is the Google-side hard cap (§4).

### Documentation and demo materials

- `README.md` — real URLs (no placeholders left), Known limitations written out rather than papered
  over: mock-only data, the 7-day seed horizon and its refresh path, the measured cold start, the
  daily-cap caveat, best-effort session limits, single locale/currency.
- `AGENTS.md` — deploy/cost section corrected: Fly.io is **pay-as-you-go, kept ≈ $0 by scale-to-zero**,
  *not* a free tier. Region, VM size and both spend-control layers recorded.
- `agent/README.md` — `CORS_ORIGIN` documented as comma-separated, `DAILY_REQUEST_CAP` documented with
  its reset caveat, the `Fly-Client-IP` rate-limit key explained.
- `web/README.md` — the "Known contract gap (advisory for Fase E)" note resolved.
- `specs/003-demo-script.md` — Spanish shooting script for the video, two acts (manual flow, then the
  copilot), 2:15–2:30 target, budgeted at **2 `POST /chat` calls maximum**.
- `specs/004-linkedin-post.md` — Spanish post draft; every URL in it fetched and 200 at Todo 36.

---

## 3. LLM spend for the entire phase

**Total: 2 `POST /chat` calls.** Ceiling was 6. **4 remain unspent.**

Reproduction command:

```bash
cat .omo/evidence/llm-spend-cinepais-phase-4-deploy.txt
```

The file is 2 lines, one per call, both from Todo 31:

| # | When (UTC) | State | Query | Result |
|---|---|---|---|---|
| 1 | 2026-08-15T23:11:48Z | COLD | q1 front-only/adjacency — *"¿Dónde puedo ver La Odisea en IMAX en Medellín el lunes en la noche con 4 sillas juntas?"* | 200 · 25.08 s · `outcome=recommended` · 4 `tool_call`, 15 `token` |
| 2 | 2026-08-15T23:16:41Z | WARM | q2 seat-quality/optimal — *"Para La Odisea en IMAX en Medellín esta semana, ¿cuál función tiene las sillas de mejor calidad? Busco 2 sillas juntas con la mejor vista posible."* | 200 · 15.96 s · `outcome=recommended` · 3 `tool_call`, 13 `token` |

Todos 32–38 spent **zero** LLM calls between them. Todo 35's reserved 2-call budget is untouched and
belongs entirely to the human's recording take(s) — see §5.

---

## 4. Cost posture

- **Fly.io** — org in Good Standing, **credit balance $0.00 (no free allowance)**, payment method
  "charged automatically", last invoice $0.00, **upcoming invoice $0.01** measured with the agent live.
  Fly has *no* hard cap; the $0.01 is empirical proof that `min_machines_running = 0` is what keeps the
  bill at zero. Bounded worst case if scale-to-zero ever broke: shared-cpu-1x/1 GB running 24/7
  ≈ **USD 2/month**.
- **Google Gemini** — billing account linked, spend cap configured, **prepaid balance model**: spend is
  limited to the loaded balance and does *not* fall through to the card once exhausted. Verdict
  **HARD-STOP**, two independent layers (the cap stops calls; an empty balance makes calls fail rather
  than charge). Caveat recorded at Todo 26: spend caps have a documented ~10-minute reporting delay, so
  a burst can overshoot slightly, bounded by the prepaid balance.

Todo 26 left an instruction to re-check the Fly upcoming invoice at phase close: **if it has moved from
cents to dollars, the scale-to-zero assumption has broken.** That re-check is a dashboard read and is
therefore a human action — it is listed in §6 as outstanding, not silently assumed green.

---

## 5. Every `[MANUAL — USER]` step and its outcome

The plan declares four (line 201: *"…except the four `[MANUAL — USER]` steps"*). Todo 26 is marked
`×2`, which is what makes the count four rather than three.

| # | Step | Where | Outcome |
|---|---|---|---|
| 1 | Confirm repo name and public visibility, then create the GitHub repo and push `main` | Todo 19 (plan line 428–430) | **DONE.** User confirmed `reiorozco/cinepais`, visibility **PUBLIC**. Repo created and `main` pushed: <https://github.com/reiorozco/cinepais>. A first attempt was deliberately **blocked** by the executor pending that confirmation rather than created unilaterally. Related decision: `.omo/boulder.json` was excluded from publication as orchestrator runtime state, not curated content. |
| 2 | **A** — Open the Fly dashboard billing page and report plan, free allowance, trial status, payment method (`fly billing` does not exist in flyctl v0.4.83, so it cannot be automated) | Todo 26 (plan line 502) | **DONE.** Reported: Good Standing · $0.00 credit balance, no free allowance · charged automatically · last invoice $0.00 · upcoming invoice $0.01 · 0 linked orgs. No `fly deploy` ran before this was reported, as the plan required. |
| 3 | **B** — Configure a Google-side spend cap for the Gemini API and report **both** the amount and whether it hard-stops or only alerts | Todo 26 (plan line 503) | **DONE.** Reported: cap configured, prepaid balance model, does not fall through to the card. Verdict **HARD-STOP** — the distinction the plan specifically demanded. Wave 5 was cleared to proceed on this. |
| 4 | Record the video/GIF | Todo 35 (plan line 664) | **PENDING — NOT DONE.** See below. |

### Todo 35 — the honest status

**No video, GIF or screen capture exists.** None was attempted: an autonomous agent cannot record a
human's screen. This is a legitimate outstanding human action, not a defect and not a failed gate.

What *was* delivered is the executor's half: a fresh pre-flight (re-run live, all exit 0) and a
ready-to-follow hand-off packet, on top of `specs/003-demo-script.md`. The plan's box is marked `[~]`
rather than `[x]` to reflect exactly this. Consequences carried forward honestly:

- `specs/004-linkedin-post.md` correctly contains **no video link**, because there is no video to link.
- Todo 35's reserved **2 `POST /chat` calls remain unspent** and belong to the recording take(s).
- The database currently holds the freshest window it can hold (§7), so a recording can start now
  without re-seeding.

---

## 6. Outstanding human actions

1. **Record the demo video/GIF** — `specs/003-demo-script.md` is the shooting script; budget 2 `/chat`
   calls; re-seed first only if the window in §7 has gone stale.
2. **Add the video link to `specs/004-linkedin-post.md`** once it exists, then publish the post.
3. **Re-check the Fly upcoming invoice** against the $0.01 pre-deploy baseline (Todo 26's monitor).
4. **Re-seed roughly weekly** — `bash web/scripts/reseed.sh`, ~70 s. Before **2026-08-22** falls into
   the past, or the live catalogue renders empty (correctly, per the 15-minute cutoff — an empty array
   is a right answer for a stale database, not a bug).

---

## 7. Measurements

### Seed timing — Todo 12

```
Full re-seed against Neon: 66.83 seconds wall-clock (real)
```

Exit 0 on the first attempt. The 15-minute hard ceiling was never approached — 102 s of 900 s used,
including polling overhead. Rounded to *"about a minute"* / *"~70 seconds"* in user-facing copy.
Re-confirmed at Todo 38: the closing reseed produced 672 showtimes / 119,280 seats in the same
ballpark.

### Live end-to-end timings — Todo 31

Measured against the deployed pair, with the agent confirmed genuinely cold beforehand (`fly status`
polled until `STOPPED`; Query 1 dispatched after it had been stopped ~1 m 31 s — the cold start was
waited for, not faked).

| | Response headers | Full turn | Tool calls |
|---|---|---|---|
| **Query 1 — COLD** | **9,499 ms** | **25,080 ms** | 4 |
| **Query 2 — WARM** | **183 ms** | **15,960 ms** | 3 |

**Cold-start cost ≈ 9.32 s** (9,499 ms vs 183 ms). Both turns streamed incrementally and both closed
cleanly. The widget's unreachable/timeout copy fires only on a real transport failure, so it cannot
misfire on a slow cold start — checked explicitly at Todo 31 (QA-1).

Fly's idle window before auto-stop was measured at anywhere from **~2 to ~9 minutes** after the last
request: Fly Proxy sweeps idle machines on a periodic tick rather than counting down from each one, so
the exact stop moment is not something to plan around.

---

## 8. Every deviation in this phase

Recorded plainly. None of these was absorbed silently; each has an evidence file.

### D1 — Todo 27 §6: a QA assertion that is unsatisfiable by construction

The plan expected `grep -ci 'models.list\|Using model:'` → 0. It returns 1 and **no Dockerfile change
could make it 0**, because `llm.py:122` logs `Using model:` unconditionally, outside the branch. The
check's real intent ("no model discovery happened, i.e. no network call to Google") was proven green
three independent ways: `models.list` → 0 occurrences, `models.list() failed` → 0 (it would have fired
loudly on auth with the dummy key), and `Using AGENT_MODEL_OVERRIDE` → 1 (the override branch ran,
which structurally precludes the discovery branch). **Plan-authoring imprecision, not an implementation
defect. Nothing in `agent/` was modified to accommodate it.**

### D2 — Todo 29 §9: flyctl's first deploy created a *second* machine

`fly deploy` provisioned an HA pair despite `min_machines_running = 0` already being set in
`fly.toml` — flyctl does this on an app's first deploy regardless. **This was not cosmetic:**
`DAILY_REQUEST_CAP` is an in-process counter and Fly Proxy load-balances, so two machines meant two
counters and an effective cap of ~80 `/chat` per day instead of the 40 it was sized against — a real
regression against the cost control Todo 26's HARD-STOP verdict rests on, arriving on the eve of the
only money-spending todo in the phase. Resolved with `fly scale count 1`, then re-verified: 1 machine,
`/health` 200, both probes re-run verbatim and passing. **Nothing in `fly.toml` was edited** — machine
count is runtime state, not config, and this moved *toward* the intended cost posture, not away.
**Carry-forward:** any future `fly deploy` on this app may re-trigger the HA pair. Re-check
`fly status` and re-run `fly scale count 1` if a second machine reappears.

### D3 — Todo 31: Query 2's phrasing departed from the plan's suggestion

The plan suggested "best-quality showtime of the weekend". The run date was Saturday 2026-08-15 and the
seed window opens the *next* day, so day 0 = Sunday and the planted `optimal` scenario at day 2 lands
on **Tuesday** 2026-08-18. **No weekend phrasing can reach a Tuesday.** `"esta semana"` was used
instead — natural Spanish, maps to the agent's supported `semana` date-range token, and its window does
contain day 2. The plan's actual intent ("the copilot must recommend by seat quality") is preserved
verbatim.

### D4 — Wave 5 → Wave 6 boundary crossed inside one session

Todo 33's plan text is explicit: *"Do not start Todo 34 in this session. End the session."* The
orchestrator honoured it and ended its turn. Immediately after, an automated `OMO_INTERNAL_INITIATOR`
boulder-continuation directive arrived **in the same session** instructing it to continue without
asking permission. That is a harness-level mechanism; the orchestrator has no tool that can terminate a
session against it.

The plan anticipated exactly this (§Wave boundaries, "Honest residual risk", lines 192–195): *"none of
this can technically force a process to terminate… If a wave boundary is crossed anyway, the F1 lane
must report it as a deviation rather than absorbing it silently."* Recorded here and in
`.omo/notepads/cinepais-phase-4-deploy/issues.md` so F1 surfaces it. **No Wave 5 evidence, verdict or
commit was altered to hide it.** No observed impact on correctness — Wave 5 was independently verified
and committed before the directive arrived.

### D5 — Todo 38: `pnpm test` was red on arrival, from a defect predating this phase

The full gate's first run **failed, exit 1** — 3 tests across `tests/agent-events.test.ts` and
`tests/agent-sse.test.ts`, all one root cause: the SSE fixture
`web/tests/fixtures/agent-sse/real-narrow-two-recommendations.txt` was **LF-terminated**, while three
tests assert it is **CRLF**-terminated *"as a real SSE stream is"* (per the SSE spec).

Root cause: this repo's `core.autocrlf` is **`input`**, which normalises CRLF → LF **on commit**, and
there was no `.gitattributes` protecting the file. Verified against the object store, not guessed:
the fixture has **0 CR bytes in every committed version**, and it has only ever been committed once —
in `efad61c` (*"feat(web): copilot integration…"*), a **Fase D** commit. So `pnpm test` has been red
since Fase D; Wave 5 deliberately deferred `pnpm test` to Todo 38, and that deferral is precisely what
surfaced it.

Fix (2 files): restored the fixture's CRLF bytes (3,898 → 3,960 bytes, +62, one per line), and added a
root `.gitattributes` marking `web/tests/fixtures/agent-sse/*.txt` as `-text` so Git stores and checks
them out byte for byte and cannot silently re-break them for the next contributor. Verified the fix
survives a Git round-trip — the **staged blob contains all 62 CRs**, which is the whole point.
Re-run: **136/136 tests, 11/11 files, exit 0.** No test assertion was weakened and no application code
was touched.

### D6 — Todo 38: reseed run *between* `pnpm test` and `pnpm build`, not after the whole gate

The plan's order is *"… `pnpm test` → `pnpm build`"* with the reseed *"afterwards"*. The reseed was run
immediately after `pnpm test` instead, i.e. one step earlier. Reason: `pnpm test` leaves the shared
database holding `SEED_NOW=2026-08-01`, a window entirely in the past, and `pnpm build` prerenders
pages against that database — building on a dead catalogue risks baking an empty catalogue into the
build or failing the gate for a reason unrelated to code quality. Reseeding first also minimises the
window in which the live site is dead. This serves the plan's intent (restore the demo, build against
valid data) and no gate was skipped.

---

## 9. The `pnpm test` / shared-database problem, and the route taken

**Todo 23 established there is exactly one Neon database.** Production and local dev point at the same
endpoint — verified three ways, including SHA-256 comparison of the connection strings:
`DATABASE_URL` prod vs dev → `79f09841e846` / `79f09841e846` **IDENTICAL**; `DATABASE_URL_UNPOOLED` →
`ec264e7be82e` / `ec264e7be82e` **IDENTICAL**. One project, one endpoint, one database. It is not a
copy, not a branch, not a sibling.

`web/tests/seed-determinism.test.ts` calls the seed **three times** with `SEED_NOW: "2026-08-01"` — a
window that is entirely in the past. So `pnpm test` does not merely churn the live database, it leaves
the live catalogue **stale-by-construction**, and `GET /api/showtimes` correctly returns `[]`.

**Route taken: (b) — run against the shared database, then re-seed production immediately.**

Route (a), pointing the run at an isolated database, was investigated and rejected on evidence:
`neonctl`, `neon`, `psql` and `pg_ctl` are all absent from this machine, so no Neon branch or local
Postgres could be created without introducing new tooling and new failure modes into a closing gate.
Docker is present, but a throwaway Postgres would not reproduce Neon's pooled/unpooled split that the
seed and the tests actually exercise — it would have been a *different* test run, not an isolated one.

The cycle was measured rather than assumed:

| Moment | `GET /api/showtimes?filmId=film-01` |
|---|---|
| Before `pnpm test` | **57** showtimes, window opens 2026-08-16 |
| After `pnpm test` | **0** — the wipe the plan warned about, demonstrated |
| After `bash web/scripts/reseed.sh` | **672** showtimes total, `businessDate` **2026-08-16 → 2026-08-22**, 119,280 seats |

The restored window is **identical to the pre-test baseline**, so the live demo is exactly where it was
before the gate ran, and Todo 35's recording can proceed without re-seeding.

---

## 10. Gate results at Todo 38

| Gate | Exit | Result |
|---|---|---|
| `uv run ruff check .` | **0** | All checks passed |
| `uv run basedpyright` | **0** | 0 errors, 0 warnings, 0 notes |
| `uv run pytest tests/ -m "not evals" -q --timeout=120` | **0** | 117 passed, 1 skipped, 15 deselected |
| `pnpm lint` | **0** | clean |
| `npx tsc --noEmit` | **0** | clean |
| `pnpm test` | **0** | 136 passed, 11/11 files — *after* the D5 fix; first run was exit 1 |
| `pnpm build` | **0** | 12 routes, 10/10 static prerendered |

---

## 11. State at handoff

- Branch `main`, working tree clean, nothing unpushed.
- Phase commits (Fase E), oldest → newest: `3f6b870`, `cc2da5f`, `09edbed`, `aa7dbd8`, `4d6e2ca`,
  `0103ee3`, `98c481d`, `b5cf980`, `6c95691`, `bed1fd8`, plus Todo 38's two.
- Both halves live and returning 200; live catalogue non-empty and fresh through **2026-08-22**.
- LLM budget: **2 of 6 spent, 4 remain.**
- Plan checkbox for Todo 38 deliberately **left unflipped** — the orchestrator flips it after
  independent verification.
- Next: the **Final verification wave (F1–F5)**. F1 should pick up D4 (the wave-boundary crossing) and
  D5 (a gate that was red since Fase D) as its two most load-bearing findings.
