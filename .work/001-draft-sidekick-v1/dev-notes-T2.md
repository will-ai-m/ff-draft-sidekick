# Dev notes — 001-draft-sidekick-v1 (T2: Sleeper attach, board sync, integrity and recovery)

Scope: design.md §T2 only — FR-1 (AC-1..AC-8), FR-2 (AC-9..AC-15), FR-3 (AC-16..AC-21), plus
AC-66's timestamp recording. Nothing from T3–T15 was implemented. T3's `snapshots/*` area and its
own msw handler module were not touched (a sibling developer worked them concurrently in this tree).

## Live re-verification, before any code (design.md §T2 asks for this explicitly)

design.md flags several Sleeper shapes as "verify at implementation time, don't assume", since the
mock used in the original AS-1 spike is purged. Checked live against `api.sleeper.app` and
`docs.sleeper.com` on 2026-08-22:

| Question | Answer found | Where it landed |
|---|---|---|
| Spike mock `1396790135072272384` still readable? | No — both `/v1/draft/<id>` and `/picks` return `null` (HTTP 200). | Client treats a `null` body as `not-found`, not `malformed` (`client.ts`). |
| Is the draft object's own `settings` the right slot source on both kinds? | Yes. Live real-league draft `289646328508579840` carries `teams, rounds, slots_qb, slots_rb, slots_wr, slots_te, slots_flex, slots_def, slots_bn, pick_timer, cpu_autopick, player_type`. | `deriveSlotConfig` (`sync.ts`); fixtures encode it. |
| Are the `slots_*` keys always present? | **No.** That live draft carries no `slots_k` at all. | Every `slots_*` key is optional in the schema; an absent key means **zero**, never a default shape (AC-30/AC-32). Test: "treats an absent slot key as zero". |
| Do mocks expose only a coarse `metadata.scoring_type`? | Confirmed, and stronger than design.md assumed: **no draft object of either kind carries a granular `scoring_settings`.** It lives only on `/v1/league/<id>` (verified: 100+ per-stat keys there). A mock's `league_id` is `null`, so a mock genuinely has no granular source. | `DraftMeta.scoringType` carries the label; both fixtures carry `metadata.scoring_type: "half_ppr"`. See "scoringDefaults.ts" below. |
| Is the DST slot key `slots_dst`? | No — `slots_def`. And the player dump spells team defenses `position: "DEF"` with `player_id` = team abbreviation (`"ARI"`), not `DST`. | `SLOT_SETTING_KEYS.DST -> 'slots_def'`, and `mapSleeperPosition` maps `DEF -> DST`. **Heads-up for T3**: design.md §T3 says to match DST against Sleeper pseudo-players "position `DST`" — the live dump says `DEF`. `mapSleeperPosition` (exported from `sync.ts`) accepts both. |
| `roster_id` type on picks | Not stable: docs show `"1"` (string), the live draft returns `10` (number), a mock returns `null`. | Schema tolerates all three. Never read for attribution (✅ AS-1). |
| `traded_picks` shape | `{season, round, roster_id (original owner), previous_owner_id, owner_id (current)}` — **roster ids, not draft slots.** | `buildPickOwnerResolver` does the `slot -> roster -> traded -> roster -> slot` hop via `slot_to_roster_id`. |

## Changes

**`packages/server/src/sleeper/client.ts`** — typed, Zod-validated, budgeted wrappers for
`/v1/draft/<id>`, `/picks`, `/traded_picks`, `/league/<id>/users`, `/user/<username>`,
`/user/<id>/drafts/nfl/<season>`, `/state/nfl`, `/players/nfl`. Every response is schema-parsed
before it reaches the app, so a malformed payload is a typed error rather than a crash or a partial
apply (AC-18). Failures are classified into a `SleeperErrorKind` (`network` / `timeout` /
`not-found` / `rate-limited` / `http-error` / `malformed` / `budget-exhausted`) because AC-7
requires the attach screen to *state which* failure occurred. `RequestBudget` is a rolling-minute
ceiling that refuses rather than exceeds `apiBudgetPerMin` (AC-10). The player dump is fetched at
most once per process and held in memory.

**`packages/server/src/sleeper/sync.ts`** — board derivation and the poll engine.
`deriveDraftState` rebuilds the whole picture (meta, teams, board, pick feed) from the complete
pick list every time; nothing is ever merged incrementally, so attaching mid-draft (AC-13) is
literally "the first poll". Attribution is `draft_slot` + `draft_order` only (AC-4), with traded
picks resolved on top (AC-12). `checkPickListIntegrity` implements AC-17's three inconsistency
signals. `BoardSync` owns the poll loop, the degraded/healthy transition, `boardVersion`,
Re-sync (AC-19), and observability recording (AC-66).

**`packages/server/src/sleeper/instanceHeartbeat.ts`** — AC-8. Heartbeat entries in
`os.tmpdir()/draft-sidekick-instances.json`; `PollIntervalController` turns the live-instance count
into `pollIntervalMs * (1 + secondInstanceBackoffFactor * others)` and layers the reactive 429
doubling (capped at `rateLimitBackoffMaxMs`, decaying after a run of clean polls) on top. A missing
or corrupt heartbeat file means "no other instances" — a broken temp file must never stop a draft
from syncing.

**`packages/server/src/sleeper/attach.ts`** — FR-1. `parseDraftId` (URL or raw id), the full
initial ingest inside `initialIngestTimeoutMs`, seat resolution, and `AttachManager` enforcing one
draft per process (AC-6). Failures echo the user's exact input back so the attach screen can retry
without clearing the field (AC-7). `listUserDrafts` is AC-3's convenience list.

**`packages/server/src/observability.ts`** — AC-66. Poll-arrival and per-view reflection
timestamps in a bounded ring buffer, plus a nearest-rank p95 helper so SC-1's ≤3 s bar is actually
judgeable during a rehearsal. T2 records; T10 decides how to surface.

**Fixtures** — `test/fixtures/sleeper-real-league-draft.json` and `sleeper-mock-draft.json`, each a
bundle of `{draft, picks, tradedPicks, leagueUsers}`. Same 10-team half-PPR draft, same 22-pick
snake sequence, real Sleeper `player_id`s (Gibbs `9221`, Chase `7564`, …) so later tasks can join
against them. Deliberate details, each earning a test:

- `slot_to_roster_id` is **not** the identity map, so nothing may assume `draft_slot === roster_id`.
- Real fixture: 9 owners across slots 1–9, **slot 10 empty** (bot/empty seat by slot number, AC-2);
  two owners never named their team, so `displayName` is legitimately null.
- Real fixture carries **one traded pick** (round 2, slot 7's pick → the roster drafting at slot 2),
  which is why pick 14 must attribute to `slot-2` (AC-12).
- Mock fixture: `league_id: null`, `picked_by: ""`, `roster_id: null`, `slot_to_roster_id: null`,
  `draft_order` with only the human seat — the AS-1 deltas, re-confirmed against the docs.

**`packages/server/test/msw/sleeperHandlers.ts`** — msw handlers plus a mutable `SleeperScenario`
(advance the draft, override the pick list, force the next N `/picks` responses to fail a chosen way).

### Decisions worth a reviewer's attention

1. **`boardVersion` bumps on any board change, not only on a full re-ingest.** design.md §T2 says
   "incremented on every successful full re-ingest"; taken as *only* that, a normal poll that adds
   a pick would leave insights looking current against a changed board, which is precisely what
   AC-21 forbids. Implemented as a superset: every applied poll **and** every re-ingest bumps it; a
   poll that brings nothing new deliberately does not, so insights don't churn between picks.
2. **While degraded, the retry *is* a full re-ingest.** design.md describes "on the next successful
   poll after a degraded spell, do a full re-ingest". Doing that literally costs two round trips
   (a picks-only poll to prove success, then the re-ingest). Instead, once degraded every tick
   attempts the full re-ingest directly — its `/picks` fetch is the successful poll. AC-17 is
   satisfied and it is one code path. Corollary: a re-ingest deliberately does **not** re-run the
   integrity check, because a full-state replace *is* the reset (otherwise a legitimately
   admin-removed pick would wedge the board degraded forever). Tested both ways
   ("recovers by full re-ingest…", "keeps retrying while degraded…").
3. **A self-imposed budget refusal is not a degraded poll.** `RequestBudget` exhaustion raises
   `budget-exhausted`, which at attach time is a stated failure (AC-7) and in the loop marks the
   board degraded like any other failed poll. It should never fire at default cadence (1 req/s =
   60/min against a 120/min budget); it exists so AC-10 holds even when attach, Re-sync and the
   poll loop overlap.
4. **Two mechanism knobs are named module constants, not new `parameters.ts` keys.**
   `DEFAULT_HEARTBEAT_INTERVAL_MS` (5 s) and `RATE_LIMIT_DECAY_AFTER_SUCCESSES` (10, the figure
   design.md states inline). Both are injectable via the controller's options. Reasoning: T1's
   table is the 🔶 AS-N set plus the two constants §T6/§T7 explicitly told T1 to add; the PRD names
   neither of these, and quietly growing the shared parameter table felt worse than a documented,
   injectable constant. Flagging it in case the reviewer wants them promoted.
5. **`BoardSync.start()`/`stop()` own the heartbeat's lifetime.** Polling and heartbeating share a
   lifetime, so AC-8 cannot be left silently unwired by an orchestrator that forgets to start the
   controller. Both calls are idempotent, so T10 may still manage it explicitly.
6. **Per-request timeouts are derived from config, never invented.** Attach uses
   `initialIngestTimeoutMs` (AC-1), Re-sync uses `resyncTimeoutMs` (AC-19), and a poll's `/picks`
   request uses `pickReflectionLatencyMs` (AC-11) — a poll slower than that can't meet AC-11
   anyway. `performFullIngest` treats its budget as an **overall** deadline across its 3–4 calls,
   not per call, so AC-19's 5 s is really 5 s.
7. **`config/scoringDefaults.ts` still deliberately not created** (continuing T1's decision #8).
   T2's job here was to confirm the shape, and it did: a mock has only `metadata.scoring_type`, and
   the granular per-stat dict exists only at `/v1/league/<id>`, which a mock has none of. That
   finding is now encoded in the fixtures, in `DraftMeta.scoringType`, and in a `client.ts` comment.
   The table's *contents* (per-stat point values per named format) are FR-11 scoring data with no
   consumer in T2 — writing it here would be unused code. It belongs to T4/T9, and `getLeague` was
   likewise left unwritten for the same reason (T2's endpoint list in design.md doesn't include it).
8. **`test/msw/sleeperHandlers.ts`, not `test/msw/handlers.ts`.** design.md's T1 dependency note
   puts shared fixture handlers in one `handlers.ts`, but T2 and T3 were developed concurrently in
   one working tree and both need handlers; a single shared file would have been a guaranteed
   collision. Split by source (`sleeperHandlers.ts` here; T3 owns its own). Whichever later task
   first needs both at once can add a one-line aggregate `handlers.ts`.
9. **The board holds drafted players only.** Absent means available. Enumerating all ~12 k Sleeper
   players in `Board.players` would bloat every SSE payload for no information gain.
10. **`matchedToSnapshot` defaults to true when no snapshot is loaded.** `deriveDraftState` takes an
    optional matched-id set; `null` (no ECR loaded) means nothing is flagged, so AC-28's
    "sync/rosters/pick feed still run" doesn't turn into 150 spurious AC-20 warnings. T10 passes
    T3's real matched set via `BoardSync.setMatchedPlayerIds`.
11. **The poll-scheduling test uses a hand-rolled `fetchImpl`, not msw.** Vitest fake timers and a
    real request interceptor don't mix; the behaviour under test is the scheduling, not transport.
    Every other test goes through msw as design.md requires.

## Test-first evidence

All five test files were written, and confirmed failing, before any implementation file existed.

- failing: `npm test` →
  ```
   FAIL |server|  src/observability.test.ts [ src/observability.test.ts ]
  Error: Failed to load url ./observability (resolved id: ./observability) ... Does the file exist?
   FAIL |server|  src/sleeper/attach.test.ts   → Failed to load url ./attach
   FAIL |server|  src/sleeper/client.test.ts   → Failed to load url ./client
   FAIL |server|  src/sleeper/instanceHeartbeat.test.ts → Failed to load url ./instanceHeartbeat
   FAIL |server|  src/sleeper/sync.test.ts     → Failed to load url ../observability

   Test Files  11 failed | 4 passed (15)
        Tests  24 passed (24)
  exit: 1
  ```
  (The other six failures in that run were the sibling T3 developer's in-flight files, not T2's.)
- passing: `npx vitest run --project server src/sleeper src/observability` →
  `Test Files  5 passed (5) / Tests  92 passed (92)`, exit 0. Full root `npm test`:
  `Test Files  15 passed (15) / Tests  190 passed (190)`, exit 0.
- commits: none — per this spawn's instruction the developer does not run git; the orchestrator
  commits. Test-first ordering is recorded here instead of by commit order.

Two test edits happened after the first green run, both because the **test** was wrong, not the
implementation; recording them so a reviewer isn't puzzled by the diff:

- "accepts a manually selected slot" originally asserted slot 7's picks were `[7, 14]`. Wrong:
  pick 14 is the round-2 pick slot 7 *traded away*, so it belongs to slot 2. Switched the test to
  slot 3 (`[3, 18]`), which has no trade — the fixture and the code were both right.
- "applies a new pick wholesale" asserted McCaffrey (`4034`, pick 17) was drafted after advancing
  to 12 picks. Off by five picks; corrected to McBride (`8130`, pick 12), and an assertion added
  that `4034` is still undrafted.

Coverage against §T2's "done when", one assertion apiece:

| Required | Test |
|---|---|
| both fixtures through attach | `attach.test.ts`: "attaches from a pasted draft URL…", "attaches to a mock draft…" |
| healthy poll sequence | `sync.test.ts`: "follows a healthy poll sequence…" (5 polls, mixed applied/unchanged) and "runs a mock draft through the same poll sequence…" |
| degraded — malformed payload | "marks the board degraded on a malformed payload (AC-18)…" |
| degraded — decreasing pick count | "…on a decreasing pick count" |
| degraded — out-of-order pick number | "…on an out-of-sequence pick number" (plus network failure and changed-pick cases) |
| automatic recovery on the next good poll | "recovers by full re-ingest on the next successful poll (AC-17)", "keeps retrying while degraded…" |
| manual Re-sync | "rebuilds the whole board out of cadence on Re-sync, inside the budget (AC-19)", "reports a failed Re-sync as degraded…" |
| correct `boardVersion` bumps | "follows a healthy poll sequence…" asserts the exact version series `[1,2,2,3,3,4]`; the degraded cases assert no bump |
| degraded flag transitions | asserted in every degraded/recovery test via `syncIndicator.status` and `degradedReason` |
| mock-vs-real → same downstream `Team` shape | "produces the same Team shape for a mock…" and "attributes every pick by draft_slot… identically for a mock" |
| heartbeat back-off math, separately | `instanceHeartbeat.test.ts` (12 tests): interval math from config, two faked live entries raising the interval, stale/corrupt-file handling, 429 doubling + cap, decay, decay floor |

## Test-file changes

- **none.** No pre-existing test file was modified or deleted. All five files
  (`src/sleeper/{client,sync,attach,instanceHeartbeat}.test.ts`, `src/observability.test.ts`) are
  new in T2. T1's four test files are untouched and still pass; T3's files were not touched.

## Commands

Run from repo root.

- test: `npm test` → **exit 0** — 15 files, 190 tests passed (T2 contributes 92).
- lint: `npm run lint` → **exit 0**.
- typecheck: `npm run typecheck` → **exit 0** — all three `tsc --noEmit` invocations clean.

## Left for downstream tasks (seams T2 exposes, deliberately unwired here)

- **T10** wires `AttachManager`/`BoardSync` into routes and the SSE broadcast. `BoardSync` already
  exposes `onChange` (SSE trigger) and `onNewPicks` (the burst-debounce trigger), and
  `AttachManager.attachState()` returns the `AppStateSnapshot.attach` projection directly.
- **T4** reads `sync.state.meta.slots` / `.teamCount` / `.scoringType`, and should record its own
  `pick-reflected` sample for the `roster` view (T2 records `board` and `pickFeed`).
- **T5** can import `teamIdForSlot` and `buildPickOwnerResolver` from `sync.ts` so the window's
  traded-pick ownership matches sync's, rather than re-deriving it.
- **T3** feeds `BoardSync.setMatchedPlayerIds(...)` to switch AC-20's warning on.
