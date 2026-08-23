# Design — 001-draft-sidekick-v1

## Approach

**Stack: TypeScript end-to-end.** npm workspaces monorepo — `packages/shared` (types + the AS-N config module), `packages/server` (Express + Node, native `fetch`/`zlib`), `packages/web` (React + Vite + Tailwind). One language, one package manager, one lint/typecheck/test toolchain.

Rejected: a Python backend for `nflreadpy`/numpy convenience (the PRD's §11 dependency note names it). Verified live during this design pass: every nflverse table `nflreadpy` would wrap is a plain CSV/gzip file on a public GitHub release (`github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats.csv`, `.../players/players.csv`, `.../pbp/play_by_play_2025.csv.gz`) — `nflreadpy` is a convenience wrapper around HTTP downloads we can make directly. A two-language stack (pytest+ruff+mypy *and* vitest+eslint+tsc, two dependency managers, IPC between a Python data process and a TS server) buys nothing here and doubles the gate surface the constitution has to carry. Monte Carlo at this problem's scale (bounded candidate universe, one draft window, low-thousands of runs) doesn't need numpy — see T7's benchmark.

**Full-state-replace, top to bottom.** FR-2/FR-3 mandate stateless full-refetch against Sleeper because incremental diffs are how staleness bugs happen. The same principle is applied to our own backend→frontend channel: the server computes one `AppStateSnapshot` after every poll/recompute and pushes the *whole thing* over Server-Sent Events; the browser does a wholesale state replace, never incremental patching. No websocket library, no client-side merge logic, no client-side staleness class to debug — SSE (native `EventSource`) is one-way, which is all this needs (Sidekick never accepts writes back from the browser beyond attach/resync/slot-pick REST calls). Multiple tabs (AC-15) are satisfied by construction: every SSE connection receives the identical broadcast from the one server-held state.

**nflverse data is offline, never live.** Spec's FR-11 preamble says "local nflverse data" — taken literally. A standalone prep script (`npm run prep:nflverse`, run manually before draft season per PRD §11) downloads and slims the nflverse files into a small local cache; the running server only ever reads that cache. This keeps a 98MB-per-season play-by-play file (verified size, see T9) completely off the draft-night latency budget, and matches "refreshed before draft season" in the PRD rather than a per-draft fetch.

**Player-ID matching: verified, concrete join path (not the PRD's literal description).** The PRD's dependency note says Sleeper's player dump "carries cross-platform IDs (gsis/espn/yahoo/sportradar ids)" as the matching foundation. Live-checked during this design against Sleeper's real `/v1/players/nfl` dump (12,221 players): among 992 active skill-position players, `gsis_id` is populated on only **167 (17%)**, `espn_id` on 224 (23%), `yahoo_id` on 231 (23%) — even top picks like Jahmyr Gibbs carry `gsis_id: null`. `sportradar_id` is populated on 981/992 (99%), but FantasyPros' and FFC's feeds don't expose sportradar IDs either, so that's not a usable join key against *them*.
The actual working path, verified live end-to-end: `dynastyprocess/data`'s `db_playerids.csv` (public, free, no auth, ~12.5k rows, current — 2026 rookies present) carries `fantasypros_id`, `sleeper_id`, `gsis_id`, `sportradar_id`, and a pre-normalized `merge_name` all on one row. Confirmed by direct lookup: Jahmyr Gibbs's row has `fantasypros_id: 22968` (exactly the `player_id` FantasyPros' `ecrData` embed uses for him) and `sleeper_id: 9221` (exactly Sleeper's own dict key for him). So: **`ecrData.players[].player_id` → crosswalk `fantasypros_id` → crosswalk `sleeper_id`** is a direct, verified join — no dependence on Sleeper's sparse `gsis_id`/`espn_id` fields at all. Coverage of that path: 4,784/8,000 crosswalk rows carrying a `gsis_id` also carry a `fantasypros_id` — real but incomplete, so AC-25's normalized-name fallback (using the crosswalk's own `merge_name` convention against a similarly normalized Sleeper `full_name`) is still load-bearing, not a rare edge case. FFC's ADP feed has **no crosswalkable ID at all** (its `player_id` is FFC-internal, absent from the crosswalk) — ADP matching is normalized-name-only, always, not "ID first."
DST rows (`ecrData` position `DST`, e.g. `{player_id: 8120, player_name: "Houston Texans", player_team_id: "HOU"}`) never appear in the player crosswalk (it's players-only) — match DST purely by team abbreviation.

**Mock drafts have no granular scoring settings — verified structural gap, not a spec conflict.** A mock's `league_id` is `null` (research/draft-apis-sleeper-espn-yahoo.md, AS-1), so there is no `/v1/league/<id>` to fetch a full per-stat `scoring_settings` dict from — only the draft object's own coarse `metadata.scoring_type` label (e.g. `"half_ppr"`) is available. FR-11 (AC-64) requires scoring the game log from "the attached league's own scoring settings, not a generic format." For real league drafts, fetch the granular dict from the league endpoint as intended. For mocks, fall back to a named standard scoring table keyed by `metadata.scoring_type` (defined once in `packages/shared/src/config/scoringDefaults.ts`, not inlined) — this is the same coarse label FR-4's AC-27 mismatch check already has to read, so no new data dependency, just an explicit fallback table. Flag this to the user via the pre-draft check when the mock's label isn't `half_ppr` (same mechanism as AC-27). This also settles FR-5 (AC-30): read roster-slot counts from the **draft object's own `settings`** (present on both mocks and real leagues — `slots_qb`, `slots_rb`, etc.), not the league's `roster_positions` array, so one code path serves both, extending the AS-1 principle the research already established for pick attribution to settings-reading generally. *(Flagged for first-implementation verification against a live draft object, since no currently-live draft was available to re-confirm the exact settings field names during this design pass — the mock used in the original AS-1 spike is already purged, confirmed live during this pass: both `/v1/draft/<that id>` and its `/picks` now return `null`.)*

**Second-instance budget sharing (AC-8) without real IPC.** Each instance writes a small heartbeat file (`os.tmpdir()/draft-sidekick-instances.json`, `{pid, startedAt, lastHeartbeat}`); on startup and every heartbeat tick each instance counts other live entries and raises its own poll interval proportionally. Reactive defense-in-depth: any HTTP 429 from Sleeper doubles the interval up to a cap, decaying back to baseline after sustained success. No sockets, no shared process needed.

**No database.** Live draft state is single-attach, single-process, in-memory (constitution: one draft per instance). The only state worth persisting across restarts is the offline nflverse/crosswalk cache, which is flat JSON files under `data/cache/` (gitignored, rebuilt by the prep script) — SQLite would be pure overhead at this scale.

**Rejected:** Redux/Zustand for frontend state (wholesale-replace-on-SSE-message fits a single reducer + `useSyncExternalStore`, no need for a state library); WebSockets (one-way push is all that's needed, SSE is simpler); Fastify over Express (Express's SSE story is one `res.write` call away, and its ubiquity lowers the "fresh-context developer" ramp cost the architect role optimizes for).

**Algorithmic gaps the PRD leaves qualitative, resolved concretely below (flagged, not hidden):** the FR-7 "bending" formula and the FR-8 within-position reach-adjustment formula are stated in the PRD only in words ("bends... by its profile", "adjusted by the team's reach profile"). Task T6 and T7 below give each a concrete, configurable formula so two developers wouldn't invent different math. Both are explicitly named as architect-supplied, tunable during the PRD's own mock-rehearsal validation loop (§14) — not spec text.

## File structure plan

```
willy-ff/
├── package.json                        # npm workspaces root; scripts: dev/build/start/test/lint/typecheck/prep:nflverse
├── tsconfig.base.json
├── eslint.config.js                    # flat config, typescript-eslint + react plugins for packages/web
├── .prettierrc
├── vitest.workspace.ts
├── .gitignore                          # extend: node_modules, dist, data/cache/, config.local.json, *.tsbuildinfo
├── config.local.json.example           # documents every override key from parameters.ts; copy to config.local.json to override
├── packages/
│   ├── shared/
│   │   ├── package.json  (name: @sidekick/shared)
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── config/parameters.ts       # every 🔶 AS-N default, named + typed + JSDoc-cited (table in T1)
│   │       ├── config/scoringDefaults.ts  # standard scoring tables keyed by Sleeper metadata.scoring_type, for the mock-draft fallback
│   │       ├── types/board.ts             # Board, Team, PickFeedEntry, SyncIndicator
│   │       ├── types/roster.ts            # RosterPanel, NeedVector, SlotConfig
│   │       ├── types/opponent.ts          # OpponentPanelEntry, Window, TendencyProfile
│   │       ├── types/candidate.ts         # CandidateRow, Recommendation, Plan
│   │       ├── types/gamelog.ts           # GameLogEntry, PlayerCard
│   │       ├── types/insight.ts           # Insight<T> = {data, boardVersion, recomputing, degraded}
│   │       ├── types/appstate.ts          # AppStateSnapshot — the one SSE payload shape
│   │       └── needvector.ts              # computeNeedVector / normalizeToDistribution — Terms-defined, used by every FR that touches needs
│   ├── server/
│   │   ├── package.json  (name: @sidekick/server)
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── config/loadConfig.ts        # merges parameters.ts defaults with config.local.json
│   │   │   ├── sleeper/client.ts           # typed endpoint wrappers + request-budget/back-off
│   │   │   ├── sleeper/attach.ts           # FR-1 attach flow, slot resolution, username-drafts convenience list
│   │   │   ├── sleeper/sync.ts             # FR-2/FR-3 poll loop, board derivation, degraded detection, Re-sync
│   │   │   ├── sleeper/instanceHeartbeat.ts# AC-8 multi-instance budget sharing
│   │   │   ├── snapshots/fantasypros.ts    # ecrData fetch + parse
│   │   │   ├── snapshots/ffc.ts            # FFC ADP fetch, team-count pool selection
│   │   │   ├── snapshots/crosswalk.ts      # db_playerids.csv fetch + local cache (shared with T9)
│   │   │   ├── snapshots/match.ts          # ID-first / normalized-name-fallback matching, DST-by-team
│   │   │   ├── snapshots/predraftCheck.ts  # assembles the pre-draft check surface
│   │   │   ├── roster/needvectors.ts       # FR-5 — imports shared/needvector.ts, reads draft.settings
│   │   │   ├── opponent/window.ts          # FR-6 — window derivation + panel assembly
│   │   │   ├── tendencies/profiles.ts      # FR-7 — reach/need-adherence/positional tracking + bending
│   │   │   ├── simulation/montecarlo.ts    # FR-8 — the sim engine + per-run survivor sets
│   │   │   ├── recommend/candidates.ts     # FR-9 — candidate list + highlight-reason resolver
│   │   │   ├── recommend/lookahead.ts      # FR-10 — plan generation + scoring
│   │   │   ├── gamelogs/store.ts           # FR-11 runtime reader of the local cache
│   │   │   ├── gamelogs/scoring.ts         # league-settings-driven fantasy point recompute
│   │   │   ├── orchestrator.ts             # wires poll → recompute cascade → SSE broadcast; burst debounce
│   │   │   ├── observability.ts            # AC-66/AC-67 lag/latency instrumentation
│   │   │   ├── routes/attach.ts, resync.ts, playerGamelog.ts, config.ts, events.ts, server.ts
│   │   │   └── index.ts                    # entrypoint (tsx-run, no separate backend build step)
│   │   ├── scripts/prep-nflverse-data.ts   # offline CLI: downloads+slims nflverse into data/cache/
│   │   └── test/
│   │       ├── fixtures/                   # sleeper-real-league-draft.json, sleeper-mock-draft.json, ecrData-slice.json, ffc-slice.json, crosswalk-slice.csv, sleeper-players-slice.json, player_stats-slice.csv, pbp-slice.csv
│   │       └── msw/handlers.ts             # mocked fetch handlers per external dependency, reused across suites
│   └── web/
│       ├── package.json  (name: @sidekick/web)
│       ├── tsconfig.json
│       ├── index.html
│       ├── vite.config.ts                  # dev-server proxy: /api, /events → the Express port
│       ├── tailwind.config.ts
│       └── src/
│           ├── main.tsx
│           ├── state/store.ts              # EventSource-fed wholesale-replace store (useSyncExternalStore)
│           ├── screens/AttachScreen.tsx    # paste URL/ID, teams/owners confirm, pre-draft check, slot picker
│           ├── screens/DraftScreen.tsx     # composes the panels below
│           ├── components/SyncIndicator.tsx
│           ├── components/CandidateList.tsx
│           ├── components/OpponentPanel.tsx
│           ├── components/RosterPanel.tsx
│           ├── components/PickFeed.tsx
│           ├── components/PlayerCard.tsx
│           └── **/*.test.tsx               # colocated component tests (Vitest + React Testing Library)
├── data/cache/                              # gitignored: crosswalk.json, gamelogs.json (built by prep script)
└── prd/, research/, .backlog/, .work/, .village/   # existing — untouched by this feature
```

## Execution

mode: per-task

## Tasks

### T1: Repo scaffold, tooling, shared types, config module

- depends_on: []
- context:
  Greenfield repo — nothing exists yet except `prd/`, `research/`, `.backlog/`, `.work/`, `.village/`, a root `README.md`, and a two-line `.gitignore` (`.DS_Store` only). Create the npm workspaces monorepo exactly as in the file structure plan above.
  - Root `package.json`: `"workspaces": ["packages/*"]`, Node engine `>=20` (native `fetch`/`zlib`, no polyfills). Scripts:
    - `"test": "vitest run"` (root `vitest.workspace.ts` lists `packages/shared`, `packages/server`, `packages/web`)
    - `"lint": "eslint ."`
    - `"typecheck": "tsc --noEmit -p packages/shared/tsconfig.json && tsc --noEmit -p packages/server/tsconfig.json && tsc --noEmit -p packages/web/tsconfig.json"` (three independent invocations, not TS project references — simpler to reason about and fix than composite-build `.d.ts` emission chains for a repo this size)
    - `"dev": "concurrently \"npm:dev:server\" \"npm:dev:web\""`, `"dev:server": "tsx watch packages/server/src/index.ts"`, `"dev:web": "npm run dev -w @sidekick/web"`
    - `"build": "npm run build -w @sidekick/web"` (only the frontend needs a compiled artifact — static assets Express serves; the backend runs from TS source via `tsx` even in "production" launch, since this is a personal local tool, not a hosted deploy)
    - `"start": "npm run build && tsx packages/server/src/index.ts"` (the actual "launch on demand" command from PRD §11)
    - `"prep:nflverse": "tsx packages/server/scripts/prep-nflverse-data.ts"`
  - These three exact commands (`npm test`, `npm run lint`, `npm run typecheck`) are what the constitution's Commands section is waiting on — the orchestrator copies them in after this design is approved.
  - Dependencies to declare: root devDeps `typescript@^5`, `vitest@^2`, `eslint@^9` + `typescript-eslint`, `prettier`, `tsx`, `concurrently`; server deps `express@^4`, `zod` (runtime-validate every external API response — required by AC-18's "malformed payload never crashes, always treated as failed poll"), `papaparse` (CSV parsing — **do not hand-roll with `split(',')`**: live-fetched nflverse `players.csv` during this design contained fields like `"https://static.www.nfl.com/image/private/f_auto,q_auto/..."` with embedded commas inside quoted fields; a naive splitter breaks silently), `msw@^2` (server test fixture mocking — install fixture handlers once in `test/msw/handlers.ts`, reused by every suite that touches an external API); web deps `react@^18`, `react-dom@^18`, `vite@^5`, `tailwindcss`, plus `@testing-library/react` as a web devDep.
  - `eslint.config.js`: flat config, `typescript-eslint` recommended + `eslint-plugin-react`/`eslint-plugin-react-hooks` scoped to `packages/web/**`.
  - `packages/shared/src/config/parameters.ts` — the single source of truth for every 🔶 AS-N default. Nothing outside this file may hardcode one of these numbers; every other task's context below names the exact key it must import. Full table (PRD-cited defaults must match the PRD's stated value exactly; architect-filled entries pick a concrete number where the PRD names the parameter but not a number; architect-added entries are implementation-necessary parameters the PRD doesn't name at all — all three kinds are equally "configurable, not hardcoded" per the constitution):

    | key | default | provenance |
    |---|---|---|
    | `pollIntervalMs` | 1000 | PRD AS-5 / AC-9 |
    | `apiBudgetPerMin` | 120 | PRD AS-5 / AC-10 |
    | `initialIngestTimeoutMs` | 10000 | PRD AS-5 / AC-1 |
    | `pickReflectionLatencyMs` | 3000 | PRD AS-5 / AC-11, AC-31 |
    | `resyncTimeoutMs` | 5000 | PRD AS-5 / AC-19 |
    | `snapshotStalenessWarningHours` | 24 | PRD AS-5 / AC-22 |
    | `insightRefreshLatencyMs` | 5000 | PRD AS-5 / AC-46, AC-53 |
    | `tendencyColdStartPicks` | 3 | PRD AS-2 / AC-39 |
    | `survivalBandLikelyGoneMax` | 0.25 | PRD AS-5 / AC-44 |
    | `survivalBandLikelyAvailableMin` | 0.75 | PRD AS-5 / AC-44 |
    | `candidateListDefaultRows` | 8 | PRD AS-5 / AC-49 |
    | `valueThresholdAdpPicksEarlier` | 10 | PRD AS-5 / AC-51 |
    | `nearTieSurvivalPct` | 5 | PRD AS-5 / AC-52 |
    | `nearTieEcrRanks` | 3 | PRD AS-5 / AC-52 |
    | `planTotalTooCloseEcrRanks` | 3 | PRD AS-5 / AC-55, AC-58 |
    | `lookaheadMaxPicks` | 2 | PRD AS-2 / AC-60 |
    | `flexEligiblePositions` | `['RB','WR','TE']` | PRD §9 Terms (need vector def.) |
    | `simUniverseSize` | 40 | **architect-filled** — PRD AS-5 names "sim universe = top available by ADP extended to displayed rows" (AC-42) without a number; 40 comfortably covers 8 default candidate rows across 4 positions plus lookahead extension |
    | `monteCarloRunCount` | 2000 | **architect-filled** — PRD AS-2 covers the engine, not a run count; see T7's benchmark for the latency-budget justification |
    | `burstDebounceMs` | 400 | **architect-added** — needed to implement "recompute once per burst, not once per pick" (AC-46/AC-53/AC-67); not itself an AS-5 line item |
    | `secondInstanceBackoffFactor` | 0.5 | **architect-filled** — PRD AS-5 names "second-instance poll back-off" (AC-8) without a number; multiplies `pollIntervalMs` per extra detected live instance |
    | `rateLimitBackoffMaxMs` | 10000 | **architect-added** — reactive 429 defense-in-depth alongside the heartbeat mechanism |
    | `adpPoolTeamSizes` | `[8,10,12,14]` | PRD AS-6 — FFC's supported team-count buckets; nearest-match, ties toward the larger count |
    | `gamelogSeasonsToCache` | 3 | **architect-filled** — PRD says "most recent season" plus "prior seasons where data exists" (AC-63) without a number |

  - `packages/shared/src/needvector.ts`: implement per PRD §9 Terms exactly:
    ```ts
    type SlotConfig = { QB: number; RB: number; WR: number; TE: number; FLEX: number; K: number; DST: number; BN: number };
    // computeNeedVector: for each unfilled dedicated QB/RB/WR/TE slot, weight[pos] += 1.
    // for each unfilled FLEX slot, weight[pos] += 1 / flexEligiblePositions.length for each eligible pos.
    // K/DST contribute 0 always. If every weight is 0 → return the sentinel 'no-need-signal' (not a zero vector —
    // callers must branch on this, per Terms: "its simulated pick is drawn from ADP order... best-available regime").
    function computeNeedVector(slots: SlotConfig, filled: Record<Position, number>): NeedVector | 'no-need-signal';
    // normalizeToDistribution: divide each weight by their sum: turns raw weights into a sum-1 probability
    // distribution. Used by FR-6 for display likelihoods (pre-FR-7) and as FR-7's bending input.
    function normalizeToDistribution(v: NeedVector): Record<Position, number>;
    ```
    This one function is imported by T4 (self), T5 (opponents), T6 (bending input), T7 (sampling) — implement it once, here, correctly, with unit tests covering: all slots filled → sentinel; a partially-filled FLEX splitting across 3 positions; a league with a non-standard FLEX eligibility set from config.
  - `packages/shared/src/types/insight.ts`: `type Insight<T> = { data: T; boardVersion: number; recomputing: boolean; degraded: boolean }` — the wrapper every downstream FR-3-sensitive output (opponent panel, candidate list, survival, roster panel) uses; `recomputing` and `degraded` must never both be silently dropped by a consumer.
  - `packages/shared/src/types/appstate.ts`: sketch (T10 finalizes field-by-field, but lock the top-level shape now so T11-T14 can build against it without waiting on T10's implementation):
    ```ts
    interface AppStateSnapshot {
      attach: { status: 'not-attached'|'attaching'|'attached'|'error'; draftId?: string; error?: string };
      sync: { lastSuccessfulSyncAt: string|null; status: 'healthy'|'degraded'; boardVersion: number };
      board: { players: Record<string, { drafted: boolean; draftedByTeamId?: string; pickNo?: number }>; teams: TeamInfo[] };
      pickFeed: PickFeedEntry[];
      userRoster: Insight<RosterPanelData>;
      opponentPanel: Insight<OpponentPanelEntry[]>;
      candidateList: Insight<{ rows: CandidateRow[]; highlightPlayerId: string|null; reason: string|null }>;
      preDraftCheck: PreDraftCheckData | null;
      config: PublicConfig;
    }
    ```
  - Extend `.gitignore`: add `node_modules/`, `dist/`, `data/cache/`, `config.local.json`, `*.tsbuildinfo`.
  - Add `config.local.json.example` documenting every key above as a comment-annotated JSON (or `.jsonc`) so a user knows how to override without reading `parameters.ts`.
- done when: `npm test`, `npm run lint`, and `npm run typecheck` all exit 0 from repo root with at least one real passing unit test in `packages/shared` (the `computeNeedVector` tests described above) and a placeholder test in `packages/server` and `packages/web`; `npm run dev` starts both processes without error; `npm run prep:nflverse` exists as a runnable (may no-op) script.

### T2: Sleeper attach, board sync, integrity and recovery (FR-1, FR-2, FR-3)

- depends_on: [T1]
- context:
  Implements the whole "attach-and-sync layer" the sizing doc anticipated as one natural seam. Ground truth on Sleeper's API (verified live during this design, and by the prior AS-1 spike in `research/draft-apis-sleeper-espn-yahoo.md` — read that file, it documents the exact mock-vs-real-league schema deltas):
  - Endpoints (base `https://api.sleeper.app`, no auth): `GET /v1/draft/<id>`, `GET /v1/draft/<id>/picks`, `GET /v1/draft/<id>/traded_picks`, `GET /v1/user/<username>` (resolve username→user_id for AC-3's convenience list), `GET /v1/user/<user_id>/drafts/nfl/<season>`, `GET /v1/league/<league_id>/users` (team/owner display names for real leagues), `GET /v1/players/nfl` (full player dump, ~14.6MB live-measured — cache in memory for the process lifetime, do not refetch per poll).
  - **Mock vs real-league schema deltas (from the AS-1 spike, re-confirm the field names against a live draft object at the start of this task — the mock draft id used in the original spike is already purged, confirmed during this design: both `/v1/draft/<id>` and `/v1/draft/<id>/picks` now return `null` for it):** real league draft has `league_id` set, picks carry real `picked_by`/`roster_id`; mock draft has `league_id: null`, picks carry `picked_by: ""` and `roster_id: null`. **Key every pick attribution on `draft_slot` + `draft_order`, never `picked_by`/`roster_id`** (✅ AS-1, AC-4) — this one choice makes mocks and real leagues share a code path.
  - **Verify at implementation time, don't assume:** whether the draft object's own `settings` (not the league's `roster_positions`) is the right single source for roster-slot counts on both mock and real drafts, and whether mocks expose only a coarse `metadata.scoring_type` label with no granular `scoring_settings` (no league to fetch one from). This task's fixtures (below) should encode whichever the first real check confirms; T4 and the game-log scoring path (T9) depend on this being right.
  - Build two test fixtures now, reused by every later server task: `test/fixtures/sleeper-real-league-draft.json` and `test/fixtures/sleeper-mock-draft.json`, each with a matching `picks` array, shaped per the deltas above.
  - Attach flow (FR-1): accept a pasted URL (extract the trailing numeric draft id) or a raw id; `GET /v1/draft/<id>`; on 404/invalid shape, surface which failure occurred and leave prior user input intact (AC-7) — never clear the input field's backing state on failure. Determine the user's slot from `draft_order` matching a stored/entered Sleeper user id; if absent, return an explicit "needs manual slot" state that blocks mine-vs-opponent/next-pick/survival output until resolved (AC-5) — model this as part of `AppStateSnapshot.attach`, not a crash or a default guess. Enforce exactly one attached draft per process (AC-6) — a second `attach` call while already attached is rejected, the user runs a second `npm start` on a second port for a second draft.
  - Poll loop (FR-2): every `pollIntervalMs` (config, T1), re-fetch the *complete* `/picks` list — never diff incrementally against Sleeper. Compare the new full list to the previous full list purely to detect "what's new" for UI event purposes (pick feed append, roster update trigger) — but the board itself is always rebuilt wholesale from the latest response, so attaching mid-draft (AC-13) is just "the first poll," no special case.
  - Integrity checks (FR-3): a poll response is treated as failed (degraded, keep retrying, no partial apply — AC-18) when: the HTTP call fails/times out, the payload fails Zod schema validation, pick count decreased vs the last good state, a previously-seen pick's player or team changed, or a pick number is out of sequence (AC-17). On the next *successful* poll after a degraded spell, do a full re-ingest (settings + draft_order + traded_picks + picks), same code path as attach. Track a monotonic `boardVersion`, incremented on every successful full re-ingest — this is the counter `Insight<T>.boardVersion` (T1) compares against to decide `recomputing` (AC-21).
  - Re-sync control (AC-19): forces an immediate out-of-cadence refetch (bypass the poll timer) and re-reads settings/draft_order/traded_picks, not just picks; must complete within `resyncTimeoutMs`.
  - `sleeper/instanceHeartbeat.ts` (AC-8): write `{pid, startedAt, lastHeartbeat}` to `os.tmpdir()/draft-sidekick-instances.json` on an interval; on each tick, read the file, count entries with `lastHeartbeat` newer than 2×the heartbeat interval, and set effective poll interval to `pollIntervalMs * (1 + secondInstanceBackoffFactor * otherLiveCount)`. Additionally, on any HTTP 429 from Sleeper, double the current interval up to `rateLimitBackoffMaxMs`, decaying back toward the heartbeat-computed baseline after 10 consecutive successful polls. Unit-test by faking two heartbeat entries in a temp file and asserting the computed interval rises, independent of any real second process.
  - Observability (AC-66): timestamp every poll response's arrival and the moment each dependent view (board, roster, pick feed) is updated from it; expose both via `observability.ts` (T10 surfaces this on a debug endpoint) — this task only needs to *record* the timestamps.
- done when: unit tests (mocked via `msw`, per T1's `test/msw/handlers.ts`) drive both fixtures through attach, a healthy poll sequence, a degraded sequence (malformed payload, decreasing pick count, out-of-order pick number — one test each), automatic recovery on the next good poll, and a manual Re-sync — asserting the correct `boardVersion` bumps, degraded flag transitions, and that mock-vs-real-league attribution both resolve to the same downstream `Team` shape. A separate unit test proves the heartbeat back-off math.

### T3: ECR/ADP snapshots and player-ID crosswalk matching (FR-4) [P]

- depends_on: [T1]
- context:
  Parallel-safe against T2 — different external data sources, no shared runtime state, only T1's config/types.
  **Live-verified sources and shapes (fetched directly during this design pass — use these exact URLs and field names, not the PRD's paraphrase of them):**
  - FantasyPros ECR: `GET https://www.fantasypros.com/nfl/rankings/half-point-ppr-cheatsheets.php` (plain HTML, no auth). Extract the embedded `var ecrData = {...};` JSON via regex (`/var ecrData = (\{.*?\});/s`) — confirmed live: 839 players including K/DST, top-level keys `sport, type, ranking_type_name, year, week, position_id, scoring, filters, count, total_experts, last_updated, players, last_updated_ts, experts_available, accessed`. Each player object: `{ player_id, player_name, player_team_id, player_position_id, player_positions, player_short_name, player_page_url, player_filename, player_bye_week, player_owned_avg, player_ecr_delta, rank_ecr, rank_min, rank_max, rank_ave, rank_std, pos_rank, tier }`. `rank_ecr` is the overall rank (this drives ordering, AS-8 — surface raw, never re-sort). `pos_rank` is a string like `"RB1"`. `last_updated`/`last_updated_ts` give the staleness-check timestamp (AC-22).
  - FFC ADP: `GET https://fantasyfootballcalculator.com/api/v1/adp/half-ppr?teams={N}&year={season}` (plain JSON, no auth) — `N` from `adpPoolTeamSizes` nearest-match to the attached league's team count (AC-24: display which pool was actually used when the exact team count isn't one of `[8,10,12,14]`). Confirmed live shape: `{status, meta: {type, teams, rounds, total_drafts, start_date, end_date}, players: [{player_id, name, position, team, adp, adp_formatted, times_drafted, high, low, stdev, bye}]}`. FFC's `player_id` is FFC-internal — **no crosswalk exists for it**; match every FFC row by normalized name (+ team/position as tie-breakers) only. There is no ID-first path for this source, by construction of the data, not a shortcut.
  - Player-ID crosswalk: `GET https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv` (public CSV, ~12,480 rows, confirmed current for the 2026 draft class). Columns include `fantasypros_id, gsis_id, sleeper_id, sportradar_id, espn_id, yahoo_id, name, merge_name, position, team`. **Verified live join**: Jahmyr Gibbs's row has `fantasypros_id=22968` (matches his `ecrData` `player_id` exactly) and `sleeper_id=9221` (matches Sleeper's own dump key for him exactly). Fetch and cache this file locally (small, ~2.6MB; refresh on a TTL — e.g. re-download if the cached copy is older than `snapshotStalenessWarningHours`, same knob as the snapshot staleness check, or a dedicated cache-refresh interval if that reads better once written). This crosswalk file is also T9's join key for game logs — put it in `snapshots/crosswalk.ts` so both import the same loader, not two copies.
  - Matching algorithm (`snapshots/match.ts`, AC-25): for each ECR row, look up `fantasypros_id == crosswalk.fantasypros_id` → take `crosswalk.sleeper_id` as the match. If no crosswalk row, or the resulting `sleeper_id` doesn't exist in the live Sleeper player dump (T2), fall back to normalized-name match (lowercase, strip suffixes/punctuation — mirror the crosswalk's own `merge_name` convention) against Sleeper's `full_name`/`search_full_name`. DST rows: match by `player_team_id` (team abbreviation) against Sleeper's team-defense pseudo-players (position `DST`), never via the player crosswalk. For FFC ADP rows: normalized-name match directly against Sleeper's dump (no crosswalk hop available). Anything still unmatched after both passes goes on the pre-draft check's unmatched list (AC-25) and is excluded from candidate list/simulation (not shown as available-forever).
  - Pre-draft check assembly (`predraftCheck.ts`): snapshot ages + `snapshotStalenessWarningHours` warning (AC-22); K/DST-absence warning if a fetched ECR snapshot lacks them (AC-23); ADP pool actually used (AC-24); unmatched-entries list (AC-25); ADP-missing-for-player → falls back to ECR-within-position order for sampling, not to be confused with the unmatched list (AC-26) — this is a distinct "matched but no ADP number" case, keep the two lists separate; scoring-format mismatch warning when the league's scoring differs from half-PPR (AC-27, reuse the FR-11/mock scoring-label logic from T2's context); "no ECR loaded" explicit disabled-state for candidate list/survival/recommendations while board sync/rosters/pick feed still run (AC-28).
  - Immutability (AC-29): fetch both snapshots exactly once, at the pre-draft check step, before the poll loop starts; store them in memory for the attached draft's lifetime; no code path may re-fetch them until a new `attach`.
  - Fixtures: `test/fixtures/ecrData-slice.json` (a trimmed real slice — include at least one QB, RB, WR, TE, K, and DST row, using the exact field names verified above), `test/fixtures/ffc-slice.json`, `test/fixtures/crosswalk-slice.csv` (include the verified Gibbs row plus at least one row with no `fantasypros_id`, to exercise the name-fallback path), `test/fixtures/sleeper-players-slice.json`.
- done when: unit tests matching the fixture ECR+ADP+crosswalk+Sleeper-dump slices produce the expected matched set (via ID), the expected name-fallback matches, a DST match by team code, an unmatched entry landing on the pre-draft check's list, and an ADP-missing-falls-back-to-ECR-order case — each asserted individually.

### T4: League settings, roster panel, need vectors (FR-5)

- depends_on: [T2]
- context:
  Reads team count, roster slot structure, and scoring settings from the draft/league API per T2's verified-or-corrected settings source (draft object's own `settings`, confirmed/adjusted in T2). Never hardcode "10 teams" / "3 WR" / any format assumption anywhere in this module — every shape comes from the API response (AC-30, AC-32).
  Import `computeNeedVector`/`normalizeToDistribution` from `packages/shared/src/needvector.ts` (T1) — do not reimplement. Roster panel data: filled starting slots, unfilled starting slots by position (the need vector, displayed raw — not normalized, since AC-31 asks for "unfilled starting slots by position," a count-shaped view, distinct from FR-6's normalized-likelihood view), bench count; must update within `pickReflectionLatencyMs` of the user's own pick landing (AC-31) — wire this off T2's "new pick observed" event for the user's own team specifically. K/DST slots are tracked and displayed on the roster (AC-33) even though `computeNeedVector` gives them 0 weight — two different concerns (display bookkeeping vs. prediction math), don't conflate a K/DST slot count of "unfilled" with a nonzero need-vector entry.
  Build a second real-settings fixture here (extending T2's real-league fixture) with non-default slots — 3 WR, 12 teams — specifically to exercise AC-32; the same fixture and the same code path must produce correct output with zero special-casing.
- done when: tests against the default-fixture league and the 3-WR/12-team fixture both produce correct filled/unfilled/bench/need-vector output purely from settings data, with no branch in the code keyed on "is this the default league shape."

### T5: Opponent panel and window (FR-6)

- depends_on: [T3, T4]
- context:
  The "window" (PRD §9 Terms: the exact pick sequence between the user's current pick and their next pick, snake-order and traded-picks aware) is computed once here as a pure function of `(draft_order, current_pick_index, traded_picks)` → an ordered list of `(pickNo, team)`. This function is reused by T6 (which teams to profile), T7 (which picks to simulate), T8 (lookahead's "at the user's next turn") — implement it once, in `opponent/window.ts`, exported for those tasks to import directly rather than re-deriving.
  Terms: "While the user is on the clock, 'current pick' is the in-progress one and 'next pick' is the one after it; the in-progress slot is never simulated. When the user is not on the clock, the window runs from the in-progress pick through the one before the user's next turn." — encode both branches explicitly; get the off-by-one right in both directions, since every downstream FR (6/7/8/9/10) inherits whichever window this returns.
  For each team in the window: unfilled starting slots + need vector (import T4's `computeNeedVector`, applied per-opponent-team using that team's own roster from the board) + remaining picks (AC-35); most-likely-position(s) from `normalizeToDistribution(needVector)` (i.e., sum-to-1, *before* FR-7 bending — AC-36) with example players drawn from the ADP snapshot (T3) ordered within those positions. Tag each panel entry with a `confidence: 'position' | 'player-example'` field (AC-37) — the UI task (T13) reads this tag to render the visual distinction; don't leave that distinction as UI-only guesswork.
  A team picking twice before the user's next turn appears twice in the window (per PRD's own "Consequences" note on FR-6) — don't dedupe by team.
- done when: a fixture window containing a traded pick produces the correct owning-team sequence (ownership follows the traded-picks endpoint, not the original slot), and per-team need vectors/likely-positions/example-players match hand-computed expected values in tests.

### T6: Within-draft tendency profiles (FR-7)

- depends_on: [T5]
- context:
  Per team, after every pick that team makes (own picks excluded — this profiles opponents only, though nothing stops a curious implementation from computing the user's own for symmetry; the spec only requires opponents): update three running stats (AC-38) —
  - **average reach** = mean of (`player's ADP` − `pick number taken`) across that team's picks so far (positive = taken ahead of market)
  - **need-adherence** = fraction of that team's picks that filled a *then*-unfilled starting slot at the moment of the pick (compute this at pick-time using the roster state as of just before that pick, not the final roster — a team's early picks might all be need-fits even if a later pick isn't)
  - **positional counts** relative to the league's starting-slot proportions (e.g., a 10-team league with 2 starting RB slots per team out of 9 total starters has a "expected" RB share of 2/9; compare the team's actual drafted-position counts against that baseline)
  Cold start (AC-39): until a team has made `tendencyColdStartPicks` (default 3) picks *in this draft*, use neutral priors (reach = 0, need-adherence = 1.0 i.e. assume need-driven, positional counts = the league baseline exactly) and label the profile `'early'`/low-confidence — surface this label in the type, not just a UI string, so T13 can gray it out consistently.
  **Bending formula (architect-supplied — the PRD says only "bends... by its profile," AC-40, with no formula):** given the team's normalized need-distribution `needDist` (from T5) and a best-player-available distribution `bpaDist` (probability mass on each of QB/RB/WR/TE proportional to `1 / bestAvailableEcrRankAtPosition`, renormalized to sum 1), blend by that team's need-adherence fraction `a`:
  ```
  blended[pos] = a * needDist[pos] + (1 - a) * bpaDist[pos]
  ```
  then apply a bounded positional-preference nudge from the observed-vs-expected positional share `δ[pos] = clamp(observedShare[pos] - expectedShare[pos], -0.5, 0.5)`:
  ```
  bent[pos] = blended[pos] * (1 + δ[pos]);  renormalize bent to sum 1
  ```
  Both the `±0.5` clamp and the blend itself must read from `parameters.ts` (T1) as named, documented constants (e.g. `tendencyPositionalNudgeClamp`), not inline literals — this formula is explicitly a first cut meant to be tuned during the PRD's own mock-rehearsal loop (§14), and the whole point of "configurable" is that tuning it later is a config edit, not a redeploy.
  Discard on detach/draft-end (AC-41): tendency profile state must live in the same per-attach in-memory scope T2's board lives in, torn down identically on detach/new-attach — write a test that attaches, drafts a few picks, detaches, re-attaches (even to the same draft id), and asserts profile state is neutral-prior again, not carried over.
- done when: a fixture sequence of opponent picks produces the exact documented reach/need-adherence/positional numbers, the cold-start label disappears exactly at the 3rd pick, the bending formula visibly shifts the distribution away from a neutral team's when fed a synthetic high-reach/low-need-adherence profile, and the detach-then-reattach test shows no residual state.

### T7: Monte Carlo survival simulation (FR-8)

- depends_on: [T3, T6]
- context:
  This is the algorithmic core the rest of the recommendation engine (T8) depends on — get the per-run data structure right first, since T8 needs individual run outcomes, not just aggregated percentages (AC-43).
  **Simulation universe**: the top `simUniverseSize` (config, default 40) available players by ADP, extended to guarantee every player currently displayed in a skill-position candidate-list row is included even if outside that cutoff (AC-42) — this task exposes a `ensureIncluded(playerIds)` parameter to the simulation entry point; T8 calls it with the candidate list's own row set.
  **Per-run algorithm**, for each of `monteCarloRunCount` (config, default 2000 — see benchmark note below) independent runs, over every pick in the current `window` (T5):
  1. If the picking team has `'no-need-signal'` (T4's sentinel — no unfilled starting slots): skip the position draw entirely, sample the player directly from ADP order among currently-available-in-this-run universe players (the "best-available regime," Terms).
  2. Otherwise: draw a position from that team's FR-7 tendency-bent distribution (T6's `bent`).
  3. Within the drawn position, draw the player using a **reach-adjusted ADP-order weighting (architect-supplied — PRD says only "adjusted by the team's reach profile," AC-42, no formula)**: for each available player at that position, `effectiveAdpRank = max(1, adpRankWithinPosition - reachAdjustmentPerPick * team.avgReach)`, weight `= 1 / effectiveAdpRank`, normalized over currently-available players at that position in this run. `reachAdjustmentPerPick` is a new named config constant (add it to T1's table as an architect-added parameter, default `1.0` — one pick of reach shifts the effective rank by one slot) rather than inlining `1.0` here.
  4. **K/DST saturation rule (AC-47), precisely**: before step 1-3 for a given simulated pick, check `team.unfilledKDstSlots >= team.remainingPicksInWindowIncludingThis`. If true, this pick consumes no skill player at all (decrement the team's remaining-picks counter and one unfilled K/DST slot, move to the next window pick) — model this as a zero-cost branch taken *before* any position/player draw, not as a fake K/DST draw from the (nonexistent, per AS-7) K/DST simulation universe.
  5. Remove the drawn player from this run's available pool; continue to the next window pick.
  After all `window.length` picks in a run: for every universe player, record `survived[run][playerId] = still available`. **Retain this full per-run boolean matrix** (a `Uint8Array` or `Map<playerId, Uint8Array>` sized `monteCarloRunCount × universeSize` is plenty efficient) — this is what AC-43 requires and what T8's plan scoring (AC-55) consumes directly ("per-run best surviving rank," never marginal percentages treated as independent).
  Marginal survival % = mean of `survived[*][playerId]` across runs; band from `survivalBandLikelyGoneMax`/`survivalBandLikelyAvailableMin` (config, AC-44). Suppress entirely (no % or band) when the user has no next pick (AC-45). Degraded flag passthrough from T2's board state (AC-48).
  **Recompute timing (AC-46)**: triggered by T10's orchestrator on every burst-settled pick event (see T10) — this task just needs to be fast enough to run inside the 5s budget with margin; write the benchmark test below to prove it, since `monteCarloRunCount` and `simUniverseSize` are exactly the two knobs to turn down if a real machine proves slower than expected.
- done when: (1) a fixture window+universe produces per-run survivor data consumable by a simple aggregate-percentage check matching hand-verified expected values for at least one clearly-should-survive and one clearly-should-not-survive player; (2) a **stability test** re-runs the full simulation twice on an identical fixture board and asserts no player's marginal percentage crosses a band boundary between runs (this directly encodes the PRD's SC-2 guardrail — "re-running on an unchanged board moves no player's percentage across a band boundary" — as an automated check, not just a manual mock-rehearsal observation); (3) a benchmark test asserts a full recompute over a realistic-sized fixture (universe 40, window length ~15) completes in well under 1 second in CI, giving comfortable headroom under the 5s budget.

### T8: Candidate list, recommendation highlight, two-pick lookahead (FR-9, FR-10)

- depends_on: [T4, T7]
- context:
  FR-9 and FR-10 are implemented together deliberately — per the PRD's own framing, "the highlight is FR-10's output, not an independent second opinion." One highlight-reason resolver function, not three independent checks that could each fire text simultaneously.
  **Candidate list** (`recommend/candidates.ts`): top `candidateListDefaultRows` (config, default 8) available players in raw ECR order (AS-8 — never re-sort, never blend; the QB-vs-market skew ships as-is, disclosed only via the ADP column per-row), extended to include the FR-10 highlight if it falls outside the default rows (AC-49). Each row: overall ECR rank, positional rank, ADP, and — only while the user has a subsequent pick — survival % + band from T7. Position filter (AC-50): one-interaction filter; K/DST filter shows positional-ECR order with no survival math (K/DST is excluded from the sim universe by construction, AS-7), falling back to ADP order if the snapshot has no K/DST rankings at all.
  **Plan generation and scoring** (`recommend/lookahead.ts`, AC-54/AC-55 — read precisely, this is the densest single computation in the whole feature):
  - Enumerate plans as ordered pairs `(nowPosition, nextPosition)` drawn **only** from positions with an unfilled starting slot per T4's need vector for the user — not from whatever positions happen to be in the candidate list. `nowPosition === nextPosition` is a valid plan (e.g., a user needing 2 RB slots legitimately has an "RB-now/RB-next" plan) — don't special-case it out.
  - `term1` = the overall ECR rank of the single best (numerically lowest rank) currently-available player at `nowPosition` — a present-tense lookup, not simulated.
  - `term2` = the **average, across all `monteCarloRunCount` runs, of the best surviving overall-ECR-rank at `nextPosition` in that run** — read directly from T7's per-run survivor matrix (filter to players at `nextPosition`, take the minimum ECR rank among survivors in that run). A run with zero survivors at that position scores `(the snapshot's worst overall ECR rank) + 1` for that run (AC-55's explicit rule — this is what makes an empty-position run a genuine penalty rather than a skipped/ignored run).
  - `planScore = term1 + term2`; **lower wins**.
  - Winning plan's highlight = the highest-ECR available player at the winning plan's `nowPosition` (AC-56), extending the candidate list to include them if needed.
  - Display the winning plan, the closest-scoring alternative plan, and name the specific survival fact that separates them (AC-57 — e.g., which position's shelf is thinning; pull this from the same per-run data, not a re-derived summary).
  - Too-close fallback (AC-58): if the top two plans' scores are within `planTotalTooCloseEcrRanks` (config, default 3), state that explicitly and fall back to the higher-ECR current pick instead of the plan winner — merge this message with FR-9's own near-tie message (below) into one shown statement, never both.
  - Fewer-than-2-picks-remaining (AC-59): skip plan comparison entirely, use FR-9's own ECR-ordered highlight (below), and state that lookahead doesn't apply. `lookaheadMaxPicks` (config, default 2) bounds how far ahead this ever reaches (AC-60) — this task's plan enumeration only ever looks at "current + next," so this bound is currently structural, not a loop counter; if that changes later, wire the bound explicitly rather than assuming it stays true by construction.
  **FR-9's own highlight-reason precedence** (`recommend/candidates.ts`, used only when FR-10's plan comparison isn't itself the differentiator — i.e., the plan winner's `nowPosition` highlight equals the plain top-ECR candidate): resolve in this exact order, stop at the first that applies (AC-51):
  1. plan/survival — the winning plan moved the highlight off the overall top-ECR candidate
  2. need — the top-ECR candidate's position has no unfilled starting slot (so FR-10 excluded it from the plan set entirely)
  3. value — the highlight is the top-ECR candidate and its ADP is ≥ `valueThresholdAdpPicksEarlier` (config, default 10) picks earlier than the current pick number
  4. else best available
  **Near-tie override** (AC-52): after the highlight is resolved by whichever path above, if it and the highest-ECR available candidate *at a different position* are both within `nearTieSurvivalPct` percentage points of survival **and** within `nearTieEcrRanks` overall ECR ranks, leave the highlight in place but replace the reason line with a too-close-to-call statement naming the other candidate — merge with FR-10's AC-58 message if both fire on the same pick (one shown line, never two).
  Drafted-player exclusion (AC-53): the candidate list and highlight must never name a player T2's board has already marked drafted — filter before ranking, not after.
- done when: distinct fixture scenarios — a need-driven pick, a value-driven pick (top-ECR + ADP gap ≥10), a plan/survival-driven pick, a too-close-to-call case, a <2-picks-remaining case, and a plan-totals-within-3 case — each produce the exact expected highlighted player and exact expected reason string in tests, one assertion per scenario.

### T9: Player game-log data prep and runtime reader (FR-11 backend) [P]

- depends_on: [T1, T3]
- context:
  Parallel-safe against T4 through T8 — a fully independent data subsystem, only needing T1's config and T3's crosswalk loader (`snapshots/crosswalk.ts` — import it, don't re-fetch `db_playerids.csv` separately).
  **Verified live during this design** (use these exact URLs/shapes):
  - `GET https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats.csv` — all seasons 1999–present combined, 33MB, weekly granularity. Confirmed header: `player_id` (this is a **gsis_id**, format `00-0000003`), `player_name, player_display_name, position, position_group, recent_team, season, week, season_type, opponent_team`, then per-category stat columns: passing (`completions, attempts, passing_yards, passing_tds, interceptions, ...`), rushing (`carries, rushing_yards, rushing_tds, rushing_fumbles, ...`), receiving (`receptions, targets, receiving_yards, receiving_tds, receiving_fumbles, ...`), plus `fantasy_points, fantasy_points_ppr`. **Gap**: this file has no "longest play" column, and AC-62 requires "long" for receiving (and rushing "avg" is trivially `rushing_yards / carries`, computable, not a gap). Deriving per-game "long reception"/"long rush" requires play-by-play data.
  - `GET https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_{season}.csv.gz` — confirmed live, e.g. `play_by_play_2025.csv.gz` is **19MB compressed / ~98MB uncompressed**. This is why it must be an offline prep step, never fetched live during a draft (see Approach). Decompress with Node's built-in `zlib.gunzipSync`; parse with `papaparse`; keep only the columns needed to compute per-game longest completed pass / longest rush per player (`game_id` or `week`+`season`, `passer_player_id`/`rusher_player_id`/`receiver_player_id`, `play_type` or `rush_attempt`/`complete_pass`, `yards_gained`), reduce to a tiny per-`(gsis_id, season, week)` "long" value, then **discard the raw PBP rows from memory/disk — do not persist the 98MB file locally**, only the derived long-value table.
  - Crosswalk join: reuse T3's `snapshots/crosswalk.ts` loader to map each `player_stats.csv` row's `player_id` (gsis_id) → `sleeper_id`, which becomes this cache's lookup key (the running app's canonical id everywhere is Sleeper's `player_id`).
  - `scripts/prep-nflverse-data.ts`: a standalone CLI (`npm run prep:nflverse`), **not part of the live server's code path**, documented (in the script's own header comment — this is a script, not a doc file) as something to re-run manually before each draft season per PRD §11. It downloads `player_stats.csv`, filters to the last `gamelogSeasonsToCache` (config, default 3) seasons, downloads+derives the long-value table from that many seasons of PBP, joins via the crosswalk, and writes `data/cache/gamelogs.json` keyed by Sleeper `player_id` → season → array of per-game rows shaped per AC-62's exact stat line: `{week, opponent, fantasyPoints, passing?: {att,comp,yds,td,int}, rushing?: {att,yds,avg,td}, receiving?: {tgt,rec,yds,td,long,ydsPerTgt}, fumbles}`. Ship small fixture-sized versions of `player_stats.csv` and a PBP slice under `test/fixtures/` so the prep script's own tests don't hit the network or handle 98MB files.
  - **Runtime reader** (`gamelogs/store.ts`, this *is* on the live server's code path): loads `data/cache/gamelogs.json` once at server startup (small — a few MB at most for 3 seasons), looks up by Sleeper `player_id`, exposes season tabs (AC-63), and returns an explicit "no NFL game data" result (never an empty table) when a player has no cached rows — e.g. a rookie (AC-65).
  - **Scoring** (`gamelogs/scoring.ts`, AC-64): recompute `fantasyPoints` per game from the attached league's own scoring settings (T2/T4's granular dict for real leagues, or the `scoringDefaults.ts` fallback table for mocks per the Approach section) applied to the raw per-game stat line — never trust `player_stats.csv`'s own precomputed `fantasy_points`/`fantasy_points_ppr` columns, since those are fixed-format (standard/PPR) and won't reflect a custom league's actual settings.
- done when: running the prep script against the fixture-sized `player_stats`/PBP slices produces a `gamelogs.json` shape matching AC-62's stat line exactly (including a correctly-derived "long" value from the PBP fixture), the runtime reader returns season-tabbed data for a fixture player and the explicit no-data state for a fixture player absent from the cache, and a scoring test recomputes a hand-checked fantasy-point total from a fixture league's custom scoring settings that differs from the source file's own precomputed column.

### T10: Server orchestration, SSE broadcast, REST endpoints

- depends_on: [T2, T3, T4, T5, T6, T7, T8, T9]
- context:
  The integration point — wires every module above into one `AppStateSnapshot` (shape locked in T1, finalize field-by-field here) and pushes it over SSE on every change.
  **Burst coalescing** (AC-46/AC-53's "burst-final" semantics, AC-67's observability): when T2's poll loop observes one or more new picks, start (or reset) a `burstDebounceMs` (config, default 400ms, architect-added — see T1) timer instead of recomputing immediately; only trigger the T5→T6→T7→T8 recompute cascade once the timer elapses with no further new picks observed. While a recompute is in flight or debounced, mark the affected `Insight<T>` fields `recomputing: true` (their stale `data` stays visible, per FR-3's "recomputing, never presented as current" — that means flagged-as-stale, not hidden) — this is the concrete mechanism behind AC-21/AC-46/AC-53's "marked recomputing in the interim" language.
  **SSE endpoint** (`routes/events.ts`): on connection, immediately send the current full `AppStateSnapshot`; thereafter, send a new full snapshot on every state change (poll result, recompute completion, degraded-flag change). Multiple connections (AC-15, multiple browser tabs) all receive identical broadcasts from the one server-held state — no per-connection logic needed beyond "send what everyone else just got."
  **REST endpoints**: `POST /api/attach` (body: pasted URL/ID; also handles the manual-slot-selection follow-up call), `POST /api/resync`, `GET /api/player/:sleeperPlayerId/gamelog` (T9's reader), `GET /api/config` (read-only surface of current AS-N values for the pre-draft check display — never lets the browser *write* config; local overrides are a server-restart-time file edit, per the Approach's "no in-app UI to resolve ambiguity" spirit already established for FR-4).
  **Observability surface** (AC-66/AC-67): expose T2's recorded per-pick timestamps and this task's per-burst recompute timestamps via structured console log lines (e.g. one JSON line per event: `{type: 'pick-reflected', lagMs}` / `{type: 'burst-refreshed', latencyMs}`) at minimum — sufficient for a human watching the terminal during a mock rehearsal to eyeball p95 behavior, which is explicitly all AC-66/67 ask for (the PRD's own validation protocol, §14, treats the actual p95 judgment as a live mock-rehearsal activity, not a CI assertion). A `/api/debug/metrics` endpoint returning the last N recorded samples is a reasonable addition if convenient, not required beyond the log lines.
- done when: an integration test drives a fixture poll sequence — including a burst of 3 picks arriving within one debounce window — end-to-end through attach → sync → recompute → SSE payload, asserting exactly one recompute (not three) fired for the burst, the final `AppStateSnapshot` matches hand-computed expected board+insights, and two simulated SSE listeners both receive byte-identical payloads.

### T11: Frontend shell, SSE-fed state store, attach screen

- depends_on: [T1, T10]
- context:
  `packages/web` scaffold: Vite + React + TS + Tailwind. `vite.config.ts` proxies `/api` and `/events` to the Express port in dev, so there's never a CORS concern in dev or in the single-process production launch (T1's `npm start` serves the built frontend and the API from the same Express process/port).
  **State store** (`state/store.ts`): open one `EventSource('/events')`; on every message, wholesale-replace the store's `AppStateSnapshot` (per the Approach's full-state-replace principle — no field-level merging, no partial updates, ever). Expose via `useSyncExternalStore` so components re-render only on actual snapshot changes, without a full state-management library.
  **Attach screen** (`screens/AttachScreen.tsx`, UJ-1): paste field for URL/ID, optional username-based convenience list (only shown when a stored username exists, per AC-3 — "paste remains the primary path regardless," so don't gate the paste field behind the convenience list rendering), teams/owners display for confirmation (AC-2 — team names + owner display names where available, bot/empty seats by slot number), manual slot picker shown only when `attach.status` indicates the auto-detected slot is missing (AC-5), and the pre-draft check panel (T3's data: snapshot ages/staleness, matching results incl. unmatched list, league settings summary, scoring-mismatch warning). Transition to `DraftScreen` only after the user explicitly confirms (UJ-1's "user confirms it's the right draft").
  **Sync indicator** (`components/SyncIndicator.tsx`): last successful sync time + healthy/degraded, wired to `sync.status`/`sync.lastSuccessfulSyncAt`; a visible Re-sync button posting to `/api/resync`.
  This task builds against the `AppStateSnapshot` shape T1 locked and T10 implements — if T10 lands with any field renamed/reshaped from T1's sketch, reconcile against T10's actual shape (the source of truth is whatever T10 shipped, not the sketch) rather than the reverse.
- done when: against a mocked `EventSource` emitting fixture `AppStateSnapshot` payloads (msw or a hand-rolled fake EventSource in tests), the attach screen renders fixture teams/owners, surfaces the pre-draft check content, shows the manual slot picker exactly when the fixture's `attach` state calls for it, and transitions to the draft screen on confirm — each as a separate component test.

### T12: Candidate list and recommendation panel UI [P]

- depends_on: [T8, T11]
- context:
  Renders `AppStateSnapshot.candidateList` (`Insight<{rows, highlightPlayerId, reason}>`): ECR/positional-rank/ADP/survival+band per row, the highlighted row visually distinguished, the one-line reason text, position filter (including the K/DST no-survival-math variant), and a visible "recomputing" treatment when `candidateList.recomputing` is true (stale data stays on screen, dimmed/labeled — never blanked, per FR-3's spirit).
  Consume the exact reason strings T8 produces (need/value/plan/best-available/too-close-to-call/lookahead-not-applicable) verbatim — this component doesn't re-derive or reword them.
- done when: fixture `AppStateSnapshot` payloads — one per T8 test scenario (need-driven, value-driven, plan-driven, too-close-to-call, <2-picks-remaining) — each render the exact expected highlighted row and reason text in component tests, plus one test asserting the recomputing-dimmed state renders when the fixture sets that flag.

### T13: Opponent panel, roster panel, and pick feed UI [P]

- depends_on: [T4, T5, T11]
- context:
  Three related, comparatively simpler panels bundled into one task since none is individually complex enough to warrant its own developer spawn:
  - `OpponentPanel.tsx`: the window's team sequence, per-team need/unfilled-slots/remaining-picks, tendency-profile compact summary (T6's `bent` distribution + the `'early'` label), likely-position(s) with ADP-drawn example players — rendering the `confidence: 'position'|'player-example'` tag (T5) as a genuinely distinct visual treatment (e.g., position predictions in a solid badge, player examples visibly lighter/italicized/labeled "e.g.") — AC-37 explicitly forbids presenting a player-level guess as a certainty, so this isn't a cosmetic nicety.
  - `RosterPanel.tsx`: the user's filled/unfilled starting slots, bench count, K/DST tracked-but-math-excluded slots shown like any other slot.
  - `PickFeed.tsx`: chronological pick list, each entry attributed to its team and flagged mine-vs-opponent; entries for unmatched players (T3) show the raw Sleeper name plus a visible warning badge (AC-20) rather than silently omitting them.
- done when: fixture data renders correct team ordering with the position/player-example visual distinction present and queryable in tests, correct filled/unfilled/bench counts, a pick feed with correct mine/opponent flags, and an unmatched-player pick feed entry showing the raw name + warning badge.

### T14: Player card modal UI [P]

- depends_on: [T9, T11]
- context:
  One click from any candidate row, pick-feed entry, or roster entry opens the card without navigating away (AC-61) — implement as an overlay/modal driven by local UI state (which player id is "open"), not a route change. Fetches `/api/player/:id/gamelog` (T10) on open. Per-game table columns are position-appropriate per AC-62 exactly: passing (att/comp/yds/TD/INT), rushing (att/yds/avg/TD), receiving (tgt/rec/yds/TD/long/yds-per-tgt), plus fumbles always. Season tabs when prior-season data exists (AC-63). Explicit "no NFL game data" message (not an empty table) when T9's reader returns the no-data case (AC-65).
- done when: a fixture game-log payload renders the correct column set for a QB, a RB, and a WR/TE fixture player each, season tabs appear and switch correctly for a fixture player with 2 seasons of data, and the no-data state renders (not an empty table) for a fixture rookie.

### T15: End-to-end integration test against a full mock-draft fixture

- depends_on: [T10, T12, T13, T14]
- context:
  The capstone correctness check before this feature is handed to spec_review/code_review/qa. Build one realistic, synthetic 10-team half-PPR mock-draft fixture — a full pick-by-pick sequence (15 rounds × 10 teams = 150 picks) shaped per the real mock-draft schema (T2's fixtures) — including at least one traded pick, one burst of 3+ picks landing together, one drafted player absent from the ECR/ADP fixtures (to exercise the unmatched-player path end to end), and the user's own team drafting on schedule throughout.
  Replay this fixture through the real server (attach → sequential poll responses simulating the draft progressing → final state), asserting: (1) **convergence** — the final board matches the fixture's true end state exactly, no player shown available that the fixture drafted and vice versa (this directly mirrors SC-1's counter-metric, "non-converging board state," as an automated check); (2) the burst collapses to one recompute, not N; (3) the traded pick is attributed to its current owner throughout, not the original slot; (4) the unmatched player shows raw-name + warning throughout and never enters the candidate list; (5) observability hooks (T2/T10) recorded at least one pick-lag sample and one burst-latency sample with plausible (non-negative, non-absurd) values — proving the instrumentation AC-66/AC-67 ask for is actually wired end to end, even though the real p95 judgment against live latency is explicitly a mock-rehearsal activity outside this suite (spec.md's own carve-out).
  Render at least a smoke-level check of the frontend against this same fixture's final `AppStateSnapshot` (component-level render asserting no unhandled error and that the five named surfaces — candidate list, opponent panel, roster panel, pick feed, sync indicator — all rendered something) — full pixel-level UI correctness is already covered per-component in T12–T14; this task's UI check is "does it hang together," not re-testing each panel's internals again.
- done when: the full 150-pick fixture replay passes all five assertions above in one automated test run, with zero unhandled exceptions anywhere in the stack during replay.
