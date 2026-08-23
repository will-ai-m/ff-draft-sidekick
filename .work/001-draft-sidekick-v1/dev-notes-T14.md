# Dev notes — 001-draft-sidekick-v1 (T14: player card modal UI, FR-11 frontend)

Scope: design.md §T14 only (AC-61 … AC-65). T12 (candidate list) and T13 (opponent/roster/pick
feed) were running concurrently in the same tree; none of their components was touched. The card
is opened by an exported function their rows call — the plumbing on their side is theirs.

## Changes

**New — `packages/web/src/state/playerCard.ts`.** Which player's card is open, and what it holds.
A tiny external store in the same `useSyncExternalStore` shape as T11's SSE store, deliberately
**separate** from it: the open card is browser-local UI state, and a wholesale snapshot
replacement arriving mid-read must not close a card the user is still looking at. Exports:

| export | what it is |
|---|---|
| `openPlayerCard(playerId)` | **the one-click open hook every panel calls** (AC-61) |
| `closePlayerCard()` | closes whatever is open |
| `playerCards` | the shared `PlayerCardController` the draft screen mounts |
| `usePlayerCard(controller?)` | subscribes a component to the open card |
| `PlayerCardController` | the class, for tests that want an isolated instance |
| `PlayerCardState`, `PlayerCardStatus`, `gamelogUrl` | the state shape and the route it fetches |

A candidate row / pick-feed entry / roster entry opens the card with exactly:

```tsx
import { openPlayerCard } from '../state/playerCard';
<button onClick={() => { openPlayerCard(row.playerId); }}>{row.playerName}</button>
```

**New — `packages/web/src/components/PlayerCard.tsx`.** `PlayerCardModal` (presentational: takes a
`PlayerCardState`, renders it) and `PlayerCardHost` (subscribes, renders nothing until a player is
open). AC-62's three column sets, AC-63's season tabs, AC-64's disclosure, AC-65's stated absence,
plus loading, failure-with-retry, Escape/backdrop/Close, and focus into the overlay.

**Amended — `packages/web/src/screens/DraftScreen.tsx`.** Two lines: the import and one
`<PlayerCardHost />` inside `<main>`, plus the header comment naming the open hook. This is the
mount point T11's notes reserved for T14 ("T14 mounts inside `DraftScreen`").

**Amended — `packages/shared/src/types/gamelog.ts` and `packages/server/src/gamelogs/store.ts`**
— `unsupportedScoringKeys` onto the card. See decision 5; this is the one change outside the
frontend and it is flagged rather than folded in quietly.

**New tests** — `components/PlayerCard.test.tsx` (14), `state/playerCard.test.ts` (14), plus
`test/playerCards.ts` (the fixture payloads), and one added case in the server's
`gamelogs/store.test.ts`.

## Decisions worth a reviewer's attention

### 1. The column set comes from the payload, not from a position table in the UI

§T14 says "position-appropriate per AC-62 exactly", which invites a `Record<Position, Columns>` in
this component. That would be a **second** answer to a question T9 already answers: its reader
decides which of `passing`/`rushing`/`receiving` a game carries from the player's position *plus
what he actually did* (T9's decision 4 — Ja'Marr Chase's one carry in 2025 week 3 gets him a
rushing line; his week 2 does not). A UI table keyed on position alone would have hidden that
carry, and the two tables would drift the first time either changed.

So the card asks each season's games which lines they carry and shows the **union across the
season**. Union, not per-game, is what keeps columns from appearing and disappearing between rows
of one table: Chase's rushing columns stand for the whole season and his week 2 reads `—` under
them. That dash is a real assertion in the WR test.

### 2. Repeated column labels, disambiguated in the accessibility tree and not just visually

Passing, rushing and receiving all have an "Att"/"Yds"/"TD". A group header row (`Passing` |
`Rushing` | `Receiving`, `scope="colgroup"`) is how the fantasydata.com page the PRD points at
solves it visually — but visually only, which leaves a screen reader (and every test) with three
columns called "Yds". Each leaf header therefore carries an `sr-only` group prefix, so its
accessible name is `Passing Yds` / `Rushing Yds` / `Receiving Yds` while the screen still shows
the compact label under its group. The three column-set tests assert those full names in table
order, which is what makes "a QB's columns" a falsifiable claim rather than a screenshot.

### 3. Season tabs are derived, never synchronised

The selected season is `seasons.find(s => s.season === selected) ?? seasons[0]`. No effect resets
it when the card's player changes: a season that is not on the current card simply falls back to
the newest one, which the payload already sorts first (AC-63). An effect-based reset would have a
frame where the table points at a tab that isn't there.

Tabs render whenever the card has seasons, including for a single-season player — a lone `2025`
tab still says which season the table is, which an unlabelled table does not.

### 4. Points keep a second decimal when the league's settings produce one

`19.3` prints as `19.3`, `12.05` as `12.05`. AC-64's number is the *league's*, and a league's
scoring dict has no obligation to land on a tenth; rounding one away would misreport it. (T9
already rounds to two decimals at the source, so this is the full precision that exists.)

### 5. `unsupportedScoringKeys` reaches the card — two files outside the frontend, flagged

T9 built `unsupportedScoringKeys(settings)` and documented it as "for callers that want to show
them… so the gap is inspectable rather than silent", but nothing called it: it was on no payload
and no surface. This spawn's work order names surfacing it as part of T14, and it is the honest
other half of AC-64 — a card that says "scored in your league's settings" while silently dropping
the ~54 defensive/kicking keys a real Sleeper dict carries (T4 measured 81 on a live league) is
over-claiming.

The frontend cannot compute it: the league's per-stat dict never reaches the browser (the
snapshot's `leagueSummary` carries only team count, scoring *label* and rounds). So:

- `packages/shared/src/types/gamelog.ts` — `PlayerCard.unsupportedScoringKeys: string[]`, required.
  Required rather than optional so both construction sites are compiler-checked; there are exactly
  two, both in `store.ts`.
- `packages/server/src/gamelogs/store.ts` — populated in `getPlayerCard` and in `noData` (a rookie
  card should still say what the league's settings would not have expressed).

Blast radius checked before the edit: `store.ts` is the only place a `PlayerCard` literal is built,
no existing assertion deep-equals a whole card (`toMatchObject`, or `toEqual` on `seasons`/one
game), and no sibling task touches either file. The card renders the note only when the list is
non-empty, so a league whose every rule is expressible shows nothing.

Flagging it because design.md §T14 does not mention it and it is the only change this task makes
outside `packages/web`.

### 6. One controller, module-level — not React context

Three panels open the same card, so the open-state cannot live in any one of them. A context would
work but would make every row a context consumer and force T12/T13 to thread a provider; a plain
exported function is one import and one call, which is what "their rows calling your exported open
function" needs to cost. The controller is a class with the singleton exported alongside, so tests
(and any future second card) can hold an isolated instance.

### 7. A sequence number, because a game log is the one thing here fetched over REST

Everything else the app displays arrives on the SSE stream. A game log does not, and should not:
it is immutable history, it is not part of the board, and shipping every player's log in every
snapshot to serve the handful a user clicks would be absurd. But a REST fetch reintroduces
out-of-order responses, which the stream does not have — so every `open`/`close` bumps a sequence
and a response whose sequence is stale is dropped. Two tests pin it: a slow first click cannot
overwrite a fast second one, and a response landing after `close()` cannot re-open the card.

Re-opening the player already on screen is a no-op (a double click does not blank the table and
refetch); re-opening one that *failed* does retry, which is what the card's own "Try again" calls.

### 8. Modal behaviour: no focus trap, and that is deliberate

Focus moves onto the dialog on open, Escape closes, the backdrop closes, a click inside does not,
and the listener is removed on unmount (asserted). A full focus trap — cycling Tab within the
overlay — is not implemented: no AC asks for it, and the honest alternative to a correct trap is
not a half-built one. Naming it here so its absence is a decision on the record rather than an
oversight.

### 9. `data-testid` on the leaf header row

`getAllByRole('columnheader')` returns the group headers too, so the column-set assertions need to
address the second header row specifically. `data-testid="gamelog-columns"` is one attribute in
one place; the alternative (index into `getAllByRole('row')`) breaks the moment a card has no stat
groups at all. It is the only test id this task adds.

## Test-first evidence

Both web test files and the fixture module were written before `state/playerCard.ts` or
`components/PlayerCard.tsx` existed; the server case was written before the field existed.

- failing (web): `npx vitest run --project web src/components/PlayerCard.test.tsx src/state/playerCard.test.ts` →
  ```
   FAIL |web|  src/components/PlayerCard.test.tsx [ … ]
  Error: Failed to resolve import "./PlayerCard" from
    "packages/web/src/components/PlayerCard.test.tsx". Does the file exist?

   FAIL |web|  src/state/playerCard.test.ts [ … ]
  Error: Failed to resolve import "./playerCard" from
    "packages/web/src/state/playerCard.test.ts". Does the file exist?

   Test Files  2 failed (2)
        Tests  no tests
  ```
- failing (server): `npx vitest run --project server src/gamelogs/store.test.ts` →
  ```
   × GameLogStore > carries the league scoring keys no game log can answer onto the card itself
     - Expected: Array [ "def_st_td", "fgm_40_49" ]
     + Received: undefined

   Test Files  1 failed (1)
        Tests  1 failed | 7 passed (8)
  ```
- passing: `npx vitest run --project web src/components/PlayerCard.test.tsx src/state/playerCard.test.ts` →
  `Test Files 2 passed (2) / Tests 28 passed (28)`; `npx vitest run --project server src/gamelogs`
  → `4 passed / 44 passed` (T9's 43 plus this task's one added case). Whole suite: `npm test` →
  **exit 0**, `Test Files 38 passed (38) / Tests 592 passed (592)`, no pre-existing test touched.
- commits: none — per this spawn's instruction the developer does not run git; the orchestrator
  commits. Test-first ordering is recorded here instead of by commit order.

One assertion was corrected while writing, before any implementation existed, because the **test**
was wrong: the out-of-order test's fast branch resolved a bare card object where the controller
reads a `Response`-shaped value, so it asserted against a `fetch` contract the module never had.
It now resolves `jsonResponse(quarterbackCard())` like every other stub in the file.

### §T14's "done when", clause by clause

| required | where |
|---|---|
| a fixture payload renders the correct column set for a **QB** | `PlayerCard.test.tsx` → "shows a QB's passing and rushing columns, and never a receiving one" — all 13 headers in order, plus an explicit assertion that no receiving column appears |
| … for a **RB** | "shows a RB's rushing and receiving columns, long and yds-per-tgt included" — all 14 headers in order |
| … for a **WR/TE** | "shows a WR's receiving columns, plus a rushing line only because he carried it" — the headers, plus the week with no carries reading `—` under all four rushing columns |
| season tabs appear and switch correctly for a 2-season fixture | "offers every cached season as a tab, newest first, and switches between them (AC-63)" — tab order `['2025','2024']`, the newest selected by default, and after clicking `2024` the 2024 game is present and the 2025 games are gone |
| the no-data state renders (**not** an empty table) for a rookie | "states that a rookie has no NFL game data instead of showing an empty table (AC-65)" — the message, the player's name, and `queryByRole('table')`/`queryByRole('tab')` both null |

Beyond the "done when": AC-61 end to end (`PlayerCardHost` inside a real `DraftScreen` — the card
opens over it and the candidate list and pick feed are still mounted underneath, and closing
returns to them), AC-62's per-game values cell by cell, AC-64's disclosure line and the
unsupported-rules note in both directions, the loading and failure states, retry, close by button
/ Escape / backdrop and *not* by a click inside, listener cleanup on unmount, focus into the
overlay, and — in `playerCard.test.ts` — the fetch URL and its encoding, the no-refetch and
retry-after-failure rules, subscriber notification and unsubscribe, reference stability for
`useSyncExternalStore`, a 409 surfacing the server's own message, an HTTP-code fallback, an
unreachable server, and both stale-response drops.

## Test-file changes

- **none modified or deleted.** `packages/server/src/gamelogs/store.test.ts` gains one new `it()`
  ("carries the league scoring keys no game log can answer onto the card itself") for decision 5's
  field; every existing case in that file is untouched and still passes. All other test files in
  this task are new.

## Commands

Run from repo root, with T12's and T13's concurrent work also present in the tree.

- test: `npm test` → **exit 0** — `Test Files 38 passed (38) / Tests 592 passed (592)`. Judged
  against `baseline.txt` (the greenfield ENOENT), so there are no pre-existing failures to net
  against. This task contributes 28 web tests and one server case.
- lint: `npm run lint` → **exit 0**, no warnings.
- typecheck: `npm run typecheck` → **exit 0** (shared, server, web).
- `npx prettier --check` over this task's touched files → clean (two were reformatted by `--write`
  before the final run; no other task's file was touched).

### Verified against the real cache, not only fixtures

The 3.8MB `data/cache/gamelogs.json` T9's live prep run left behind was driven through the real
`GameLogStore` with a half-PPR dict plus three unsupported keys, to check that the payloads this
card will actually receive match what it renders:

| player | result |
|---|---|
| Jahmyr Gibbs (RB) | 3 season tabs (2025/2024/2023); week 1 `{opponent:"GB", fantasyPoints:10, rushing:{att:9,yds:19,avg:2.11,td:0}, receiving:{tgt:10,rec:10,yds:31,td:0,long:7,ydsPerTgt:3.1}, fumbles:0}` — the RB column set |
| Ja'Marr Chase (WR) | receiving every week and a rushing line in **3 of 16** games, which is exactly the case decision 1's season-union handles: the rushing columns stand all season, the other 13 weeks read `—` |
| Josh Allen (QB) | passing + rushing, never receiving; `fantasyPoints: 38.76` keeps its second decimal per decision 4 |
| Squirrel White (rookie) | `hasData: false` → AC-65's card |
| all four | `unsupportedScoringKeys: ["def_st_td","fgm_40_49","sack"]`, including on the no-data card |

`opponent` is a bare team abbreviation and `week` a number in the real data, as the fixtures
assume. The cache's scoring-only fields (`fumblesLost`, `twoPointConversions`) are dropped by T9's
reader before the card sees them, so nothing in this component reads a field AC-62 does not name.

### A transient collision, and how it was handled

The first full run failed in this task's AC-61 test with
`TypeError: Cannot read properties of undefined (reading 'map')` from `PickFeed` — T13 had landed
a new required `teams` prop on `PickFeed` but had not yet updated `DraftScreen` to pass it, so
`npm run typecheck` also reported `DraftScreen.tsx: Property 'teams' is missing`. Nothing in this
task's own files was implicated; the commands above are the re-run after T13's side settled, which
is the handling this spawn's brief prescribes for a concurrent-tree collision.

## Left for downstream tasks

- **T12 / T13** wire the one-click trigger on their own rows: `import { openPlayerCard } from
  '../state/playerCard'` and call `openPlayerCard(playerId)`. Nothing else is required of them —
  the host is already mounted on the draft screen and owns the overlay, the fetch and the state.
  **AC-61 is only fully reachable in the running app once at least one of those rows calls it**;
  the card itself, its route and its mount are proven here.
- **T15**'s frontend smoke check gets one more surface for free: the card is inert until opened, so
  a fixture snapshot render is unaffected, and `openPlayerCard(id)` + a stubbed `fetch` is the
  whole recipe if the capstone wants to touch it.
- **A reviewer's call**: whether `unsupportedScoringKeys` (decision 5) belongs on the player card,
  on the pre-draft check beside `gamelog-cache-missing`, or both. It is per-league, not per-player,
  so the pre-draft check is arguably its more natural home — the card is where it is *read*,
  which is why it went there first.
