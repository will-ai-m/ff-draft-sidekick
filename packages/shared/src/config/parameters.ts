import type { RankingsFormat } from './rankingsFormat';
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
  /**
   * The rankings format an attach uses when the request names none (2026-09-02): which
   * FantasyPros ECR board and positional tier pages, which FFC ADP pool, and which scoring table
   * a mock's value curves and the pre-draft scoring comparison assume. The attach screen's
   * toggle overrides this per attach, before the draft starts; this is only where that toggle
   * starts. `half_ppr` or `ppr`.
   * **architect-added** — PRD §10 shipped v1 half-PPR only; full PPR is the first second format.
   */
  defaultRankingsFormat: RankingsFormat;
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
   * Positions legally eligible for a FLEX slot. How an unfilled FLEX slot's need weight splits
   * across them is the FLEX share (below), uniform 1/(this length) only when no share is known.
   * PRD §9 Terms (need vector definition).
   */
  flexEligiblePositions: readonly SkillPosition[];
  /**
   * Overrides the FLEX demand share the engine derives at attach (amended 2026-09-02) — one
   * weight per FLEX-eligible position, renormalised to sum 1; a position omitted or at 0 does
   * not flex. `null` derives the share from the league's own scoring curves
   * (`roster/flexDemand.ts`: with the 2026 half-PPR curves a 10-team RB2/WR2/TE1/FLEX1 room
   * comes out RB 0.40 / WR 0.60 / TE 0, matching the FFC market's RB 36 / WR 64 / TE 0), and
   * falls back to the uniform AS-5 split only when no game-log cache exists. Set it to pin a
   * split the curves cannot see — `{ "RB": 0.5, "WR": 0.5 }` declares TE bench-only outright;
   * a TE-premium room the curves under-read can give TE a share here.
   */
  flexShareOverride: Readonly<Partial<Record<SkillPosition, number>>> | null;

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
  /**
   * How many picks before the hard AC-47 deadline a simulated team may start spending picks on
   * K/DST. Within its last `unfilled + this` picks each simulated pick goes to K/DST with the
   * back-weighted chance 🔶 `kdstEarlyPickDecay` sets (1 at the deadline, which is AC-47's
   * original rule); 0 restores the deadline-only model. Default 5 since 2026-09-02 so the
   * observed tail — a first DST taken seven picks out — is reachable; the decay, not the
   * window, is what keeps that tail thin. PRD AS-5 / FR-8 (amended 2026-08-27, 2026-09-02).
   */
  kdstEarlyPickWindow: number;
  /**
   * How a simulated team's K/DST picks spread over its last `unfilled + kdstEarlyPickWindow`
   * picks: the pick `r` from its deadline carries weight `this^(r−1)`, and each pick is spent on
   * K/DST with chance `unfilled × weight(r) / Σ weight(1..r)` (1 at the deadline). 1 restores the
   * 2026-08-27 uniform placement, which put a third of every team's last six picks on K/DST —
   * the rooms on record do not: across the 2026-09-02 league draft and two completed bot-room
   * mocks (30 teams, 57 K/DST picks), 74% of K/DST picks came in the last two rounds and the
   * middle rounds went to skill depth. Default 0.5: least-squares fit of the per-pick marginals
   * (SSE 0.036 vs 0.46 uniform); re-fit against `npm run trace:calibrate` after each rehearsal.
   * PRD AS-5 / FR-8 (amended 2026-09-02).
   */
  kdstEarlyPickDecay: number;
  /**
   * Exponent on the player draw's `1 / effectiveRank` weight: `1 / effectiveRank^this`. 1 was
   * the original AC-42 draw and left "likely available" candidates surviving ~69% vs ~0.91
   * predicted across the 2026-08 rehearsals. Default 1.5 since 2026-08-31: the joint MLE with
   * 🔶 `opponentNeedBlend` over observed opponent skill picks from the 10-team rehearsal
   * drafts (real rooms take the top-3 available at a position ~73% of the time). Re-fit
   * against `npm run trace:calibrate` after each rehearsal.
   */
  drawSharpness: number;
  /**
   * How much a simulated opponent's position choice leans on roster need versus the market.
   * The position is drawn from `(1-this) * marketShare + this * needDist`, where marketShare
   * is each position's share of the cross-position ADP draw weight over what is still
   * available, and needDist is FR-7's tendency-bent need distribution. 0 is pure market, 1 is
   * the pre-2026-08-31 need-proportional draw — which assumed draft-open rooms spend 19% of
   * picks on TE and 14% on QB while the observed rooms spent 7% and 3% (first 30 picks ran
   * 50% RB / 40% WR), making TEs look scarce and RBs look safe. Default 0.45: the joint MLE
   * with 🔶 `drawSharpness` (log-likelihood −750 vs −1319 for need-only on the same picks).
   */
  opponentNeedBlend: number;
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
  /**
   * Projected-points gap (pts/gm) inside which two plan totals are too close to separate.
   * PRD AS-5 / AC-55, AC-58 — replaces `planTotalTooCloseEcrRanks` (amended 2026-08-31: plans
   * score in shaded-curve projected points, not ECR-rank sums).
   */
  planTotalTooClosePoints: number;
  /** How many of the user's own picks the lookahead ever reaches ahead. PRD AS-2 / AC-60. */
  lookaheadMaxPicks: number;
  /**
   * FR-9's endgame guard: when the user's remaining picks are at or below their unfilled K/DST
   * starting slots plus this buffer, the highlight moves to the top available K/DST so a
   * follow-the-highlight user cannot finish with those slots empty. The buffer is slack for
   * ignored recommendations; 0 (the default since 2026-08-28) fills K/DST with exactly the last
   * picks — rehearsal #3 showed the 1-pick buffer costing a bench RB a fully-compliant user
   * never needed insurance for. PRD AS-5 / FR-9 (amended 2026-08-27).
   */
  endgameKdstBufferPicks: number;
  /**
   * The bench phase's roster cap for positions that are NOT FLEX-eligible: once the user's
   * starters are full, such a position stops entering plans or the highlight when the roster
   * already holds `starting slots + this` of it (a 1-QB league caps at 2 QBs). FLEX-eligible
   * positions are never capped — bench depth there always starts. PRD AS-5 / FR-9, FR-10
   * (amended 2026-08-27: the no-need→raw-ECR regime recommended QB3 through QB6 in the mock
   * rehearsal, amplified by AS-8's known QB-vs-market ECR skew reading as repeated "value").
   */
  benchPositionHeadroom: number;

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

  defaultRankingsFormat: 'half_ppr',
  snapshotStalenessWarningHours: 24,
  adpPoolTeamSizes: Object.freeze([8, 10, 12, 14]),
  snapshotFetchTimeoutMs: 15_000,

  insightRefreshLatencyMs: 5000,
  burstDebounceMs: 400,

  flexEligiblePositions: Object.freeze<SkillPosition[]>(['RB', 'WR', 'TE']),
  flexShareOverride: null,

  tendencyColdStartPicks: 3,
  tendencyPositionalNudgeClamp: 0.5,

  simUniverseSize: 40,
  monteCarloRunCount: 2000,
  reachAdjustmentPerPick: 1,
  kdstEarlyPickWindow: 5,
  kdstEarlyPickDecay: 0.5,
  drawSharpness: 1.5,
  opponentNeedBlend: 0.45,
  survivalBandLikelyGoneMax: 0.25,
  survivalBandLikelyAvailableMin: 0.75,

  candidateListDefaultRows: 8,
  valueThresholdAdpPicksEarlier: 10,
  nearTieSurvivalPct: 5,
  nearTieEcrRanks: 3,
  planTotalTooClosePoints: 0.75,
  lookaheadMaxPicks: 2,
  endgameKdstBufferPicks: 0,
  benchPositionHeadroom: 1,

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
