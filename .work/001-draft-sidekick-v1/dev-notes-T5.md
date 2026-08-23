# Dev notes — 001-draft-sidekick-v1 (T5: opponent panel and the window, FR-6)

Scope: design.md §T5 only — FR-6 (AC-34, AC-35, AC-36, AC-37). Nothing from T6–T15 was
implemented: the panel deliberately ships **without** FR-7's bent distribution or tendency
profile. T9's area (`src/gamelogs/*`, `scripts/prep-nflverse-data.ts`,
`test/msw/nflverseHandlers.ts`, `test/fixtures/player_stats-*`/`pbp-*`) was not touched — a
sibling developer worked it concurrently in this tree.

## Changes

**`packages/server/src/opponent/window.ts`** (new) — the whole task, one file, as design.md's file
plan lays it out (window derivation + panel assembly). Five exports:

| export | job |
|---|---|
| `buildPickSequence(shape, ownerOf)` | every pick in the draft, snake-ordered, ownership resolved |
| `computeWindow(input)` | the window (AC-34), pure in `(teamCount, rounds, picksMade, userTeamId, ownerOf)` |
| `countRemainingPicks(sequence, picksMade)` | per-team picks still owed (AC-35) |
| `buildOpponentPanel(input)` | one panel row per window pick (AC-35, AC-36, AC-37) |
| `computeOpponentPanel(source)` | window + rows in one call — what T10 recomputes per burst |

**Both of Terms' window branches collapse to one rule**, which is how the code states it: *the
window is every pick that will be made before the user's next pick*, and the on-the-clock branch
decides only whether the in-progress pick is inside it (it is not, when that pick is the user's
own — "the in-progress slot is never simulated"). Implementing the two sentences as two separate
walks is exactly how the off-by-one gets made in one direction only, and every downstream FR
inherits whichever window this returns.

**`packages/server/test/fixtures/sleeper-window-traded-draft.json`** (new) — §T5's done-when needs
"a fixture window containing a traded pick", and both existing fixtures only carry trades in
rounds already *played*, which the window never covers. This one is T2's real-league draft (same
10-team half-PPR league, same draft/league ids, same 22 picks, same round-2 trade) carried two
picks further and given two **future**-round trades:

- round 3, roster 4 (seat 8) → roster 7 (seat 2) — pick 28, inside the window
- round 4, roster 10 (seat 6) → roster 6 (seat 10) — pick 35, inside the window

With 24 of 150 picks made, pick 25 (seat 5, the user) is in progress, so the window is picks
26–35: **10 picks, 6 distinct teams**, seat 10 appearing three times and seats 7 and 9 twice.
Deduping by team, or reading ownership off the board column, each fails a different assertion.
Picks 23–24 (Nico Collins `7569`, Kyren Williams `8150`) use real Sleeper ids, re-fetched live
from `/v1/players/nfl` on 2026-08-22, as do the 16 example-player candidates in the test.

**Small additive edits to existing files**, each named because it touches another task's code:

- `packages/server/src/sleeper/sync.ts` — added a `BoardSync.pickOwnerResolver` getter. T2's dev
  notes hand T5 `buildPickOwnerResolver`, but it needs `draft.slot_to_roster_id` and the live
  `traded_picks` list, which only `BoardSync` holds and which a re-ingest can replace mid-draft.
  The getter is the seam; no other line of `sync.ts` changed. (Left `sync.ts` otherwise untouched
  on purpose — `prettier --check` already failed on it before this task, in T2's own code, and
  reformatting another task's file would be a drive-by.)
- `packages/shared/src/types/opponent.ts` — four changes to T1's sketch, all so the type states
  what FR-6 actually produces:
  1. `DraftWindow` gained `userOnTheClock` and `inProgressPickNo`. Terms' anchor branch is data,
     not something each of T6/T7/T8 should re-derive from the pick feed, and T8's AC-51 needs the
     draft's current pick number anyway.
  2. `DraftWindow.currentUserPickNo` is now documented as **null while the user is off the
     clock**. T1's comment read "null when the user has no pick left". Terms names a "current
     pick" only for the on-the-clock branch; making it mean "the user's soonest pick" instead
     would leave the window closing at `currentUserPickNo` in one branch and `nextUserPickNo` in
     the other, and every downstream consumer would have to branch. Under this reading
     `nextUserPickNo === null` is exactly AC-45's suppression trigger, which is what T1's comment
     on *that* field already promised.
  3. `OpponentPanelEntry.needDistribution` is now `Record<Position, number> | null` — see
     decision 3.
  4. `OpponentPanelEntry.bentDistribution` and `.tendencyProfile` are now optional, and `round`
     was added. FR-7 fills the first two (T6); `round` keeps snake math out of the React
     component that renders "pick 28 (round 3)".

### Decisions worth a reviewer's attention

1. **The window is derived from the seat order, not from the pick feed.** A window is made of
   picks that have not happened, so the pick feed cannot attribute them. `buildPickSequence`
   walks pick 1..`teamCount × rounds`, computes each pick's board column from the snake rule, and
   asks T2's resolver who owns it — the identical function sync uses to attribute the same pick
   once it lands, so the window can never disagree with the board about a traded pick (AC-12,
   AC-34).
2. **`mostLikelyPositions` is every position with nonzero weight, ranked — not the argmax.** AC-36
   asks for "most likely position(s) ... with likelihood derived from need-vector weights
   normalized to sum to 1": the likelihood is per-position, so the useful surface is a ranked set
   carrying its own numbers. Positions with zero weight (a team that already has its QB, and K/DST
   always) are not "likely" at all and are omitted rather than listed at 0. Ties resolve in the
   canonical QB/RB/WR/TE order — a team needing one RB, one WR and one TE has three genuinely
   equal likelihoods, and the row must not reshuffle between renders of an unchanged board.
   `needDistribution` still carries the full sum-1 picture for any consumer that wants it.
3. **A no-need-signal team gets `needDistribution: null`, not a zero or uniform vector.** Per
   Terms such a team drafts best-available from ADP order across QB/RB/WR/TE — that is a
   different regime, not a flat prediction, and `normalizeToDistribution` throws on an all-zero
   vector precisely so nobody launders it into one. Its `mostLikelyPositions` is empty and its
   examples come from cross-position ADP order instead. The `NO_NEED_SIGNAL` sentinel stays on
   `needVector`, so T7 branches on the value it already expects.
4. **Example ordering is recomputed over the *available* players, not read off
   `MatchedPlayer.samplingRank`.** T3's exported `assignSamplingRanks` is used, as design.md
   directs, but re-run per position over what is still on the board. AC-26's rule places an
   ADP-less player by his ECR rank *within the group*; once the players ahead of him are drafted,
   his place in what remains moves with them. The fixture proves it: Bucky Irving (no ADP, ECR 18)
   must appear ahead of Chase Brown (ADP 20.6, ECR 22), and within WR the ADP order
   (London, Higgins, Wilson) deliberately inverts the ECR order.
5. **`examplesPerPosition` is a named module constant (2), not a new `parameters.ts` key.** The
   PRD names no number here — AC-36 asks only for "example likely players" — so this is a display
   budget rather than one of the 🔶 AS-N knobs the constitution requires be configurable. It is
   injectable per call, following T2's decision 4 and T4's decision 7. Flagging it in case the
   reviewer wants it promoted to the shared table.
6. **The panel is derived, never accumulated.** `buildOpponentPanel` is a pure projection of
   `(window, roster panels, snapshot, board)`, so it cannot drift from the picks it was built
   from. That is what makes AC-35's "updated within 5 s of any pick" a question about *when T10
   recomputes*, not about any invalidation rule of its own — see "Left for downstream tasks".
7. **No observability sample is recorded here.** `DependentView` is `board | pickFeed | roster` —
   the views AC-11's 3 s clock covers. AC-35's 5 s is `insightRefreshLatencyMs`, the
   insight-refresh budget design.md §T10 explicitly assigns to the burst-recompute instrumentation
   (AC-67). Adding a fourth view to T2's enum from here would have put T10's measurement in T5's
   file. Flagging it as a judgment call.
8. **Snake order is assumed, and is the only order implemented.** AC-34 says "snake order and
   traded picks respected" and the PRD scopes v1 to snake drafts; a `linear`/`auction` branch
   would be untested code answering no acceptance criterion. `locatePick` is deliberately private
   and carries the rule in one place, so adding a branch later is a one-function change.
9. **`computeOpponentPanel` takes `teamCount`/`rounds` flat, not a `meta` object.** One input
   shape shared with `computeWindow`, and it names the exact two settings the window depends on —
   both read from the draft object's own `settings` (AC-30), never assumed.

## Test-first evidence

`packages/server/src/opponent/window.test.ts` was written and confirmed failing before
`window.ts` existed.

- failing: `npx vitest run --project server src/opponent` →
  ```
   ❯ |server| src/opponent/window.test.ts (0 test)

   FAIL |server|  src/opponent/window.test.ts [ packages/server/src/opponent/window.test.ts ]
  Error: Failed to load url ./window (resolved id: ./window) in
  /Users/willyu/willy-ff/packages/server/src/opponent/window.test.ts. Does the file exist?

   Test Files  1 failed (1)
        Tests  no tests
  ```
- first implementation run: same command → `Tests 2 failed | 30 passed (32)`. Both failures were
  in the two "composed against the live board" tests and both were **the test being wrong**: they
  passed `meta: sync.state.meta` to `computeOpponentPanel`, an input shape I had not settled when
  writing them (see decision 9). Corrected to `teamCount:`/`rounds:`; no assertion about behaviour
  changed. Recording it because vitest does not typecheck, so the mistake ran rather than failing
  to compile.
- passing: `npx vitest run --project server src/opponent` → `Test Files 1 passed (1) /
  Tests 32 passed (32)`, exit 0. Full root `npm test`: `Test Files 23 passed (23) /
  Tests 301 passed (301)`, exit 0 (269 before this task).
- commits: none — per this spawn's instruction the developer does not run git; the orchestrator
  commits. Test-first ordering is recorded here instead of by commit order.

Every expected value was hand-computed from the fixture before the implementation existed (the
six window seats' rosters, their need vectors and distributions, their remaining-pick counts, and
the per-position ADP orderings), and the implementation matched on the first run.

Coverage against §T5's "done when", one assertion apiece:

| Required | Test |
|---|---|
| a window containing a traded pick → correct owning-team sequence | "attributes a traded pick inside the window to the acquiring seat" — asserts pick 28 is `slot-2` and *not* `slot-8`, pick 35 is `slot-10` and not `slot-6` |
| ownership follows the traded-picks endpoint, not the original slot | "takes ownership from the resolver, not from the board column" (all three trades, incl. T2's round-2 one) |
| per-team need vectors match hand-computed values | "reports each team's unfilled starting slots, need vector and remaining picks" (seats 6 and 2) |
| per-team likely positions match hand-computed values | "ranks the positions a team actually needs, and omits the ones it does not" (seats 10, 2, 9) + "breaks ties in the canonical QB/RB/WR/TE order" (seat 6) |
| per-team example players match hand-computed values | "orders examples by ADP, not by ECR", "slots a player with no ADP in by ECR order within the position", "offers one example per likely position when asked for one" |

The rest of FR-6, each asserted individually:

- **AC-34** — snake reversal (`buildPickSequence`); both Terms branches ("runs from the pick after
  the user's in-progress pick…", "runs from the in-progress pick through the one before the
  user's next turn", "includes the in-progress pick, which the on-the-clock branch excludes");
  a team appearing three times not deduped; four empty-window cases (on the clock with no later
  pick, no pick left at all, draft over, seat unresolved per AC-5).
- **AC-35** — unfilled slots + need vector + remaining picks per team; remaining-pick counts for
  all six window seats plus the user, with trades in both directions; a repeated team keeping its
  own counts.
- **AC-36** — every entry's distribution sums to 1; the ranked positions and their likelihoods;
  examples in ADP order within those positions; drafted players never offered; and
  `bentDistribution`/`tendencyProfile` asserted **absent**, since AC-36 requires the *unbent*
  weights and FR-7 has not run.
- **AC-37** — every prediction tagged `'position'`, every example tagged `'player-example'`, the
  two in separate fields with disjoint shapes.
- **Terms' best-available regime** — a fully-rostered team reports `NO_NEED_SIGNAL`, a null
  distribution, no position predictions, and examples drawn across positions by ADP.
- **The seams** — one test composes `BoardSync.pickOwnerResolver` + `RosterPanelTracker.panelFor`
  through `computeOpponentPanel`; another advances the draft two picks through a real poll and
  asserts the window flips from the off-the-clock branch to the on-the-clock one.

## Test-file changes

- **none.** No pre-existing test file was modified or deleted. `src/opponent/window.test.ts` and
  `test/fixtures/sleeper-window-traded-draft.json` are new in T5. No existing fixture, msw handler
  or suite was edited; T2's 92, T3's 74 and T4's 36 tests all still pass untouched.

## Commands

Run from repo root.

- test: `npm test` → **exit 0** — 23 files, 301 tests passed (T5 contributes 32).
- lint: `npm run lint` → **exit 0**.
- typecheck: `npm run typecheck` → **exit 0** — all three `tsc --noEmit` invocations clean.

Scoped verification of T5's own work: `npx vitest run --project server src/opponent` → 32 tests,
exit 0; `npx prettier --check packages/server/src/opponent packages/shared/src/types/opponent.ts`
→ clean.

## Left for downstream tasks (seams T5 exposes, deliberately unwired here)

- **T6** imports `computeWindow` for which teams to profile, and fills `bentDistribution` /
  `tendencyProfile` on the entries `buildOpponentPanel` returns (both are optional on the type for
  exactly that reason). Its bend takes `entry.needDistribution` as the `needDist` input — and must
  handle the `null` case, which is the team FR-8 samples in the best-available regime instead.
- **T7** imports `computeWindow` for which picks to simulate. `window.picks` is already
  traded-pick aware and repeats a team once per pick it owns, so a team picking twice in the
  window is simulated twice with no special case. `countRemainingPicks` is draft-wide; AC-47's
  "remaining picks in the window including this one" is a count over `window.picks`, not this map.
  `assignSamplingRanks`-over-available (see decision 4) is the same ordering rule its per-run
  sampler needs.
- **T8** reads `window.nextUserPickNo` for "the user's next turn" and — since it is null exactly
  when the user has no later pick — for AC-45's suppression and AC-59's fewer-than-2-picks case.
  `window.inProgressPickNo` is the "current pick number" AC-51's value check compares an ADP
  against.
- **T10** calls `computeOpponentPanel({ teamCount, rounds, picksMade: sync.state.pickFeed.length,
  userTeamId: sync.state.userTeamId, ownerOf: sync.pickOwnerResolver, panelFor: (id) =>
  tracker.panelFor(id), players: snapshots.matching.players, board: sync.state.board })` once per
  burst-settled recompute, and stamps the result with `tracker.boardVersion`. Two things it owns
  that this task deliberately does not: **AC-35's 5 s** — the panel is current by construction, so
  the budget is entirely the cascade's, and it is the `insightRefreshLatencyMs` sample AC-67 asks
  T10 to record; and **the empty-window caption** — an empty `entries` array means "nothing
  between now and your next turn" *or* "your seat is unresolved" (AC-5), and only `attach.status`
  distinguishes them. `AppStateSnapshot.opponentPanel` is `Insight<OpponentPanelEntry[]>` and the
  rows carry the window, so no snapshot-shape change was needed; if T10 wants the anchors on the
  wire for T13's caption, `computeOpponentPanel` already returns the `DraftWindow` beside them.
- **T13** renders `mostLikelyPositions` (badge, `confidence: 'position'`) and `examplePlayers`
  (visibly lighter/"e.g.", `confidence: 'player-example'`) as the two distinct treatments AC-37
  requires — the tags are on the data, not left to the component to infer. `needDistribution ===
  null` is the "drafting best available" row, which has no position badges at all.
