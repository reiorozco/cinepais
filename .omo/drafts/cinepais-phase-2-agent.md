---
slug: cinepais-phase-2-agent
status: READY FOR /start-work (2026-08-06; 11 todos + F1-F4; dual high-accuracy review DOUBLE-APPROVED in round rr-20260806-03; final live-digest validation passed via ses_02669ebc2ffesc8S40X6JKj5Ca)
intent: clear
review_required: true (SATISFIED — both receipts recorded below)
phase: review_complete_approved
plan_path: .omo/plans/cinepais-phase-2-agent.md
plan_sha256: 9222ec9df22576e9be5f59b909f0981e95e7239d0ba5879f780d66d486088c39
plan_bytes: 52571
review_round_id: rr-20260806-03
round_status: approved (terminal; momus=APPROVE + independent=APPROVE, matching bindings; live plan re-hashed post-approval = 9222ec9d… 52571B, no drift)
pending-action: user runs /start-work cinepais-phase-2-agent in a fresh worker session (planner never executes)
fix_summary_round_2: applied ALL — Oracle r2#1 (finde/keywords resolve against the discoverable [min,max] businessDate window, never wall-clock; test_finde_resolves_within_seeded_window), r2#3 (in-group deterministic first-pick + test_seat_pick_stable_across_runs), r2#4 (recommend_best n: >4 → max_seats_exceeded, None → n=1; prompt teaches n=None; eval 7 asserts the tool path), r2#5 (eval 4 split into two hard assertions, no OR-chains), r2#6 (adjacent_seats derives blocks/max_row via normalize_room; accessibility-only note payload + test), r2#7 (Format Literal mirroring web enum), r2#8 (display fields inline on RecommendationEvent, populated in scoring), r2#9 (google-genai direct dep + exact import path), r2#10 (conftest 15s + retry, Neon cold start), r2#11 (aisle→block-boundary wording; aisle_cols=set() parity note), r2#12 (astream_events version runtime-verified, SSE contract frozen regardless); Momus r2 minors (Wave 3a/3b, speculative-ids note).
prior_round_id: rr-20260806-02
round_status: changes_requested (terminal; momus=APPROVE, independent=CHANGES_REQUESTED — both lanes completed with matching bindings; dual rule requires both)
round_2_results:
  momus: ses_0267266a1ffeCBLRdMK2XB1vJ5 → APPROVE (all 10 round-1 items verified encoded; 2 non-blocking minors: Wave-3 wording, prune speculative model id)
  independent: ses_026722cf2ffeuJJHMHiG4L7Gxv → CHANGES_REQUESTED (round-1 fixes all verified encoded, no regressions; NEW: MAJ#1 finde may resolve outside seeded 7-day window, MAJ#3 in-group pick not deterministic, MAJ#4 recommend_best n>4/None semantics missing, MAJ#5 Wednesday eval OR-chain masks broken discount, MAJ#6 adjacent_seats blocks/max_row derivation + accessibility-only note; #2 retracted by reviewer; minors #7 Format Literal, #8 display fields on RecommendationEvent, #9 google-genai direct dep, #10 conftest 15s Neon cold-start, #11 aisle→block wording, #12 astream_events version runtime-verify)
pending-action: review .omo/plans/cinepais-phase-2-agent.md
fix_summary_round_1: applied ALL round-1 findings — Oracle B1 (SEED_NOW bare YYYY-MM-DD everywhere: Verification, todo 9 conftest, todo 11 README, success #6), M1 (freshness strictly > today + soldout discovered by shape), M2 (date_range grammar: YYYY-MM-DD | range ≤7d | hoy/mañana/finde/semana + bad_date_range), M3 (outcome discriminator recommended/degraded/no_availability + branch validators, 3 branches enumerated in scoring, contract doc covers all), M4 (tool returns model_dump_json; SSE handler validation chain model_validate→model_validate_json→log+skip + both-shapes test), M5 (session cap reframed best-effort in todo 8/11/success #5), M6 (MCP lifespan init-once, plain python -m, 4-tool probe, per-call timeout, dead-child test), m2 (cheapest assertion computed-min + Wednesday cross-check, NO literals — Oracle's own 19000 example was wrong: 18000×0.6=10800→11000), m3 (test_group_stays_within_block + semantics clarified), m4 (city-scoped film resolution + hint payload), m5 (models.list preferred, short-circuit, AGENT_MODEL_OVERRIDE added to .env.example), m6 (TZ=America/Bogota in Verification + README + success #6); Momus MAJOR (proportional tier triplets 13→1-2/3-8/9-13, 12→1-2/3-7/8-12, 9→1-2/3-5/6-9 asserted; README prose flagged as non-canonical; eval 2 asserts 3-8 band), Momus MIN-2 (### Alternative payload section, grep ≥6 kept), Momus MIN-3 (web/prisma/seed.ts paths).
review_round_1_archive:
  momus: ses_0267aa081ffe86MTn8zhSj7iDX → CHANGES_REQUESTED (receipts + digest verified)
  independent: ses_0267a591affe2K2ZUBU0RBlNxB → CHANGES_REQUESTED (receipts + digest verified)
review:
  momus:
    status: launching
    workspace_root: /Users/reiorozco/Dev/cinepais
    runtime_home: null
    target: .omo/plans/cinepais-phase-2-agent.md
    round_id: rr-20260806-03
    plan_sha256: 9222ec9df22576e9be5f59b909f0981e95e7239d0ba5879f780d66d486088c39
    launch_id: ln-momus-03
    session: ses_0266ca22bffe52736ZjMOgA95n (bg_b58e93ad)
    result: APPROVE (unconditional; zero BLOCKER/MAJOR; 2 informational minors — test name traceability [already present in todo 6's test list, reviewer hit line truncation] and optional eval-2 band tightening; all citations + tier math + round-2 encodings verified against repo; bindings echoed, digest verified)
  independent:
    status: launching
    workspace_root: /Users/reiorozco/Dev/cinepais
    runtime_home: null
    target: .omo/plans/cinepais-phase-2-agent.md
    round_id: rr-20260806-03
    plan_sha256: 9222ec9df22576e9be5f59b909f0981e95e7239d0ba5879f780d66d486088c39
    launch_id: ln-oracle-03
    session: ses_0266c6f4bffe1up39IDYIGjxTa (bg_5a365038)
    result: APPROVE (unconditional; ZERO findings — all 12 round-2 items verified faithfully encoded with repo cross-checks; new-issues hunt clean; "executor-ready"; 2 informational notes parked for Fase E; bindings echoed, digest verified)
  sha_source: explore ses_0266d61bdffeOVxOoETiy4ZSwK (shasum -a 256; 52571 bytes; r2 sha 9ac5e959… 48705B via ses_02673400affeSCncb6bVgqmzmk; r1 sha 9c054bd8… 41223B via ses_0267b4198ffendK282MgjjxhoG)
approach: agent/ uv project; FastMCP stdio ×4 tools over read API; runtime-verified prebuilt agent + Gemini Flash (fallback chain, max_tokens); deterministic recommend_best; FastAPI SSE token/tool_call/recommendation/done; hardening; 8 deterministic evals; Fase D contract doc
---

# Draft: cinepais-phase-2-agent

## Components (topology ledger)
<!-- id | outcome (one line) | status: active|deferred | evidence path -->
- agent-scaffold | uv project under agent/ (pyproject, ruff, pytest, .env.example, README) | active | handoff:63
- mcp-tools | FastMCP server: search_showtimes / seat_availability / adjacent_seats(n) / recommend_best, all via httpx → web read API | active | specs/002:54
- agent-core | LangGraph agent (create_agent) + Gemini Flash + Spanish scope-narrow system prompt + deterministic recommend scoring lib | active | specs/001:103-106
- sse-service | FastAPI POST /chat SSE endpoint (token/tool_call/recommendation/done events) + session state + slowapi + CORS + caps | active | handoff:69
- evals-qa | pytest evals: ≥5 query types + business-rule + off-topic-refusal tests, deterministic vs seed | active | specs/001:120-129
- docs-handoff | agent/README (run, prereqs, SSE contract for Fase D) | active | handoff:40

## Open assumptions (announced defaults)
<!-- assumption | adopted default | rationale | reversible? -->
- Python tooling | uv + ruff + pytest + pytest-asyncio + httpx + basedpyright | programming-skill defaults; handoff:63 predicted adopt-default | yes
- Agent architecture | single tool-calling agent via `langchain.agents.create_agent` (create_react_agent DEPRECATED in langgraph 1.0); recommend_best = DETERMINISTIC scoring tool (pure Python, testable), LLM only narrates in Spanish | keeps killer-feature logic deterministic/evalable; avoids graph overkill for 4 tools | yes
- MCP transport | FastMCP (mcp SDK) server over **stdio**, wired via langchain-mcp-adapters; NOT streamable-http (race bugs mcp 1.12–1.14) | same-repo, simplest, satisfies "MCP" spec requirement | yes
- LLM model | `gemini-3.5-flash-lite` via init_chat_model("google_genai:gemini-3.5-flash-lite"); `max_tokens` MANDATORY (Gemini 3.x thinking-hang bug GH#2062) | cheap GA, not retiring (2.5-flash retires 2026-10-16); one-line swap by design | yes
- Budget cap | app-level agent-executed (max_tokens, input char cap, per-session query cap) + Google Cloud Spend Cap documented as USER MANUAL STEP (console-only, Public Preview) | true hard cap requires console; plan cannot automate it | yes
- Rate limiting | slowapi v0.1.10 decorator-only, NO SlowAPIMiddleware (breaks SSE streaming, GH#249/#260) | verified gotcha | yes
- SSE contract (Fase D) | named events `token` / `tool_call` / `recommendation` / `done`; recommendation payload = `{showtimeId, seatIds[], filmId, reasoning, alternatives[]}` Pydantic-typed; sse-starlette EventSourceResponse | handoff:69 mandates designing NOW; matches SelectionProvider needs (fase-1 draft) | yes (pre-D)
- Session state | LangGraph InMemorySaver + thread_id per session | demo-scale; scale-to-zero loses state = acceptable, documented | yes
- Evals harness | plain pytest with deterministic assertions (tool trajectory + response content vs planted seed scenarios); NO LLM-as-judge (cost/flakiness, mock is deterministic); LangSmith tracing env-gated optional | simplest that proves acceptance criteria | yes
- Package versions | researched versions are CLAIMS; executor pins latest stable via `uv add` and records actual versions in lockfile | librarian findings partially conflicting (sse-starlette/fastapi.sse UNVERIFIED) | yes

## Findings (cited - path:lines)

- SCAFFOLD DEVIATION: no shell tool available in this session; draft hand-written byte-faithful to `scaffold-plan.mjs buildDraft('cinepais-phase-2-agent','clear',{reviewRequired:false})`. Plan skeleton after approval must replicate `buildPlanSkeleton` exactly (headers verbatim).
- web/ is now **Neon Postgres** (not SQLite dev as AGENTS.md says): web/README.md:3, env via `vercel env pull .env.local` (README:22-34). Agent dev prerequisite = web dev server on :3000 with Neon env pulled + seeded.
- Read API contract fully documented with real examples: web/README.md:62-200 (cities, films, films/:id, showtimes w/ priceFrom, showtimes/:id/seats w/ price+qualityTier+areaCategory+summary.byArea+priceTable).
- Business rules: orphan (src/lib/business/orphan.ts), cutoff 15min (cutoff.ts), quality rows 1-3 low/4-8 optimal/9+ high (quality.ts) — web/README.md:202-207.
- Seed determinism: SEED=20260801, SEED_NOW env; 672 showtimes, 119,280 seats, 4 planted scenarios (web/README.md:45, handoff §Seed).
- Handoff `.omo/handoff-fase-c.md` = primary scope source; Fase C scope at :36-40; open questions ledger at :62-69; suggested slug adopted.
- Deploy (Fly.io) is Fase E, NOT C (handoff:38). HITL UI integration is Fase D, but SSE payload shape (showtimeId + seatIds) must be designed NOW (handoff:69).

## Decisions (with rationale)

- Verified (explore bg_269f8e4a): full API surface w/ Zod schemas (web/src/lib/api/schemas.ts), errors (errors.ts:4-8), pricing PRICING constants (pricing.ts:14-31), ROOM_LAYOUTS blocks (layout.ts:1-5), MAX_SEATS=4 (selection.ts:38), wouldLeaveOrphan signature (orphan.ts:11-49), rowToTier (quality.ts:6-15), planted scenarios scenarioFor (prisma/seed.ts:234-253) incl. films: soldout=film-02, front-only/optimal=film-01.
- Verified (explore bg_4299fe6b): killer feature verbatim (specs/001:103-106), 5 business rules (001:87-92), acceptance criteria (001:120-129), 7 Gherkin scenarios (001:33-69), SelectionProvider is the Fase D preselection surface (fase-1 draft:20-21).
- Research (bg_5e2c701d): langgraph 1.0.8 stable; `create_agent` from langchain.agents is the successor API; InMemorySaver checkpointer; astream_events v2/v3 for SSE; langchain-google-genai 4.x; langchain-mcp-adapters 0.3.x; mcp SDK 1.12.x.
- Research (bg_75fd82dd): Gemini pricing table (3.5-flash-lite $0.30/$2.50 per 1M; 2.5-* retiring Oct 2026); free tier 500 RPD; Cloud Spend Caps = real hard cap (Public Preview, console); slowapi SSE middleware bug; LangSmith env vars + 5k traces/mo free. NOTE: their cost estimate had 1000× arithmetic error — real cost/session ≈ $0.002, negligible.
- Research (bg_976ee026): "MatchDay" is a pattern family, NOT a canonical LangGraph repo (Animesh Kumar repo 404/private) — plan follows the pattern (Gemini + MCP tools + FastAPI/SSE), citing 3 OSS LangGraph+MCP+SSE repos as references; uv 0.16.x, ruff, pytest-asyncio 1.4, httpx 0.28.
- Agent uses ONLY the read API over HTTP (no DB access, no web/ imports) — least-privilege per specs/001:96-101; business-rule logic it needs (adjacency within blocks, orphan-safe recommendations, quality weights) is REIMPLEMENTED in Python from the verified TS constants (layout blocks, MAX_SEATS=4, quality rows), with tests asserting parity against the documented rules.
- Prerequisite for dev/evals: web dev server on localhost:3000 with Neon env pulled + seeded (SEED=20260801, SEED_NOW near today so cutoff/planted days line up) — documented in agent/README.
- Git verified: only `phase-0-scaffold` and `phase-1-ui` exist in .git/refs/heads, no main — plan branches `phase-2-agent` from `phase-1-ui` (user decision).
- DETERMINISM PITFALL (self-derived): the 15-min cutoff compares showtime start vs REAL now (cutoff.ts), while planted scenarios sit on seed days 0–3. If SEED_NOW = today and evals run after ~13:45, the day-0 soldout showtime (14:00) is filtered out of /api/showtimes → flaky evals. FIX encoded in plan: eval prerequisite = re-seed with SEED_NOW = TOMORROW 00:00 America/Bogota (dynamic), so planted days 0–3 are all strictly future; evals compute dates (incl. the single Wednesday and weekend days in the 7-day window) relative to SEED_NOW, never hardcoded.

## Scope IN

- agent/ Python project: MCP tools ×4, LangGraph agent, Spanish replies, tradeoff explanations w/ client↔business balance, FastAPI/SSE service, security hardening (scope-narrow prompt, slowapi, token/input/session caps, CORS), LangSmith env-gated, pytest evals ≥5 query types + refusal tests, SSE contract doc for Fase D, agent/README.

## Scope OUT (Must NOT have)

- NO deploy (Fly.io = Fase E). NO UI/chat-widget work in web/ (Fase D). NO writes to web/ code. NO real cinema APIs/scraping. NO extra tools beyond the 4 cinema read tools. NO purchase/booking execution by the agent (recommends only; HITL is D). NO LLM-as-judge evals. NO merging/pushing branches.

## Open questions

(all resolved 2026-08-06)
1. Branch base → USER DECIDED: fork `phase-2-agent` from `phase-1-ui` (agent needs priceFrom/price/priceTable added in Fase B).
2. Test strategy → USER DECIDED: tests-with-each-todo (pytest, deterministic).
3. GOOGLE_API_KEY → USER CONFIRMED: available, ~$35 USD balance (dev+evals cost ≈ cents; app-level caps stay mandatory).

## Approval gate
status: approved (user: "procede con tu recomendacion" 2026-08-06, after brief)
approach: agent/ uv project; FastMCP stdio server with 4 httpx tools over the read API; create_agent + gemini-3.5-flash-lite (init_chat_model, max_tokens capped); deterministic recommend_best scoring (availability+adjacency+quality+business balance) with Spanish narration; FastAPI POST /chat SSE (token/tool_call/recommendation/done; recommendation={showtimeId,seatIds[],...}); slowapi decorators + CORS localhost:3000 + session caps; pytest evals vs planted seed scenarios; README + Fase D SSE contract doc.
next-action: todos appended, TL;DR filled → offer dual high-accuracy review (review_required: false, user decides).

## Metis findings folded (session ses_026850880ffeaqjfHnxXnn3eYO, 16 findings)
- #4+#5 (SEED_NOW/cutoff tension, CRITICAL): resolved — showtime IDs encode day-index+time (st-<site>-<room>-<dayIdx>-<hhmm>), NOT dates, and seat states depend only on SEED; so dynamic SEED_NOW keeps IDs/states stable. Plan mandates: re-seed with SEED_NOW = tomorrow 00:00 America/Bogota → planted days 0–3 strictly future (no cutoff loss); evals compute dates/Wednesday/weekend RELATIVE to SEED_NOW; prices asserted via ported pricing formula, never hardcoded dates.
- #9 (create_agent vs create_react_agent contradiction): both research claims; plan encodes runtime verification directive + both fallbacks, with smoke test.
- #14 (model ID unverified): plan encodes model-discovery step (models.list) with priority fallback chain; max_tokens always set.
- #11 (hallucinated IDs): recommendation SSE event populated ONLY from captured recommend_best tool output (on_tool_end), never LLM-generated JSON; regex assertions (^st-, ^\d+_\d+_\d+$).
- #7+#10 (payload schemas): seatIds = raw area_row_col pass-through; Alternative schema fully defined (showtimeId, filmId, siteName, businessDate, time, formats, priceFrom, qualityTier, reason).
- #8 (scoring formula unspecified): explicit deterministic formula + never-discourage invariant + tie-breaks encoded in todo 5.
- #6+#12 (orphan/adjacency semantics): adjacency = same row, same block, consecutive cols (layout.ts blocks, converted 0-based); orphan filtering lives INSIDE tools (agent never reasons about it); dedicated orphan unit test + eval.
- #1,#2,#3,#15 (missing evals): added price/Wednesday, accessibility-exclusion, max-4 conversational, tradeoff-via-trajectory evals (structural assertions, no LLM-judge).
- #16 (astream_events version): pinned version="v2" with explicit event mapping table in todo 8.
- #13 (silent infra failure): session-scoped conftest health-check fixture with fail-fast + seed-freshness validation.
<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->
