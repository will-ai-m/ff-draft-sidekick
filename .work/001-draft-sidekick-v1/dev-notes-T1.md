# Dev notes — 001-draft-sidekick-v1 (T1: repo scaffold, tooling, shared types, config module)

Scope: design.md §T1 only. Nothing from T2–T15 was implemented; where a T1 file had to exist for
`npm run dev` / `npm run prep:nflverse` to run, it is a deliberately bare scaffold with a comment
naming the task that fills it in.

## Changes

**Workspace tooling (design.md §T1 "Root `package.json`" bullet)**

- `package.json` — npm workspaces root (`packages/*`), `"type": "module"`, engine `>=20`. All nine
  scripts exactly as §T1 specifies: `test`/`lint`/`typecheck`/`dev`/`dev:server`/`dev:web`/`build`/
  `start`/`prep:nflverse`. `typecheck` is three independent `tsc --noEmit -p` invocations, not TS
  project references, per §T1's explicit call.
- `tsconfig.base.json` — strict, ES2022, `moduleResolution: Bundler`, plus `noUncheckedIndexedAccess`
  and `verbatimModuleSyntax`. `paths` maps `@sidekick/shared` to the shared package's source so tsc,
  Vite and tsx all resolve the workspace dep identically.
- `vitest.workspace.ts` — lists the three packages so the single root `vitest run` is the whole suite,
  which is what the constitution's `test:` command has to mean.
- `eslint.config.js` — flat config: `@eslint/js` recommended + `typescript-eslint` recommended, with
  `eslint-plugin-react`/`eslint-plugin-react-hooks` scoped to `packages/web/**` only. Verified to lint
  26 real files (`npx eslint . --format json`), so the lint gate is not vacuously passing.
- `.prettierrc`; `.gitignore` extended with `node_modules/`, `dist/`, `data/cache/`,
  `config.local.json`, `*.tsbuildinfo` (`.DS_Store` retained).
- `packages/{shared,server,web}/package.json` + `tsconfig.json` + per-package vitest/vite config
  (`shared`/`server` → node env, `web` → jsdom). `packages/web/vite.config.ts` proxies `/api` and
  `/events` to the Express port.

**Shared types (`packages/shared/src/types/*`)** — `board.ts` (Position/SkillPosition, `Team`,
`BoardPlayerState`, `Board`, `PickFeedEntry`, `SyncIndicator`), `roster.ts` (`SlotConfig`,
`NeedVector`, `NO_NEED_SIGNAL`, `UnfilledStartingSlots`, `RosterPanelData`), `opponent.ts`
(`WindowPick`/`DraftWindow`, `TendencyProfile`, `OpponentPanelEntry` with the AC-37
`confidence: 'position' | 'player-example'` tag), `candidate.ts` (`CandidateRow`, `Survival`/band,
`Recommendation`, `Plan`, `PlanComparison`, `CandidateListData`), `gamelog.ts` (AC-62's exact stat
lines, `PlayerCard.hasData` for AC-65), `insight.ts` (`Insight<T>`), `appstate.ts`
(`AppStateSnapshot` per §T1's sketch, plus `AttachState`, `PreDraftCheckData`, `PublicConfig`).
Identifiers follow PRD §9 Terms per the constitution; each type carries the AC it serves in JSDoc.

**Config module (`packages/shared/src/config/parameters.ts`)** — all 24 keys from §T1's table with
the stated defaults, plus the two constants §T6 and §T7 explicitly instruct T1 to add
(`tendencyPositionalNudgeClamp` 0.5, `reachAdjustmentPerPick` 1). Every entry is JSDoc'd with its
provenance tag (PRD-cited / architect-filled / architect-added) and the AC it backs. `Object.freeze`d;
`PARAMETER_KEYS`/`isParameterKey` give the loader its allowlist.

**Need vector (`packages/shared/src/needvector.ts`)** — `computeNeedVector` and
`normalizeToDistribution` per PRD §9 Terms, implemented once for T4/T5/T6/T7 as §T1 requires.

**Server/web scaffolds** — `packages/server/src/config/loadConfig.ts` (merges `config.local.json`
over the defaults), `packages/server/src/index.ts` (loads config, `/api/health`, read-only
`/api/config`, serves `packages/web/dist` when built), `packages/server/scripts/prep-nflverse-data.ts`
(runnable no-op with the header comment §T9 asks for), and a placeholder `packages/web`
shell (`index.html`, `main.tsx`, `App.tsx`, Tailwind entry).

**`config.local.json.example`** — every key annotated with a `//`-prefixed comment line giving its
provenance tag and what changing it does, so a user can override without reading `parameters.ts`.

### Decisions worth a reviewer's attention

1. **FLEX fill model, chosen not specified.** §T1 defines the weights ("each unfilled FLEX slot
   contributes 1/eligible") but not what makes a FLEX slot *filled*. Implemented as: dedicated slots
   fill first, positional surplus at FLEX-eligible positions then absorbs FLEX slots up to how many
   exist, the remainder is bench. Two unit tests pin it (RB:3 against 2 RB slots consumes the FLEX;
   RB:5 does not consume more FLEX than exists).
2. **`normalizeToDistribution` throws on an all-zero vector** rather than returning NaNs or a fake
   uniform. `computeNeedVector` never produces a zero vector, so receiving one means a caller skipped
   the `NO_NEED_SIGNAL` branch — the Terms-mandated best-available regime. Failing loudly keeps that
   bug out of the sampling math instead of laundering it.
3. **`computeNeedVector` takes an optional `flexEligiblePositions`** (third arg, defaulting to the
   parameter default) so §T1's required "non-standard FLEX eligibility from config" test has an
   injection point and callers holding a loaded config can pass theirs. `computeUnfilledStartingSlots`
   is exported alongside because it is the same fill math in count form, which is exactly the shape
   AC-31's roster panel displays raw — exporting it stops T4 from reimplementing the fill model.
4. **`Team`, not `TeamInfo`.** design.md names the type `Team` in its `types/board.ts` bullet but
   `TeamInfo[]` in the `AppStateSnapshot` sketch. Went with `Team`, matching both the board.ts bullet
   and PRD §9 Terms, which the constitution makes binding on identifiers. The sketch is explicitly a
   sketch T10 finalizes.
5. **`loadConfig.ts` included in T1** though §T1's bullet list does not enumerate it (design.md's file
   structure plan does). Without a loader, `config.local.json.example` documents an override mechanism
   that does not exist, and the constitution's "configurable, not hardcoded" rule would be unbacked.
   Unknown keys and type-mismatched values are hard errors, so a config typo cannot silently leave the
   app on a default the user believed they changed.
6. **`AttachState.status` gained `'needs-manual-slot'`** beyond the sketch's four values, because AC-5
   requires that state to block mine-vs-opponent/next-pick/survival output and §T2's context says to
   model it "as part of `AppStateSnapshot.attach`, not a crash or a default guess."
7. **Server PORT is `process.env.PORT ?? 3001`, not a parameter.** It is a local process detail, not a
   product default with an AS-N provenance, so it does not belong in `parameters.ts`. Kept in step with
   the web dev proxy.
8. **`config/scoringDefaults.ts` deliberately NOT created.** design.md's Approach places it in
   `packages/shared/src/config/`, but §T1's context does not enumerate it and its content (standard
   scoring tables keyed by Sleeper `metadata.scoring_type`) is only knowable once T2 confirms the mock
   scoring-label shape live. Left to the task that consumes it (T2/T9).
9. **`eslint-plugin-react-hooks` pinned `^5`, not `^4`.** `npm install` failed ERESOLVE: v4's peer
   range tops out at eslint 8, and design.md specifies `eslint@^9`. v5 is the version that supports
   eslint 9. Sole deviation from design.md's declared dependency versions.

## Test-first evidence

Tests were written before any implementation file existed, and confirmed failing first.

- failing: `npm test` →
  ```
   FAIL |shared|  src/needvector.test.ts [ packages/shared/src/needvector.test.ts ]
  Error: Failed to load url ./config/parameters (resolved id: ./config/parameters) ... Does the file exist?
   FAIL |shared|  src/config/parameters.test.ts [ packages/shared/src/config/parameters.test.ts ]
  Error: Failed to load url ./parameters (resolved id: ./parameters) ... Does the file exist?
   FAIL |server|  src/config/loadConfig.test.ts [ packages/server/src/config/loadConfig.test.ts ]
  Error: Failed to resolve entry for package "@sidekick/shared". ...
   FAIL |web|  src/App.test.tsx  (same shape — ./App absent)

   Test Files  4 failed (4)
        Tests  no tests
  exit: 1
  ```
- passing: `npm test` → `Test Files  4 passed (4) / Tests  24 passed (24)`, exit 0.
- commits: none — per the orchestrator's instruction for this spawn, the developer does not commit;
  the orchestrator commits. The test-first ordering is recorded here instead of by commit order.

One intermediate red→green step is worth recording, because a reviewer will see the test edited after
it was written: the "every starting slot is filled" case initially asserted `NO_NEED_SIGNAL` against a
fixture whose FLEX slot was still open (`{QB:1,RB:2,WR:2,TE:1}` against a roster with `FLEX: 1`), so it
failed against correct behaviour. The **fixture** was wrong, not the implementation — corrected to
`WR: 3` so the surplus fills FLEX, which is what "every starting slot filled" actually requires. The
implementation was not changed to accommodate the test.

Coverage of §T1's three named `computeNeedVector` cases: all slots filled → sentinel (plus a
K/DST-only-unfilled variant, since AC-33/AS-7 make that a distinct case); a partially-filled FLEX
splitting across 3 positions (plus a case where the split lands on top of unfilled dedicated weights);
and a non-standard FLEX eligibility set supplied through config.

## Test-file changes

- **none.** No pre-existing test file was modified or deleted — this is a greenfield repo, and all four
  test files (`packages/shared/src/needvector.test.ts`, `packages/shared/src/config/parameters.test.ts`,
  `packages/server/src/config/loadConfig.test.ts`, `packages/web/src/App.test.tsx`) are new in T1.
- `packages/web/src/App.test.tsx` is the placeholder §T1 asks for and is expected to be replaced
  wholesale by T11's real attach/draft-screen tests.
- Also written: `.work/001-draft-sidekick-v1/baseline.txt` (QA baseline, captured before touching the
  tree — the greenfield `npm test` ENOENT, verbatim). `.village/constitution.md` and
  `.work/001-draft-sidekick-v1/status.yaml` show as modified in `git status` but were **not** written by
  this agent; the orchestrator filled the constitution's Commands section before this spawn.

## Commands

Run from repo root. Full verbatim output of the passing run is reproduced above in summary form.

- test: `npm test` → **exit 0** — 4 files, 24 tests passed.
- lint: `npm run lint` → **exit 0** — clean; 26 files actually covered (verified via
  `npx eslint . --format json`, not just by the zero exit).
- typecheck: `npm run typecheck` → **exit 0** — all three `tsc --noEmit` invocations clean. Verified via
  `--listFiles` that every source *and test* file is in the program, and that the server program
  resolves `@sidekick/shared` through to the shared package's real sources.

Additional §T1 done-when checks:

- `npm run dev` → both processes start clean: `[dev:server] [sidekick] server listening on
  http://localhost:3001` and `[dev:web] VITE v5.4.21 ready in 116 ms → Local: http://localhost:5173/`.
  End-to-end confirmed live: `curl http://localhost:3001/api/health` → `{"status":"ok"}`, and
  `curl http://localhost:5173/api/config` returned the full parameter set **through the Vite proxy**,
  so the proxy wiring T11 depends on is proven, not just configured.
- `npm run prep:nflverse` → exit 0, prints its not-yet-implemented notice and reads
  `gamelogSeasonsToCache` from config (proving the script is really wired to the config module).
- `npm run build` → exit 0, Vite emits `packages/web/dist` (the artifact `npm start` serves).
