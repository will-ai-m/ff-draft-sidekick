---
gate: code_review
verdict: pass
by: code-reviewer
at: "2026-08-23T13:17:03Z"
---
## Evidence

Re-run of a failed gate after repair commit `ed36cd7`. Everything below was re-derived: commands
re-run from the repo root, `git show ed36cd7` hunks read directly, and each of the four blocking
issues probed against the running code — including **mutation tests** that revert the repair and
confirm the new suites go red, so a green suite is not mistaken for a guard that exists.

### Cheap tools (constitution §Commands), exit codes captured directly, not through a pipe

- `npm test` → **exit 0**; `Test Files 42 passed (42) / Tests 671 passed (671)`, no `Errors` line.
  Re-run a second time at the end of this review on the restored tree — identical result.
- `npm run lint` (`eslint .`) → **exit 0**, no output.
- `npm run typecheck` (three `tsc --noEmit`: shared, server, web) → **exit 0**.
- `npm run build` (`vite build`) → **exit 0**; `55 modules transformed`,
  `dist/assets/index-D-qxXAQs.js 187.19 kB │ gzip: 57.72 kB`.
- Domain variants: the only `review-*/SKILL.md` on disk is `review-shell`;
  `git diff --name-only 5e25747 ed36cd7 | grep -E '\.(sh|bash|zsh)$'` → 0 files. Not applicable.

### B1 — literal NUL separators → `\0` escapes. **Fixed, and the seed is provably unchanged.**

- `file packages/server/src/simulation/montecarlo.ts` → `Java source, Unicode text, UTF-8 text`
  (was `data`).
- Byte scan: **0 literal `0x00`**, **5 `\0` escapes**, at lines 275, 307 (×2), 312, 318 — exactly
  the five offsets the prior verdict's scan found.
- Grep sees the module again: `grep -c export …/montecarlo.ts` → `18` (was exit 1, no output);
  `grep -rn "deriveSeed" packages/server/src/` → finds `montecarlo.ts:298` and `:39`;
  `grep -rn "export function simulateSurvival" packages/server/src/` → `montecarlo.ts:510`.
- **Seed unchanged — proved structurally, not by probe.** Reconstructed the pre-repair file from
  the current one by substituting each `\0` escape back to a literal `0x00`, and compared against
  `git show 5e25747:…/montecarlo.ts`: `reconstructed == pre-repair file, byte for byte: True`
  (26595 bytes / 5 NULs pre-repair, 26600 bytes / 5 escapes now). Since `'\0'` in a TS template
  literal *is* U+0000, the only difference in the whole file is the spelling of the separator, so
  no survival percentage or plan score can have moved. This is stronger than the maker's runtime
  probe (which reported `2581010503` both ways on its own board) and does not depend on it.
- **The golden pin is a real guard, not decoration.** Built a space-separated copy of the module
  and derived a seed from one fixed board through both: `{"escapeSpelling":1136439564,
  "spaceSeparated":3675795148,"identical":false}`. So normalising the separators again moves
  `deriveSeed`, and `montecarlo.test.ts:791`'s `expect(deriveSeed(universe, picks, config()))
  .toBe(3486165602)` is what would catch it. The comment at `:774-783` states the maintenance
  contract (re-derive and say why, in the same commit). Probe module deleted; tree clean.
- Diff is additive elsewhere: `montecarlo.test.ts` gains only the pinned test (+21 lines).

### B2 — error containment. **Fixed at all four layers, and each layer probed.**

- `orchestrator.ts:559-573` — `settleBurst()` wraps `this.recompute()` in try/catch, records
  `cascadeFailure: DegradedReason`, calls `observability.recordCascadeFailed(…)`, broadcasts and
  returns; success clears it (`:561`). One place covers both callers the prior verdict named —
  the debounce `setTimeout` callback (`:536-539`) and `flushBurst()` (`:592-598`).
- **Mutation test (the load-bearing check).** Removed the try/catch from `settleBurst` and re-ran
  `orchestrator.resilience.test.ts` → `Tests 4 failed | 3 passed (7)` / `Errors 3 errors`, each
  an `Uncaught Exception: simulateSurvival: 3 simulated picks for a window of 4` with the stack
  `Orchestrator.recompute → Orchestrator.settleBurst → Timeout._onTimeout → listOnTimeout` —
  i.e. exactly B2's crash path, reproduced. Restored the file and re-verified by SHA-256
  (`6673038c…f166b63` before and after); suite back to `7 passed`.
- The resilience suite genuinely asserts what the task requires (`orchestrator.resilience.test.ts:96-127`):
  `recomputeCount` unchanged (the cascade really threw), `pickFeed` still length 2 (the board is
  untouched), `sync.status === 'degraded'`, `sync.degradedReason` contains `simulateSurvival`,
  `candidateList/opponentPanel/userRoster.degraded === true`, `recomputing === true`, and one
  `cascade-failed` sample in the observability buffer (logged, not swallowed). Separate cases cover
  the broadcast (`:129-142`), recovery on the next good cascade (`:144-165`) and the Re-sync/
  `flushBurst` path (`:167-179`).
- **Express error handler leaks nothing.** `routes/server.ts:47-59` `errorBoundary` sends a fixed
  sentence as JSON and `console.error`s the real error; the arity-4 signature is kept deliberately
  with a comment, and it delegates to `next(error)` when `res.headersSent` (reachable — `/events`
  streams). Mounted **last** in `createSidekickApp` (`:86`), after every router and the static
  handler. `createApp` — the form every suite uses — delegates to `createSidekickApp` (`:98`), so
  tests exercise the production app. `routes/server.test.ts:326-346` asserts status 500,
  `content-type: application/json`, and that the raw body contains neither `/Users/` nor
  `orchestrator.ts` nor `    at ` — and that the session is still attached afterwards.
- All three route IIFEs terminate in `.catch(next)`: `routes/attach.ts:86`, `:118`,
  `routes/resync.ts:33`. `grep -rn "void (async"` over `packages/server/src` (non-test) finds
  exactly those three call sites and no fourth.
- **Process guards verified on a real process, not in-runner.** `packages/server/src/processGuards.ts`
  registers `uncaughtException` and `unhandledRejection`; `index.ts:37-42` calls
  `installProcessGuards` as the first statement of `createServer()`, and `index.ts:85-87` invokes
  `createServer().listen()` when the module is the entrypoint (`npm start` →
  `tsx packages/server/src/index.ts`). Ran the fixture child directly on **Node v26.0.0**:
  `node --import tsx packages/server/test/fixtures/processGuardsChild.ts` →
  `{"alive":true,"faults":["uncaughtException: the recompute cascade exploded","unhandledRejection: a route promise rejected"]}`, **exit 0**. Wrote two unguarded controls of the
  same two faults in the scratchpad: both **exit 1**. So the guard is what makes the difference,
  on this Node, for both fault shapes.
- Remaining `setTimeout` callbacks in server product code are all contained: `orchestrator.ts:536`
  (now try/catch), `sleeper/client.ts:324` (`controller.abort()`), `sleeper/sync.ts:693` →
  `tick()`, which already had its own try/catch.

### B3 — snapshot fetch timeout. **Fixed, and plumbed to all three third parties.**

- Parameter exists: `packages/shared/src/config/parameters.ts:36-45` declares
  `snapshotFetchTimeoutMs: number` with an `**architect-added**` rationale, and `:144` sets the
  default `15_000`. Documented in `config.local.json.example:22-23`.
- **The example file is actually loadable** — `isParameterKey` derives from
  `Object.keys(PARAMETER_DEFAULTS)` (`parameters.ts:177-181`), so no hand-maintained list can drift.
  Ran `loadConfig({ configPath: 'config.local.json.example' })` verbatim →
  `{"snapshotFetchTimeoutMs":15000,"keys":27}`. A user copying the example gets a working config,
  which is the constitution's "configurable, not hardcoded" requirement.
- **Call site found**: `orchestrator.ts:405` inside `startSession` —
  `signal: AbortSignal.timeout(this.config.snapshotFetchTimeoutMs)` passed to `this.snapshots.load({…})`.
- Plumbed end to end, verified at each fetch: `snapshots/store.ts:88` → `loadCrosswalk` →
  `crosswalk.ts:157` `doFetch(url, { signal: options.signal, … })`; `store.ts:95` →
  `fetchEcrSnapshot` → `fantasypros.ts:139`; `store.ts:103` → `fetchAdpSnapshot` → `ffc.ts:166`.
  All three hosts the prior verdict named are covered.
- Behaviourally asserted, not just wired: `orchestrator.resilience.test.ts:187-202` attaches with
  `snapshotFetchTimeoutMs: 150` against handlers stalled 4000 ms and asserts attach still succeeds,
  `elapsed < 3000`, and the pre-draft check carries `no-ecr-loaded` — i.e. the AC-28 degrade path,
  not a hang. A companion case (`:204-208`) pins that a responsive source is left alone.
- One documented consequence, deliberate and stated in the code comment at `orchestrator.ts:396-401`:
  the single signal budgets the *load*, so a slow crosswalk eats the ECR/ADP budget. Reasonable, and
  the crosswalk keeps its own stale-cache fallback (`store.ts:82-90`).

### B4 — prototype-shaped player ids. **Fixed at both reads, and mutation-proved.**

- `gamelogs/store.ts:109-115` — `Object.hasOwn(players, playerId)` guards the cache read;
  `orchestrator.ts:815-820` — the same guard on `active.sleeperPlayers[playerId]`, so the
  `?? playerId` name fallback fires. `byPlayerId` is a `Map` and needs nothing.
- **Mutation test.** Reverted both guards to the plain index reads and re-ran the two suites →
  `Tests 2 failed | 21 passed (23)`: `routes/server.test.ts` → `__proto__: expected 500 to be 200`,
  `orchestrator.resilience.test.ts` → `TypeError: Cannot convert undefined or null to object`.
  So the new tests are real guards over the exact defect. Restored both files, SHA-256 verified
  (`66afa026…f786f3d73`, `6673038c…f166b63`).
- That mutation run also **cross-confirms B2's boundary**: the reintroduced throw came back as a
  clean `500` with `[sidekick] unhandled route error: TypeError…` on the *log*, where pre-repair
  the same defect rendered Express's HTML page with `/Users/willyu/willy-ff/packages/server/src…`
  in the response body.
- `routes/server.test.ts:312-325` drives the real HTTP surface for all five prototype-shaped ids
  (`__proto__`, `constructor`, `toString`, `valueOf`, `hasOwnProperty`), asserting 200 +
  `hasData: false` + zero seasons for each.

### No regression from the repair

- 671/671 green (655 baseline + 16: 7 resilience + 5 processGuards + 3 `server.test.ts` + 1 golden
  seed pin). Confirmed the arithmetic against the prior verdict's recorded 655.
- **Test files touched by `ed36cd7`, audited one by one**: `orchestrator.resilience.test.ts` (new),
  `processGuards.test.ts` (new), `test/fixtures/processGuardsChild.ts` (new),
  `montecarlo.test.ts` (+21, the pin only), and the two flagged additive changes:
  - `packages/shared/src/config/parameters.test.ts` — exactly **+1 line**
    (`snapshotFetchTimeoutMs: 15_000`) inside the existing `toMatchObject`. No existing assertion
    touched. Read the hunk directly.
  - `packages/server/test/msw/snapshotHandlers.ts` — three optional `*DelayMs` options and the three
    resolvers made `async`. All default `undefined`, so every existing handler behaves identically;
    required by B3's covering test. No existing behaviour changed.
  - `routes/server.test.ts` — a `vi` import, `vi.restoreAllMocks()` added to the existing
    `afterEach`, and three appended tests. No pre-existing assertion was altered or removed; the
    `restoreAllMocks` addition can only strengthen isolation.
- **No pre-existing test was weakened, modified or deleted** beyond those two flagged additive
  changes. Verified by reading each hunk, not by counting.
- `SyncIndicator.status` is the binary union `'healthy' | 'degraded'` (`shared/src/types/board.ts:83`),
  so `snapshot()`'s new `status: degraded ? 'degraded' : 'healthy'` (`orchestrator.ts:311`) is
  behaviour-identical to the old `indicator.status` whenever `cascadeFailure === null`. No third
  state was collapsed.
- The maker's claim that `cascadeFailure` is deliberately kept out of `BoardSync` holds:
  `sleeper/sync.ts:564` branches on `BoardSync`'s own `this.status`, never on the orchestrator's
  snapshot, so a cascade failure cannot put the poll loop into AC-17's full-re-ingest mode (N14).
  `orchestrator.ts:632`'s per-insight `degraded` correctly reads the board only — a successful
  recompute is by definition not a failed one.
- Constitution re-checked against the repair's changed lines: the new parameter is configurable and
  documented; no new outbound host, credential or paid surface; the Sleeper budget path is
  untouched; no incremental-diff path introduced; and the staleness rule is *strengthened* —
  a failed cascade now forces `degraded` with `recomputing` true rather than publishing derived
  views stamped current.

### Non-blocking — the prior 14 (N1–N14) stand, unescalated

Spot-checked that the repair made none of them worse: N1's `season` query parameter is untouched;
N6's `0.0.0.0` bind and N12's missing `SIGINT`/`SIGTERM` shutdown are untouched (process guards
handle faults, not signals); N14's degraded-tick behaviour is unaffected, per the `sync.ts:564`
check above. Two small new observations, neither blocking and neither a trap:

- **N15** `settleBurst`'s try/catch covers `this.recompute()` only — `this.broadcast()` (both the
  success path at `orchestrator.ts:583` and inside the catch at `:571`) and
  `recordBurstRefreshed` sit outside it, so a throwing SSE listener would still reach the burst
  timer. Now merely a degraded-broadcast loss rather than process death, because `processGuards`
  backstops it, which is why this is a note and not a finding.
- **N16** `errorBoundary` logs via `console.error` (`routes/server.ts:48`) rather than the
  Observability sink, making `routes/server.ts` the third file with a bare `console.*`. Defensible
  for a boundary that must work when observability does not, but it is a small drift from the
  AC-66 sink convention. N4's ring-buffer note now also covers the new `cascade-failed` sample; the
  sample is printed by `index.ts`'s sink immediately, so the durable record is the log, not the
  2000-entry buffer.

### Housekeeping

Two source files were temporarily mutated for the mutation tests (`orchestrator.ts`,
`gamelogs/store.ts`) and one probe module was created (`simulation/zzProbeSpaceSep.ts`). All were
restored or deleted and verified: SHA-256 matches the pre-mutation values for both files, the probe
file is gone, and `git status --porcelain --untracked-files=all` shows only the pre-existing
` M .work/001-draft-sidekick-v1/status.yaml`. Every scratch artefact (backups, probe scripts,
command logs) lives in the session scratchpad. No git write commands were run.
