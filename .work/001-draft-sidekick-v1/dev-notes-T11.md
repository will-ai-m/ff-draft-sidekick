# Dev notes — 001-draft-sidekick-v1 (T11: frontend shell, SSE-fed state store, attach screen)

Scope: design.md §T11 only. The server is consumed exactly as T10 shipped it — no server file, no
shared type, and no other task's test was touched. T12 (candidate list), T13 (opponent/roster/pick
feed) and T14 (player card) get named, typed, snapshot-wired mount points rather than
implementations.

## Changes

**New — `packages/web/src/state/store.ts`.** The SSE-fed store. One `EventSource` on `/events`;
every frame is applied by **wholesale replacement** of the whole `AppStateSnapshot` — no
field-level merge anywhere, which is the Approach's full-state-replace principle pushed one layer
past the server. Exposed to React through `useSyncExternalStore` (`useAppState`), so a component
re-renders on an actual new frame and on nothing else; `getState` returns a stable reference
between frames. Also exports `isRecomputing(snapshot)` — AC-21 as one predicate over the three
`Insight` wrappers, which is what the sync indicator reports.

**New — `packages/web/src/state/api.ts`.** The browser's only write surface: `postAttach`,
`postDraftSlot` (AC-5's follow-up on the same route), `postResync`, `postDetach`,
`fetchUserDrafts` (AC-3), plus the `localStorage`-backed stored-username helpers. Nothing here
writes into the store — every effect comes back on the stream like any other change, so there is
one answer to "what is on the board".

**New — `packages/web/src/screens/AttachScreen.tsx`.** UJ-1 end to end: paste field (never gated
behind anything), optional username + convenience list, teams/owners confirmation (AC-2, bot and
empty seats by slot number), the manual slot picker when the seat is unresolved (AC-5), the
pre-draft check surface (snapshot sources/ages, warnings verbatim, league summary, unmatched
entries, matched-but-ADP-less players), and the explicit "Start drafting" confirmation.

**New — `packages/web/src/screens/DraftScreen.tsx`** (three-column layout, sync indicator, detach)
and **`packages/web/src/components/`**: `SyncIndicator.tsx` (real), `Panel.tsx` (the frame every
named surface sits in), and `CandidateList.tsx` / `OpponentPanel.tsx` / `RosterPanel.tsx` /
`PickFeed.tsx` as mount points — each already receiving its slice of the snapshot with the props
T12/T13 build against.

**Rewritten — `packages/web/src/App.tsx`, `main.tsx`.** `App` takes the store as a prop and holds
exactly one piece of local state (has the user confirmed this draft); `main.tsx` builds and
connects the store outside React.

**Amended — `packages/web/vite.config.ts`.** One line: `test.setupFiles`. See decision 5.

**New tests** — `state/store.test.ts` (7), `components/SyncIndicator.test.tsx` (8),
`screens/AttachScreen.test.tsx` (11), `App.test.tsx` (5, replacing T1's placeholder), plus
`test/fakeEventSource.ts`, `test/fixtures.ts`, `test/setup.ts`.

## Decisions worth a reviewer's attention

### 1. Confirmation is blocked while the seat is unresolved (AC-5 + UJ-1, architect-unspecified)

design.md says the slot picker appears when the seat is missing and that the draft screen is
reached "only after the user explicitly confirms", but not how those two interact. UJ-1's path
reads *"user confirms it's the right draft (and clicks their slot if auto-detect can't)"* — one
step, both halves. So **"Start drafting" is disabled while `attach.status === 'needs-manual-slot'`**,
with the picker directly above it naming what stays blocked ("mine-vs-opponent, next-pick and
survival output").

The alternative — confirm freely and resolve the seat later — is a trap: the picker lives on the
attach screen, so a user who confirmed without a seat would have no way back to it. Blocking the
transition is strictly stronger than AC-5's "block those outputs" (which the server enforces on its
own via `disabledReason`), and it costs nothing: choosing a slot is one interaction away.

### 2. The stored username is a browser-side concern, and it does double duty

AC-3 says the convenience list appears "when a stored Sleeper username exists". Nothing on the
server stores one, so `localStorage` is the only place it can live in a local, auth-less, no-DB
app — key `sidekick.sleeperUsername`. The same stored username is sent as `sleeperUsername` on
`POST /api/attach`, which is how `AttachManager` resolves the user's seat from `draft_order` in the
first place. Without that, *every* attach would land on AC-5's manual-slot path and the auto-detect
branch would be dead code in practice.

The username **input** is always visible (it is how one gets stored); only the **list** is gated,
and the paste field is never gated on either — AC-3's "paste remains the primary path regardless".

### 3. A connection state the snapshot cannot express (architect-unspecified, flagged)

A dead server and a quiet draft look identical from snapshots alone: nothing new arrives in either
case. T10's decision 4 already fought this on the server side with a ticking indicator; the same
hole exists one layer up — if the SSE stream drops, the last snapshot simply sits there looking
current. So the store tracks `connecting | open | reconnecting | closed`, and the shell shows a
banner while it is not `open`. Paired with the sync indicator's local one-second ticker (the
elapsed reading keeps climbing whether or not frames arrive), a stalled system is visible from two
independent directions instead of zero.

Flagging it because design.md names neither. Neither adds a data path: the ticker is display-only
and the banner reads the transport, not the board.

### 4. Two things the shell renders that arguably belong to T12/T13

- **`candidateList.data.disabledReason`** is rendered by the `CandidateList` mount point. AC-28's
  "no rankings loaded" is explicitly in this task's brief, and the state is the candidate list's
  own, so it lives there rather than in a shell-level banner. The file carries a comment telling
  T12 to keep the branch — "no rankings loaded" is a *stated mode*, never an empty table.
- **A `Detach` button** on the draft screen. T10 added `POST /api/detach` for AC-41's first clause
  and left it with no caller; without a control, the only detach is killing the process and the AC
  stays unreachable. Same reasoning T10 recorded for adding the route.

Everything else in those four components is a placeholder naming the task that fills it in.

### 5. `setupFiles` — and why the web suite ships its own `localStorage`

`vite.config.ts` gains `test.setupFiles: ['./src/test/setup.ts']`, which does two things:

- **RTL cleanup.** Testing Library only auto-registers its unmount when `afterEach` is a global,
  and this workspace deliberately runs vitest without `globals: true` (T1). Without it, renders
  accumulate across tests in a file and `getByRole` starts finding duplicates.
- **`localStorage`.** Diagnosed by probe: **Node 26 defines a `globalThis.localStorage` accessor
  that returns `undefined`** unless the process was started with `--localstorage-file`, and it
  shadows the working one jsdom provides (`new JSDOM(…).window.localStorage` is a real Storage;
  `globalThis.localStorage` is `undefined` plus an ExperimentalWarning). Real browsers have
  storage, so the setup file installs a minimal in-memory `Storage` rather than letting the suite
  encode an absence that exists only under Node. The app's own accessors are `try`/`catch`-wrapped
  regardless, so a browser with storage disabled loses the convenience list and nothing else.

The stray `ExperimentalWarning` lines in the test output come from Node touching that accessor and
are unrelated to any assertion.

### 6. `UserDraftSummary` is mirrored, not imported

AC-3's list rows are typed by `UserDraftSummary` in `packages/server/src/sleeper/attach.ts`. The
web package does not depend on the server package and should not start to for one interface, and
promoting it into `@sidekick/shared` would mean editing another task's package from a frontend
task. `state/api.ts` declares the same seven fields locally with a comment naming the server type
as the authority. Worth a reviewer's call on whether it should be promoted to shared instead —
it is the only duplicated shape in the frontend.

### 7. `EventSource` is injected, not stubbed globally

jsdom ships no `EventSource`, so the store takes an `EventSourceFactory` (defaulting to the real
one). The suite passes `FakeEventSource`, which drives frames **synchronously** — that is what
makes "this exact frame produced that exact render" assertable rather than a timing race, and it
keeps the store's contract (a `data` string in, a whole snapshot out) visible in the fake's own
tiny surface.

## Test-first evidence

All four test files, both test-support modules and the fixture builder were written before
`store.ts`, `api.ts`, either screen or any component existed.

- failing: `npm test` →
  ```
   FAIL |web|  src/App.test.tsx [ packages/web/src/App.test.tsx ]
   FAIL |web|  src/components/SyncIndicator.test.tsx [ … ]
   FAIL |web|  src/state/store.test.ts [ … ]
   FAIL |web|  src/screens/AttachScreen.test.tsx [ … ]
  Error: Failed to resolve import "./AttachScreen" from
    "packages/web/src/screens/AttachScreen.test.tsx". Does the file exist?

   Test Files  4 failed | 28 passed (32)
        Tests  466 passed (466)
  ```
  exit 1. The 466 pre-existing tests were green in that same run — the four new suites were the
  only failures. (466, not T10's 467: the placeholder `App.test.tsx` that T1 wrote and T1's own
  notes say T11 "is expected to replace wholesale" is the one test that went away.)
- passing: `npm test` → `Test Files 32 passed (32) / Tests 497 passed (497)`, exit 0.
  466 pre-existing + 31 from this task's four files, none of the 466 touched.
- commits: none — per this spawn's instruction the developer does not run git; the orchestrator
  commits. Test-first ordering is recorded here instead of by commit order.

Two assertions were adjusted after the tests were written and before implementation, both because
the **test** was wrong; recording them so the diff is not puzzling:

- The slot picker's `<select>` was queried with `getByLabelText(/draft slot/i)`, which also matches
  the enclosing `<section aria-label="Your draft slot">` — RTL's `getByLabelText` matches
  `aria-label` on any element, not just form controls, so the query was ambiguous by construction.
  Changed to `getByRole('combobox', { name: /draft slot/i })`.
- One assertion used `toHaveProperty('textContent', expect.stringContaining(…))` where a plain
  `expect(alert.textContent).toMatch(…)` says the same thing and reads as an assertion about text.

### §T11's "done when", clause by clause

| required | where |
|---|---|
| against a mocked EventSource emitting fixture snapshots | `test/fakeEventSource.ts` drives `store.test.ts` and `App.test.tsx`; `AttachScreen`/`SyncIndicator` take fixture props directly |
| attach screen renders fixture teams/owners | `AttachScreen.test.tsx`: "displays every seat, bot and empty ones by slot number (AC-2)" — named team, named owner, bot seat, empty seat, and all four slot numbers |
| surfaces the pre-draft check content | "surfaces the pre-draft check content the user confirms against (AC-22..AC-27)" — both snapshot sources, the 30 h age, the substituted ADP pool, all three warning strings, the league summary, the unmatched entry and the ADP-less player |
| manual slot picker shown **exactly when** the attach state calls for it | "shows the picker only while the seat is unresolved" — present under `needs-manual-slot`, absent under `attached`; plus "posts the chosen slot to the attach route" asserting the body is exactly `{draftSlot: 2}` |
| transitions to the draft screen on confirm | `AttachScreen.test.tsx` "confirms the draft and hands off…" (the callback) and `App.test.tsx` "moves to the draft screen only once the user confirms…" (the routing, asserting all five named surfaces render and that none of them render before the click) |
| each as a separate component test | 31 tests across four files, one behaviour each |

Beyond the "done when": the store's wholesale-replace guarantee (a detach frame leaves no residue
of the attached one), reference stability for `useSyncExternalStore`, a malformed frame keeping the
last good snapshot, AC-7's classified failure + preserved input, AC-3's gating in both directions,
AC-28's stated mode, AC-14/AC-16/AC-17/AC-21's four indicator states, AC-19's Re-sync in both
outcomes, and the connection-drop banner.

### Live smoke test (not part of the suite)

`npm run build` then `PORT=3111 npx tsx packages/server/src/index.ts`, driven in a real browser:

- `/` serves the built shell; the attach screen rendered from the server's real on-connect SSE
  frame (not from any client-side default), confirming the wholesale-replace path end to end.
- Typing `not-a-draft` and pressing Attach produced the server's own classified message —
  `"not-a-draft" does not contain a Sleeper draft id. Paste a draft URL or the id itself.` — in the
  alert, with the field still reading `not-a-draft`. AC-7 verified against the real route, not a
  mock.
- No unhandled console errors (only the expected 400 from that deliberate bad attach).

## Test-file changes

- **`packages/web/src/App.test.tsx` — replaced wholesale.** It was T1's one-line placeholder
  asserting the scaffold heading; T1's own dev notes state it "is expected to be replaced wholesale
  by T11's real attach/draft-screen tests", and §T11 requires exactly those. The scaffold
  component it tested (`App`'s placeholder body) no longer exists, so the assertion had no
  behaviour left to make.
- No other pre-existing test file was modified or deleted. All 466 tests from T1–T10 still pass.

## Commands

Run from repo root.

- test: `npm test` → **exit 0** — `Test Files 32 passed (32) / Tests 497 passed (497)`. Judged
  against `baseline.txt` (the greenfield ENOENT), so there are no pre-existing failures to net
  against; every suite green before this task is green after.
- lint: `npm run lint` → **exit 0**, no warnings.
- typecheck: `npm run typecheck` → **exit 0** (shared, server, web).
- `npx prettier --check` over this task's touched files → clean (six were reformatted by
  `--write` before the final run; no other task's file was touched).
- `npm run build` → exit 0, Vite emits `packages/web/dist` — the artifact `npm start` serves.

## Left for downstream tasks

- **T12** replaces `components/CandidateList.tsx`. Props are already `{ candidateList:
  Insight<CandidateListData> }`. Read `data.rowsByPosition[position]` for AC-50's filter (no
  fetch), render `data.reason` verbatim, use `recomputing` for the dimmed-but-visible treatment —
  and **keep the `disabledReason` branch**, which is AC-28/AC-5's stated mode.
- **T13** replaces `components/OpponentPanel.tsx`, `RosterPanel.tsx`, `PickFeed.tsx`. Props are
  already the exact slices (`Insight<OpponentPanelData>`, `Insight<RosterPanelData | null>`,
  `PickFeedEntry[]`). `Panel` gives each one its frame and its accessible name; keep the PRD §9
  Terms titles, since the component tests and screen readers address the panels by them.
- **T14** mounts inside `DraftScreen`. The card is an overlay over local UI state (which player id
  is open), so the "which row was clicked" plumbing is T14's to add through whichever panels it
  needs — nothing here presupposes its shape.
- **T15**'s smoke-level frontend check can render `<App store={…}/>` with a `FakeEventSource`
  emitting the 150-pick fixture's final snapshot; `test/fixtures.ts` and `test/fakeEventSource.ts`
  are built for exactly that, and all five named surfaces are queryable by role + PRD §9 name.
- **Possible promotion**: `DraftSummary` in `state/api.ts` mirrors the server's `UserDraftSummary`
  (decision 6). If a reviewer prefers one declaration, it belongs in `@sidekick/shared`.
