import type { SkillPosition } from '../types/board';

/**
 * The single source of truth for every 🔶 AS-N default.
 *
 * The constitution's rule: "every 🔶 AS-N default in the PRD's §12 is a configurable
 * parameter, not a constant to invent differently." Concretely — **no module outside this
 * file may hardcode one of these numbers.** Import the key; never inline the literal.
 *
 * Three kinds of entry live here, all equally configurable:
 *  - **PRD-cited** — the PRD states the number; it must match exactly.
 *  - **architect-filled** — the PRD names the parameter but no number; design.md picks one.
 *  - **architect-added** — implementation-necessary knobs the PRD does not name at all.
 *
 * Users override any of these in `config.local.json` at the repo root (see
 * `config.local.json.example`); the server merges the file over these defaults at startup.
 */
export interface ParameterValues {
  // ---- Sync cadence and API budget (FR-1, FR-2) ----------------------------------------
  /** Poll cadence for the complete pick-list refetch. PRD AS-5 / AC-9. */
  pollIntervalMs: number;
  /** Ceiling on Sleeper requests per minute from one instance. PRD AS-5 / AC-10. */
  apiBudgetPerMin: number;
  /** Budget for the full initial ingest at attach. PRD AS-5 / AC-1. */
  initialIngestTimeoutMs: number;
  /** Budget from a pick landing in a poll response to it showing in every view. PRD AS-5 / AC-11, AC-31. */
  pickReflectionLatencyMs: number;
  /** Budget for a manual Re-sync to rebuild the whole board. PRD AS-5 / AC-19. */
  resyncTimeoutMs: number;

  // ---- Snapshots (FR-4) ---------------------------------------------------------------
  /** Age past which the pre-draft check warns an ECR/ADP snapshot is stale. PRD AS-5 / AC-22. */
  snapshotStalenessWarningHours: number;
  /** FFC's supported team-count buckets; nearest match wins, ties toward the larger. PRD AS-6 / AC-24. */
  adpPoolTeamSizes: readonly number[];
  /**
   * Budget for the whole third-party snapshot load at attach — the crosswalk download plus the
   * ECR and ADP fetches, which run behind an open `POST /api/attach`.
   * **architect-added** — AS-5's `initialIngestTimeoutMs` bounds the *Sleeper* calls only, and
   * these three hosts are nobody's dependency but ours. Without a bound they inherit undici's
   * ~300 s defaults and hang attach; with one, a slow source degrades into AC-28's "no rankings
   * loaded" path instead. Kept separate from the Sleeper budget because these are bulk documents
   * (a ~3 MB crosswalk CSV) on slower hosts, so they deserve a looser ceiling than a JSON poll.
   */
  snapshotFetchTimeoutMs: number;

  // ---- Insight refresh (FR-8, FR-9) ---------------------------------------------------
  /** Budget from a burst's final pick to every insight reflecting it. PRD AS-5 / AC-46, AC-53. */
  insightRefreshLatencyMs: number;
  /**
   * Quiet period after the last observed new pick before the recompute cascade fires, so a
   * burst recomputes once rather than once per pick (AC-46/AC-53/AC-67).
   * **architect-added** — not itself an AS-5 line item.
   */
  burstDebounceMs: number;

  // ---- Need vectors (FR-5, FR-6) ------------------------------------------------------
  /**
   * Positions eligible for a FLEX slot. Each unfilled FLEX slot contributes
   * 1/(this length) to each of these positions. PRD §9 Terms (need vector definition).
   */
  flexEligiblePositions: readonly SkillPosition[];

  // ---- Tendency profiles (FR-7) -------------------------------------------------------
  /** Picks a team must make before its profile leaves neutral priors. PRD AS-2 / AC-39. */
  tendencyColdStartPicks: number;
  /**
   * Bound on the observed-minus-expected positional-share nudge applied after the
   * need/BPA blend, i.e. δ is clamped to ±this.
   * **architect-added** — the PRD states FR-7's bending qualitatively only ("bends… by its
   * profile", AC-40); design.md §T6 supplies the formula and flags it as a first cut meant to
   * be tuned during the PRD §14 mock-rehearsal loop. Tuning it is a config edit.
   */
  tendencyPositionalNudgeClamp: number;

  // ---- Monte Carlo survival (FR-8) ----------------------------------------------------
  /**
   * Top-N available players by ADP forming the simulation universe, before extension to
   * cover every displayed candidate row.
   * **architect-filled** — PRD AS-5 / AC-42 names the universe but no number.
   */
  simUniverseSize: number;
  /**
   * Independent Monte Carlo runs per recompute.
   * **architect-filled** — PRD AS-2 covers the engine, not a run count; design.md §T7 ties
   * this to the AC-46 latency budget. Turn this down first if a machine misses budget.
   */
  monteCarloRunCount: number;
  /**
   * How far one pick of average reach shifts a player's effective within-position ADP rank
   * when weighting the player draw.
   * **architect-added** — PRD AC-42 says only "adjusted by the team's reach profile".
   */
  reachAdjustmentPerPick: number;
  /** Survival at or below this is "likely gone". PRD AS-5 / AC-44. */
  survivalBandLikelyGoneMax: number;
  /** Survival at or above this is "likely available". PRD AS-5 / AC-44. */
  survivalBandLikelyAvailableMin: number;

  // ---- Candidate list and recommendation (FR-9, FR-10) --------------------------------
  /** Rows shown before any FR-10 highlight extension. PRD AS-5 / AC-49. */
  candidateListDefaultRows: number;
  /** ADP must be at least this many picks earlier than the current pick to read as value. PRD AS-5 / AC-51. */
  valueThresholdAdpPicksEarlier: number;
  /** Survival gap (percentage points) inside which two candidates are "within noise". PRD AS-5 / AC-52. */
  nearTieSurvivalPct: number;
  /** ECR-rank gap inside which two candidates are "within noise". PRD AS-5 / AC-52. */
  nearTieEcrRanks: number;
  /** ECR-rank gap inside which two plan totals are too close to separate. PRD AS-5 / AC-55, AC-58. */
  planTotalTooCloseEcrRanks: number;
  /** How many of the user's own picks the lookahead ever reaches ahead. PRD AS-2 / AC-60. */
  lookaheadMaxPicks: number;

  // ---- Multi-instance and rate limiting (FR-1) ----------------------------------------
  /**
   * Each additional live instance multiplies the poll interval by this factor:
   * `pollIntervalMs * (1 + secondInstanceBackoffFactor * otherLiveInstances)`.
   * **architect-filled** — PRD AS-5 / AC-8 names the back-off but no number.
   */
  secondInstanceBackoffFactor: number;
  /**
   * Ceiling on the reactive back-off applied after an HTTP 429 from Sleeper.
   * **architect-added** — defence in depth alongside the heartbeat mechanism.
   */
  rateLimitBackoffMaxMs: number;

  // ---- Game logs (FR-11) --------------------------------------------------------------
  /**
   * Seasons of nflverse data the offline prep script caches.
   * **architect-filled** — PRD AC-63 says "prior seasons where data exists", no number.
   */
  gamelogSeasonsToCache: number;
}

export const PARAMETER_DEFAULTS: Readonly<ParameterValues> = Object.freeze({
  pollIntervalMs: 1000,
  apiBudgetPerMin: 120,
  initialIngestTimeoutMs: 10_000,
  pickReflectionLatencyMs: 3000,
  resyncTimeoutMs: 5000,

  snapshotStalenessWarningHours: 24,
  adpPoolTeamSizes: Object.freeze([8, 10, 12, 14]),
  snapshotFetchTimeoutMs: 15_000,

  insightRefreshLatencyMs: 5000,
  burstDebounceMs: 400,

  flexEligiblePositions: Object.freeze<SkillPosition[]>(['RB', 'WR', 'TE']),

  tendencyColdStartPicks: 3,
  tendencyPositionalNudgeClamp: 0.5,

  simUniverseSize: 40,
  monteCarloRunCount: 2000,
  reachAdjustmentPerPick: 1,
  survivalBandLikelyGoneMax: 0.25,
  survivalBandLikelyAvailableMin: 0.75,

  candidateListDefaultRows: 8,
  valueThresholdAdpPicksEarlier: 10,
  nearTieSurvivalPct: 5,
  nearTieEcrRanks: 3,
  planTotalTooCloseEcrRanks: 3,
  lookaheadMaxPicks: 2,

  secondInstanceBackoffFactor: 0.5,
  rateLimitBackoffMaxMs: 10_000,

  gamelogSeasonsToCache: 3,
} satisfies ParameterValues);

export type ParameterKey = keyof ParameterValues;

/** Every recognised override key — the allowlist `loadConfig` validates `config.local.json` against. */
export const PARAMETER_KEYS: readonly ParameterKey[] = Object.freeze(
  Object.keys(PARAMETER_DEFAULTS) as ParameterKey[],
);

export const isParameterKey = (key: string): key is ParameterKey =>
  (PARAMETER_KEYS as readonly string[]).includes(key);
