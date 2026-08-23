# Dev notes — repairs — 001-draft-sidekick-v1

Repair passes after a failed gate. One section per pass; each fixes only the blocking issues its
verdict names.

## Repair pass 1 (spec_review)

Verdict: `.work/001-draft-sidekick-v1/review-spec.md` — `fail`, two blocking issues.

### Changes

**Blocking issue 1 — AC-50's ADP-order K/DST fallback was unreachable in production.**

The fallback branch existed in `filterCandidateRows` but nothing could ever feed it: `matchSnapshots`
built `MatchResult.players` by walking the ECR feed alone, so a cheat sheet without K/DST produced no
K/DST rows at all and the filter rendered empty. Made the path real end to end:

- `packages/server/src/snapshots/types.ts` — `MatchedPlayer.ecrRank` widened to `number | null` and
  `fantasyProsId` to `number | null`, so the type admits a row the ECR snapshot does not carry. Two
  aliases keep every existing guarantee intact rather than pushing null-checks downstream:
  `EcrMatchedPlayer` (`ecrRank: number`, `fantasyProsId: number`) is what `MatchResult.players` and
  `byPlayerId` are now typed as — the ECR-ordered board still cannot contain an unranked row — and
  `AdpOnlyPlayer` (`ecrRank: null`, `adp: number`) pins the fallback row's shape. FR-6/FR-7/FR-8's
  structural `{ecrRank: number}` inputs are untouched.
- `MatchResult` gains `adpOnlyPlayers: AdpOnlyPlayer[]` — the ADP entries `resolveAdpEntry` already
  resolved to Sleeper ids and then discarded. Grouped by position, ADP order within each, which is
  also their `samplingRank` (the only order such a row has).
- `packages/server/src/snapshots/match.ts` — `resolveAdpEntry` now returns a `Resolution` (id +
  `matchedBy`) instead of a bare id, so an ADP-only row records its join path like any other. A
  `spentAdp` set records which ADP entries an ECR row already took its number from, by either join
  path, so nothing is emitted twice; `claimed` still guards against two ADP rows landing on one
  Sleeper player. `players`, `byPlayerId`, `unmatched` and `counts` are unchanged in meaning — an ADP
  row that reaches a Sleeper player was never "unmatched", and is not now.
- `packages/server/src/orchestrator.ts` — `ActiveSession.kdstAdpFallback` is resolved once per attach
  (the snapshot is immutable for the draft, AC-29): the ADP-only rows for a **non-skill** position the
  ECR snapshot ranks **not at all**. `rowsByPosition` appends them for that position only, so
  `filterCandidateRows` sees rows whose `ecrRank` is uniformly null and takes its ADP-order branch.
  They never enter the ECR-ordered list, `candidateSimulationIds`, the simulation universe or the
  highlight — all three read `active.players`, which is ECR-only. Asymmetry is handled per position:
  a snapshot with K but no DST keeps ECR order for K and falls back for DST.
- `packages/server/src/snapshots/predraftCheck.ts` — AC-23's warning no longer promises a fallback the
  ADP snapshot cannot keep. It counts the ADP-only K/DST rows and either names the fallback (with the
  count) or states that the filter will be empty.
- T12's empty-state sentence (`CandidateList.tsx:62`, "No available K in the loaded rankings.") is
  correct unchanged: it now renders only when both feeds lack the position (or every row is drafted),
  which is exactly what it says.

**Blocking issue 2 — AC-27 compared a scoring label where the criterion says scoring settings.**

- `predraftCheck.ts` — `LeagueSummary` gains optional `scoring: {source, settings}`: the resolved
  per-stat dict FR-5 already reads at attach, plus the `ScoringSource` that says whether it is the
  league's own dict or one of `scoringDefaults.ts`'s named tables.
- New `halfPprDivergences(settings)` compares the dict against `SCORING_DEFAULTS.half_ppr` key by key,
  absent ⇒ 0, with a 1e-9 tolerance (values are hundredths). The compared set is the half-PPR table's
  own keys plus `bonus_rec_te` / `bonus_rec_rb` / `bonus_rec_wr` — a real dict carries ~81 keys, and
  comparing kicking distances or IDP would warn on every league and mean nothing.
- The warning now names the divergent keys (`pass_td 6 vs 4`) and keeps the coarse label in the text,
  since the label is what Sleeper shows the user. The label-only test survives as the **fallback**
  branch, taken only when `scoring.source !== 'league-settings'` — a mock has `league_id: null` and
  therefore no dict anywhere, and a fallback table would only ever match itself.
- The label branch now uses shared `scoringFormatFromLabel` (substring: `dynasty_half_ppr` is
  half-PPR) instead of the local exact-string `HALF_PPR_SCORING_TYPES` / `isHalfPprScoring`, which are
  removed. That was the inconsistency the verdict flagged: the same label resolved to half-PPR in
  `scoringDefaults.ts` and warned here. No other module imported them.
- `orchestrator.ts:buildPreDraftCheck` passes `league.scoring.settings` and `.source` — the dict was
  already on the same object, already fetched at attach and already consumed by AC-64.
- `PreDraftCheckData.leagueSummary` is now **projected** to `{teamCount, scoringType, rounds}` rather
  than passed through, so the granular dict is an input to the check and never rides the wire on every
  broadcast. The shared type is unchanged.

**Deliberately not changed** (in scope for the verdict's wording, considered and left):

- `setMatchedPlayerIds` (AC-20's feed badge) is still built from the ECR board alone, so a drafted
  ADP-only kicker is still badged "Unmatched". Correct on its own terms — the *rankings* snapshot
  genuinely does not rank that player — and widening it would change AC-20's behaviour, which the
  verdict scoped out ("K and DST **only** … rowsByPosition").
- `computeCandidateList`'s `positionFilter` parameter still filters over ECR rows only. It has no
  caller anywhere in the tree (the orchestrator's precomputed `rowsByPosition` is AC-50's transport,
  per the verdict's own reading), so wiring the fallback into it would be speculative surface.

### Test-first evidence

- failing: `npx vitest run --project server src/snapshots/match.test.ts src/snapshots/predraftCheck.test.ts`
  → `Tests  10 failed | 40 passed (50)`. The ten, trimmed to their `FAIL` lines:

  ```
   FAIL |server|  src/snapshots/match.test.ts > matchSnapshots — ADP-only rows (AC-50's K/DST fallback) > emits the ADP feed's K and DST as ADP-only rows when the ECR snapshot carries none
   FAIL |server|  src/snapshots/match.test.ts > matchSnapshots — ADP-only rows (AC-50's K/DST fallback) > ranks the ADP-only rows of one position in ADP order
   FAIL |server|  src/snapshots/match.test.ts > matchSnapshots — ADP-only rows (AC-50's K/DST fallback) > emits nothing extra when the ECR snapshot ranks the K and DST itself
   FAIL |server|  src/snapshots/predraftCheck.test.ts > K/DST presence (AC-23) > says the filter will be empty when the ADP snapshot has no K/DST either
   FAIL |server|  src/snapshots/predraftCheck.test.ts > scoring format (AC-27) > warns on the settings, not the label, when a "half_ppr" league pays 1 per reception
   FAIL |server|  src/snapshots/predraftCheck.test.ts > scoring format (AC-27) > warns for the live counterexample: 6-point passing TDs under a conventional label
   FAIL |server|  src/snapshots/predraftCheck.test.ts > scoring format (AC-27) > warns for a TE-premium bonus, which no scoring label can express
   FAIL |server|  src/snapshots/predraftCheck.test.ts > scoring format (AC-27) > treats a key absent from the dict as zero, never as a match
   FAIL |server|  src/snapshots/predraftCheck.test.ts > scoring format (AC-27) > falls back to the coarse label when there is no dict to read (a mock)
   FAIL |server|  src/snapshots/predraftCheck.test.ts > scoring format (AC-27) > echoes the league summary read from the draft API, without the scoring dict
  ```

  The three `match.test.ts` failures are the missing `MatchResult.adpOnlyPlayers` field; the AC-27
  ones are the label check standing where the settings comparison belongs. Two verbatim:

  ```
  AssertionError: expected { teamCount: 10, …(3) } to deeply equal { teamCount: 10, …(2) }
   ❯ src/snapshots/predraftCheck.test.ts:273:33   (the scoring dict rode through onto the wire)

  Object {
    "code": "scoring-format-mismatch",
    "message": "This draft's scoring is \"dynasty_half_ppr\", but the ingested rankings and ADP are half-PPR. Ranks and ADP may not reflect this format.",
  }
   ❯ src/snapshots/predraftCheck.test.ts:246:72   (exact-string label set vs scoringFormatFromLabel)
  ```

- failing: `npx vitest run --project server src/orchestrator.test.ts` → `Tests  4 failed | 19 passed (23)`:

  ```
   FAIL |server|  src/orchestrator.test.ts > AC-50 — the K/DST filter when the ECR snapshot ranks no K or DST > renders the filter in ADP order, from the ADP snapshot, with no ECR rank
   FAIL |server|  src/orchestrator.test.ts > AC-27 — the scoring warning reads the league's settings, not its label > warns for a league labelled half_ppr whose settings are full PPR
   FAIL |server|  src/orchestrator.test.ts > AC-27 — the scoring warning reads the league's settings, not its label > warns for the live counterexample: a conventional label with 6-point passing TDs
   FAIL |server|  src/orchestrator.test.ts > AC-27 — the scoring warning reads the league's settings, not its label > warns for a TE-premium bonus the coarse label cannot express
  ```

  The AC-50 one is the blocking issue itself: `rowsByPosition.DST` came back `[]` where the ADP
  snapshot carries two defenses. The other three AC-50 cases in that block (rows kept out of the ECR
  list, empty filter when neither feed carries K/DST, ECR order when the snapshot does) passed before
  the fix as well — they are the guards that the fix must not break, not its drivers.
- One AC-27 case — `scoring format (AC-27) > lets the settings outrank the label in both directions`
  (label `ppr`, dict genuinely half-PPR ⇒ no warning) — was added after the implementation landed, so
  it is not in the failing run above. It would have failed against the old code, which warned on the
  label alone; recorded here rather than quietly counted as test-first.
- passing: `npm test` → `Test Files 40 passed (40) / Tests 655 passed (655)`, 8.30 s.
- commits: none made by this agent — the orchestrator commits (no git commands run per the task brief).

### Test-file changes

- `packages/server/src/recommend/candidates.test.ts` — **deleted** `filterCandidateRows` >
  "falls back to ADP order when the snapshot carries no K/DST rankings" (was :394-409). The verdict
  rejected it as evidence: it hand-built `CandidatePlayer`s with `ecrRank: null`, an input the
  pipeline could not produce, so its green proved nothing about AC-50. Replaced by
  `orchestrator.test.ts` > "AC-50 — the K/DST filter when the ECR snapshot ranks no K or DST", which
  drives the real ingest (fixture ECR feed with the K/DST rows stripped + FFC feed carrying them →
  `matchSnapshots` → attach → `rowsByPosition.DST`). A comment at the deletion site points to it.
- `packages/server/src/snapshots/predraftCheck.test.ts` — AC-23's "warns when a fetched ECR snapshot
  has no K or DST rows" now calls a new `skillOnlyEcr()` helper instead of building the same snapshot
  inline; the assertion is character-identical. AC-27's "echoes the league summary read from the draft
  API" now passes a league that **does** carry a scoring dict and asserts the output still equals the
  `{teamCount, scoringType, rounds}` trio — strictly stronger, and it pins the new projection.
- `packages/server/test/msw/snapshotHandlers.ts` — additive `adpData` option, mirroring the existing
  `ecrData` one. The covering test needs an ADP feed carrying two defenses, so that "ADP order" is an
  order and not a single row. No existing behaviour changed.
- `packages/server/src/orchestrator.test.ts` — `standUp` gains pass-through `bundle` / `players` /
  `ecrData` / `adpData` options, all optional and all defaulting to today's fixtures. No existing test
  changed.

### Commands

- test: `npm test` → exit 0, `Test Files 40 passed (40) / Tests 655 passed (655)`.
- lint: `npm run lint` → exit 0, no output.
- typecheck: `npm run typecheck` → exit 0 (shared, server, web).

## Repair pass 1 (code_review)

Verdict: `.work/001-draft-sidekick-v1/review-code.md` — `fail`, four blocking issues (B1–B4). The 14
non-blocking observations (N1–N14) are out of scope and untouched.

**Resume history.** This pass ran three times; only infrastructure ended the first two, never a
design problem. Attempt 1 landed B1 and wrote the red tests for B2/B4 before a stream watchdog
killed it; attempt 2 hit a session limit before changing anything. Attempt 3 (this one) inherited a
tree holding B1's fix plus failing tests with no implementations behind them, sanity-checked those
tests against the verdict (see "Inherited tests" below), and finished B2/B3/B4.

### Changes

**B1 — five literal `0x00` bytes as FNV separators in `simulation/montecarlo.ts`.** Landed in
attempt 1; re-verified here rather than re-done.

- The five separators are now `\0` escapes: `hashNumber`'s `` `${value}\0` ``, `deriveSeed`'s
  `` `${player.sleeperPlayerId}\0${player.position}\0` `` (two), `` `${pick.teamId}\0` `` and
  `'no-need-signal\0'`. Byte scan: 5 × `\0` escape, 0 × literal `0x00`.
- `file packages/server/src/simulation/montecarlo.ts` → `Java source, Unicode text, UTF-8 text`
  (was `data`); `grep -rn "deriveSeed" packages/server/src/` now finds the module.
- **The seed did not move.** Reconstructed the pre-repair file byte-for-byte (every `\0` escape
  turned back into a literal `0x00` — 5 NUL bytes, 0 escapes, exactly the shape the review's byte
  scan found), imported both modules side by side and derived a seed from one fixed board:
  `{"prerepairLiteralNul":2581010503,"currentEscape":2581010503,"identical":true}`. So no survival
  percentage or plan score changed, which is why no expected value anywhere needed updating.
- `montecarlo.test.ts:773` "pins the derived seed to a golden value for a fixed board"
  (`3486165602`) is the standing guard: every other assertion in that file is relative, so this is
  the only thing that would notice the separators being edited again.

**B2 — a throwing recompute cascade reached the event loop and exited the process; no error
boundary anywhere.** Four layers, matching the four paths the verdict enumerates.

- `orchestrator.ts` — `settleBurst()` wraps `this.recompute()` in try/catch. On a throw it records
  `cascadeFailure` (a `DegradedReason`), logs it, broadcasts, and returns; a later cascade that
  succeeds clears it. This one place covers both callers the verdict names — the burst-debounce
  `setTimeout` callback (`onNewPicks`) and `flushBurst()` on the Re-sync path — so neither needed
  its own guard. The pattern is `BoardSync.tick()`'s, one layer down.
- `cascadeFailure` is held **on the orchestrator, not pushed into `BoardSync`'s degraded state**,
  deliberately: the board is not what failed, and marking it degraded would put the poll loop into
  AC-17's full-re-ingest mode over a fault that has nothing to do with Sleeper. `snapshot()` ORs the
  two sources into the single `degraded` flag every `Insight<T>` already carries and into
  `sync.status`, and reports the board's own reason first when both are set. `recomputing` needs no
  change: the failed cascade never advanced `insights.boardVersion`, so AC-21's existing comparison
  already says "the board moved, this view did not".
- `observability.ts` — new `CascadeFailedSample` (`type: 'cascade-failed'`, board version, message)
  + `recordCascadeFailed`. Containing the throw must not also silence it; `index.ts`'s existing sink
  (everything except `poll-response`) prints it and `/api/debug/metrics` retains it.
- `routes/attach.ts` (×2) and `routes/resync.ts` — each `void (async …)()` IIFE now ends
  `.catch(next)`, and the handlers take `next`. Express does not await these, so a rejection was a
  floating one, which exits 1 on Node 20+.
- `routes/server.ts` — `errorBoundary`, an `ErrorRequestHandler` mounted last in
  `createSidekickApp`. Answers a fixed-sentence JSON 500; the real error goes to `console.error`,
  not the wire. Express's default handler renders `err.stack` into the body, which on this app means
  absolute developer paths in an HTTP response (exactly what B4 observed live). Delegates to
  `next(error)` when `res.headersSent` — reachable because `/events` streams.
- `processGuards.ts` (new) + `index.ts` — `installProcessGuards` registers `uncaughtException` and
  `unhandledRejection`, reports each fault and returns. Registering the listeners is what replaces
  Node's `exit(1)` default; that is the whole mechanism. **The one deliberate crash-as-last-resort
  is documented in the module header**: if reporting the fault *itself* throws, the guard exits 1
  rather than keeping an unknown-state process alive while emitting nothing. No recovery is
  attempted here and none should be — each fault's state is its owning module's problem.

**B3 — attach's three third-party fetches ran unbounded while `POST /api/attach` was held open.**

- New 🔶 parameter `snapshotFetchTimeoutMs`, default **15 000 ms**, in
  `packages/shared/src/config/parameters.ts` and documented in `config.local.json.example`.
  Kept separate from `initialIngestTimeoutMs` (10 000 ms) rather than reused: these are bulk
  documents (a ~3 MB crosswalk CSV) on hosts with no contract with us, so they earn a looser ceiling
  than a Sleeper JSON poll — and the operator should be able to move one without the other.
- `orchestrator.ts:startSession` now constructs `AbortSignal.timeout(config.snapshotFetchTimeoutMs)`
  and passes it as `SnapshotLoadInput.signal` — the field was already plumbed to `loadCrosswalk`,
  `fetchEcrSnapshot` and `fetchAdpSnapshot` and had simply never been given a value in production.
  One signal for the whole load, not one per request: the parameter budgets the load. Mirrors how
  `initialIngestTimeoutMs` is passed to the Sleeper calls ten lines earlier.
- An overrun lands in `SnapshotStore`'s existing `settle()` → `ecrError`/`adpError` → the pre-draft
  check's `no-ecr-loaded` / no-ADP warnings, i.e. AC-28's "board sync keeps running" path, instead
  of hanging attach past AC-1's budget. The crosswalk keeps its own stale-cache fallback.

**B4 — prototype-shaped player ids answered 500 with a stack trace instead of AC-65's no-data card.**

- `gamelogs/store.ts:getPlayerCard` — `this.cache?.players[playerId]` → an `Object.hasOwn` guarded
  read. An inherited `Object.prototype` member is truthy, so `players['toString']` slipped past the
  `if (!cached)` branch and reached `seasonsFor`, where `Object.entries(cached.seasons)` threw on
  `undefined`.
- `orchestrator.ts:playerCard` — same guard on `active.sleeperPlayers[playerId]`, so the
  `?? playerId` name fallback actually fires instead of resolving to a stringified prototype member.
- `byPlayerId` needed nothing: it is a `Map`, which has no prototype-key hazard.
- Chose `Object.hasOwn` over rebuilding the maps with `Object.create(null)`: both maps are parsed
  straight from third-party JSON at their source, so a null prototype would have to be re-imposed at
  every parse site, and the guard belongs at the read that takes browser input.

### Inherited tests — sanity-checked against the verdict

Attempt 1 wrote `orchestrator.resilience.test.ts` (7), `processGuards.test.ts` (5) +
`test/fixtures/processGuardsChild.ts`, and three assertions in `routes/server.test.ts` before it was
killed; the implementations behind them did not exist. Read all fifteen against B1–B4 before
writing any code. **None contradicts the verdict and none was modified.** They demand exactly what
B2/B3/B4 prescribe — degrade-and-log over exit, `.catch` on the three IIFEs, clean 500 JSON with no
stack or path, a `snapshotFetchTimeoutMs`-bounded attach, and the `hasData:false` card for the five
prototype-shaped ids. Two notes on how they are built, for the record:

- The resilience suite reaches the cascade throw through a `vi.mock` seam on `simulateSurvival`
  rather than a fixture. Justified in the file, and correctly: `simulateSurvival` genuinely throws
  on a picks/window length mismatch (`montecarlo.ts:514`), which is the throw B2 is about, but the
  orchestrator is what does that wiring, so no fixture can provoke it from outside. The seam is off
  unless a test arms it and the module is otherwise passed through untouched.
- `processGuards.test.ts` unit-tests the wrapper against an injected fake `process`, then runs
  `test/fixtures/processGuardsChild.ts` in a real child under `node --import tsx`. The child is the
  only honest evidence, since both faults exit 1 on an unguarded process — asserting "still alive"
  inside the runner would assert nothing.

### Test-first evidence

- failing (the inherited red tests, before any implementation): `npm test` →
  `Test Files  3 failed | 39 passed (42)` / `Tests  9 failed | 657 passed (666)` / `Errors  5 errors`.

  ```
   FAIL |server|  src/processGuards.test.ts [ packages/server/src/processGuards.test.ts ]
   FAIL |server|  src/orchestrator.resilience.test.ts > a recompute that throws > degrades the insights instead of killing the process
   FAIL |server|  src/orchestrator.resilience.test.ts > a recompute that throws > broadcasts the degraded state rather than leaving the browser on a stale frame
   FAIL |server|  src/orchestrator.resilience.test.ts > a recompute that throws > recovers on the next cascade that succeeds
   FAIL |server|  src/orchestrator.resilience.test.ts > a recompute that throws > contains the same throw on the Re-sync path, which flushes the burst by hand
   FAIL |server|  src/orchestrator.resilience.test.ts > the snapshot fetches at attach > bounds the third-party fetches with 🔶 snapshotFetchTimeoutMs instead of hanging attach
   FAIL |server|  src/orchestrator.resilience.test.ts > player ids that name an Object.prototype member > answers AC-65’s no-data card rather than throwing out of the index read
   FAIL |server|  src/routes/server.test.ts > REST endpoints > GET /api/player/:id/gamelog answers the no-data card for a prototype-shaped id
   FAIL |server|  src/routes/server.test.ts > REST endpoints > answers a route that throws with a clean 500 JSON, never a stack or a path
   FAIL |server|  src/routes/server.test.ts > REST endpoints > answers a throwing attach the same way, on the other router
  ```

  `processGuards.test.ts` failed at **collection** — `src/processGuards.ts` did not exist — so its 5
  tests are absent from the 666 total, which is why the suite gains 16 rather than 15.

  The five `Errors` are the point of B2, reproduced: the throw really did escape to the runtime.

  ```
  ⎯⎯⎯⎯⎯ Uncaught Exception ⎯⎯⎯⎯⎯
  Error: simulateSurvival: 3 simulated picks for a window of 4
   ❯ Orchestrator.recompute packages/server/src/orchestrator.ts:610:22
   ❯ Orchestrator.settleBurst packages/server/src/orchestrator.ts:529:10
   ❯ Timeout._onTimeout packages/server/src/orchestrator.ts:518:12
   ❯ listOnTimeout node:internal/timers:605:17

  ⎯⎯⎯⎯ Unhandled Rejection ⎯⎯⎯⎯⎯
  Error: boom
   ❯ packages/server/src/routes/server.test.ts:353:64
   ❯ processTicksAndRejections node:internal/process/task_queues:104:5
  ```

- passing (targeted): `npx vitest run packages/server/src/processGuards.test.ts packages/server/src/orchestrator.resilience.test.ts packages/server/src/routes/server.test.ts`
  → `Test Files  3 passed (3)` / `Tests  28 passed (28)`.
- passing (full): `npm test` → exit 0, `Test Files 42 passed (42)` / `Tests 671 passed (671)`, 8.26 s.
  Baseline was 655; +16 = 7 resilience + 5 processGuards + 3 `server.test.ts` + 1 golden-seed pin.
  **Zero pre-existing tests changed behaviour or were removed.**
- commits: none made by this agent — the orchestrator commits (no git commands run per the task brief).

### Test-file changes

No existing test was modified or deleted. Two additive changes, both flagged:

- `packages/shared/src/config/parameters.test.ts` — added one line,
  `snapshotFetchTimeoutMs: 15_000`, to the existing "carries the architect-supplied defaults"
  `toMatchObject`. B3's covering test for the *behaviour* is the resilience suite; this pins the
  *default* so the new knob cannot drift, matching how every other architect-added parameter is
  guarded. Additive only — no existing assertion touched.
- `packages/server/test/msw/snapshotHandlers.ts` — added optional `ecrDelayMs` / `adpDelayMs` /
  `crosswalkDelayMs`, and made the three resolvers `async`. Required by the inherited B3 test, which
  stalls ECR and ADP for 4 s to prove the timeout is what ends the wait. All three default to
  undefined, so every existing handler behaves identically.

### Deliberately not changed

- `selectSlot()`'s direct `recompute()` call is left unguarded. It runs synchronously inside the
  attach route's IIFE, so a throw there is now caught by `.catch(next)` and answered as a 500 —
  already covered by B2's route layer, and degrading a seat choice would be a behaviour change the
  verdict does not ask for.
- `startSession()`'s first `recompute()` is likewise unguarded: `attach()` already wraps it in a
  try/catch that tears the half-wired session down and reports a classified failure. Adding a
  degrade path there would contradict that teardown.
- All 14 non-blocking observations (N1–N14), including N6's `0.0.0.0` bind and N12's missing
  `SIGINT`/`SIGTERM` shutdown, which sit next to this pass's files but are out of scope.

### Commands

All four re-run from the repo root, exit codes captured directly (not through a pipe):

- test: `npm test` → **exit 0**, `Test Files 42 passed (42) / Tests 671 passed (671)`, 8.26 s.
- lint: `npm run lint` (`eslint .`) → **exit 0**, no output.
- typecheck: `npm run typecheck` → **exit 0** (shared, server, web).
- build: `npm run build` (`vite build`) → **exit 0**, `55 modules transformed`,
  `dist/assets/index-D-qxXAQs.js 187.19 kB │ gzip: 57.72 kB`.
