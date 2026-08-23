---
gate: spec_review
verdict: fail
by: spec-reviewer
at: "2026-08-23T08:30:57Z"
---

## Evidence

Diff under review: `46000ab..HEAD` (`ddcf4c8`), 10 commits, 163 files, 45 479 insertions / 7 deletions.
`git log --oneline 0ae851c..46000ab` confirms the stated baseline holds only pipeline artifacts (PRD,
spec, design, sizing, constitution, research) and no implementation, so the develop-phase diff is
exactly this range.

### Gate commands (re-run by me, not quoted from dev-notes)

- `npm test` → exit 0 — `Test Files 40 passed (40) / Tests 634 passed (634)`, duration 8.24 s.
- `npm run lint` → exit 0 (`eslint .`, no output).
- `npm run typecheck` → exit 0 (all three `tsc --noEmit` projects: shared, server, web).
- `npx vitest run --project server test/e2eReplay.test.ts` → exit 0, 27 tests, 7.71 s.
- `grep -rn "it\.only|describe\.only|it\.skip|describe\.skip|test\.only|test\.skip|xit\(|todo\("` over
  every `*.test.ts(x)` → no matches. No test is focused, skipped or stubbed out.

### Per acceptance criterion

**Attach — FR-1**

- AC-1 **met** — `packages/server/src/sleeper/attach.ts:195` → `performFullIngest`
  (`packages/server/src/sleeper/sync.ts:364`) slices one deadline across all four calls via
  `remaining()`; budget is the `initialIngestTimeoutMs` parameter (10 000), read at
  `orchestrator.ts:364,369`. Test: `sleeper/attach.test.ts:83`.
- AC-2 **met** — `sync.ts:202` `deriveTeams` falls back team name → owner display name → slot number;
  `packages/web/src/App.tsx:48` gates the draft screen on explicit confirmation of the team list.
  Tests: `AttachScreen.test.tsx:118`, `sync.test.ts:67`.
- AC-3 **met** — `attach.ts:269` `listUserDrafts`, route `routes/attach.ts:100`; the convenience list is
  gated on a stored username (`AttachScreen.tsx:184`) while the paste form at `:110` is unconditional.
- AC-4 **met** — attribution runs through `sync.ts:119 teamIdForSlot` (`draft_slot` + `draft_order`).
  I grepped for `picked_by` / `roster_id`: neither is read for attribution anywhere; `roster_id`
  appears only in AC-12's traded-pick hop and as a display field. Test: `sync.test.ts:126`.
- AC-5 **met** — `sync.ts:184 resolveUserTeamId`, `attach.ts:211 needsManualSlot`,
  `orchestrator.ts:654 seatUnresolvedList` blocks the recommendation while leaving raw ECR rows
  visible. Tests: `orchestrator.test.ts:350`, `AttachScreen.test.tsx:193`.
- AC-6 **met** — `attach.ts:157` refuses a second attach rather than swapping. Test: `attach.test.ts:149`.
- AC-7 **met** — `attach.ts:110-129` classifies the failure and echoes `input` back on every failure
  path; `AttachScreen.tsx:76-81` never clears the field. Tests: `attach.test.ts:170,185`.
- AC-8 **met** — real mechanism, not a stub: a PID-keyed heartbeat file under `os.tmpdir()`
  (`sleeper/instanceHeartbeat.ts:44,187`), liveness-windowed at `:85`, and
  `computeEffectivePollInterval` at `:132` = `pollIntervalMs * (1 + secondInstanceBackoffFactor *
  otherLiveInstances)`. Wired into the live scheduler at `sync.ts:680,715` and production at
  `index.ts:40`. Test writes a real file with two foreign PIDs and asserts the doubled interval:
  `instanceHeartbeat.test.ts:98`. Caveat recorded below.
**Board sync — FR-2**

- AC-9 **met** — `sync.ts:680,691`, `pollIntervalMs` default 1000. Test: `sync.test.ts:555`.
- AC-10 **met** — enforced structurally, not merely targeted: `RequestBudget`
  (`sleeper/client.ts:236`) is consumed before *every* request at `client.ts:314` and refuses rather
  than sends. Under AC-8 back-off the rate only falls. Test: `client.test.ts:155-177`. Coverage gap
  recorded below.
- AC-11 **met** — `sync.ts:588 applyPicks` marks the board, appends to the pick feed with `teamId` and
  `isUserPick`; roster cache keyed on `boardVersion` (`roster/needvectors.ts:242`). `e2eReplay.test.ts:280`
  asserts `pickLag.maxMs < config.pickReflectionLatencyMs` over 315 real samples.
- AC-12 **met** — `sync.ts:159 buildPickOwnerResolver` (slot→roster→traded→roster→slot), exposed to the
  window at `sync.ts:504`. `e2eReplay.test.ts:442,459` assert both feed attribution and that the trade
  is visible *in the window* before the pick is made.
- AC-13 **met** — `e2eReplay.test.ts:105` compares the 150-pick replay's final snapshot field-by-field
  against a second orchestrator attached at the full board: identical board, feed, roster, window and
  candidate rows.
- AC-14 **met** — `sync.ts:708` keeps rescheduling while incomplete; `orchestrator.ts:291` publishes
  `draftStatus`. Tests: `sync.test.ts:526`, `SyncIndicator.test.tsx:26`.
- AC-15 **met** — exhaustive route grep: the only mutating routes are `POST /api/attach`, `/api/detach`,
  `/api/resync`; none writes board/pick/roster state. SSE serialises once and writes identical bytes to
  every tab (`routes/events.ts:35-47`). Test: `server.test.ts:337`.
**Board integrity and recovery — FR-3**

- AC-16 **met** — `sync.ts:483 syncIndicator`; UI ticks locally each second (`SyncIndicator.tsx:59`) so a
  dead stream cannot read as a quiet draft. Tests: `SyncIndicator.test.tsx:26,34`.
- AC-17 **met** — all three detectors exist and are individually tested inside
  `checkPickListIntegrity` (`sync.ts:300`): count-decreased `:304`, out-of-sequence `:317`,
  pick-changed player `:330` / team `:340`. Degrade-without-apply at `sync.ts:579`; automatic full
  re-ingest on the next good response at `sync.ts:563-566`. Tests: `sync.test.ts:219,228,237,246` and
  `:413-455` (parameterised through the live poll engine, asserting board, `boardVersion` and
  `lastSuccessfulSyncAt` all untouched).
- AC-18 **met** — Zod parse on every response (`client.ts:381`), every failure classified into
  `SleeperApiError`. Tests: `sync.test.ts:413,516`; `e2eReplay.test.ts:228`.
- AC-19 **met** — `sync.ts:663 resync()` clears the timer, re-ingests with `resyncTimeoutMs`, reschedules.
  `performFullIngest` (`sync.ts:373-380`) re-reads `getDraft` (settings **and** draft order),
  `getDraftPicks`, **`getTradedPicks`** and `getLeagueUsers`. `sync.test.ts:496` asserts all four
  endpoints were hit and `durationMs < resyncTimeoutMs`.
- AC-20 **met** — raw Sleeper name at `sync.ts:231`, flag at `:261`, matched-id set fed at
  `orchestrator.ts:383`. Exclusion is structural, not a filter: candidate list and simulation universe
  are built only from `bundle.matching.players` (`recommend/candidates.ts:95,127`,
  `orchestrator.ts:582-595`). Named warning at `PickFeed.tsx:42,105-114`. The invariant checker asserts
  it on **every** broadcast (`test/e2eReplay.ts:302`) with a proven-to-fire negative at
  `e2eReplay.test.ts:378`.
- AC-21 **met**, structurally — `orchestrator.ts:277`: `const recomputing = this.insights.boardVersion <
  indicator.boardVersion`, stamped onto all three insights at `:278-283`; the cascade is synchronous
  (`recompute()` sets the cache version at `:623`) so a snapshot can never mix two board versions.
  `e2eReplay.ts:230-261` asserts the identity on 60+ broadcasts with zero violations, and
  `e2eReplay.test.ts:355` proves the checker can fire.

**ECR/ADP snapshots — FR-4**

- AC-22 **met** — `snapshots/predraftCheck.ts:83-95` emits one `snapshot-stale` warning per snapshot
  against `snapshotStalenessWarningHours` (24), read from config at `:63`.
- AC-23 **met** — `snapshots/fantasypros.ts` parses the cheat sheet's embedded `ecrData` JSON;
  `predraftCheck.ts:98-102` emits `kdst-missing` when K/DST rows are absent. (Its message text is part
  of blocking issue 1 below.)
- AC-24 **met** — `predraftCheck.ts:105-113` emits `adp-pool-substituted` naming
  `teamCountRequested` vs `teamCountUsed`; pool buckets are the `adpPoolTeamSizes` parameter.
- AC-25 **met** — `snapshots/match.ts:207` tries the crosswalk `fantasypros_id → sleeper_id` first,
  then normalized name (`:214-218`), then team abbreviation for DST (`:198-205`). Unmatched entries are
  collected at `:302-305` and reported; they are excluded structurally because they never enter
  `MatchResult.players`.
- AC-26 **met** — `match.ts:245-262 assignSamplingRanks`: ADP order for players carrying an ADP, ECR
  order within position for those that do not.
- AC-27 **partially met — see blocking issue 2.** `predraftCheck.ts:116-123` emits
  `scoring-format-mismatch`, but only against Sleeper's coarse `metadata.scoring_type` **label**
  (`isHalfPprScoring`, `:21`), never against the league's granular scoring settings — which the
  pre-draft check structurally cannot see (`LeagueSummary`, `:32-37`, carries `teamCount`,
  `scoringType`, `rounds` and nothing else).
- AC-28 **met** — traced the whole path: an ECR fetch failure is settled, not thrown
  (`snapshots/store.ts:30-36,93-106`), so `matchSnapshots` stages nothing (the ECR loop at
  `match.ts:300` is the only source of `players`) and `computeCandidateList` short-circuits at
  `candidates.ts:259` to `disabledList()` with the explicit "No rankings snapshot loaded" state; the
  simulation universe is likewise empty. `BoardSync`, the pick feed (`orchestrator.ts:294-295`, read
  straight off `BoardSync`) and the roster panel (positions taken from Sleeper's own pick metadata,
  `sync.ts:259` → `needvectors.ts:82`, with the snapshot resolver only a fallback) all keep running.
  `predraftCheck.ts:51-58,126-127` and `CandidateList.tsx:302-305` render the stated mode. Coverage
  nuance recorded below.
- AC-29 **met** — `snapshots/store.ts:57-58` short-circuits to the cached bundle, `:59-69` dedupes
  concurrent loads, `:108` returns it `Object.freeze`d. `reset()` is called from exactly two sites —
  a new attach (`orchestrator.ts:372`) and detach (`:727`) — and `resync()` deliberately re-ingests
  Sleeper only (`orchestrator.ts:706-716`). No mid-draft snapshot refetch path exists. Caveat
  recorded below.

**Rosters — FR-5**

- AC-30 **met** — `roster/leagueSettings.ts`: team count, rounds and slot structure come from the draft
  object's own `settings` (both mocks and real leagues carry them); scoring comes from `/v1/league/<id>`
  at `:149`. The named-table fallback (`:76`) fires only where the API genuinely has nothing to give —
  a mock (`league_id: null`) or a failed fetch — is keyed off the draft's own API-supplied
  `scoring_type`, and records its provenance in `scoring.source`/`scoring.note`. That is a gap-filler,
  not a hardcoded format constant replacing an API read.
- AC-31 **met** — `roster/needvectors.ts:114 computeRosterPanel` publishes filled slots, unfilled
  slots (the need vector) and bench count; budget is `pickReflectionLatencyMs`.
- AC-32 **met** — slot keys are read generically; an absent key means zero of that slot, never a default
  league shape. `needvectors.test.ts:178` exercises a non-default (2 QB) shape.
- AC-33 **met** — `needvectors.ts:20,132`: K and DST are counted, displayed and filled like any other
  slot while contributing zero need weight.

**Opponent panel — FR-6**

- AC-34 **met** — `opponent/window.ts:269 buildOpponentPanel` emits one row per window pick, never
  deduped by team, each carrying `teamId` resolved through T2's `pickOwnerResolver` (so snake order and
  traded picks agree with sync).
- AC-35 **met** — each row carries `unfilledStartingSlots`, `needVector` and `remainingPicks`
  (`window.ts:293-299`).
- AC-36 **met** — `window.ts:247-263 rankPositions` over `normalizeToDistribution(needVector)`, i.e. the
  unbent need-vector weights normalised to sum 1; examples come from `assignSamplingRanks` (ADP) order
  within those positions (`window.ts:287-291`).
- AC-37 **met** — every position entry carries `confidence: 'position'` and every example carries
  `confidence: 'player-example'` (`window.ts:243,262`), rendered distinctly in `OpponentPanel.tsx`.

**Tendency profiles — FR-7**

- AC-38 **met** — `tendencies/profiles.ts` computes average reach, need-adherence and positional counts
  relative to the league's starting-slot proportions.
- AC-39 **met** — `profiles.ts:212` returns `neutralTendencyProfile` below `tendencyColdStartPicks` (3,
  configurable) and keeps the observed pick count so the UI can say "1 of 3 picks seen".
- AC-40 **met** — `profiles.ts:332 bendDistribution` produces the bent weights, `:396` attaches them to
  the panel rows, and they are what FR-8 consumes: `montecarlo.ts:141-152` (`toSimulatedPicks` copies
  `row.bentDistribution` onto `SimulatedPick`), read by the position draw and hashed into the seed at
  `montecarlo.ts:318`. A neutral profile is proved an exact identity on the distribution
  (`profiles.ts:318`).
- AC-41 **met** — `TendencyProfileTracker.discard()` (`profiles.ts:517`) is invoked on draft completion
  (`orchestrator.ts:545`) and on detach (`orchestrator.ts:724`); after discard every profile reads back
  neutral (`:478`). Nothing is written to disk.

**Survival — FR-8**

- AC-42 **met** — `montecarlo.ts:326 buildSimulationUniverse` takes the top `simUniverseSize` available
  players in ADP order and extends by `ensureIncluded` (the candidate rows, supplied by
  `candidates.ts:126 candidateSimulationIds`); the position draw reads `bentDistribution`, and its
  absence — the `NO_NEED_SIGNAL` team — is handled by sampling straight from ADP order rather than
  drawing a position (`montecarlo.ts:110-116` doc + the draw). K/DST are excluded by construction.
- AC-43 **met** — `SurvivalProjection.survivors` is a `runCount × universe.length` `Uint8Array` retained
  in full (`montecarlo.ts:363-375`), with `survivedInRun()` at `:385` as FR-10's accessor.
- AC-44 **met** — `montecarlo.ts:341-348 survivalBand`, thresholds from
  `survivalBandLikelyGoneMax` (0.25) / `survivalBandLikelyAvailableMin` (0.75). Comparisons are strict,
  matching AC-44's own "<25% / >75%" wording rather than the parameter-name suffixes — a defensible
  reading of the spec over the identifier.
- AC-45 **met** — `projection.suppressed` (`montecarlo.ts:353`) makes survival *absent*, not zero;
  `candidates.ts:144-151 survivalOf` returns null. Test: `e2eReplay.test.ts:160`.
- AC-46 **met** — `orchestrator.ts:482 onNewPicks` arms a `burstDebounceMs` timer, `:501 settleBurst`
  runs one cascade timed from the burst's final pick; interim snapshots carry `recomputing` via AC-21's
  comparison. `e2eReplay.test.ts:122` asserts three picks in one window produce exactly one recompute
  (12 → 12 → 13).
- AC-47 **met** — `montecarlo.ts:230 planKDstSaturation`: `saturated = unfilled > 0 && unfilled >=
  remaining`, and a saturated pick consumes no skill player. "Remaining picks" is read draft-wide,
  counting this pick, which is AC-47's own unqualified wording; design.md §T7's narrower
  `remainingPicksInWindowIncludingThis` would saturate every seat in every early-round window (two
  rounds in, `2 >= 1` fires for all of them and no player is ever drafted in any run). The
  implementation follows the AC over the design doc — correct precedence. Test:
  `montecarlo.test.ts:1014`.
- AC-48 **met** — `degraded` is stamped onto the projection at construction and onto every insight at
  `orchestrator.ts:282`.

**Candidate list — FR-9**

- AC-49 **met** — `candidates.ts:390-397`: `candidateListDefaultRows` (8) rows in raw ECR order, plus a
  pushed row when the FR-10 highlight falls outside them (`addedForHighlight: true`); `toRow`
  (`:153-167`) carries `ecrRank`, `positionalRank`, `adp` and `survival`.
- AC-50 **partially met — see blocking issue 1.** The one-interaction filter is met
  (`orchestrator.ts:683 rowsByPosition` precomputes per-position sets into the same snapshot, so the
  filter needs no round trip); K/DST rows come back with `survival: null` by construction. The
  **ADP-order fallback clause is unreachable in the shipped product.**
- AC-51 **met** — `candidates.ts:305-340` resolves exactly one reason by the AC's precedence:
  `plan-survival` (highlight moved and the top-ECR player's position *was* in the plan set),
  `need` (moved and it was not), `value` (not moved, `currentPickNo - adp >=
  valueThresholdAdpPicksEarlier`), else `best-available`. All five kinds have distinct tests
  (`candidates.test.ts:177,191,201,210,238`).
- AC-52 **met** — `candidates.ts:344-361`: `other` is the first different-position player in ECR order,
  the test is `|Δp|·100 <= nearTieSurvivalPct` **and** `|Δrank| <= nearTieEcrRanks`, and the highlight is
  never moved — only `reason` is rewritten. Merged with AC-58's clause into one `reason` string at
  `:373-377`.
- AC-53 **met** — `availableInEcrOrder` (`:99-104`) and `bestAvailableByPosition`
  (`lookahead.ts:146`) both filter drafted players *before* ranking, so the highlight cannot name one.
  Asserted on every non-recomputing broadcast of the 150-pick replay (`e2eReplay.ts` invariant,
  `e2eReplay.test.ts:214`) with a proven-to-fire negative at `:366`.

**Two-pick lookahead — FR-10**

- AC-54 **met** — `lookahead.ts:111 planPositions` reads the FR-5 need vector only
  (`needVector[position] > 0`); the displayed candidate set is never consulted.
- AC-55 **met, with a recorded spec defect** — see ruling 1 below.
- AC-56 **met** — `candidates.ts:295` `highlight = best.get(chosen.nowPosition)`; `:395` extends the rows
  when the highlight is outside them.
- AC-57 **met** — `comparePlans` returns `winner`, `runnerUp` and `separatingFact`
  (`lookahead.ts:341-361`); `CandidateList.tsx:250,254,262` renders all three.
- AC-58 **met** — `lookahead.ts:338 tooClose = runnerUp.score - winner.score <=
  planTotalTooCloseEcrRanks`; `candidates.ts:290-294` then highlights the plan with the lower `term1`
  (the higher-ECR current pick) while the *displayed* comparison still reports the real winner. The two
  tie statements are joined into one `reason` line, never rendered as two.
- AC-59 **met** — `lookahead.ts:293` returns `applicable: false` below `lookaheadMaxPicks`;
  `candidates.ts:308-314` keeps the ECR highlight and states that lookahead does not apply.
- AC-60 **met** — the same `lookaheadMaxPicks` (2) bound, and the enumeration is pair-shaped so raising
  the knob would require extending the module rather than silently reaching further.

**Game logs — FR-11**

- AC-61 **met** — all three entry points confirmed by grep: `CandidateList.tsx:182`, `PickFeed.tsx:85`,
  `RosterPanel.tsx:187`, all calling `openPlayerCard`; the card is an overlay over `DraftScreen`.
- AC-62 **met** — `shared/types/gamelog.ts:5-42` declares exactly AC-62's column sets: passing
  att/comp/yds/TD/INT, rushing att/yds/avg/TD, receiving tgt/rec/yds/TD/long/ydsPerTgt, plus `fumbles`.
- AC-63 **met** — `GameLogStore` returns seasons newest-first as tabs (`gamelogs/store.ts`), pinned by
  `store.test.ts:49`.
- AC-64 **met** — traced end to end: `orchestrator.ts:744-745` calls
  `gameLogStore.getPlayerCard(playerId, { scoring: active.league.scoring.settings })` — the attached
  league's own resolved dict, never a generic table; `gamelog.ts:35` documents that nflverse's
  precomputed `fantasy_points` columns are deliberately not used. `e2eReplay.test.ts:480` asserts the
  granular league dict is what scores the real-league bundle.
- AC-65 **met** — `hasData: false` card, pinned by `store.test.ts:104`.

**Observability — cross-cutting**

- AC-66 **met** — a genuine recorded metric, not a log line: `observability.ts:63-176` keeps a ring
  buffer, `recordPollResponse` (`:82`) starts the clock and `recordPickReflected` (`:89-106`) stamps
  `lagMs` per view — board and pick feed at `sync.ts:606-607` (re-ingest path `:644-645`), roster at
  `needvectors.ts:264-271`. Read out **during a draft** at `GET /api/debug/metrics`
  (`routes/config.ts:29-40` → `orchestrator.ts:760-766`): nearest-rank p95, max, count, the configured
  budget, and the last 200 raw samples. Nuance recorded below.
- AC-67 **met** — `observability.ts:114-131 recordBurstRefreshed`; the clock starts at the burst-final
  pick's poll response (`orchestrator.ts:485-490`) and stops after the whole FR-6→FR-7→FR-8→FR-9
  cascade (`:501-516`), one sample per burst rather than per pick. Same read-out, against the
  `insightRefreshLatencyMs` budget. `e2eReplay.test.ts:280` reads back 315 pick-lag and 29
  burst-latency samples from the real 150-pick replay, asserts a 3-pick burst coalesced into one
  sample, and asserts both maxima sit inside their configured budgets — so the instrumentation PRD
  §14's rehearsals will read is proven wired end to end, which is what these two ACs ask for.

### Rulings on the five flagged deviations

1. **T8's AC-55 departure (`term2` excludes `term1`'s player on same-position plans) — ACCEPTED; the
   spec's (and the PRD's) formula is defective, recorded here.** I re-derived the argument rather than
   taking it: with `term2` a function of `next` alone, `score(now, next) = f(now) + g(next)` is
   separable, so `argmin` factorises and the winning plan's now-position is `argmin f` — the best
   available player at a needed position — for every possible survivor matrix. Three primary-source
   consequences follow. PRD §FR-10's headline ("optimizes the user's next two picks jointly, not the
   current pick in isolation — and it, not a per-row rule, is what places FR-9's highlight",
   `prd/draft-sidekick/prd.md` FR-10) would be false of its own formula. PRD §FR-9's **plan/survival**
   reason, defined verbatim as "the winning plan moved the highlight off the overall top-ECR
   candidate", would be unreachable — leaving it and the **need** clause as two names for one
   condition. And AC-56 would reduce to "highlight the best available player at a needed position",
   making FR-10 ceremonial. The shipped exclusion (`lookahead.ts:321-324`) applies **only** when
   `nextPosition === nowPosition`, so every cross-position plan is bit-identical to the literal
   reading; it encodes what "at the user's next turn" already means once the plan's own now-pick is
   spent (an RB-now/RB-next plan cannot take the same back twice), and AC-55's no-survivor penalty then
   correctly prices a position whose only survivor was the one spent. Verified reachable and distinct
   in test: `candidates.test.ts:177` produces `reasonKind: 'plan-survival'` while `:191` produces
   `'need'`. **Defect to record for the PRD/spec:** AC-55 and PRD FR-10's second bullet should state
   that `term2` is computed over the position's players excluding the plan's own now-pick.

2. **AC-50's ADP-only K/DST fallback — BLOCKING implementation gap.** See blocking issue 1.

3. **T13's AC-36/AC-40 both-shown resolution — ACCEPTED.** AC-36 requires the likelihood be shown
   "prior to FR-7 adjustment"; AC-40 requires the panel "bends that team's displayed position
   likelihoods by its profile". The shipped panel renders `RB 50% → 60%` with an accessible name
   spelling out "50% from need, 60% after tendency profile" (`OpponentPanel.tsx:259-274`), and the
   arrow is suppressed below a 0.5 pp shift so a neutral cold-start profile renders one number.
   That satisfies **both** ACs literally rather than resolving the tension by overwriting one; it adds
   no capability beyond what the two ACs already require, and AC-37's confidence distinction is
   untouched. Minor spec ambiguity worth recording (AC-36's "prior to FR-7 adjustment" reads most
   naturally as scoping FR-6's derivation, not as forbidding FR-7's display bend), but the shipped
   behaviour is a superset of either reading and is not a deviation in substance.

   **Seat-vs-NFL-club reading of canonical team codes — ACCEPTED as correct.** No AC in FR-6 or FR-2
   asks for the drafted player's NFL club. AC-11's "attributed to its team" and AC-34's "each pick's
   owning team" both mean the drafting **seat**, which is what `teamLabel.ts` resolves (team name →
   owner display name → `Slot N`, AC-2's own order). `match.ts:88 normalizeTeam` canonicalises *NFL*
   abbreviations for feed matching and is correctly scoped to FR-4; the NFL club does reach the user
   where an AC asks for it, on the candidate row (`candidates.ts:162 team`). No gap.

4. **T15's mock-with-traded-pick fixture substitution — ACCEPTED; a design-doc artifact, not a spec
   deviation.** The claim checks out against the Sleeper API's shape: traded picks resolve through
   `slot_to_roster_id` and `roster_id`, and a mock has `league_id: null` and therefore neither — so
   `/v1/league/<id>/traded_picks` does not exist for a mock and design.md §T15's single fixture is not
   expressible. The split covers both ACs it was meant to cover: the mock bundle carries AC-4's
   seat-only attribution (`e2eReplay.test.ts:54` describe block), the real-league bundle carries AC-12
   (`:426` describe block, `:442`, `:459`). The round-5 trade is placed at overall pick 47, inside the
   window between the user's picks 44 and 57, so it is exercised in the opponent panel and the
   simulation *before* the pick is made, not merely in the feed afterwards. No AC loses coverage.

5. **T15's finding that a no-new-picks recovery leaves insights recomputing — ACCEPTED as not an AC
   violation; recorded as a spec gap and a backlog item.** Re-derived independently: `sync.ts:639`
   bumps `this.version` unconditionally on re-ingest, while `sync.ts:652-654` fires the new-pick
   listeners only when `newFeedEntries.length > 0`, and `orchestrator.ts:483` returns early on an empty
   pick list — so the cascade never arms and `orchestrator.ts:277`'s comparison holds `recomputing:
   true` until the next pick or a Re-sync (which flushes, `orchestrator.ts:520`). AC-21 requires that
   an insight from an older board be *marked recomputing and never presented as current*: satisfied,
   and in the strict direction. AC-46 conditions its recompute on a pick landing, which did not happen.
   No AC covers the flag *clearing* once the board stops moving. The behaviour is nonetheless a real
   wart — on a paused draft the panels sit dimmed indefinitely — and it bears on PRD §14's live
   rehearsal, whose SC-1 counter-metric is "non-converging board states". Recorded for the backlog, not
   as a gate failure.

### Scope sweep

- Walked all 163 files in `46000ab..HEAD`. Every source file traces to an FR group; the remainder is
  the scaffold the constitution's own commands require (`package.json`, `tsconfig*`,
  `eslint.config.js`, `.prettierrc`, `vitest.workspace.ts`, `vite.config.ts`, `tailwind.config.ts`,
  `postcss.config.js`, `package-lock.json`) plus `config.local.json.example` (the cross-cutting
  configurability requirement) and `packages/server/scripts/prep-nflverse-data.ts` (FR-11's local,
  free-to-run data source). **No scope creep found.**
- `.village/constitution.md` is modified — the three `{{…}}` command placeholders were filled with
  `npm test` / `npm run lint` / `npm run typecheck`. The placeholder text itself instructs that the
  architect fill them from design.md's chosen stack, so this is the template being completed, not an
  agent rewriting its own rules. No convention, override or budget was altered.
- `.gitignore` gains `node_modules/`, `dist/`, `data/cache/`, `config.local.json`, `*.tsbuildinfo` —
  all build/cache/user-override paths, nothing that hides source or evidence.
- **Non-goals:** grepped for each. No auth/accounts/credentials (zero hits for
  `password|oauth|jwt|login|signup`). No ESPN/Yahoo integration (only `espn_id`/`yahoo_id` as columns
  in the DynastyProcess crosswalk, unused for matching). No auction/dynasty/keeper/best-ball/IDP/TE-
  premium handling. No ECR blending or QB-skew correction — every display comparator is
  `a.ecrRank - b.ecrRank` (`candidates.ts:104,197`, `lookahead.ts:101-102`); ADP appears only as a
  display column, as FR-4/FR-8's sampling order, and in AC-51's reason test. No tendency persistence
  (`discard()` wired, nothing written to disk). No positional-run alerts. No picking, autodraft or
  queue management — `sleeper/client.ts` sets no HTTP method anywhere, so every Sleeper call is a GET;
  the only POSTs in the tree are the app's own `/api/attach|detach|resync`. No in-draft UI to fix
  unmatched entries. No in-app post-draft checklist. `packages/server/test/e2eReplay.ts` is the nearest
  miss to "a quantitative backtest/replay harness" — ruled **not** a violation: it replays a synthetic
  fixture inside the automated suite (which the spec's own AC preamble requires), ships in `test/`, and
  backtests nothing against historical drafts.

### Cross-cutting requirements

- **Configurable, not hardcoded:** every 🔶 AS-N number named in an AC maps to a key in
  `packages/shared/src/config/parameters.ts:125-160` with the stated default and a real read site —
  `initialIngestTimeoutMs` 10 000, `pollIntervalMs` 1000, `apiBudgetPerMin` 120,
  `pickReflectionLatencyMs` 3000, `resyncTimeoutMs` 5000, `snapshotStalenessWarningHours` 24,
  `adpPoolTeamSizes`, `insightRefreshLatencyMs` 5000, `tendencyColdStartPicks` 3,
  `survivalBandLikelyGoneMax` 0.25 / `survivalBandLikelyAvailableMin` 0.75,
  `candidateListDefaultRows` 8, `valueThresholdAdpPicksEarlier` 10, `nearTieSurvivalPct` 5 /
  `nearTieEcrRanks` 3, `planTotalTooCloseEcrRanks` 3, `lookaheadMaxPicks` 2, `simUniverseSize`,
  `secondInstanceBackoffFactor`. Overrides load from `config.local.json` with unknown-key and type
  validation (`server/src/config/loadConfig.ts:64-97`). A sweep of all 57 non-test source files with
  comments and string literals stripped found **no AS-N number inlined in logic**. Numeric collisions
  checked and cleared as different concepts: `client.ts:286` (per-request socket timeout, overridden
  explicitly on every AC-relevant call), `instanceHeartbeat.ts:25` (heartbeat cadence),
  `events.ts:20` / `SyncIndicator.tsx:25` (SSE reconnect and UI clock tick), `prep.ts:88` (nflverse
  crosswalk cache age). Three un-parameterised display budgets remain — `lookahead.ts:77
  DEFAULT_SHELF_SIZE`, `window.ts:70 DEFAULT_EXAMPLES_PER_POSITION`, `OpponentPanel.tsx:59-66` — each
  documented, each injectable at its call site, and none carries a 🔶 AS-N tag in the PRD. Acceptable
  under the rule as written.
- **PRD §9 vocabulary as identifiers:** all eleven terms present — `class BoardSync` /
  `Board`; `DraftWindow` / `computeWindow()`; `computeNeedVector()` / `NeedVector`;
  `computeCandidateList()` / `filterCandidateRows()`; `buildOpponentPanel()` /
  `computeOpponentPanel()`; `computeRosterPanel()` / `RosterPanelTracker`; `PickFeedEntry` /
  `PickFeed()`; `interface SyncIndicator` / `SyncIndicator()`; `interface Insight<T>`;
  `recomputing: boolean`; `degraded: boolean`. A sweep of 24 plausible synonyms (`watchlist`,
  `shortlist`, `picklist`, `syncStatus`, `connectionStatus`, `rivalPanel`, `myRoster`, `pickLog`,
  `recalculating`, …) returned zero hits.
- **Raw ECR, unadjusted:** confirmed. No blend, re-weight or QB-skew correction exists anywhere; the
  ADP column is the disclosure, exactly as the spec requires.

### Test-change audit

- `git diff 46000ab..HEAD --diff-filter=D` → **empty**: no test file was deleted.
- Walking every commit in the range, exactly three pre-existing test/test-support files were modified
  after being added, and each is flagged with justification:
  - `packages/server/test/msw/sleeperHandlers.ts` (modified in `7165086`) — flagged in
    `dev-notes-T4.md:167`; I read the hunk: purely additive (`league?` on the fixture bundle, a
    `failLeague` option, a `/v1/league/:leagueId` handler). No existing behaviour changed.
  - `packages/web/src/App.test.tsx` (modified in `7d5107a`) — flagged in `dev-notes-T11.md:200`, and
    pre-declared as a placeholder by `dev-notes-T1.md:135`. I read the hunk: T1's one-line scaffold
    assertion replaced by 5 real attach/draft-screen tests. The component it asserted on no longer
    exists.
  - `packages/server/src/gamelogs/store.test.ts` (modified in `45e7943`) — flagged in
    `dev-notes-T14.md:211`. I read the hunk: one new `it()` for `unsupportedScoringKeys`, plus two
    prettier reformats (quote style, object wrapping). No assertion weakened or removed. Minor: the
    note says "every existing case … is untouched", which is true of the assertions but overlooks the
    two cosmetic reformats — an inaccuracy in the note, not a violation.
- **No unflagged test change. Audit passes.**

### Findings recorded but not blocking

- **`packages/server/src/simulation/montecarlo.ts` contains 5 literal `0x00` bytes** (lines 275, 307×2,
  312, 318), used as FNV field separators inside template literals. `file` classifies the file as
  `data`, and plain `grep` therefore **silently skips the entire 617-line module** (`LC_ALL=C grep -c
  "AC-4" …` → rc 1; `grep -a -c` → 30). The delimiter choice is sound; the literal bytes are not.
  This is a verification hazard for every grep-based gate — it exempted the single most
  parameter-dense module in the tree from my first sweep and from a second reviewer's. `\0` escapes
  would fix it with no semantic change. Flagging for code_review, not a spec matter.
- **AC-10 under back-off and while degraded is untested.** The budget clamp makes the AC true
  regardless (`client.ts:314` refuses rather than sends), so this is a coverage gap, not an unmet AC.
  Worth an architect's eye: while degraded, each poll is a *full* re-ingest (4 requests) at 1 s
  cadence = 240/min nominal; the clamp holds AC-10 but converts the excess into `budget-exhausted`
  errors, which re-mark the board degraded — a sustained degraded episode self-throttles its own
  recovery.
- **AC-8 shares the cadence signal, not the budget counter.** `RequestBudget` is per-process, so two
  instances could each spend `apiBudgetPerMin`; the heartbeat back-off is what keeps the real per-IP
  total down (2 instances → 1500 ms each → ~80/min). AC-8's checkable clause ("the second instance
  raises its own poll interval") is fully met, and AC-10 is scoped to "a running instance", so neither
  AC is violated — but the spec's *intent* ("shares the per-IP API budget") is met by cadence rather
  than by a shared counter. `writeHeartbeat` is also an unlocked read-modify-write; racing instances
  can transiently drop each other's entry, self-healing within one 5 s heartbeat.
- **AC-28 has no integrated test.** All three halves are asserted — but each at a different layer
  (`store.test.ts:77`, `match.test.ts:226`, `predraftCheck.test.ts:193,201`,
  `CandidateList.test.tsx:525`) and never together. `snapshotHandlers({ecrStatus: 503})` is used only
  in `store.test.ts` and `fantasypros.test.ts`, never through `Orchestrator` or the e2e harness, so no
  test attaches with a failed ECR fetch and then asserts board sync, the pick feed and the roster panel
  still work on that instance. Not blocking — I traced the composition and it is structurally forced
  (empty `players` ⇒ `disabledList()`), not a runtime coupling that could silently drift — but it is
  the cheapest missing test in the tree.
- **AC-29's freeze is shallow.** `Object.freeze` on the bundle does not freeze
  `bundle.matching.players` (an array of mutable objects) or `byPlayerId` (a live `Map`). Immutability
  against a *refetch* — which is what AC-29 requires — is enforced; immutability against in-process
  mutation is convention. Every consumer copies before sorting (`candidates.ts:99,196`,
  `match.ts:250,253`), so nothing mutates today. For code_review.
- **AC-66's served p95 is per-view, not per-pick.** The AC's clock is "poll-response arrival to the pick
  reflected in *every* view"; the implementation records one sample per (pick, view) and pools them, so
  the served p95 is over per-view lags rather than per-pick max-across-views. `roster` is also sampled
  only for the user's own picks (`needvectors.ts:250-251`). The raw samples are all in
  `metrics.samples`, so an operator can reconstruct the per-pick max — the AC's bar ("observable/
  measurable … sufficient to evaluate") is met, but the headline number is not literally AC-66's.
  Related: AC-67's `refreshedAt` is stamped after `recompute()` but before `broadcast()`
  (`orchestrator.ts:506→509→515`), so the interval ends at cascade completion, sub-millisecond short of
  publication.
- **AC-64 for a mock is generic by necessity.** A mock has `league_id: null` and therefore no league
  object, so `leagueSettings.ts:112-117` falls back to the named table — a mock's card *is* scored
  generically. Unavoidable, and disclosed through `scoring.source`/`scoring.note`. Separately, the e2e
  fixture's league dict (`test/fixtures/e2eDraft.ts:563-576`) is numerically identical to the half-PPR
  table, so `e2eReplay.test.ts:480` cannot by itself distinguish "read the league" from "fell back";
  the distinguishing evidence is at the unit layer (`leagueSettings.test.ts:64`, `store.test.ts:76`).
- **Spec-defect list for the PRD/spec owner:** (a) AC-55 / PRD FR-10 bullet 2 — `term2` must exclude the
  plan's own now-pick, else FR-10 is provably inert (ruling 1); (b) AC-36 vs AC-40 — say explicitly
  that AC-36 scopes FR-6's derivation and AC-40 governs the display (ruling 3); (c) no AC covers the
  `recomputing` flag clearing after a content-free re-ingest (ruling 5).

## Blocking issues

1. **AC-50's ADP-order fallback for K/DST is unreachable in the shipped product, and the pre-draft
   check tells the user it will happen.**

   AC-50 (verbatim from PRD FR-9 bullet 2): "…the K/DST filter shows positional ECR order without
   survival math, **falling back to ADP order when the snapshot carries no K/DST rankings**." AC-23
   exists precisely because that snapshot is a real occurrence — it requires a pre-draft warning when
   K/DST rows are absent from a fetched snapshot.

   The fallback branch exists (`packages/server/src/recommend/candidates.ts:194-203`, guarded by
   `available.some(p => p.ecrRank !== null)`) but cannot fire. `matchSnapshots`
   (`packages/server/src/snapshots/match.ts:300`) builds `MatchResult.players` by walking the **ECR**
   feed only; ADP entries are consumed solely to attach an `adp` number to an already-staged ECR row
   (`match.ts:313-315`) and are otherwise reported as unmatched. `MatchedPlayer.ecrRank` is therefore
   typed and populated as `number`, never null (`packages/server/src/snapshots/types.ts:143`), and the
   orchestrator feeds exactly that list to the candidate layer (`orchestrator.ts:381`,
   `orchestrator.ts:683 rowsByPosition`). When a fetched ECR snapshot carries no K/DST, there are no
   K/DST `MatchedPlayer`s at all, so `filterCandidateRows` receives an empty `available`, the guard is
   irrelevant, and the K/DST filter renders **empty** — not ADP order.

   The only test covering the clause hand-builds inputs the pipeline cannot produce
   (`candidates.test.ts:394-409` constructs `CandidatePlayer`s with `ecrRank: null`), so the suite's
   green does not evidence the AC.

   This is compounded by a user-visible false statement: `snapshots/predraftCheck.ts:98-102` emits the
   AC-23 warning with the text "The FantasyPros snapshot has no K or DST rows, so the K/DST candidate
   filter **will fall back to ADP order**." As shipped, it will not.

   Both makers who touched this escalated it rather than resolving it (`dev-notes-T8.md:150`,
   `dev-notes-T10.md:148`), and neither offers a rationale that the AC should not be met — only that
   the fix belongs in a different subtask. The spec text is coherent and achievable, so there is no
   spec defect to record in its place.

   **What must change:** make ADP-only K/DST rows reachable end to end. Concretely — emit them from
   `snapshots/match.ts` (the natural shape is a second field on `MatchResult`, e.g.
   `adpOnlyPlayers: MatchedPlayer[]` with `ecrRank: null`, built from the ADP entries
   `resolveAdpEntry` already resolves to Sleeper ids at `match.ts:290` but currently discards), widen
   `MatchedPlayer.ecrRank` to `number | null` or introduce a distinct row type for them, and have the
   orchestrator include them when it builds `rowsByPosition` for K and DST **only** — never in the
   ECR-ordered main list, never in the simulation universe, and never eligible for the highlight, so
   AC-42/AC-47/AC-49 and the raw-ECR rule are unaffected. Add a test that drives the real pipeline
   (`matchSnapshots` → orchestrator → `rowsByPosition.DST`) from a fixture ECR snapshot with the K/DST
   rows removed and asserts ADP order comes back, replacing the synthetic-input unit test as the
   evidence for this clause. If instead the project decides the fallback is not worth building, that
   is a **spec change**: AC-50's clause and PRD FR-9 bullet 2 must be amended, and
   `predraftCheck.ts:98-102`'s warning text corrected to say the K/DST filter will be empty.

2. **AC-27 compares a scoring *label* where the criterion says scoring *settings*, so a half-PPR-labelled
   league with non-half-PPR scoring is silently accepted.**

   AC-27: "When the attached league's **scoring settings** differ from half-PPR, the pre-draft check
   warns that rankings are for a different scoring format." PRD FR-4 is more explicit still: "When the
   attached league's scoring settings (**read at attach, FR-1**) differ from the snapshot's scoring
   format … the pre-draft check shall warn."

   The shipped check reads only Sleeper's coarse `metadata.scoring_type` string:
   `predraftCheck.ts:116` tests `!isHalfPprScoring(league.scoringType)` against the exact-string set at
   `:19-22`. The pre-draft check **cannot** see the settings: `LeagueSummary`
   (`predraftCheck.ts:32-37`) carries `teamCount`, `scoringType` and `rounds` only, and
   `orchestrator.ts:441-446` passes `league.scoring.scoringType` while the granular dict sits unused on
   the very same object (`league.scoring.settings`, already fetched at attach by
   `roster/leagueSettings.ts:150` and already consumed by AC-64 at `orchestrator.ts:745`).

   The codebase itself documents why the label is not sufficient, from a live check:
   `packages/shared/src/config/scoringDefaults.ts:12-14` — a real league labelled `"ppr"` pays 6 for a
   passing TD and −2 for an interception where the conventional table pays 4 and −1; "A label is a
   category, not a scoring system." The same reasoning is why AC-30 insists settings be read from the
   API rather than assumed. The consequence is a false negative in exactly the case AC-27 exists to
   catch: a league labelled `half_ppr` that is TE-premium, or pays 6-point passing TDs, draws no
   warning at all, and the user drafts on ECR/ADP that do not fit their league believing they were
   checked.

   `dev-notes-T3.md:105-108` records the choice, but the rationale is a sequencing one — design.md §T3
   said to reuse "the FR-11/mock scoring-label logic" and the granular fetch did not exist yet. T4 then
   landed `leagueSettings.ts` and the loop was never closed; no note argues that a label check
   satisfies AC-27. Two lesser defects ride along: `isHalfPprScoring` is an exact-string set while
   `scoringFormatFromLabel` (`scoringDefaults.ts:70-83`) matches by substring, so `dynasty_half_ppr`
   warns in one place and resolves to half-PPR in the other; and a mock, whose label the orchestrator
   renders `'(none)'` (`orchestrator.ts:445`), always warns.

   **What must change:** widen `PreDraftCheckInput`'s `LeagueSummary` to carry the resolved
   `ScoringSettings` dict (and its `ScoringSource`), pass `league.scoring.settings` from
   `orchestrator.ts:441-446`, and make the AC-27 test compare that dict against
   `SCORING_DEFAULTS.half_ppr` — warning when the reception value is not 0.5 or when any other key
   differs materially — rather than testing the label. Keep the label in the message text (it is what
   the user recognises), and suppress or reword the warning when `scoring.source` is not
   `'league-settings'`, since a mock has no settings to compare and a fallback table trivially matches
   itself. Add a test with a fixture league labelled `half_ppr` whose dict carries a non-half-PPR value
   (e.g. `rec: 1` or `bonus_rec_te`) and assert the warning fires; today it does not.
