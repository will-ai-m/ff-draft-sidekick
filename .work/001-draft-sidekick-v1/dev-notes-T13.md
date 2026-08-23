# Dev notes — 001-draft-sidekick-v1 (T13: opponent panel, roster panel, pick feed UI)

Scope: design.md §T13 only — the three mount points T11 left named and snapshot-wired. Nothing in
`packages/server/`, nothing in `packages/shared/`, and no other task's component or test was
touched. T12 (`CandidateList.tsx`) and T14 (`PlayerCard.tsx`, `state/playerCard.ts`) were worked
concurrently by sibling developers in this same tree and are untouched here.

## Changes

**Rewritten — `packages/web/src/components/OpponentPanel.tsx`.** The window strip plus one row per
window pick: pick number and round, the owning team, remaining picks, unfilled starting slots,
AC-36's need-derived position likelihoods, AC-40's bent likelihoods beside them, AC-37's separately
treated example players, and the compact tendency summary with AC-39's `'early'` gray-out. Two new
props, `teams` and `attachStatus` — see decisions 2 and 4.

**Rewritten — `packages/web/src/components/RosterPanel.tsx`.** AC-31's three readings as three
separate views: starting slots as filled-of-total (FLEX among them, K/DST among them per AC-33),
the bench count on its own line, and the count-shaped unfilled list. Which rows exist at all comes
from `slots`, so AC-32's shapes need no branch. Plus a `Drafted` list of the user's own players,
each a `<button>` calling `openPlayerCard` (AC-61) — see decision 11.

**Rewritten — `packages/web/src/components/PickFeed.tsx`.** Newest-first pick list, each entry
attributed to its drafting seat and flagged mine-vs-opponent in colour *and* in its accessible
name, with AC-20's warning badge on any pick whose player never matched the snapshot. One new
prop, `teams`. Every entry's player name is a `<button>` calling T14's `openPlayerCard` (AC-61).

**New — `packages/web/src/components/teamLabel.ts`.** The one place a seat is turned into a name,
imported by both the pick feed and the opponent panel so the same team cannot be spelled two ways
in two panels.

**Amended — `packages/web/src/screens/DraftScreen.tsx`.** Four props on the three mount points:
`teams={snapshot.board.teams}` on both new consumers, `attachStatus={snapshot.attach.status}` on the
opponent panel, and `players={snapshot.pickFeed.filter((e) => e.isUserPick)}` on the roster panel.
This is T13's own mount point in the shell; no other line of the screen changed. (T14's
`PlayerCardHost` had landed in the same file by then and composed cleanly.)

**New tests** — `components/OpponentPanel.test.tsx` (20), `components/RosterPanel.test.tsx` (15),
`components/PickFeed.test.tsx` (12). Fixtures are built inside each test file rather than added to
T11's shared `test/fixtures.ts`, deliberately: two siblings were writing in this tree and that file
is the one every web suite imports.

## Decisions worth a reviewer's attention

### 1. AC-36 and AC-40 both bind, and they say opposite things — so both are shown

AC-36: the panel displays likelihoods "from that team's need-vector weights normalized to sum to
1, **prior to FR-7 adjustment**". AC-40: the panel "**bends** that team's displayed position
likelihoods by its profile". Read literally, one forbids what the other requires.

Resolved by showing the pair: `RB 50% → 60%`, with the accessible name spelling it out ("50% from
need, 60% after tendency profile"). AC-36's unbent number is displayed, AC-40's bend is applied to
what is displayed, and neither is satisfied by quietly overwriting the other. It also happens to be
the more useful reading — the profile's effect on a team is legible instead of baked invisibly into
one number, which is what the mock-rehearsal loop (PRD §14) has to eyeball to tune the formula.

The arrow only appears when the two differ by ≥ 0.5 pp (`BEND_VISIBLE_MIN`), so a neutral
cold-start profile — which T6 proves is an exact identity on the distribution — renders one number,
not `27% → 27%`.

### 2. `teams` is a prop, because a `teamId` is not a team name

`OpponentPanelEntry` and `PickFeedEntry` both carry `teamId` (`slot-5`) and nothing else about the
seat. AC-11 wants the pick "attributed to its team" and AC-34 wants "each pick's owning team", which
means resolving through `board.teams` — the same records AC-2's attach screen displays. Fallback
order is AC-2's own: team name → owner display name → `Slot N`, which every seat has even when
Sleeper names it not at all.

**On "canonical team codes" in this spawn's brief:** T3's `normalizeTeam` canonicalizes *NFL* club
abbreviations (JAC→JAX, LVR/OAK→LV) for feed matching. No NFL club code reaches either of these
panels — `PickFeedEntry` carries `playerId`/`playerName`/`position` and no NFL team, and adding one
would mean editing T2's `sleeper/sync.ts` and T1's `types/board.ts` and promoting `normalizeTeam`
out of the server package, none of which is in T13's area or answers any AC in §T13's list. So the
canonical identity used here is the **drafting seat**, resolved once through `teamLabel.ts`. Flagged
rather than assumed; if a reviewer wants the drafted player's NFL club in the feed, it is a
server-side field addition, not a frontend change.

### 3. The pick feed runs newest-first

design.md calls it a "chronological pick list" and AC-11 says picks are "appended". Both directions
order by pick number; newest-first is the one where the pick that just landed is visible in a
scrolling panel after 150 of them, which is the entire reason the surface exists during a live
draft. The header states the direction and a test pins it. Flagging it because "appends" could be
read as bottom-growing.

### 4. The empty-window caption needs `attach.status`, which nothing put on the wire

T5's dev notes name this exactly: an empty `entries` array means "nothing between now and your next
turn" *or* "your seat is unresolved" (AC-5), and only `attach.status` distinguishes them — and they
hand the caption to T10, which shipped `OpponentPanelData` as `{window, entries}` with no caption
field. Rather than invent a snapshot field from a UI task, the status is passed as a prop from the
shell, where it is one field of the same snapshot. Four captions are covered by tests: seat
unresolved, no pick left, nothing in the window, and the normal case (plus the on-the-clock prefix,
which reads `userOnTheClock`/`currentUserPickNo` rather than re-deriving Terms' branch).

### 5. A cold-start profile reports only what it knows (AC-39)

T6's neutral prior sets `needAdherence: 1.0` and the positional share to the league baseline
exactly. Printing "drafts to need (100%)" off those would assert a tendency observed from zero
evidence — precisely what the `'early'` label exists to prevent. So an `'early'` summary reads
`early · 2 picks · reach unknown · neutral priors` and omits the adherence and positional claims
entirely, on top of the gray-out. The gray-out itself keys on `profile.confidence`, which is in the
data per §T6, not on any UI-side pick-count rule.

Same discipline for `reachSampleCount` (T6's addition): `0` means no pick of theirs carried an ADP,
which is **not** "drafts exactly at market" — it renders `reach unknown`, and a test asserts the
words "at market" do not appear.

### 6. The words that describe a tendency are display copy, not config

`REACH_NEUTRAL_PICKS`, `NEED_ADHERENCE_HIGH`/`_LOW`, `POSITIONAL_LEAN_MIN`, `BEND_VISIBLE_MIN` are
named module constants in `OpponentPanel.tsx` with comments saying what they claim. They are not
`parameters.ts` keys: the constitution's "configurable, not hardcoded" rule covers the 🔶 AS-N
defaults, and these are thresholds on *rendering a number as a word* — nothing downstream reads
them, and changing one changes what this panel says, never what FR-8 samples. T6's own notes leave
them here explicitly ("display copy the PRD gives no values for — left to T13 rather than invented
as config here"). Flagged in case a reviewer prefers them promoted anyway.

`examplesPerPosition`-style display budgets are likewise absent from this file: how many examples
exist is T5's decision, and the panel renders whatever it is handed.

### 7. AC-37's distinction is rendered three ways, not one

A player-level guess must never read as a certainty, so the hedge is not carried by colour alone:
a solid high-contrast badge versus lighter italic text, a visible `e.g.` prefix, and an accessible
name ending "illustrative example, not a prediction" against the prediction's "position-level
prediction". `data-confidence` mirrors the tag T5 put in the data (`'position'` /
`'player-example'`) so the distinction is queryable rather than a screenshot judgment. Nothing here
re-derives which is which — the tags are read, never inferred.

### 8. `NO_NEED_SIGNAL` is two different states, and the roster panel says which

`computeNeedVector` returns the sentinel whenever every weight is zero — true both for a finished
roster and for one whose only open slots are K and DST, since those carry no weight (🔶 AS-7).
Collapsing them into "starters complete" would tell a user their kicker slot is filled when it is
not. The panel branches on whether any K/DST dedicated slot is still open and says so; both
branches are tested. The K/DST slots stay visible in both (AC-33) — bookkeeping and prediction are
different jobs, which is the same line T4 and T6 drew.

### 9. Stale-but-visible, never blanked

Each panel already carried T11's `recomputing` badge. Added: `aria-busy` and a dimming class on the
content, so AC-21's "marked recomputing, never presented as current" reaches assistive tech too,
and the data stays on screen rather than being blanked (FR-3's spirit — flagged, not hidden).

### 10. Where the panels do *not* re-derive

`filledFlexSlots` is read, never computed: a FLEX filled by positional surplus is not
`slots.FLEX − unfilled.flex` in general, and T4 added that field precisely so roster math stays out
of a React component. A test pins it with a shape (`1 of 2` filled, `0` unfilled) that arithmetic
alone cannot produce. Likewise the window's order, ownership, snake reversal, trades and Terms'
off-by-one all come off `OpponentPanelData` as the server computed them.

### 11. AC-61's roster entries needed players the roster panel was never given

**Added mid-task**, on the orchestrator's addendum assigning AC-61's row triggers to T13: the pick
feed and roster panel rows now call T14's `openPlayerCard(playerId)`.

The pick feed was trivial — every entry already carries a `playerId`. The roster panel was not:
`RosterPanelData` is **counts only**. T4 publishes no slot-to-player assignment (its dev notes are
explicit that the panel is `filledStartingSlots` / `filledFlexSlots` / `unfilledStartingSlots` /
`benchCount`), so there was no roster entry to click.

Rather than invent a server field from a UI task, the players come in as a separate `players` prop,
supplied at the mount point as `snapshot.pickFeed.filter((e) => e.isUserPick)`. That is the **same
pick feed T4 derives the counts from**, so the list and the counts cannot disagree, and `isUserPick`
is exactly "the user's seat made this pick" — including a pick acquired by trade, which T2
attributes to the acquiring seat before the feed is built. They render in draft order under a
`Drafted` heading.

Two consequences worth a reviewer's attention:

- The panel now shows *which* players fill the roster, which AC-31 does not ask for. It is the
  minimum surface AC-61's "roster entry" can be clicked on; without it the AC is unreachable from
  this panel.
- There is still **no slot→player assignment** — the list is flat, not "your RB1 is X". Producing
  that would mean replaying T4's fill algorithm in the browser, which decision 10 exists to
  prevent. If a reviewer wants slotted rows, the right move is for T4 to publish the assignment,
  not for this component to re-derive it.

Both rows are plain `<button type="button">`, so click, Enter, Space and a screen reader's activate
all work with no key handler of ours to get wrong. `players={[]}` renders no list at all rather than
an empty one.

## Test-first evidence

All three test files were written and confirmed failing before any of the three components was
rewritten.

- failing: `npx vitest run --project web src/components/OpponentPanel src/components/RosterPanel src/components/PickFeed` →

  ```
   ✓ (1 passed)   RosterPanel > says the seat is unresolved …   <- T11's placeholder already did this
   Test Files  3 failed (3)
        Tests  40 failed | 1 passed (41)

  TestingLibraryElementError: Unable to find a label with the text of: WR: 2 of 3 starting slots filled
  … <div class="…"><p class="text-sm text-slate-500">Rendered by T13.</p></div>
  ```

  exit 1. The one pass is the null-roster message T11's mount point already rendered and this task
  preserves verbatim; every other assertion failed against the `Rendered by T13.` placeholders.

- passing: same command → `Test Files 3 passed (3) / Tests 41 passed (41)`, exit 0.

**Second red→green cycle, for the AC-61 addendum** (which arrived after the three panels were
already green). The five new tests were written alongside the component edits rather than strictly
before them, so the red step was produced explicitly, by reverting the two component changes and
re-running — recording it plainly rather than claiming an ordering that did not happen:

- failing: `npx vitest run --project web src/components/RosterPanel src/components/PickFeed` with
  the pick-feed button reverted to a `<span>` and `<DraftedPlayers>` removed →

  ```
   × PickFeed — one click opens the player card (AC-61) > opens the clicked entry's card …
   × PickFeed — one click opens the player card (AC-61) > makes every entry's name a real button …
   × RosterPanel — one click opens the player card (AC-61) > lists the user's own picks in draft order
   × RosterPanel — one click opens the player card (AC-61) > opens the clicked player's card …
   × RosterPanel — one click opens the player card (AC-61) > makes each roster entry a real button …

   Test Files  2 failed (2)
        Tests  5 failed | 22 passed (27)
  ```

  Exactly the five AC-61 tests failed; the other 22 were unaffected, which is the check that the
  addendum's tests are testing the addendum and nothing else.

- passing: same command with the components restored → `Test Files 2 passed (2) / Tests 27 passed
  (27)`, exit 0. Full root `npm test`: `Test Files 38 passed (38) / Tests 602 passed (602)`, exit 0.

- commits: none — per this spawn's instruction the developer runs no git commands; the orchestrator
  commits. Test-first ordering is recorded here instead of by commit order.

**One assertion was corrected after the first implementation run, and it was the test that was
wrong**, recorded so the diff is not puzzling: the AC-34 ordering test read
`within(windowList).getAllByRole('listitem')` and expected four rows, but each window row *nests*
three further lists (unfilled slots, likely positions, example players), so the query returned 29
list items — the window rows interleaved with their own details. The query now filters to elements
carrying `data-pick-no`, extracted as a `windowRows()` helper with a comment saying why. No
assertion about behaviour changed, and the implementation was not touched.

Separately, fifteen `[0]` indexings in `OpponentPanel.test.tsx` needed `!` to satisfy the web
package's `noUncheckedIndexedAccess`; the same idiom is already used across T3's and T4's suites.
Caught by `npm run typecheck`, not by the suite — vitest does not typecheck.

Coverage against §T13's "done when", clause by clause:

| Required | Test |
|---|---|
| fixture data renders **correct team ordering** | `OpponentPanel.test.tsx` "lists every pick between now and the user's next turn, in order, with its owning team" (rows `26,27,28,29`, three different seat-naming cases) + "repeats a team that picks twice in the window rather than deduping it" (seat 3 at picks 26 *and* 28) |
| the **position/player-example visual distinction present and queryable** | "tags position predictions and player examples with the confidence the data carries" (`data-confidence`) + "gives the two a genuinely distinct visual treatment (AC-37)" (classNames differ, `e.g.` in the visible text, "illustrative" vs "position-level prediction" in the accessible names) |
| **correct filled/unfilled/bench counts** | `RosterPanel.test.tsx` "reports every starting slot as filled-of-total, the FLEX among them", "counts the bench separately from the starting slots", "shows the unfilled starting slots by position — the need vector, count-shaped" |
| a pick feed with **correct mine/opponent flags** | `PickFeed.test.tsx` "flags the user's own pick and leaves opponents' picks unflagged" (all four rows, both directions, name *and* `data-owner`) + "gives mine and opponent genuinely different treatments" |
| an **unmatched-player entry showing the raw name + warning badge** | "shows the raw Sleeper name with a visible warning badge naming the player" + "leaves matched picks unbadged" + "counts the unmatched picks in the panel's own header" |

The rest of the ACs §T13 inherits, each asserted individually:

- **AC-34** — both of Terms' branches (off-the-clock, and the on-the-clock one that excludes the
  user's own in-progress pick); the window caption naming the closing pick; and three distinct
  empty-window captions (nothing in the window, no pick left, seat unresolved).
- **AC-35** — per-row unfilled starting slots including a K slot, and remaining picks, with a
  repeated team keeping its own counts at each of its two picks.
- **AC-36** — the need-derived likelihood on each badge; example players in the supplied ADP order;
  and a no-need-signal team offering **no** position prediction at all while keeping its
  cross-position examples.
- **AC-37** — the three-way distinction above.
- **AC-39** — `'early'` grays out and labels the profile, reports its pick count and nothing more.
- **AC-40** — the compact summary's reach / need-adherence / positional-lean readings; the bent
  likelihood shown beside the unbent one; and no bent badges for a team with no distribution to
  bend.
- **AC-26 via T6's `reachSampleCount`** — "does not claim a reach tendency when no pick could be
  scored for one".
- **AC-31/AC-32/AC-33** — the default shape, a 12-team / 3-WR / 2-FLEX / **no-kicker** shape through
  the identical code path, K and DST listed like any other slot, the two different meanings of
  `NO_NEED_SIGNAL`, and `filledFlexSlots` read rather than re-derived.
- **AC-11/AC-20** — attribution across all four seat-naming cases, round-and-slot coordinates, a
  position-less pick rendering without an invented position, an empty feed stating it is empty.
- **AC-5/AC-21** — the unresolved-seat roster message, and stale-but-visible + `aria-busy` on both
  insight-backed panels.
- **AC-61** (added by the addendum) — a pick-feed click and a roster click each move
  `playerCards.getState().playerId` to that player; both rows are real `<button type="button">`
  elements, so the keyboard reaches them; the drafted list sorts into draft order; an unmatched
  player's card is reachable like any other; and `players={[]}` renders no drafted list at all.

## Test-file changes

- **none.** No pre-existing test file was modified or deleted. All three test files are new in T13.
  T11's `src/test/fixtures.ts` was deliberately **not** edited — T13's fixtures live inside its own
  test files, since two siblings were writing in the same tree and every web suite imports that
  file. The 497 tests that existed when this task started are all still green, as are T12's and
  T14's, which landed alongside.

## Commands

Run from repo root, after both siblings' work had landed in the tree.

- test: `npm test` → **exit 0** — `Test Files 38 passed (38) / Tests 602 passed (602)`. T13
  contributes 47 (opponent panel 20, roster panel 15, pick feed 12). Judged against `baseline.txt`
  (the greenfield ENOENT): no pre-existing failures to net against.
- lint: `npm run lint` → **exit 0**, no warnings.
- typecheck: `npm run typecheck` → **exit 0** — all three `tsc --noEmit` invocations clean.
- `npx prettier --check` over every file this task touched → clean (three were reformatted by
  `--write` before the final run; no other task's file was touched).
- `npm run build` → exit 0, Vite emits `packages/web/dist`.

Scoped verification of T13's own work:
`npx vitest run --project web src/components/OpponentPanel src/components/RosterPanel src/components/PickFeed`
→ 3 files, 41 tests, exit 0.

## Left for downstream tasks (seams T13 exposes, deliberately unwired here)

- **AC-61's third surface, the candidate list, is still unwired.** This task wired the two rows it
  owns (decision 11). T14 shipped the seam and T12's `CandidateList.tsx` does not call it — grep for
  `openPlayerCard` and the only callers are `PickFeed.tsx` and `RosterPanel.tsx`. **Flagging it as
  an open gap in another task's file**, since AC-61 names "any **candidate row**, pick-feed entry,
  or roster entry" and file-disjointness meant this task could not reach into T12's component. The
  change there is the same one line: wrap the candidate row's player name in
  `<button type="button" onClick={() => { openPlayerCard(row.playerId); }}>`.
- **A slot→player assignment would improve the roster panel.** See decision 11: the drafted list is
  flat because T4 publishes no mapping from a filled slot to the player filling it. If that lands
  on `RosterPanelData`, this panel's list becomes slotted rows with no other change to its contract.
- **T15**'s smoke-level frontend check can render `<App store={…}/>` against the 150-pick fixture's
  final snapshot; all three surfaces here are addressable by `getByRole('region', { name })` under
  their PRD §9 Terms names, and every row is queryable by its accessible name (`Pick 26, …`) or by
  `data-pick-no`.
- **Possible promotion**: `teamLabel.ts`'s fallback order duplicates `AttachScreen.tsx`'s local
  `seatLabel` (which renders `Bot seat`/`Empty seat` instead of a slot number, correct for its own
  AC-2 context). Two deliberately different renderings of the same records, not a bug — but worth a
  reviewer's call on whether the attach screen should adopt the slot-number fallback for
  consistency with the two panels that attribute picks to those seats.
