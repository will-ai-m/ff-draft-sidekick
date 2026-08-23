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
