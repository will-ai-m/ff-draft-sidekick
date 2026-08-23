---
gate: qa
verdict: pass
by: qa
at: "2026-08-23T13:45:00Z"
---
## Evidence

**Baseline & suite**

- Baseline: `.work/001-draft-sidekick-v1/baseline.txt` — captured on a greenfield tree with no `package.json`; `npm test` exited 254 (`ENOENT`). No pre-existing test could pass, so every head test is net-new-green and no failure is attributable to prior state.
- Head run: `npm test` at repo root → `Test Files 42 passed (42) / Tests 671 passed (671)`, exit 0, 8.45 s. Re-run after all manual drives (and after the nflverse cache was rebuilt) → identical `671 passed`, exit 0.
- `npm run lint` → exit 0, no output. `npm run typecheck` → exit 0 (shared, server, web). `npm run build` → exit 0, `55 modules transformed`, `dist/assets/index-D-qxXAQs.js 187.19 kB`.
- Net-new failures: **none**.

**Real-network data prep**

- `npm run prep:nflverse` (real github.com downloads) → exit 0 in 21.1 s: `crosswalk: 12480 rows`, `2026: no weekly stats published`, `2025/2024/2023: 6108/5935/5897 regular-season rows`, wrote `data/cache/gamelogs.json` — `seasons 2025, 2024, 2023, 863 players, 17927 games`, `7 rows with no crosswalk row, 6 with no Sleeper id`. Cache genuinely refreshed: sha256 moved `27ac22f9…` → `8b62df3b…`; re-read shows `{version, builtAt, seasons:[2025,2024,2023], players:863}`.

**Live Sleeper API (real network)**

- `npm run dev` booted both processes: `[sidekick] server listening on http://localhost:3001`, `VITE ready … http://localhost:5173`. `GET http://localhost:5173/api/config` (through the Vite proxy) → HTTP 200 with all 27 AS-N parameters (`pollIntervalMs 1000`, `apiBudgetPerMin 120`, `resyncTimeoutMs 5000`, `snapshotFetchTimeoutMs 15000`, …).
- Attach with a garbage id against the **live** api.sleeper.app → HTTP 400 `{"kind":"invalid-input","message":"\"total-garbage-!!!-not-a-draft\" does not contain a Sleeper draft id…","input":"total-garbage-!!!-not-a-draft"}` — input echoed verbatim (AC-7).
- Attach with a well-formed but purged id (`1396790135072272384`, the research spike's mock) → live 404 from Sleeper → HTTP 404 `{"kind":"draft-not-found","message":"Sleeper has no /v1/draft/1396790135072272384."}`, input preserved. Two *distinct* classified failures, both over the real wire.
- A joinable live mock draft was **not** feasible: Sleeper mocks are purged server-side once complete (confirmed — the research draft id and its `/picks` both return `null`), and joining a new one requires account sign-in, which is out of bounds for this agent. Took the stated fallback (T15 fixture bundles against the real server) and recorded the live-API contract checks above.

**Real server over the T15 fixture bundles** (real `index.ts` wiring — `installProcessGuards` → `loadConfig` → real `SleeperClient`/`PollIntervalController`/`Orchestrator` → `createSidekickApp` with the built `packages/web/dist` — real 1 s poll loop on real timers; only api.sleeper.app / FantasyPros / FFC / dynastyprocess intercepted; the **real** `data/cache/gamelogs.json` read by `GameLogStore.fromCacheDir()`)

- `POST /api/attach` (mock bundle, `league_id: null`) → HTTP 200 in **46 ms**, well inside the 10 s AC-1 budget. `attach: {"status":"attached","isMock":true,"userTeamId":"slot-4"}`; `board.teams` = 10 seats, seat 4 `isUser:true`, the other nine `isBotSeat:true, displayName:null` (AC-2/AC-4/AC-5). Real-league bundle instead returns `displayName:"Seat 1 FC", ownerDisplayName:"manager1", rosterId:3` (AC-2 names path).
- `GET /events`: on-connect frame is a full `AppStateSnapshot` while unattached (`retry: 1000`, `data: {"attach":{"status":"not-attached"},…}`); after attach the hub pushed a new full snapshot on every state change — 181 broadcasts across the run, and a ~1 s heartbeat frame keeping `sync.lastSuccessfulSyncAt` fresh (AC-16).
- Pre-draft check over the wire: ECR `capturedAt 2026-08-23T12:24:53Z · ageHours 1`, ADP `…ageHours 13.4 · poolDescription "half-PPR, 10-team pool"`, `unmatchedEntries: []`, `playersMissingAdp: [17 entries incl. Kansas City Chiefs, Los Angeles Chargers]`, `leagueSummary {teamCount:10, scoringType:"half_ppr", rounds:15}` — projected, granular dict not on the wire (AC-22/24/25/26).
- AC-27 (repaired path) fires on **settings**, not the label: real-league bundle relabelled nothing but paid `rec 1` / `pass_td 6` → `{"code":"scoring-format-mismatch","message":"This draft is labelled \"half_ppr\", but the league's own scoring settings differ from half-PPR (pass_td 6 vs 4, rec 1 vs 0.5)…"}`.
- `POST /api/resync` → `{"ok":true,"durationMs":4,"boardVersion":14,"failure":null}` — repeatedly 2–4 ms, far inside `resyncTimeoutMs 5000`. Forced re-read of the draft object flipped `sync.draftStatus` `"drafting"` → `"complete"` (AC-14/AC-19).
- `POST /api/detach` → snapshot reset to `{"attach":{"status":"not-attached"}, board.teams: [], pickFeed: []}`, poll loop stopped, and `GET /api/player/9221/gamelog` then answered HTTP 409 "No draft is attached…" (AC-41).
- AC-12 on the real-league bundle: pick 47 comes back `{"pickNo":47,"draftSlot":7,"teamId":"slot-2",…}` — attributed to the traded pick's current owner, not the seat on the clock.

**FR-11 game logs**

- `GET /api/player/9221/gamelog` (Jahmyr Gibbs — the fixture uses his real Sleeper id, so this reads the real nflverse cache): HTTP 200, `hasData:true`, `seasons [2025,2024,2023]`, 17 games in 2025, week 1 `{opponent:"GB", rushing:{att:9,yds:19,avg:2.11,td:0}, receiving:{tgt:10,rec:10,yds:31,td:0,long:7,ydsPerTgt:3.1}, fumbles:0, fantasyPoints:10}` (AC-62/63).
- AC-64 proven by differential, not by inspection: the *same* game scores **10.0** under the mock's half-PPR defaults and **15.0** under a league whose own dict pays `rec: 1` — exactly the +5.0 that 10 receptions × 0.5 predicts. Hand-check of the half-PPR figure: 1.9 rush + 3.1 rec yds + 5.0 rec = 10.0. ✓
- Prototype-shaped ids (`constructor`, `toString`, `__proto__`, `hasOwnProperty`, `valueOf`) each → HTTP **200** with `{"hasData":false}` — the clean AC-65 card, no 500 and no stack trace. B4's repair holds on the wire.

**Latency at stated scale** (150-pick fixture board, `monteCarloRunCount: 2000`, `simUniverseSize: 40` — stock defaults)

- `GET /api/debug/metrics` after driving 0 → 150 picks through the real poll loop: `pickLag {count:318, p95Ms:1, maxMs:1}` against the 3000 ms budget; `burstLatency {count:21, p95Ms:414, maxMs:422}` against the 5000 ms budget. Every one of the 21 burst samples sits at ~400 ms, i.e. the 400 ms `burstDebounceMs` plus single-digit ms of actual recompute — **~12× margin** on the 5 s AC-46/AC-53 budget at full board size.
- The same numbers appear as the structured AC-66/AC-67 log lines the PRD §14 rehearsal protocol reads, e.g. `{"type":"burst-refreshed","pickCount":15,"finalPickNo":145,"latencyMs":403}` and `{"type":"pick-reflected","pickNo":150,"view":"board","lagMs":0}`.
- Burst coalescing (AC-46): 3 picks revealed in one poll response moved `recomputeCount` 13 → **14**, not 16.
- Poll cadence (AC-10): request counter reset, then measured for exactly 60 s on a live drafting board → **59 requests/60 s**, all `/picks` (the draft object, traded picks and the ~14 MB player dump are not refetched per poll). Under the 120/min budget with 2× headroom.
- AC-8 second instance: a second process attached (shared heartbeat file showed both pids, e.g. `[{"pid":52574,…},{"pid":52784,…}]`); each instance's own 60 s rate fell from 59 to **41 and 39** — both raised their interval, combined 80/min, still inside the per-IP budget.

**Failure drills**

- Malformed payload window: 5 injected bad `/picks` bodies. SSE timeline shows `status:"degraded"` at t+1.5 s with `degradedReason:"Sleeper returned an unexpected payload for /v1/draft/…/picks: (root) Expected array, received object"`, `lastSuccessfulSyncAt` frozen, `candidateList.degraded:true` (AC-48), retries continuing at 1 s — then at t+6.5 s automatic recovery to `healthy` with `boardVersion 1 → 2` (full re-ingest, AC-17/18), and 4 picks that landed during the outage appeared at `boardVersion 3`. No partial apply, no crash.
- Network-failure window through the browser: the shipped sync indicator flipped to `DEGRADED · Could not reach the Sleeper API (/v1/draft/…/picks): Failed to fetch` and back to `HEALTHY` on recovery.
- **Kill/restart mid-draft (AC-13):** `kill -9` on the attached process, then two independent processes compared — one attached cold at 97 visible picks, one attached at 90 and driven live to 97 one pick at a time. After stripping only wall-clock and `boardVersion`, the two `AppStateSnapshot`s are **byte-identical (43 610 bytes each)**; `pickFeed`, `userRoster`, `opponentPanel`, `candidateList`, `board` and `preDraftCheck` all compare equal. State rebuilds from the full pick list alone, and the Monte Carlo seed is board-derived.
- **Thrown recompute (ed36cd7 containment):** three faults injected into the live process — (1) a throw from a `setTimeout` callback, (2) an unhandled promise rejection, (3) a one-shot throw shadowing `Orchestrator.recompute`, reached via the Re-sync `flushBurst` cascade. Process **survived all three** (pid 51862 before and after, `GET /api/health` still 200). Log shows `[sidekick] uncaughtException: …`, `[sidekick] unhandledRejection: …`, and `{"type":"cascade-failed","boardVersion":13,"message":"The recompute cascade failed: qa-injected recompute fault"}`; the snapshot went `status:"degraded"` with that reason and `candidateList.degraded:true` — then the next successful cascade cleared it back to `healthy`, `degradedReason:null`, 8 rows.
- **AC-28 (FantasyPros down):** ECR endpoint forced to 503 at attach → attach still succeeded, `sync healthy`, 40 picks on the board, roster panel populated, opponent panel live, `candidateList.disabledReason: "No rankings snapshot loaded — candidates, survival and recommendations are unavailable."`, warning `no-ecr-loaded` naming the exact HTTP failure.

**Served frontend, driven in a real browser** (built `dist` served by the same Express process)

- Pre-draft screen renders teams + owners, both snapshot ages, pool description, league settings, the AC-27 warning verbatim, the unmatched (0) and matched-no-ADP (17) lists, and a "Start drafting" gate — teams shown *before* any insight (AC-2).
- Draft screen renders all five surfaces live off SSE with no reload: sync indicator (`HEALTHY · Last sync 1 s ago · Draft: drafting · Re-sync · Detach`), roster panel (filled/unfilled/`STILL NEEDED QB 1 TE 1 K 1 DST 1`/bench), pick feed (`6.04 DJ Moore WR Seat 4 FC YOU`), candidate list (`ECR / POS / PLAYER / ADP / SURVIVAL` with `99% Likely available`, `42% Coin flip` bands) with exactly one `RECOMMENDED` row and its reason line `"Luther Burden III (WR) fills no unfilled starting slot — Tyler Warren (TE) does."`, the plan comparison (`Winning plan TE now / QB next · 115.5` vs `Closest alternative QB now / TE next · 118.6`) and the separating survival fact, and the opponent panel with the window, per-team need vectors, tendency-bent likelihoods rendered as `QB 50% → 44%`, `e.g.` player examples, and per-team profile summaries (`6 picks · drafts at market · drafts to need (83%) · WR-heavy`) — the AC-37 position-vs-player distinction is visible.
- AC-20 in the UI: after driving past pick 88, the feed shows `9.08 Dontae Prewitt WR Seat 8 FC` under the raw Sleeper name with exactly one `role="note"` warning: "Dontae Prewitt is not in the rankings snapshot — shown under the raw Sleeper name and excluded from the candidate list and simulation."
- AC-61–64 in the UI: clicking a pick-feed name opened the player card as an overlay (no navigation) with season tabs `2025 / 2024 / 2023`, the note "Points are in your league's scoring settings", and the position-appropriate columns `RUSHING att/yds/avg/td`, `RECEIVING tgt/rec/yds/td/long/yds-per-tgt`, `FUM` — week 1 showing **15.0** under the full-PPR league, matching the HTTP-level differential.
- AC-45: after the user's last pick landed, every candidate row's `survival` was `null` and the reason line read "Lookahead does not apply with 0 picks left — best available: Dalton Kincaid (ECR 114)."
- AC-15: two browser tabs on the same instance showed identical board state simultaneously (`92 picks`, same `RECOMMENDED Tucker Kraft`, same 8 rows) with no write path between them.
- AC-7 in the UI: typing `my-garbage-draft-id-oops` and pressing Attach rendered "\"my-garbage-draft-id-oops\" does not contain a Sleeper draft id. Paste a draft URL or the id itself." **with the typed text still in the field**; pasting a valid URL into the same field then attached successfully.

**Non-blocking findings** (recorded, none breaks a criterion)

- *Recovery with no outstanding picks leaves panels flagged.* Confirmed live over the wire, not just in T15's note: after an automatic degraded→healthy recovery in which no new pick arrived, `boardVersion` bumps without a recompute, so the header reads `RECOMPUTING` and all panels dim until the next pick lands or Re-sync is pressed. Verified both exits — advancing one pick returned the indicator to `HEALTHY` at 93 picks. AC-21 holds (nothing stale is presented as current) and FR-3's one-click recovery clears it, but a user who is on the clock when a blip resolves sees dimmed panels at the worst moment. Backlog candidate.
- *No-rankings mode over-badges the feed.* With no ECR snapshot loaded, every pick renders an `UNMATCHED` badge and its own `role="note"` (40 picks → 40 notes) even though the candidate list already states the real cause once. Each note is individually true; the aggregate is noise. Cosmetic, rare mode.
- *`body` has no background colour* (`getComputedStyle(document.body).backgroundColor === "rgba(0,0,0,0)"`), so scrolling past the app container shows the browser's white default under a dark UI. Cosmetic.

## Blocking issues

None.
