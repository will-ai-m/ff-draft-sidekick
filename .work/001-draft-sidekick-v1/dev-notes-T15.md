# Dev notes — 001-draft-sidekick-v1 (T15: end-to-end integration test against a full mock-draft fixture)

Scope: design.md §T15 only. This is a **test-only** task — no file under `packages/*/src` other than
the two new test files was created or modified, and no existing test was touched. Everything below
drives the real `Orchestrator` (T10) over the real T2–T9 modules; only the outside world (Sleeper,
FantasyPros, FFC, the DynastyProcess crosswalk) is fixtures, served through `msw`.

## Changes

Five new files, all test-side:

| file | what it is |
|---|---|
| `packages/server/test/fixtures/e2e-draft-board.json` | The static fixture board: 206 players + a 150-entry `pickScript`. 32 KB. |
| `packages/server/test/fixtures/e2eDraft.ts` | Turns that board into every shape the external world actually serves — the FantasyPros `ecrData` embed, the FFC ADP feed, a `db_playerids.csv` slice, a Sleeper `/v1/players/nfl` dump, and two draft bundles over the same 150 picks. |
| `packages/server/test/e2eReplay.ts` | The replay driver plus `InvariantChecker` — the PRD's cross-cutting rules, checked on **every** broadcast. Shared by both suites. |
| `packages/server/test/e2eReplay.test.ts` | 27 tests: §T15's five "done when" clauses, the run-shape claims, and the checker's own falsifiability tests. |
| `packages/web/src/e2eSmoke.test.tsx` | 5 tests: the real UI rendered against the real server's final `AppStateSnapshot` for the same fixture. |

design.md's file-structure plan names neither `test/e2eReplay*.ts` nor a web-side e2e file; flagging
that these are additions to it, in the spirit of T10's `test/harness.ts`.

### The fixture

**Player data is real, ids are synthetic.** Names, positions, teams, ECR ordering and ADP come from
`research/half-ppr-2026-board.csv` — the repo's own 2026 half-PPR consensus board (186 skill
players). K rows are topped up to 14 and 12 team defenses added, since ten seats each need one and
the source board carries neither. Sleeper/FantasyPros ids are synthetic but internally consistent,
so the crosswalk join is exercised for real. Deliberate coverage baked into the board:

- **8 players carry no crosswalk row** → FR-4's normalized-name fallback carries them (AC-25).
- **Every DST is absent from the crosswalk**, as the real players-only file behaves → team-code
  matching (AC-25).
- **17 matched players carry no ADP row** → AC-26's "matched but no ADP" list, distinct from
  unmatched.
- **One drafted player is in the Sleeper dump and in neither snapshot** (pick 88) → AC-20.

**The pick script was generated offline** by an independent need-and-ADP heuristic (a scratch Python
script, not committed) and is committed as static data. That separation is the point: the fixture
describes what a draft room *did*, and shares no code with the simulation the server runs, so the
convergence assertion is a real comparison rather than the system agreeing with itself. Every seat
ends with a full starting lineup including a K and a DST, so AC-47's saturation branch is live in
the late rounds rather than theoretical.

### The replay

`replayDraft()` walks the shape the task brief names: attach → the pre-draft check the user confirms
on → picks arriving through ~33 polls (single and multi-pick) → one deliberate three-poll burst →
a malformed-payload degraded episode and its automatic recovery → a contradicts-the-board degraded
episode and its recovery → a manual Re-sync with seven picks outstanding → out past the user's last
pick → the tail of the draft → the draft closing. One run: 66 broadcasts, 31 recomputes, 47 Sleeper
requests, 315 pick-lag samples, 29 burst-latency samples.

## Decisions worth a reviewer's attention

### 1. Two bundles over one pick script, because Sleeper cannot express §T15's fixture as written

§T15 asks for a **mock**-draft fixture that also contains **a traded pick**. Sleeper has no such
object: traded picks are expressed in `roster_id`s and resolved through `slot_to_roster_id`, and a
mock has `league_id: null` and therefore neither (T2's own fixtures show exactly this, and
`buildPickOwnerResolver` returns the plain seat when `slot_to_roster_id` is null). Inventing a mock
that carried them would be asserting against a schema that never arrives in production.

So the one 150-pick script is emitted twice and replayed twice: the **mock** bundle
(`league_id: null`, `picked_by: ""`, `roster_id: null`) carries AC-4's seat-only attribution and is
§T15's headline fixture; the **real-league** bundle carries `slot_to_roster_id`, real
`picked_by`/`roster_id` and two traded picks, and carries AC-12. Both replays run the same driver
and the same invariants. Total cost ~7 s.

The round-5 trade is placed on purpose: seat 7's fifth-round pick is overall **47**, which sits
inside the window between the user's own picks 44 and 57 — so the trade is not merely attributed
correctly in the feed after the fact, it changes whose need vector the opponent panel publishes and
whose tendencies the simulation samples *before* the pick is made. Both are asserted.

### 2. The invariant checker runs on every broadcast — and has its own tests, so "zero violations" can fail

The headline assertion is `expect(replay.checker.violations).toEqual([])` over 76 checked states. An
assertion like that is worthless if the checker cannot fire, so eight tests mutate the real
end-state snapshot one field at a time and assert the corresponding violation appears: a player
drafted that the fixture never picked, a board that shrank, a pick attributed to the wrong seat, an
insight at a stale version with `recomputing: false`, a drafted player in a candidate row, the
unmatched player reaching the highlight, and survival still showing after the user's last pick.

The rules themselves (documented in `e2eReplay.ts`'s header): the board is always a **prefix** of
the pick script and never shrinks (SC-1's counter-metric); `recomputing` is exactly
`insight.boardVersion < sync.boardVersion` and all three insights always carry one version;
`degraded` matches `sync.status`; on any non-recomputing snapshot no candidate row, per-position
filter row, highlight or opponent-panel example names a drafted player; the unmatched player never
reaches a rankings-driven output; every feed entry is attributed to the seat the *fixture* says owns
that pick; and once the user's last pick has landed no row carries survival.

**One nuance worth naming.** "Never a drafted player recommended" is asserted only on snapshots the
candidate list is *not* flagged recomputing on. That is not a loophole — it is exactly the contract:
during a burst the stale rows deliberately stay on screen, flagged, and AC-21 is what makes that
honest. Asserting the stronger rule on flagged frames would be asserting that AC-21 should not
exist.

### 3. AC-13 equivalence doubles as the determinism proof, and as the web suite's licence to skip the replay

The replay's final snapshot is compared field-by-field against a **second, independent** orchestrator
attached to the same draft with all 150 picks already visible: identical board, identical pick feed,
identical roster panel, identical window, identical candidate rows. That is AC-13 ("attaching
mid-draft rebuilds complete, correct state from the full pick list alone"), and it is simultaneously
the strongest determinism check available for T7's `deriveSeed` — two processes that shared no state
produced the same Monte Carlo-derived ordering because the board seeded both.

It is also why `packages/web/src/e2eSmoke.test.tsx` attaches at the full board rather than replaying:
the snapshot it renders is *provably* the one the replay converges to, and the web suite does not pay
7 s for a picture the server suite already earned.

### 4. The web smoke test imports the server's replay module across packages (flagged)

design.md §T15 wants the frontend checked "against this same fixture's final `AppStateSnapshot`". The
only honest way to do that is for the browser-side suite to render what the server actually built —
a hand-copied JSON would be a third contract to keep in step, which is the whole failure mode this
task exists to catch. So `packages/web/src/e2eSmoke.test.tsx` imports
`../../server/test/e2eReplay`, JSON-serialises the resulting snapshot exactly as the SSE hub does,
and pushes it through the store the browser really uses. `tsc -p packages/web` and `eslint` both
accept this (verified); msw's node interceptor works under jsdom (verified by probe before writing
anything).

**One shim was needed and is documented in the file:** jsdom defines its own `AbortSignal`, and
Node's `fetch` (undici) brand-checks the signal against *its* class, so any server code passing a
timeout signal fails inside jsdom with `Expected signal to be an instance of AbortSignal`. The smoke
test drops `init.signal` for the single attach it performs. The signals are request deadlines only,
the fixtures answer instantly, and T2's own node-environment suite exercises the timeouts for real.

### 5. The burst step widens the debounce window, and only that step

"Three picks inside one debounce window" is only a real claim if the window comfortably outlasts
three fixture round trips. At the replay's steady 100 ms a loaded CI box could turn a correct
implementation red. The burst step therefore sets `burstDebounceMs` to 600 for its own duration and
restores it in a `finally` — the orchestrator reads the value on every pick, so this is one
assignment, and the other ~30 settles stay quick. Flagged because it mutates a config object mid-run;
the alternative was a 600 ms debounce for the whole replay, which costs ~18 s per run for no extra
coverage. Ran the suite three times consecutively after this change: stable.

### 6. A behaviour the replay pins deliberately — automatic recovery leaves insights flagged (finding, not fixed)

`BoardSync.reingest` bumps `boardVersion` on every recovery, including one that brings **no new
picks**; the recompute cascade is triggered by `onNewPicks`, so it does not run. The result is that
after an automatic recovery with nothing outstanding, all three insights stay flagged `recomputing`
until the next pick lands or the user presses Re-sync (which flushes the burst and does recompute).

This is **not** an AC-21 violation — nothing stale is presented as current, which is what the
criterion requires, and the flagged data is in fact still correct since the board's *content* did not
change. But a paused draft would sit with dimmed panels indefinitely, which is a UX wart. The replay
exercises the case and the test pins the current behaviour with a comment pointing here, so a future
change has to be deliberate. Not fixed in T15: it is a change to T2/T10 production code, and this
task is a test task. Reviewer's call whether it belongs in this feature or the backlog.

### 7. Two fixture-authoring gotchas, recorded so they are not rediscovered

- **The ADP snapshot must be dated "today".** FFC dates its pool by `end_date` alone (day
  granularity), so a hard-coded date makes the fixture cross AC-22's 24-hour line the day after it
  is written and turns the staleness warning into permanent noise. `e2eFfcAdp` computes the window
  from `Date.now()`; the ECR embed likewise stamps `last_updated_ts` an hour ago. Both are what let
  the suite assert the *absence* of a staleness warning.
- **No two fixture players may share a name.** Two rows with the same normalized name are genuinely
  indistinguishable to FR-4's fallback and both land unmatched — correct behaviour, but it would
  have quietly added phantom entries to the AC-20 assertion. The generator asserts uniqueness; the
  first draft of the board hit this (the source CSV already carried Cameron Dicker and Ka'imi
  Fairbairn, which the K top-up duplicated).

### §T15's "done when", clause by clause

| required | where |
|---|---|
| full 150-pick fixture: 15 rounds × 10 teams, real mock-draft schema | `e2e-draft-board.json` + `e2eDraft.ts` (`e2eMockBundle`); 206-player snapshot universe |
| …including at least one traded pick | `E2E_TRADED_PICKS` (rounds 5 and 9) on the real-league bundle — see decision 1 for why not on the mock |
| …one burst of 3+ picks landing together | the `burst` step: picks 45–47, three separate polls inside one window |
| …one drafted player absent from ECR/ADP | pick 88, `unmatchedPlayer` |
| …the user's own team drafting on schedule throughout | asserted: `pickFeed.filter(isUserPick).map(pickNo)` equals the fixture's own 15 user picks |
| (1) convergence — final board matches the fixture exactly, both directions | "converges: the final board is exactly the fixture's end state, player for player" + the checker's prefix rule on all 76 states |
| (2) the burst collapses to one recompute | "recomputes once for a burst of three picks, not three times": 12 → 12 inside the window → 13 after |
| (3) the traded pick is attributed to its current owner throughout | "attributes a traded pick to its current owner" + "carries the trade into the window…" + the checker's per-entry attribution rule on every broadcast |
| (4) unmatched shows raw name + warning throughout, never in the candidate list | "shows the unmatched pick under its raw Sleeper name…" (server) and "shows the unmatched pick under its raw name with a visible warning (AC-20)" (UI badge, `role="note"`) |
| (5) ≥1 pick-lag and ≥1 burst-latency sample, plausible values | "recorded plausible pick-lag and burst-latency samples end to end": 315 and 29 samples, both maxima inside their configured budgets |
| zero unhandled exceptions anywhere during replay | the replay would reject; the web smoke additionally captures `console.error` and asserts it stayed empty |
| frontend smoke: five named surfaces render something | "renders all five named surfaces with no unhandled error" — sync indicator by role, four panels by region, each asserted non-empty |

Beyond the "done when", asserted because the task brief names them: recommendations updating (14
distinct highlights over the run), AC-45's suppression after the user's last pick (survival null on
every row, `lookahead-not-applicable`), AC-17/AC-18's two degraded episodes with no partial apply,
AC-19's Re-sync inside budget catching seven outstanding picks, AC-14's `complete` draft status,
AC-64's granular league scoring on the real-league bundle, and the SSE payload surviving a real
JSON round trip.

## Test-first evidence

This is a test-authoring task, so "write the test before the code" has no production code to precede.
The two equivalents that do carry weight are recorded instead.

**1. The suite ran red before the fixture and driver were right.** First full run of
`packages/server/test/e2eReplay.test.ts`, before the board and the driver were corrected:

```
 ❯ |server| test/e2eReplay.test.ts (19 tests | 3 failed) 6521ms
   × … > recomputes once for a burst of three picks, not three times (AC-46, AC-53)
     → expected 31 to be 13 // Object.is equality
   × … > shows the unmatched pick under its raw Sleeper name and keeps it out of the rankings
     → expected [ Array(3) ] to have a length of 1 but got 3
   × … > kept the pre-draft check the user confirms on, warnings and all (FR-4)
     → expected [ 'snapshot-stale' ] to not include 'snapshot-stale'

 Test Files  1 failed (1)
      Tests  3 failed | 16 passed (19)
```

exit 1. All three were faults in **this task's own** fixture/driver, not in T1–T14: the driver read
`recomputeCount` at the end of the replay instead of at the burst's settle; the generated board
carried two duplicate kicker names (see decision 7), which put two extra players on the unmatched
list; and the FFC fixture's hard-coded `end_date` was 32 h old. Fixed in that order; no production
file was touched to make any of them pass.

The web smoke test likewise ran red twice before passing — first
`attach failed: … Expected signal ("AbortSignal {}") to be an instance of AbortSignal` (decision 4's
shim), then `expected 30 to be 15` from a label query that matched both the pick row and its badge.

**2. The invariants are provably falsifiable.** Eight tests mutate the real snapshot and assert the
checker reports the corresponding violation (decision 2). Without these, "zero violations" would be
an assertion about a checker nobody had seen fail.

- passing: `npm test` → `Test Files 40 passed (40) / Tests 634 passed (634)`, exit 0. 602 before this
  task, +32 from its two new suites (27 server, 5 web); none of the 602 touched.
- Ran the two new suites three consecutive times to check for timing flake: `Tests 32 passed (32)`
  each time.
- commits: none — per this spawn's instruction the developer does not run git; the orchestrator
  commits.

## Test-file changes

- **none.** No pre-existing test file, fixture, msw handler module or source file was modified or
  deleted. `e2eReplay.test.ts` and `e2eSmoke.test.tsx` are new suites; `e2eReplay.ts`,
  `e2eDraft.ts` and `e2e-draft-board.json` are new test-support files. T1–T14's 602 tests are
  untouched and all still pass.

## Commands

Run from repo root.

- test: `npm test` → **exit 0** — `Test Files 40 passed (40) / Tests 634 passed (634)`.
- lint: `npm run lint` → **exit 0**, no warnings.
- typecheck: `npm run typecheck` → **exit 0** (shared, server, web — including the web project's
  cross-package import of the server replay module).
- `npx prettier --check` over this task's four TypeScript files → clean. No other task's file was
  reformatted.

## Left for downstream

- **Decision 6's finding** — automatic recovery with no outstanding picks leaves the insights flagged
  `recomputing` until the next pick. Pinned by a test with a pointer to these notes; a fix belongs in
  `BoardSync`/`Orchestrator`, i.e. in T2/T10 or the backlog, not in a test task.
- **The fixture is reusable.** `e2eDraft.ts` exports the board, both bundles, all three snapshot
  payloads and the Sleeper dump; `createE2eSetup()` stands a whole server up over them in one call.
  Anything later that needs a *realistic-sized* board (a benchmark, a rehearsal harness, a regression
  for a bug found during PRD §14's live mock rehearsals) should build on it rather than growing T3's
  ten-row slice.
- **Live validation is still out of band.** spec.md's own carve-out stands: SC-1/SC-2's p95 targets
  are judged in live mock rehearsals, not here. What this task proves is that the instrumentation
  those rehearsals will read (AC-66/AC-67) is wired end to end and produces plausible numbers.
