# Dev notes — 001-draft-sidekick-v1 (T10: server orchestration, SSE broadcast, REST endpoints)

Scope: design.md §T10 only — the integration point. T1–T9's modules are **consumed and not
modified**; the only edits outside new files are the four shared-type finalizations §T10 assigns to
this task ("shape locked in T1, finalize field-by-field here") and one additive sample type on
`observability.ts` for AC-67, which T2 explicitly left to T10 to define ("T2 records; T10 decides
how to surface"). No frontend work: T11–T14 build against the `AppStateSnapshot` this task ships.

## Changes

**New — `packages/server/src/orchestrator.ts`.** The whole wiring: `AttachManager` + `BoardSync`
(T2), `resolveLeagueSettings` (T4), `SnapshotStore` (T3), `RosterPanelTracker` (T4),
`TendencyProfileTracker` (T6), `GameLogStore` (T9), and the T5→T6→T7→T8 recompute cascade, all
projected into one `AppStateSnapshot` and broadcast whole. Owns the burst debounce, the
`recomputing` semantics, AC-41's discard triggers, and AC-67's per-burst latency sample.

**New — `packages/server/src/routes/`.** `events.ts` (the SSE endpoint plus an `SseHub` that
serializes each snapshot **once** and writes the identical bytes to every connection),
`attach.ts` (`POST /api/attach` for both the paste and AC-5's slot follow-up, `POST /api/detach`,
`GET /api/drafts`), `resync.ts`, `playerGamelog.ts`, `config.ts` (`GET /api/config` +
`GET /api/debug/metrics`), and `server.ts` assembling them onto one Express app — exactly the file
list design.md's structure plan names.

**Rewritten — `packages/server/src/index.ts`.** Builds the one orchestrator this process owns and
mounts the app. The observability sink now emits one JSON line per sample, which is AC-66/AC-67's
minimum surface per §T10 (`{"type":"pick-reflected","lagMs":…}` /
`{"type":"burst-refreshed","latencyMs":…}`); poll-response samples are kept out of the log because
one line per second per poll would bury the two lines a rehearsal is actually reading.

**Amended — `packages/server/src/observability.ts`.** Added `BurstRefreshedSample`,
`recordBurstRefreshed`, and `burstLatencySummary()` (the nearest-rank p95 helper generalised over
both sample kinds). AC-67's clock — burst-final poll response → insights published — has no other
owner: T2 recorded per-pick lag and deferred this half here.

**Amended — shared types (the four fields §T10 says T10 finalizes).**

| change | why |
|---|---|
| `AppStateSnapshot.sync` → named `SyncState` with `draftStatus` and `degradedReason` | AC-14 requires the *draft's* status on screen while paused, and FR-3's indicator is more useful naming the failure than just colouring red. Both were already computed by T2 and simply had no wire field. |
| `AppStateSnapshot.opponentPanel: Insight<OpponentPanelEntry[]>` → `Insight<OpponentPanelData>` (`{window, entries}`) | T5's handoff: an empty `entries` means "nothing before your next turn" *or* "your seat is unresolved", and only the window anchors plus `attach.status` separate them. Putting the window inside the same `Insight` keeps it under the same recomputing/degraded flags as the rows it captions, instead of a second top-level field that could disagree. |
| `CandidateListData.rowsByPosition?` | AC-50's transport — see decision 2. |
| `PreDraftWarning.code` += `'gamelog-cache-missing'` | T9's handoff: `store.isLoaded === false` belongs on the pre-draft check beside the snapshot ages. The pre-draft check is the one surface that answers "is this instance ready to draft with?". |

**New tests** — `src/orchestrator.test.ts` (15) and `src/routes/server.test.ts` (13), plus
`test/harness.ts` (a whole server minus its timers) and `test/msw/handlers.ts` — the aggregate
handler module design.md's §T1 note promised and T2's decision 8 deferred to "whichever later task
first needs both at once". That task is this one.

## Decisions worth a reviewer's attention

### 1. `recomputing` is derived from the board version, not tracked as a flag

`recomputing = insights.boardVersion < sync.boardVersion`. One comparison, computed at snapshot
time, covering both halves of §T10's rule: a cascade still inside the debounce window and a cascade
in flight are both "the board moved, this view has not". That is AC-21's own wording made
structural — an insight *cannot* be published as current while its version is behind, because
there is no separate flag to forget to set. The cascade is synchronous end to end, so every insight
in the cache is always from the same board version; a snapshot can never mix two.

`degraded` stays completely separate (`sync.status === 'degraded'`, stamped onto every insight for
AC-48). The PRD draws these as distinct states and nothing here collapses one into the other.

### 2. AC-50's filter transport: precomputed per-position row sets in the snapshot (§T10 left this to me)

T8's decision 9 handed T10 the choice between recomputing per filter behind a REST parameter and
precomputing per-position sets. **Precompute, inside the same `Insight`.** Three reasons:

- The frontend genuinely cannot filter client-side — eight ECR-ordered rows might hold two
  receivers — and `filterCandidateRows` is a *server-side ordering rule* (positional ECR order, ADP
  fallback, no survival math for K/DST), not a display predicate.
- A REST endpoint per filter click opens a second channel carrying board-derived data, which can
  answer from a different board version than the SSE snapshot on screen. That is precisely the
  staleness class the Approach's full-state-replace principle exists to eliminate, and it would
  need its own `recomputing`/`degraded` plumbing to be honest.
- The cost is six `filterCandidateRows` calls per recompute over an already-computed projection —
  microseconds — against AC-50's "one interaction", which a network round trip is not.

`rowsByPosition` is optional on the type and absent whenever `disabledReason` is set, so a payload
built with no rankings loaded stays exactly as AC-28 describes it.

### 3. An unresolved seat suppresses the recommendation but not the rows (AC-5)

AC-5 blocks "mine-vs-opponent, next-pick, and survival output". With no seat there is no window, so
T7 suppresses survival on its own and T5 returns an empty window on its own — those two fall out.
The recommendation is the third: FR-10 is literally a two-pick lookahead, so with no "my next pick"
there is no plan to compare, and `computeCandidateList` would otherwise emit
*"Lookahead does not apply with 0 picks left"* — a true-sounding sentence built on a count that is
unknown rather than zero. So the orchestrator publishes the rows (raw ECR order over what is
available claims nothing about whose turn it is) with `highlightPlayerId: null` and a
`disabledReason` naming the missing slot. AC-28's "no rankings loaded" still outranks it.

### 4. A ticking sync indicator, because AC-16 says "at all times" (architect-unspecified, flagged)

`BoardSync.onChange` fires only when the board actually changes. Wired naively, nothing is
broadcast between picks — which on a 60-second pick clock is most of a draft — so the browser's
"last successful sync" reading would sit frozen at the last pick's timestamp and be
indistinguishable from a stalled poll loop. That is the exact condition AC-16's indicator exists to
make visible, inverted.

So the orchestrator runs a `pollIntervalMs`-cadence ticker that compares the
`(lastSuccessfulSyncAt, status, boardVersion)` triple against the last broadcast one and pushes
only when it moved: one extra broadcast per otherwise-silent successful poll, and **none at all
while the loop is stuck** — silence is the signal. Injectable (`syncTickMs`, 0 disables) and
tested from both sides. Flagging it because design.md does not name it: the alternative was adding
an `onPoll` hook to T2's `BoardSync`, which I preferred not to do from an integration task.

### 5. One coalesced broadcast per user action, so no listener sees a half-applied state

`AttachManager.selectSlot` → `BoardSync.setUserSlot` re-derives the board and fires `onChange`
*before* the cascade has rebuilt anything for the new seat — and `setUserSlot` does not bump
`boardVersion`, so that intermediate snapshot would carry the new seat beside the old seat's
insights with `recomputing: false`. Sub-millisecond, but SSE means the browser really does render
whatever frame it gets, and "stale presented as current" is the constitution's cardinal sin at any
duration. `coalesce()` holds broadcasts for the duration of one such action and publishes once at
the end. Re-sync goes through `flushBurst()` for the same reason plus a second one: without it a
re-ingest that brought picks would recompute twice, once explicitly and once when the armed
debounce fired.

### 6. `POST /api/attach` carries both halves of attaching, per §T10's own wording

design.md says the attach route "also handles the manual-slot-selection follow-up call". Dispatch
is on the body shape: `{input}` is the paste, `{draftSlot}` with no input is AC-5's follow-up
against the draft already attached. Failures answer a status mapped from the *classified* failure
kind (400/404/409/429/502/504) with `{failure: {kind, message, input}}` — AC-7 needs the screen to
say which failure occurred and to retry without discarding what was typed, so the input is echoed
through the whole path and never cleared server-side.

### 7. Two routes design.md does not list, both wiring existing ACs that had no transport

- `POST /api/detach` — AC-41's other trigger is "Sidekick detaches", and T6's handoff assigns that
  trigger to T10. `AttachManager.detach()` existed with no caller; the draft-ended half is wired
  separately (the orchestrator discards on `sync.isComplete`). Without this route the only detach
  is killing the process, and AC-41's first clause would be untestable and unreachable.
- `GET /api/drafts?username=` — AC-3's convenience list. `AttachManager.listUserDrafts` existed
  with no caller, and T11's attach screen cannot render the list without a transport.

Both are small and both make an existing AC reachable rather than adding behaviour; flagging them
since §T10's REST list names neither.

### 8. `GET /api/player/:id/gamelog` refuses before an attach rather than falling back

AC-64 requires the log's points to come from the attached league's own settings. With no attach
there is no league, and scoring the card in some other format would be a plausible-looking wrong
answer — worse than no answer, since nothing on the card would say which format it used. 409 with
an explicit message. (The card is only reachable from the draft screen anyway, which does not exist
before an attach.)

### 9. AC-50's ADP-only K/DST fallback is still unreachable, and the fix belongs in T3 — flagged

T8's decision 8 noted that `filterCandidateRows`' ADP-order fallback cannot fire in production
because `MatchResult.players` is built by walking the **ECR** feed, and left "pass ADP-only K/DST
rows" as a wiring choice for T10. It is not one this task can make honestly: `matchSnapshots`
resolves ADP rows to Sleeper ids in a local map it never emits, and `resolveAdpEntry` is not
exported — so building ADP-only rows in the orchestrator would mean reimplementing T3's matching
rules in a second place, which is how two answers to the same question start. Left as is: when a
fetched ECR snapshot carries no K/DST (AC-23's warning case), `rowsByPosition.K`/`.DST` come back
empty and the pre-draft check's AC-23 warning is what the user sees. The real fix is one field on
`MatchResult` in `snapshots/match.ts`. Worth a reviewer's call on whether that belongs in this
feature or the backlog — note that the live FantasyPros half-PPR cheat sheet *does* carry K and
DST (verified in design, and both are in the fixture), so this is the fallback path for a
degenerate snapshot, not the normal one.

### 10. Two test-harness details a reviewer will otherwise trip over

- **`reader.cancel()` wedges an SSE test; `AbortController.abort()` does not.** Cancelling the
  reader on an endless stream leaves undici waiting for an end that never arrives, and the suite
  hangs until vitest's timeout. Diagnosed by probe, then fixed by aborting the request — which also
  reaches the server and fires the route's `close` handler, which is what we want to exercise
  anyway. Documented in the test file so nobody re-introduces it.
- **msw is not the obstacle.** A separate probe confirmed `setupServer({onUnhandledRequest:
  'bypass'})` streams a real localhost SSE response fine, so the suites drive a real Express
  instance on an ephemeral port over native `fetch` — no new dependency (no `supertest`).
  Continuing T2's decision 11, the burst tests use **real** timers with a short
  `burstDebounceMs`, since vitest's fake timers and msw's interceptor still do not mix.

## Test-first evidence

Both suites, the harness and the aggregate handler module were written before `orchestrator.ts` or
any route existed.

- failing: `npm test` →
  ```
  ⎯⎯⎯⎯⎯⎯ Failed Suites 2 ⎯⎯⎯⎯⎯⎯⎯

   FAIL |server|  src/orchestrator.test.ts [ packages/server/src/orchestrator.test.ts ]
   FAIL |server|  src/routes/server.test.ts [ packages/server/src/routes/server.test.ts ]
  Error: Failed to load url ../src/orchestrator (resolved id: ../src/orchestrator) in
    /Users/willyu/willy-ff/packages/server/test/harness.ts. Does the file exist?

   Test Files  2 failed | 27 passed (29)
        Tests  439 passed (439)
  ```
  exit 1. The 439 pre-existing tests were green in that same run, so the two new suites are the
  only failures.
- passing: `npm test` → `Test Files 29 passed (29) / Tests 467 passed (467)`, exit 0.
  439 before this task, +28 from its two new files, none of the 439 touched.
- commits: none — per this spawn's instruction the developer does not run git; the orchestrator
  commits. Test-first ordering is recorded here instead of by commit order.

Two assertions were corrected after the tests were written and before implementation, both because
the **test** was wrong; recording them so the diff is not puzzling:

- `preDraftCheck.ecrSnapshot.source` asserted `toContain('FantasyPros')`. T3 sets `source` to the
  cheat-sheet **URL**, so the assertion is `'fantasypros.com'`.
- One line asserted a `boardVersion` on `candidateList.data`. The version lives on the `Insight`
  wrapper, not inside the payload — the assertion now reads `candidateList.boardVersion`.

### §T10's "done when", clause by clause

| required | where |
|---|---|
| integration test drives attach → sync → recompute → SSE payload | `server.test.ts`: `POST /api/attach` then `GET /events` — the on-connect frame is a complete attached snapshot |
| a burst of 3 picks inside one debounce window | `orchestrator.test.ts`: "fires exactly one recompute for three picks inside one debounce window" — three *separate* polls, each adding one pick, inside a 250 ms window |
| **exactly one** recompute fired for the burst (not three) | same test, asserting `recomputeCount` is unchanged during the window and `+1` after it; and "records one burst-refresh latency sample per burst, not one per pick" asserting a single AC-67 sample with `pickCount: 3` |
| final snapshot matches hand-computed board + insights | "publishes one complete snapshot…" pins the 10 teams, the exact `SlotConfig` off the draft's own settings, the window `[1,2,3]` closing at pick 4, the ECR-ordered rows `9221`/`7564`, and every insight fresh at the current board version; "carries the pre-draft check…" pins the TE filter order `['11604','8130','8210']` and the DST row's null survival |
| two simulated SSE listeners receive byte-identical payloads | `server.test.ts`: "gives every connected tab byte-identical payloads (AC-15)" — two live connections, three frames each (`initial`, `recomputing`, `settled`), asserted equal frame for frame |

Beyond the "done when": AC-21's recomputing marker keeping its prior data, AC-48's degraded stamp
on every insight and the recovery back to healthy, AC-16's ticking-and-then-silent indicator, AC-19
Re-sync (module and route), AC-29's fetch-exactly-once request counts, AC-6's refused second attach,
AC-7's classified failure + echoed input (module and route), AC-5's blocked-then-unblocked
transition (module and route), AC-41's detach-and-reattach returning neutral priors, AC-64's
hand-computed 19.3 half-PPR point total, AC-65's explicit no-data card, AC-3's draft list, and
`/api/config` answering 404 to a write attempt.

## Test-file changes

- **none.** No pre-existing test file was modified or deleted. `src/orchestrator.test.ts` and
  `src/routes/server.test.ts` are new, as are `test/harness.ts` and `test/msw/handlers.ts`. T1–T9's
  suites are untouched and all 439 of their tests still pass.

## Commands

Run from repo root.

- test: `npm test` → **exit 0** — `Test Files 29 passed (29) / Tests 467 passed (467)`. `baseline.txt`
  is a greenfield ENOENT, so there are no pre-existing failures to net against; every suite green
  before this task is green after.
- lint: `npm run lint` → **exit 0**, no warnings.
- typecheck: `npm run typecheck` → **exit 0** (shared, server, web).
- `npx prettier --check` over this task's ten touched files → clean. No other task's file was
  reformatted.
- Smoke-tested the real entrypoint (`npx tsx packages/server/src/index.ts`): `/api/health`,
  `/api/config`, a classified `POST /api/attach` failure, and a live `/events` stream serving the
  current snapshot all answered correctly.

## Left for downstream tasks (seams T10 exposes, deliberately unwired here)

- **T11** opens one `EventSource('/events')` and replaces its store wholesale on every message —
  never merging. The shape is `AppStateSnapshot` as shipped here, which differs from T1's sketch in
  the four rows tabled above; design.md §T11 already says T10's actual shape wins. `POST /api/attach`
  takes `{input, sleeperUserId?, sleeperUsername?}` and answers `200` + the snapshot or a 4xx with
  `{failure: {kind, message, input}}` — render `message`, keep `input` in the field (AC-7). The
  slot picker posts `{draftSlot}` to the same route when `attach.status === 'needs-manual-slot'`.
  The Re-sync button posts `/api/resync`; `GET /api/drafts?username=` is AC-3's list.
- **T12** renders `candidateList.data` verbatim (T8's reason strings are never reworded) and reads
  `rowsByPosition[position]` for AC-50's filter — one interaction, no fetch. `recomputing` is the
  dimmed-but-visible treatment; `disabledReason` now covers both AC-28's "no rankings" and AC-5's
  unresolved seat, so render it as a general disabled banner rather than assuming which cause.
- **T13** reads `opponentPanel.data.window` for AC-34's caption anchors (`userOnTheClock`,
  `inProgressPickNo`, `nextUserPickNo`) beside `.entries`. An empty `entries` with
  `nextUserPickNo === null` is "no pick left"; an empty `entries` while
  `attach.status === 'needs-manual-slot'` is the unresolved seat. `sync.draftStatus` is AC-14's
  paused/between-picks readout and `sync.degradedReason` is the indicator's detail line.
- **T14** fetches `GET /api/player/:sleeperPlayerId/gamelog` on open and renders the `PlayerCard`
  verbatim; a 409 means no draft is attached (unreachable from the draft screen).
- **T15** can replay its 150-pick fixture through `Orchestrator` directly with
  `pollingEnabled: false` and drive `pollOnce()`, exactly as this task's suites do —
  `test/harness.ts` is built for that and `recomputeCount` is the counter its burst assertion needs.
  `metrics()` answers the AC-66/AC-67 "at least one plausible sample" clause.
- **T3 or the backlog** owns decision 9's ADP-only K/DST rows, which need a field on `MatchResult`
  rather than a workaround here.
