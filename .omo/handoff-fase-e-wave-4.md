# Handoff — Wave 4 Complete (Todos 21–25, the web is LIVE on Vercel)

> For the next executor session (Wave 5, Todos 26+). Read this FIRST, then
> `.omo/notepads/cinepais-phase-4-deploy/*.md` for detailed learnings, then
> `.omo/evidence/wave-4-closed-cinepais-phase-4-deploy.txt` for the receipts.

**🔗 LIVE: <https://cinepais.vercel.app>** — publicly reachable, no login wall, full purchase flow working.

## What Shipped in Wave 4

Wave 4 was **infrastructure, not source**. Zero files under `web/` or `agent/` changed.
Everything shipped is platform-side state (Vercel) or database state (Neon).

| Todo | What | Where it lives | Status |
|------|------|----------------|--------|
| 21 | Both hostnames reserved; `NEXT_PUBLIC_AGENT_URL=https://cinepais-agent.fly.dev` set on Vercel **Production only** | Vercel env (platform) | ✅ |
| 22 | `ssoProtection.enabled: true → false` (BLOCKER B3) | Vercel project settings (platform) | ✅ |
| 23 | `prisma migrate deploy` + full seed against the production Neon DB | Neon `neondb` (database) | ✅ |
| 24 | `vercel deploy --prod` from `main` @ `3f6b870`; full browser QA on the live site | Vercel deployment | ✅ |
| 25 | Wave close: live re-verification, evidence, this note | `.omo/` bookkeeping | ✅ |

**Files committed this wave:** `.omo/handoff-fase-e-wave-4.md` (this file) + `.omo/plans/cinepais-phase-4-deploy.md` (checkboxes 19–25).
**The plan's `chore(web): production deployment configuration` commit was SKIPPED** — see [Deviations](#what-deviated-from-the-plan).

### Hostname table — both resolved

| Service | Hostname | Status at Wave 4 close |
|---|---|---|
| Vercel (web) | `https://cinepais.vercel.app` | **ACTUAL, CONFIRMED, LIVE.** PREDICTED == ACTUAL. |
| Fly (agent) | `https://cinepais-agent.fly.dev` | **CHOSEN, app NOT YET CREATED** (Todo 29). DNS still NXDOMAIN. |

The build-time-inlining trap (Todo 21's "#1 trap") **did not fire**: because the predicted Vercel
domain matched the actual one, `NEXT_PUBLIC_AGENT_URL` needed no update and **no second deployment
was required**. Confirmed empirically in the shipped bundle — chunk `2_zkbufl82yma.js` contains
`fetch("https://cinepais-agent.fly.dev/chat"…` with the correct scheme and a single slash.

## What Was Measured

### Deployment

```
Deployment ID   dpl_DYMWMt49xUNdoWweAjP77GDNQY9K
Status          ● Ready (target: production)   — confirmed 3 ways: vercel inspect,
                vercel ls, and the Vercel API's latestDeployment.readyState
Built from      main @ 3f6b870
Build region    iad1 · "✓ Ready in 1m"
Routes          12 deployed · 10/10 static pages generated
```

**`prebuild` proof (BLOCKER B1's fix, verified live):** build log line 98 `> web@0.1.0 prebuild`,
line 99 `> prisma generate`, line 106 `> next build`. Negative control grep → 0.
`web/src/generated/` is git-ignored and was absent from the 1.3 MB upload, yet the build compiled
because `prebuild` regenerated the Prisma client in 130 ms.

### Live HTTP — unauthenticated, re-verified at Wave 4 close

Run with `env -i /usr/bin/curl` (empty environment, system curl — no Vercel session, cookie jar,
or `VERCEL_*` token can enter the request):

```
https://cinepais.vercel.app                 -> 200   <-- the wave's exit criterion
https://cinepais.vercel.app/films           -> 200
https://cinepais.vercel.app/api/cities      -> 200
/api/showtimes/st-nonexistent-id-12345/seats-> 404   <-- negative control, curl is discriminating
/api/showtimes?filmId=film-01               -> 57 items, firstBusinessDate 2026-08-16
```

The SSO fix is now proven live **twice** — once at Todo 24 post-deploy, once again at Todo 25.

### Database

```
prisma migrate deploy   exit 0  ("No pending migrations" — schema was already there,
                                 itself a 4th corroboration of the shared-DB finding)
seed                    exit 0  in 77 s, SEED_NOW=2026-08-16 RECOMPUTED (never a literal)
                        "Seed complete: 119280 seats across 672 showtimes"
read back from prod     672 showtimes · 119 280 seats · 10 films · 6 sites
                        businessDate window 2026-08-16 .. 2026-08-22
```

### Browser QA on the live site (Todo 24)

Full flow driven on production, not localhost: home → *La Odisea* → LUN 17 AGO → IMAX → 19:30 Sala
IMAX → seats **F10 + F11** (adjacent, row F = `optimal` tier, orphan rule not tripped) → checkout
$ 64.000 → confirm → order **CP-N40I2I**.

- Screenshots: `.omo/evidence/task-24-seatmap.png` (116 557 B) · `.omo/evidence/task-24-confirmation.png` (68 749 B) — both verified as decodable PNGs at Wave 4 close.
- Posters: 12/12 `_next/image` → 200, **0 broken** (the `placehold.co` `remotePatterns` entry works through Vercel's optimizer).
- Console: **0 errors**; 2 benign Chrome preload hints. Todo 7's `preload → priority` rename holds in production.
- Todo 6's missing-`.catch()` fix behaves correctly — checkout rendered its summary immediately, no infinite skeleton.

### Cost

**0 live `POST /chat` calls this wave. $0.00.** The copilot panel was opened only to confirm it mounts;
no message was ever sent. Phase ceiling remains 6 calls, **0 consumed**.

## 🚨 The single most important fact to carry forward

> **PRODUCTION AND LOCAL DEV SHARE ONE NEON DATABASE.**
> `neondb` on `ep-steep-mouse-awrybf8w`, Neon project `floral-cherry-67419417`, region **`us-east-1`**.

Proven by byte-identical `DATABASE_URL` **and** `DATABASE_URL_UNPOOLED` between Vercel Production and
`web/.env.local` (sha256 prefixes `79f09841e846` / `ec264e7be82e`) — which rules out
same-host/different-role and same-host/different-branch, not merely a host match.

Two consequences that will bite if forgotten:

1. **`pnpm test` is a PRODUCTION-MUTATING command here.** The suite re-seeds three times against the
   database serving the live site. It is *not* a safe background command. Todo 38 must either accept
   that it leaves production holding the suite's last `SEED_NOW` (and re-seed afterwards with a
   recomputed one), or point the suite at a separate Neon branch first.
2. **The seed wipes before it inserts and is NOT transaction-wrapped.** There is no staging buffer —
   a seed killed halfway leaves **production** empty, not merely dev.

**Region consequence for Wave 5:** Neon is in `us-east-1`, so Todo 28's `primary_region = 'iad'`
(Ashburn, Virginia) is correct and now has its justification on record. No plan change needed.

## What Deviated from the Plan

### Deviation 1: the `chore(web)` commit was skipped — as the plan instructs

**Plan text (Todo 25):** *"Commit: `chore(web): production deployment configuration` (only if files
changed; if nothing changed, record that and skip the commit rather than creating an empty one)."*

**What happened:** `git status --porcelain` on `main` showed **only** ` M .omo/plans/cinepais-phase-4-deploy.md`
(checkbox bookkeeping). Nothing under `web/` or `agent/` changed, because every Wave 4 todo operated
on platform or database state with no repo-file representation:

- Todo 21 → a Vercel env var (platform)
- Todo 22 → a Vercel project setting (platform)
- Todo 23 → migrations + seed against Neon (database); its one temp script `web/scripts/tmp-verify-prod-counts.mts` was **deleted**, leaving `web/scripts/` with exactly its original three files
- Todo 24 → a deployment + browser session; its own evidence §9 records *"application source modified? NO — zero files changed by this todo"*

**Resolution:** no empty commit created. The handoff note and checkbox updates were committed as
`chore(omo): Wave 4 close — production deployment verified live`, which the plan's commit-count
criterion excludes via `--invert-grep --grep='^chore(omo)'`.

### Deviation 2 (carried, not fixed): 404 page returns HTTP 200

A nonexistent showtime *page* route answers **HTTP 200** while correctly rendering the 404 UI. This is
Next.js 16 streaming behaviour — the response shell is flushed before `notFound()` resolves on a
dynamic (ƒ) route, so the status line is already committed. **The API layer returns a true 404**
(verified). The plan's criterion was *"a 404, not a crash"*: the user-visible result **is** the 404
page, and nothing 500s. Recorded for visibility, **not fixed** — no application source was modified.

### Pre-existing gap noted at this gate (not Wave 4's, not fixed here)

§Wave boundaries item 4 requires one handoff note per wave. Present: `wave-1`, `wave-2`, and now
`wave-4`. **Absent: `.omo/handoff-fase-e-wave-3.md`** — Wave 3 closed with its evidence receipt but
without its handoff note. Flagged so the omission is visible; back-filling it is the orchestrator's
call, not Todo 25's scope.

**Otherwise: zero deviations.** Every Wave 4 todo hit its Accept criteria on the first attempt. No
redeploy, no re-seed, no hostname substitution, no fallback fired.

## Known-good state at handoff

- Branch: **`main`**, clean after the closing commit.
- `.omo/evidence/` still holds **0 files in git history** (`git ls-tree -r HEAD | grep -c '^.omo/evidence/'` → `0`). Never use `git add -f` on it — Todo 18's invariant.
- The **copilot is non-functional and that is EXPECTED**, not a defect: `https://cinepais-agent.fly.dev` does not resolve yet (`curl` exit 6). The web half is already correctly wired for it, so **no web rebuild will be needed** once the agent goes live — only the agent side's `CORS_ORIGIN`.

## Values Wave 5 needs (do not re-derive)

```
CORS_ORIGIN       = https://cinepais.vercel.app
WEB_API_BASE_URL  = https://cinepais.vercel.app     (no trailing slash)
Fly app name      = cinepais-agent                  (fallback: cinepais-copilot)
Fly primary_region= iad                             (co-located with Neon us-east-1)
Vercel projectId  = prj_sdPm0YinaSZyn2N9jMDC0vRd3KLS
Vercel orgId      = team_ALTbdfOZXZBgvcmPRv7bjwyF
```

⚠️ If Todo 29 finds `cinepais-agent` taken and switches to `cinepais-copilot`, you must update
`NEXT_PUBLIC_AGENT_URL` on Vercel **and trigger a full web rebuild** — the value is inlined at build
time, so an env edit alone will not take effect.

## Next step

Wave 5 deploys the agent to Fly.io. **Advancing the wave is the orchestrator's / user's call, not the
executor's** (§Wave boundaries item 3).

Wave 5 opens at **Todo 26**, which is `[MANUAL — USER]` ×2 and carries a **🔴 STOP CONDITION**:

- **A:** the user opens the Fly dashboard billing page and reports plan, free allowance, trial status, and payment method. *No `fly deploy` runs until this is reported.* (`fly billing` does not exist in flyctl v0.4.83 — it cannot be automated.)
- **B:** the user configures a Google-side spend cap for the Gemini API and reports **both** the amount **and** whether it **hard-stops requests** or **only alerts**.
- **If the account can only ALERT and cannot HARD-STOP, Wave 5 STOPS there** and the user is consulted before the agent is exposed publicly. Do **not** fall back to "the Todo 5 daily cap is the primary control" — that counter lives in an in-process cache and `min_machines_running = 0` resets it on every cold start. It is a courtesy brake, never a ceiling.

**Literal next command:**

```
/start-work cinepais-phase-4-deploy
```
