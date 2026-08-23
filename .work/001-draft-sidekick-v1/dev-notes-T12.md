# Dev notes — 001-draft-sidekick-v1 (T12: candidate list and recommendation panel UI)

Scope: design.md §T12 only. Two files touched, both mine: `packages/web/src/components/CandidateList.tsx`
(T11 left it as a mount point explicitly addressed to this task) and its new colocated test file.
**No shared file was edited** — not `DraftScreen.tsx`, not `Panel.tsx`, not `test/fixtures.ts`, not
any shared type, and nothing belonging to the two siblings running concurrently in this tree
(T13's opponent/roster/pick-feed components, T14's player card). The mount point T11 wired
(`<CandidateList candidateList={snapshot.candidateList} />`) already carried the exact prop this
task needs, so the slot wiring required no change at all.

Everything rendered here is server-computed. T8's reason strings are printed **verbatim**; the
component contains no ranking, no re-sorting, no reason derivation and no survival arithmetic
beyond turning a 0..1 probability into a percentage.

## Changes

**Rewritten — `packages/web/src/components/CandidateList.tsx`.** The whole FR-9/FR-10 surface:

- **Rows (AC-49).** `data.rows` in the order the server shipped them — raw ECR, never re-sorted
  (🔶 AS-8). Columns: overall ECR rank, positional rank rendered the way FantasyPros writes it
  (`RB1`, `WR12`), player + team, ADP, and survival. `null` renders as an em dash, never a
  fabricated `0` — reachable on `ecrRank` (K/DST ADP-fallback rows, T8 decision 8), `positionalRank`
  and `adp` (AC-26's matched-but-ADP-less player).
- **Survival (AC-44/AC-45).** `Math.round(p * 100)%` plus the band label, colour-coded by band. The
  whole column is **omitted** when no displayed row carries a survival number — AC-45 says
  suppressed, and an all-dashes column is not suppression — with a line naming why it is gone.
- **The highlight (AC-51/AC-56).** Exactly one row carries `aria-current="true"`, a ring, and a
  visible `Recommended` badge; above the table a `Recommendation` region names the player and prints
  `data.reason` as its own text node.
- **Plan comparison (AC-57).** `Winning plan` / `Closest alternative` as `WR now / RB next · 3`,
  plus `separatingFact` when the server named one — nothing rendered when it did not.
- **Position filter (AC-50).** A seven-button group (All + the six positions), one click, reading
  `data.rowsByPosition[position]` — the per-position sets T10 precomputed into the same `Insight`.
  No fetch, no second channel, so a filtered view can never be from a different board version than
  the list it replaced.
- **`recomputing` (AC-21) and `degraded` (AC-48).** Both rendered, always both, never one collapsed
  into the other (see decision 2). Recomputing dims the table and sets `aria-busy`; the rows stay on
  screen.
- **`disabledReason` (AC-28 / AC-5).** Kept and generalised — see decision 1.

**New — `packages/web/src/components/CandidateList.test.tsx`** (25 tests).

## Decisions worth a reviewer's attention

### 1. The disabled banner sits *above* the rows rather than replacing them

T11's mount point rendered `disabledReason` **instead of** the list. That is right for AC-28 (no
rankings loaded → `rows` is empty and `rowsByPosition` is absent, so the banner is the whole
surface) but wrong for the other cause the same field now carries: T10's decision 3 ships the rows
**and** `rowsByPosition` alongside a `disabledReason` when the user's seat is unresolved, because
raw ECR order over what is available claims nothing about whose turn it is — only the
recommendation is blocked by AC-5.

So the banner is unconditional and the rows render underneath whenever there are any; the
`Recommendation` region is what the disabled state suppresses. Both payloads then come out exactly
as their AC describes, from one branch:

| payload | renders |
|---|---|
| AC-28: `disabledReason` set, `rows: []`, no `rowsByPosition` | the banner alone — no table, no filter, no recommendation |
| AC-5: `disabledReason` set, rows + `rowsByPosition` present, `highlightPlayerId: null` | the banner, the filter and the rows; no recommendation |

The "no available candidates" empty-state line is suppressed while a `disabledReason` is showing —
otherwise an AC-28 payload would read "No available candidates in the loaded rankings" directly
under "No rankings snapshot loaded", which contradicts itself.

### 2. Two flags, two lines — the badge ternary T11 left had to go

The mount point's badge was `recomputing ? 'recomputing' : degraded ? 'degraded' : null`, which
silently drops `degraded` whenever both are set. `Insight<T>`'s own doc comment (T1) says the two
"must never both be silently dropped by a consumer", and they are genuinely different facts: the
board is fine but an insight is behind it (AC-21) versus the board itself failed its integrity
check (AC-48). A degraded board that is also recomputing is precisely the moment a user most needs
both. Both badges render, and each gets its own explanatory line. A test pins it.

### 3. `aria-busy` + dimming, not a spinner and not a blank

FR-3's rule is that stale output is flagged, never presented as current — which is *not* the same
as hidden. The recomputing treatment is therefore additive: the previous board's rows stay exactly
where they are, the table gets `opacity-60` and `aria-busy="true"`, and a line says the list is the
previous board's. Nothing is unmounted, so a user reading a row when a pick lands does not lose it
mid-sentence — and nothing claims to be current either.

### 4. The survival-absent note names its cause, because the payload distinguishes them

A blank survival column has two causes and they mean opposite things. A K/DST filter means "there
is no such number to compute" (🔶 AS-7 puts K/DST outside the sim universe entirely); an otherwise
empty column means AC-45's "you have no pick after this one". The active filter is this component's
own state, so the two are distinguishable without guessing, and the note says which one it is
rather than leaving a blank the user has to interpret. A third possibility — a skill-position row
outside the sim universe — cannot reach the default list, since T8 feeds every candidate row id
through AC-42's `ensureIncluded`.

### 5. An empty position gets a sentence, not an empty table (architect-unspecified, flagged)

`rowsByPosition.K` / `.DST` come back **empty** when the fetched ECR snapshot carries no K/DST —
AC-23's warning case, and the state T10's decision 9 left standing (the ADP-only fallback needs a
field on `MatchResult` that T3 does not emit). Rendering a header row over an empty body would read
as "no kickers are available", which is false. The filter instead renders
`No available K in the loaded rankings.` This is the same reasoning AC-28 applies to the list as a
whole, pushed down to one position; design.md names neither, so flagging it.

### 6. The filter is component-local state and survives a new snapshot

AC-50 asks for one interaction. A filter reset by every incoming SSE frame would cost one
interaction *per pick* to stay where the user put it — on a 10-team board that is a click every few
seconds. The filter therefore lives in `useState` and is untouched by the store's wholesale replace,
which is safe precisely because it is a view preference and not board-derived data: the rows behind
it are re-read from the new snapshot every render. A test pins that a new board version keeps the
filter pressed and swaps the rows underneath it.

### 7. What this component deliberately does *not* do

- It does not re-sort, blend or re-rank. AS-8's QB-vs-market skew ships as it arrives, disclosed by
  the ADP column exactly as the spec's own preamble requires.
- It does not compose, shorten or re-punctuate `data.reason`. AC-52's and AC-58's merged tie
  statement arrives as **one** string from T8 and is printed as one line; a test asserts
  `Too close to call` appears exactly once on that render, so a future "helpful" split would fail.
- It does not decide the highlight. `highlightPlayerId` is matched against `row.playerId` and
  nothing else.
- It adds no click plumbing for T14's player card. §T14 owns that seam ("the 'which row was clicked'
  plumbing is T14's to add through whichever panels it needs"), so adding a speculative prop here
  would be both scope creep and a collision with a task running concurrently. Rows carry
  `data-player-id`, which is what T14 will need to hang it off.

## Test-first evidence

`CandidateList.test.tsx` was written in full before `CandidateList.tsx` was touched.

- failing: `npx vitest run --project web src/components/CandidateList.test.tsx` →

  ```
  TestingLibraryElementError: Unable to find an accessible element with the role "table"
  and name `/candidate rows/i`
   ❯ bodyRows src/components/CandidateList.test.tsx:138:17

   Test Files  1 failed (1)
        Tests  24 failed | 1 passed (25)
  ```

  exit 1. The one passing test is `states "no rankings loaded" instead of rendering an empty
  candidate list (AC-28)` — T11's mount point already shipped that branch and T11's notes asked
  this task to keep it, so it was green before the implementation and stayed green after.

- passing: `npx vitest run --project web src/components/CandidateList.test.tsx` →
  `Test Files 1 passed (1) / Tests 25 passed (25)`, exit 0.
- passing (whole suite): `npm test` → see Commands.
- commits: none — per this spawn's instruction the developer does not run git; the orchestrator
  commits. Test-first ordering is recorded here instead of by commit order.

Three assertions were corrected **after** the implementation was written, all three because the
**query** was ambiguous or vacuous rather than because any behaviour changed to suit them; recording
them so the diff is not puzzling:

- `screen.getByText('Bijan Robinson')` matched **two** elements once the recommendation region
  existed — the region names the highlighted player and so does his row, which is the intended
  design, so the query was ambiguous by construction. Replaced with `playerIds()` (a row-scoped
  query) in the three tests that used it to mean "still in the list".
- `expect(recommendation().textContent).toContain('WR now / RB next')` would also have passed on
  the *reason string*, which contains the same phrase — so it asserted nothing about the plan block
  it was written for. Replaced with `within(recommendation()).getByText('WR now / RB next · 3')`,
  which can only match the `<dd>`.
- The AC-59 test asserted `not.toContain('now /')` for "no plan block rendered", which the same
  overlap makes weak; `Winning plan` is the label that actually distinguishes the block, so it
  asserts the absence of that instead.

### §T12's "done when", clause by clause

| required | where |
|---|---|
| one fixture payload per T8 scenario, need-driven | `a need-driven pick` — highlight `wr1`, reason asserted by string equality |
| value-driven | `a value-driven pick` — highlight `rb1`, the ADP-gap sentence verbatim |
| plan-driven | `a plan/survival-driven pick` — highlight `wr1`, the plan sentence verbatim |
| too-close-to-call | `a too-close-to-call pick, whose within-noise statement replaces the reason line (AC-52)` |
| <2-picks-remaining | `a fewer-than-two-picks pick, stating that lookahead does not apply (AC-59)` — also asserts no plan block renders |
| **exact** expected highlighted row per scenario | every one of the five asserts `highlightedRow()`, a helper that itself asserts exactly one row is marked (AC-51) before returning it |
| **exact** expected reason text per scenario | `screen.getByText(reason)` with the full T8 string — RTL matches an element's own text, so this is string equality on the rendered line |
| the recomputing-dimmed state renders when the fixture sets the flag | `keeps the stale list on screen, dimmed and labelled, while recomputing (AC-21, AC-53)` — `aria-busy="true"`, an `opacity-` class, the label, and all five rows still present |

Beyond the "done when": AC-49's three per-row rank/ADP columns and the highlight-extended row,
AC-26's dash, AC-44's percentage+band for all three bands, AC-45's suppressed column, AC-50's filter
in both directions plus the K and DST variants and an empty position, AC-51's exactly-one-highlight,
AC-52/AC-58's single merged line, AC-53's drafted player leaving both the rows and the
recommendation, AC-57's winner/alternative/separating-fact and its absent case, AC-48's degraded
flag, both flags at once, AC-28's stated mode and AC-5's rows-without-recommendation.

## Test-file changes

- **none.** No pre-existing test file was modified or deleted. `CandidateList.test.tsx` is new.
  `packages/web/src/test/fixtures.ts` is imported read-only (`insight`, `makeCandidateList`) and was
  not edited — the candidate-row builders live inside the new test file, deliberately, so this task
  adds nothing to a file the two concurrent sibling tasks are also importing.

## Commands

Run from repo root.

- test: `npm test` → **exit 0** — `Test Files 38 passed (38) / Tests 592 passed (592)`, of which 25
  are this task's one new file. The tree held 497 tests at the end of T11; the rest of the growth is
  T13's and T14's, added concurrently. None of the 497 was touched. `baseline.txt` is a greenfield
  ENOENT, so there are no pre-existing failures to net against.
- test (this file alone): `npx vitest run --project web src/components/CandidateList.test.tsx` →
  **exit 0**, `Tests 25 passed (25)`.
- lint: `npm run lint` → **exit 0**, no warnings.
- typecheck: `npm run typecheck` → **exit 0** (shared, server, web). See the timing note below.
- `npx prettier --check` over this task's two files → clean. No other task's file was reformatted.

**Timing note for the orchestrator.** T13 and T14 were mid-flight in this same tree throughout, so
intermediate `npm test` / `npm run typecheck` runs showed failures in `OpponentPanel.test.tsx`,
`PickFeed.test.tsx`, `RosterPanel.tsx` and `PlayerCard.test.tsx` — each sibling passing through its
own test-first window, plus a `PickFeed` prop change that had not yet reached `DraftScreen` and so
transiently broke `App.test.tsx`. Every one was verified as not-mine before waiting it out
(`grep -c CandidateList` over the failure list was 0 on every run). The results above are from runs
taken after the siblings settled, and no failure at any point during this task was in
`CandidateList.tsx` or `CandidateList.test.tsx`.

## Left for downstream tasks

- **T14** hangs the player card off a candidate row. Every `<tr>` carries `data-player-id`, and the
  row's player cell is the natural click target; the component's props are unchanged from T11's
  contract, so adding an `onSelectPlayer` callback is a one-prop change to this file.
- **T15**'s smoke check can query this surface by `role="region"` name `Candidate list`, the inner
  `role="table"` named `Candidate rows`, and `aria-current="true"` for the highlight — no test ids.
- Still open from T10 decision 9 (**not** this task's to fix): a fetched ECR snapshot with no K/DST
  leaves `rowsByPosition.K`/`.DST` empty, since T3 does not emit ADP-only rows. This UI now states
  that case explicitly (decision 5) rather than showing an empty table, but the underlying
  ADP-order fallback AC-50 describes still cannot fire in production.

## Addendum: AC-61 wiring

Added after the task was otherwise complete, on the orchestrator's instruction: the seam flagged in
this task's return (decision 7's last bullet — "adds no click plumbing for T14's player card") was
resolved **against** that call. T14 shipped `openPlayerCard`, `PlayerCardHost` and the route, and
its own notes hand the trigger to the row owners, so AC-61 ("one click from any candidate row…
opens the card without leaving the draft screen") was unreachable in the running app until a row
called in. T14's AC-61 test proves this by calling `openPlayerCard('9221')` directly rather than
clicking anything — the card end was proven, the row end was not wired.

**The change, in one place.** `packages/web/src/components/CandidateList.tsx` gains the import and
turns each row's player name into a real `<button>`:

```tsx
<button type="button" onClick={() => { openPlayerCard(row.playerId); }}>{row.playerName}</button>
```

which is T14's own documented recipe, verbatim from its module header.

**A native `<button>`, not a clickable `<tr>`.** Enter and Space then come from the platform rather
than a hand-rolled `onKeyDown`, and it lands in the tab order for free. Making the whole row
clickable would also have meant either a `role="button"` on an element that is already a table row
(and already carries `aria-current` for the highlight) or a keyboard handler competing with the
row's own semantics — more markup for a worse accessibility tree.

**The button wraps the name and nothing else.** Team abbreviation and the `Recommended` badge stay
outside it, so each button's accessible name is exactly the player's name. That keeps the row's
click target where a user would aim, and keeps `getByRole('button', {name: 'RB'})` (the position
filter) unambiguous against `getByRole('button', {name: 'Bijan Robinson'})` — no filter button
shares a name with any player button.

**Nothing else moved.** The position filter's `useState`, the highlight rendering, the survival
column, the disabled branches and every previously-passing assertion are untouched; two of the four
new tests exist specifically to pin that (the filter stays pressed and the highlight stays put
across a card open, and a filtered DST row opens its card too).

### Four new tests, driven through the real controller

`opening the player card from a row (AC-61)` — 25 tests became 29. They use the **real**
`playerCards` controller T14 exported rather than a module mock, so what is asserted is the wiring
itself (correct import, correct player id reaching the controller) and not merely that some spy
fired. `fetch` is stubbed, and `closePlayerCard()` in `afterEach` keeps the module singleton from
leaking between tests.

| test | asserts |
|---|---|
| opens that row's player card in one click | `playerCards.getState()` is `{playerId: 'rb1', status: 'loading'}` after one `click` |
| makes the name a real button | the element's `tagName` is `BUTTON` — which *is* the reason Enter/Space work; jsdom does not synthesise a native button's key-to-click behaviour, so asserting `keyDown` would test jsdom, not the component |
| opens the card from a filtered row too | filter to DST, click `Houston Texans`, controller holds `dst1` — the trigger is on every row, not only the default ECR list |
| leaves the position filter and the highlight exactly where they were | after opening a card from a filtered view: rows still `['rb1','rb2']`, the `RB` button still `aria-pressed="true"`, the highlight still on `rb1` |

**Test-first evidence for the addendum.** The component edit was written before these four tests
(an inversion of the earlier ordering, since this was a one-line trigger against an API T14 had
already shipped and documented), so the failing state was reconstructed explicitly rather than
claimed: the wiring was reverted in place, the suite re-run, and restored byte-identically
(`diff` clean). Reverted run:

```
 × opening the player card from a row (AC-61) > opens that row’s player card in one click
   → Unable to find an accessible element with the role "button" and name "Bijan Robinson"
 × … > makes the name a real button, so Enter and Space come from the platform
   → Unable to find an accessible element with the role "button" and name "Ja'Marr Chase"
 × … > opens the card from a filtered row too, including a DST row with no survival math
   → Unable to find an accessible element with the role "button" and name "Houston Texans"
 × … > leaves the position filter and the highlight exactly where they were
   → Unable to find an accessible element with the role "button" and name "Bijan Robinson"
```

All four fail without the trigger and only without it; the other 25 stayed green throughout the
reverted window.

### Addendum commands

- test: `npm test` → **exit 0** — `Test Files 38 passed (38) / Tests 602 passed (602)`, including
  `✓ src/components/CandidateList.test.tsx (29 tests)`. (The whole-tree total moved 592 → 602 as
  T13's and T14's own addendum work landed alongside; this task's own contribution is 25 → 29.)
- lint: `npm run lint` → **exit 0**, no warnings.
- typecheck: `npm run typecheck` → **exit 0** (shared, server, web).
- `npx prettier --check` over this task's two files → clean.

Same concurrency caveat as above: T13 was mid-flight on **its** AC-61 wiring during this addendum
(a new required `players` prop on `RosterPanel` that its test file had not caught up to), so
intermediate runs showed `RosterPanel.test.tsx` failures. Verified as not-mine on every run — the
only `CandidateList` line in those logs was `✓ src/components/CandidateList.test.tsx (29 tests)` —
and the results above are from a settled tree.

### Still left for T13

`OpponentPanel` and `PickFeed` rows: AC-61 names "any candidate row, pick-feed entry, or roster
entry". The candidate rows are now wired; the pick-feed and roster ends are T13's, using the same
one-line recipe.
