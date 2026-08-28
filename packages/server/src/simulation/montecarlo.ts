/**
 * Monte Carlo survival simulation — FR-8 (AC-42 … AC-48).
 *
 * "Every available candidate carries the probability it survives to the user's next pick — the
 * number that turns a ranking into a decision." The window (FR-6) says which picks stand between
 * the user and their next turn; this module plays those picks out `monteCarloRunCount` times and
 * reports, per candidate, how often they were still on the board at the end.
 *
 * The whole engine is one pure function of `(window, the window's picks, the snapshot, the
 * board, config)`. Nothing accumulates, exactly as FR-5's roster panels, FR-6's opponent panel
 * and FR-7's profiles do not — a projection cannot drift from the board it was built from, so
 * AC-46's "recompute within 5 s of a pick landing" is a question about *when the orchestrator
 * recomputes* (§T10) rather than about any invalidation rule of this module's own.
 *
 * **What one simulated pick does**, per AC-42, in order:
 *
 *  1. **K/DST placement (AC-47, amended 2026-08-27).** If the team's unfilled K/DST starting
 *     slots have caught up with the picks it has left, this pick consumes no skill player at
 *     all. Within the team's last `unfilled + kdstEarlyPickWindow` picks the same thing happens
 *     *probabilistically*, at `unfilled / remaining` — the 08-27 mock-rehearsal trace showed
 *     real rooms drafting K/DST with five and six picks still in hand, which the deadline-only
 *     rule modelled as skill-player demand and so overstated top-board scarcity. Either way it
 *     is never a draw from a K/DST pool — there is no K/DST simulation universe (🔶 AS-7).
 *  2. **The position.** Drawn from the team's FR-7 tendency-bent distribution. A team with **no
 *     bent distribution** is the `NO_NEED_SIGNAL` team (FR-6 publishes none for it): per Terms it
 *     skips the position draw entirely and samples straight from ADP order across QB/RB/WR/TE.
 *  3. **The player.** Drawn from ADP order within that position, weighted `1 / effectiveAdpRank`
 *     and normalised over the players still available *in this run*.
 *
 * **Two formulas here are architect-supplied, not spec text.** The PRD says only "drawn ... from
 * ADP order adjusted by the team's reach profile" (AC-42). design.md §T7 supplies:
 *
 * ```
 * effectiveAdpRank = max(1, adpRankWithinPosition - reachAdjustmentPerPick * team.averageReach)
 * weight           = 1 / effectiveAdpRank,  normalised over the available players
 * ```
 *
 * `reachAdjustmentPerPick` is read from the shared parameter module, never inlined, so tuning it
 * during the PRD §14 mock-rehearsal loop is a config edit. Setting it to 0 disables the reach
 * adjustment entirely and leaves the plain 1/rank draw.
 *
 * **The board seeds the simulation** (see {@link deriveSeed}). SC-2's guardrail — "re-running on an
 * unchanged board moves no player's percentage across a band boundary" — is a claim about what the
 * user sees, and only a deterministic function of the board can honour it; independent sampling
 * flips the band of any player sitting near a threshold, whatever the run count. A new pick changes
 * the universe, and with it the seed, so consecutive boards still draw independent streams.
 *
 * What this module deliberately does not do:
 *
 *  - **It does not re-derive the window.** `computeWindow` (FR-6) already says which picks are
 *    coming and who owns them, traded picks included; a team owning two of them appears twice and
 *    is simulated twice, with no special case here.
 *  - **It does not re-derive ADP order.** `assignSamplingRanks` (FR-4) is the one place AC-26's
 *    "a player with no ADP falls back to ECR order within their position" lives.
 *  - **It does not score plans.** AC-55 is FR-10's job; this module's contract to it is AC-43's
 *    per-run survivor matrix, retained in full rather than collapsed to marginal percentages.
 */

import { SKILL_POSITIONS, isSkillPosition } from '@sidekick/shared';
import type {
  Board,
  DraftWindow,
  ParameterValues,
  Position,
  SkillPosition,
  Survival,
  SurvivalBand,
  TendencyProfile,
  UnfilledStartingSlots,
} from '@sidekick/shared';

import { assignSamplingRanks } from '../snapshots/match';

export type SurvivalConfig = Pick<
  ParameterValues,
  | 'simUniverseSize'
  | 'monteCarloRunCount'
  | 'reachAdjustmentPerPick'
  | 'kdstEarlyPickWindow'
  | 'survivalBandLikelyGoneMax'
  | 'survivalBandLikelyAvailableMin'
>;

/**
 * The shape of a snapshot player this module needs. Declared structurally and narrowly, as FR-4,
 * FR-6 and FR-7 all do: T3's `MatchedPlayer` satisfies it without this module importing the
 * ingestion layer's full vocabulary.
 */
export interface SimulationCandidate {
  sleeperPlayerId: string;
  position: Position;
  /** Overall ECR rank — FantasyPros stays the ordering authority (🔶 AS-8). */
  ecrRank: number;
  /** FFC ADP, or null when the snapshot carries no row for this player (AC-26). */
  adp: number | null;
}

/** One member of the simulation universe (AC-42), in ADP order, K/DST excluded (🔶 AS-7). */
export interface UniversePlayer {
  sleeperPlayerId: string;
  position: SkillPosition;
  ecrRank: number;
  adp: number | null;
  /** Column offset into {@link SurvivalProjection.survivors}. */
  index: number;
  /** 1-based ADP order across the whole available skill board (AC-26's rule). */
  samplingRank: number;
  /** True when this player is in the universe only because `ensureIncluded` named them (AC-42). */
  addedForDisplay: boolean;
}

/** One pick of the window, reduced to everything a simulated draw needs to know about it. */
export interface SimulatedPick {
  pickNo: number;
  teamId: string;
  /**
   * FR-7's tendency-bent position weights (AC-40). **Absent** is meaningful, not missing data: it
   * is exactly the `NO_NEED_SIGNAL` team, which Terms says drafts best available from ADP order.
   */
  bentDistribution?: Record<Position, number>;
  /** FR-7's mean of (ADP − pick number); 0 for a team whose reach was never observed (AC-38). */
  averageReach: number;
  /** Unfilled dedicated K + DST starting slots (AC-47). */
  unfilledKDstSlots: number;
  /** Picks this team still owns **in the draft**, counting this one (AC-47). */
  remainingPicks: number;
}

/** FR-6/FR-7's enriched panel row, narrowed to what {@link toSimulatedPicks} reads off it. */
export interface EnrichedPanelRow {
  pickNo: number;
  teamId: string;
  bentDistribution?: Record<Position, number>;
  tendencyProfile?: Pick<TendencyProfile, 'averageReach'>;
  unfilledStartingSlots: UnfilledStartingSlots;
  remainingPicks: number;
}

/**
 * One simulated pick per enriched panel row, in window order.
 *
 * FR-7's `applyTendencyProfiles` returns one row per window pick and preserves their order, so
 * this is a straight projection — the only judgement in it is that a row with no
 * `tendencyProfile` reads as a neutral prior (reach 0), which is the identity for the draw below.
 */
export function toSimulatedPicks(rows: readonly EnrichedPanelRow[]): SimulatedPick[] {
  return rows.map((row) => ({
    pickNo: row.pickNo,
    teamId: row.teamId,
    ...(row.bentDistribution === undefined ? {} : { bentDistribution: row.bentDistribution }),
    averageReach: row.tendencyProfile?.averageReach ?? 0,
    unfilledKDstSlots: row.unfilledStartingSlots.dedicated.K + row.unfilledStartingSlots.dedicated.DST,
    remainingPicks: row.remainingPicks,
  }));
}

// ---------------------------------------------------------------------------------------------
// The simulation universe (AC-42)
// ---------------------------------------------------------------------------------------------

export interface BuildSimulationUniverseInput {
  /** The matched snapshot (T3), immutable for this draft's lifetime (AC-29). */
  players: readonly SimulationCandidate[];
  /** The board, read only to exclude the players it already shows drafted. */
  board: Pick<Board, 'players'>;
  /** 🔶 `simUniverseSize` — the cutoff before the display extension below. */
  size: number;
  /**
   * Player ids that must be in the universe even if they fall outside the cutoff — AC-42's
   * "extended to cover every player displayed in a skill-position candidate-list row". FR-9 calls
   * this with its own row set; a K, a DST or an already-drafted player is never admitted by it.
   */
  ensureIncluded?: Iterable<string>;
}

/**
 * The top `size` available players in ADP order, extended to cover every displayed row (AC-42).
 *
 * The ordering rule is FR-4's, imported rather than re-derived: players carrying an ADP rank by
 * ADP, and a player with none takes their ECR order within the group (AC-26). K and DST are
 * excluded by construction, not filtered later (🔶 AS-7), which is what makes "no K/DST
 * simulation universe to draw from" true of the data structure rather than of a code path.
 */
export function buildSimulationUniverse(input: BuildSimulationUniverseInput): UniversePlayer[] {
  const available = input.players.filter(
    (player): player is SimulationCandidate & { position: SkillPosition } =>
      isSkillPosition(player.position) &&
      input.board.players[player.sleeperPlayerId]?.drafted !== true,
  );

  const ranked = assignSamplingRanks(available);
  const withinCutoff = new Set(
    ranked.slice(0, Math.max(0, input.size)).map((player) => player.sleeperPlayerId),
  );
  const required = new Set(input.ensureIncluded ?? []);

  return ranked
    .filter(
      (player) =>
        withinCutoff.has(player.sleeperPlayerId) || required.has(player.sleeperPlayerId),
    )
    .map((player, index) => ({
      sleeperPlayerId: player.sleeperPlayerId,
      position: player.position,
      ecrRank: player.ecrRank,
      adp: player.adp,
      index,
      samplingRank: player.samplingRank,
      addedForDisplay: !withinCutoff.has(player.sleeperPlayerId),
    }));
}

// ---------------------------------------------------------------------------------------------
// The K/DST saturation rule (AC-47)
// ---------------------------------------------------------------------------------------------

/**
 * Which window picks consume no skill player, one flag per pick in window order (AC-47).
 *
 * A team whose unfilled K/DST starting slots have caught up with the picks it has left must spend
 * this one on a kicker or a defense, so it takes nobody out of the skill-player pool. Both
 * counters walk down as the window advances, so a team with one open K slot and three picks left
 * drafts skill players twice and saturates only on the third.
 *
 * **"Remaining picks" is draft-wide, counting this pick** — the reading AC-47's own rationale
 * requires ("so late-round K/DST demand does not inflate apparent skill-player scarcity") and the
 * one FR-6 already publishes on every panel row. design.md §T7 names the field
 * `remainingPicksInWindowIncludingThis`; taken literally that would saturate every seat in every
 * early-round window — two rounds into a draft each seat has an open K and DST slot and owns one
 * pick inside a ten-pick window, so `2 >= 1` fires for all of them and no player is ever drafted
 * in any run. Flagged in this task's dev notes rather than implemented as written.
 *
 * Nothing here is random, so it is computed once per recompute rather than once per run.
 */
export function planKDstSaturation(picks: readonly SimulatedPick[]): boolean[] {
  const unfilledByTeam = new Map<string, number>();
  const remainingByTeam = new Map<string, number>();

  return picks.map((pick) => {
    const unfilled = unfilledByTeam.get(pick.teamId) ?? pick.unfilledKDstSlots;
    const remaining = remainingByTeam.get(pick.teamId) ?? pick.remainingPicks;
    const saturated = unfilled > 0 && unfilled >= remaining;

    unfilledByTeam.set(pick.teamId, saturated ? unfilled - 1 : unfilled);
    remainingByTeam.set(pick.teamId, remaining - 1);
    return saturated;
  });
}

/**
 * The probability one simulated pick is spent on K/DST (AC-47 as amended 2026-08-27).
 *
 * A uniform-placement model: a team that must spend `unfilled` of its `remaining` picks on
 * K/DST, and is inside its last `unfilled + earlyWindow` picks, is treated as placing those
 * K/DST picks uniformly among what it has left — so the chance this particular pick is one of
 * them is `unfilled / remaining`. At the deadline (`remaining <= unfilled`) that reaches 1,
 * which is exactly the original hard saturation rule; outside the window it is 0, so an early-
 * round pick never goes to a kicker. 🔶 `kdstEarlyPickWindow` = 0 restores deadline-only.
 *
 * Calibration evidence for the window's existence: the 2026-08-27 mock trace shows nine seats
 * taking their first DST with four to six picks still in hand, which the deadline-only model
 * scored as skill-player demand — one measured source of the projection's survival pessimism.
 */
export function kdstPickChance(unfilled: number, remaining: number, earlyWindow: number): number {
  if (unfilled <= 0) return 0;
  if (remaining <= unfilled) return 1;
  if (remaining > unfilled + Math.max(0, earlyWindow)) return 0;
  return unfilled / remaining;
}

// ---------------------------------------------------------------------------------------------
// Randomness
// ---------------------------------------------------------------------------------------------

/**
 * A seeded uniform generator (mulberry32) — reproducible, and fast enough to be irrelevant to the
 * latency budget.
 */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

const hashText = (hash: number, text: string): number => {
  let next = hash;
  for (let i = 0; i < text.length; i += 1) {
    next = Math.imul(next ^ text.charCodeAt(i), FNV_PRIME);
  }
  return next >>> 0;
};

const hashNumber = (hash: number, value: number): number => hashText(hash, `${value}\0`);

/**
 * The default seed: a 32-bit FNV-1a over everything a run of this simulation reads.
 *
 * **This is what makes SC-2's stability guardrail true** — "re-running on an unchanged board moves
 * no player's percentage across a band boundary". Sampling independently cannot deliver that, and
 * no run count can be bought to fix it: a player whose true survival sits a hair from a threshold
 * lands on either side of it from one sample to the next, and on any real board somebody always
 * does. The 40-player fixture in this module's stability test has one at ≈0.7524 against the 0.75
 * boundary, with a standard error at 🔶 `monteCarloRunCount` of ≈0.0097 — two independent samples
 * disagree on his band about half the time, and did, which is what sent this design here.
 *
 * So the board decides the stream. Identical inputs replay identical draws and the displayed
 * percentage cannot move while nothing has happened; the moment a pick lands, the universe changes
 * and the seed with it, so successive boards get independent samples rather than one stream's
 * quirks riding along all draft. It also makes any projection a user saw reproducible from the
 * board alone, which is worth having when a survival number is ever disputed.
 *
 * Hashed over exactly the inputs the draw consumes — the universe in sampling order, each pick's
 * team/reach/K-DST/remaining-picks and bent weights over the skill positions, and the two config
 * values that change a draw. Bands are not hashed: they colour the result, they do not sample it.
 */
export function deriveSeed(
  universe: readonly UniversePlayer[],
  picks: readonly SimulatedPick[],
  config: Pick<
    SurvivalConfig,
    'monteCarloRunCount' | 'reachAdjustmentPerPick' | 'kdstEarlyPickWindow'
  >,
): number {
  let hash = hashNumber(FNV_OFFSET_BASIS, config.monteCarloRunCount);
  hash = hashNumber(hash, config.reachAdjustmentPerPick);
  hash = hashNumber(hash, config.kdstEarlyPickWindow);

  for (const player of universe) {
    hash = hashText(hash, `${player.sleeperPlayerId}\0${player.position}\0`);
    hash = hashNumber(hash, player.samplingRank);
  }

  for (const pick of picks) {
    hash = hashText(hash, `${pick.teamId}\0`);
    hash = hashNumber(hash, pick.pickNo);
    hash = hashNumber(hash, pick.averageReach);
    hash = hashNumber(hash, pick.unfilledKDstSlots);
    hash = hashNumber(hash, pick.remainingPicks);
    if (pick.bentDistribution === undefined) {
      hash = hashText(hash, 'no-need-signal\0');
    } else {
      for (const position of SKILL_POSITIONS) {
        hash = hashNumber(hash, pick.bentDistribution[position]);
      }
    }
  }

  return hash >>> 0;
}

// ---------------------------------------------------------------------------------------------
// Bands (AC-44)
// ---------------------------------------------------------------------------------------------

export type SurvivalBandConfig = Pick<
  ParameterValues,
  'survivalBandLikelyGoneMax' | 'survivalBandLikelyAvailableMin'
>;

/**
 * AC-44's three bands: "likely gone (<25%), coin flip, likely available (>75%)".
 *
 * The comparisons are **strict**, following the AC's own wording rather than the `Max`/`Min`
 * suffixes on the two parameter names, which read as inclusive. The two readings differ only on a
 * percentage that lands exactly on a threshold, and the spec is the authority there.
 */
export function survivalBand(probability: number, config: SurvivalBandConfig): SurvivalBand {
  if (probability < config.survivalBandLikelyGoneMax) return 'likely-gone';
  if (probability > config.survivalBandLikelyAvailableMin) return 'likely-available';
  return 'coin-flip';
}

// ---------------------------------------------------------------------------------------------
// The projection
// ---------------------------------------------------------------------------------------------

export interface SurvivalProjection {
  /**
   * True when the user has no pick after the current one (AC-45). Survival is then **absent**,
   * not zero: a 0% would read as "certainly gone" rather than "nothing to survive to".
   */
  suppressed: boolean;
  /** The board's degraded flag, carried onto every survival output (AC-48). */
  degraded: boolean;
  runCount: number;
  /** The simulated players, in ADP order; `index` is each one's column below. */
  universe: UniversePlayer[];
  /**
   * AC-43's per-run survivor sets: `runCount × universe.length`, row-major by run, 1 = the player
   * was still available at the end of that run.
   *
   * Retained in full rather than collapsed to the marginal percentages, because FR-10's plan
   * scoring (AC-55) needs the *joint* outcome — "the best surviving rank at this position in this
   * run" — which marginal percentages combined as if independent cannot reconstruct. FR-10 reads
   * it as `survivedInRun(projection, run, playerId)` over `universe` filtered to its position.
   */
  survivors: Uint8Array;
  /** Marginal survival plus band per player id (AC-44). Empty while suppressed. */
  survivalByPlayerId: Map<string, Survival>;
  /** Universe column offset per player id. */
  indexByPlayerId: Map<string, number>;
}

/** A player's survival, or null when they are outside the universe or survival is suppressed. */
export function survivalFor(projection: SurvivalProjection, playerId: string): Survival | null {
  return projection.survivalByPlayerId.get(playerId) ?? null;
}

/** Whether one player was still available at the end of one run (AC-43). */
export function survivedInRun(
  projection: SurvivalProjection,
  run: number,
  playerId: string,
): boolean {
  const index = projection.indexByPlayerId.get(playerId);
  if (index === undefined) return false;
  if (!Number.isInteger(run) || run < 0 || run >= projection.runCount) return false;
  return projection.survivors[run * projection.universe.length + index] === 1;
}

export interface SimulateSurvivalInput {
  /** FR-6's window. Only `nextUserPickNo` is read: null is AC-45's suppression trigger. */
  window: DraftWindow;
  /**
   * One entry per `window.picks`, in the same order — `toSimulatedPicks(enrichedPanelRows)`. A
   * mismatched length is a wiring bug that would silently mis-state survival, so it throws.
   */
  picks: readonly SimulatedPick[];
  players: readonly SimulationCandidate[];
  board: Pick<Board, 'players'>;
  config: SurvivalConfig;
  /** AC-42's display extension — FR-9's candidate rows. */
  ensureIncluded?: Iterable<string>;
  /** FR-3's degraded flag, echoed onto the projection (AC-48). */
  degraded?: boolean;
  /** Overrides the seed the board would derive — see {@link deriveSeed}. Tests pin it; T10 does not. */
  seed?: number;
  /** A generator to use outright; takes precedence over `seed`. Tests inject determinism with it. */
  random?: () => number;
}

const suppressedProjection = (degraded: boolean): SurvivalProjection => ({
  suppressed: true,
  degraded,
  runCount: 0,
  universe: [],
  survivors: new Uint8Array(0),
  survivalByPlayerId: new Map(),
  indexByPlayerId: new Map(),
});

/**
 * Draws a position from the team's bent weights, restricted to positions that still have somebody
 * available in this run and renormalised over them.
 *
 * K and DST are given no mass whatever the caller passes (🔶 AS-7). Returns null when no position
 * carrying mass has anyone left, which sends the pick to the best-available draw instead of
 * spending it on nothing.
 */
function drawPosition(
  distribution: Record<Position, number>,
  availableByPosition: Record<SkillPosition, number>,
  random: () => number,
): SkillPosition | null {
  let total = 0;
  for (const position of SKILL_POSITIONS) {
    if (availableByPosition[position] > 0) total += Math.max(0, distribution[position]);
  }
  if (!(total > 0)) return null;

  let target = random() * total;
  let last: SkillPosition | null = null;
  for (const position of SKILL_POSITIONS) {
    if (availableByPosition[position] <= 0) continue;
    const weight = Math.max(0, distribution[position]);
    if (weight <= 0) continue;
    last = position;
    target -= weight;
    if (target <= 0) return position;
  }
  // Only reachable through floating-point slop at the very top of the range.
  return last;
}

/**
 * Draws one player from a pool, weighted `1 / max(1, rank - reach)` over the players still
 * available in this run (AC-42). Returns the universe index, or -1 when the pool is empty.
 *
 * The rank is recomputed over what is *available*, not read off the snapshot's precomputed order:
 * once the players ahead of someone are off the board, his place in what remains moves up with
 * them, which is the same rule FR-6 applies to its example players. Reading a static rank instead
 * would flatten every position's weights as the board thinned, quietly weakening the
 * best-available pull exactly when a run has consumed the most players.
 */
function drawPlayer(
  pool: Int32Array,
  available: Uint8Array,
  reach: number,
  random: () => number,
): number {
  let total = 0;
  let rank = 0;
  for (let i = 0; i < pool.length; i += 1) {
    const index = pool[i]!;
    if (available[index] !== 1) continue;
    rank += 1;
    total += 1 / Math.max(1, rank - reach);
  }
  if (!(total > 0)) return -1;

  let target = random() * total;
  let last = -1;
  rank = 0;
  for (let i = 0; i < pool.length; i += 1) {
    const index = pool[i]!;
    if (available[index] !== 1) continue;
    rank += 1;
    last = index;
    target -= 1 / Math.max(1, rank - reach);
    if (target <= 0) return index;
  }
  return last;
}

/**
 * The survival projection for the current window (FR-8).
 *
 * Cost is `runCount × window.length` draws over a universe bounded by `simUniverseSize`, which is
 * what keeps AC-46's 5 s budget comfortable; those two parameters are the knobs to turn down
 * first if a machine ever misses it (see the benchmark in this module's test file).
 */
export function simulateSurvival(input: SimulateSurvivalInput): SurvivalProjection {
  const { picks, config } = input;
  const degraded = input.degraded === true;

  if (picks.length !== input.window.picks.length) {
    throw new Error(
      `simulateSurvival: ${picks.length} simulated picks for a window of ${input.window.picks.length} — ` +
        'the picks must be this window\'s own rows, in order',
    );
  }
  // Nothing to survive to: AC-45 suppresses rather than reporting zeroes.
  if (input.window.nextUserPickNo === null) return suppressedProjection(degraded);

  const universe = buildSimulationUniverse({
    players: input.players,
    board: input.board,
    size: config.simUniverseSize,
    ...(input.ensureIncluded === undefined ? {} : { ensureIncluded: input.ensureIncluded }),
  });
  const size = universe.length;
  const runCount = Math.max(1, Math.trunc(config.monteCarloRunCount));

  // Pools, in the order a draw walks them: within a position for the need-driven regime, across
  // the board for the best-available one. Both are ADP order (AC-26), computed once.
  const positionPools: Record<SkillPosition, Int32Array> = {
    QB: new Int32Array(0),
    RB: new Int32Array(0),
    WR: new Int32Array(0),
    TE: new Int32Array(0),
  };
  const initialByPosition: Record<SkillPosition, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
  for (const position of SKILL_POSITIONS) {
    const group = assignSamplingRanks(universe.filter((player) => player.position === position));
    positionPools[position] = Int32Array.from(group, (player) => player.index);
    initialByPosition[position] = group.length;
  }
  const allPool = Int32Array.from(universe, (player) => player.index);
  const positionByIndex = universe.map((player) => player.position);

  // K/DST placement (AC-47 as amended). With an early window the walk is stochastic and
  // per-run — whether pick N went to a kicker changes whether pick N+3 must — so the counters
  // live inside the run loop; with the window at 0 the deterministic deadline plan is
  // precomputed once, exactly as before the amendment. Deterministic outcomes (chance 0 or 1)
  // never consume randomness, so a window-less draw replays the identical stream.
  const earlyWindow = config.kdstEarlyPickWindow;
  const saturatedPlan = earlyWindow > 0 ? null : planKDstSaturation(picks);
  const teamIds = [...new Set(picks.map((pick) => pick.teamId))];
  const teamIndexByStep = Int32Array.from(picks, (pick) => teamIds.indexOf(pick.teamId));
  const initialUnfilled = Int32Array.from(
    teamIds,
    (id) => picks.find((pick) => pick.teamId === id)!.unfilledKDstSlots,
  );
  const initialRemaining = Int32Array.from(
    teamIds,
    (id) => picks.find((pick) => pick.teamId === id)!.remainingPicks,
  );
  const unfilledInRun = new Int32Array(teamIds.length);
  const remainingInRun = new Int32Array(teamIds.length);

  // The board seeds itself unless a caller overrides it — see `deriveSeed` for why that is the
  // simulation's contract with SC-2 rather than a testing convenience.
  const random =
    input.random ?? createSeededRandom(input.seed ?? deriveSeed(universe, picks, config));

  const survivors = new Uint8Array(runCount * size);
  const availableInRun = new Uint8Array(size);
  const availableByPosition: Record<SkillPosition, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };

  for (let run = 0; run < runCount; run += 1) {
    availableInRun.fill(1);
    let poolLeft = size;
    for (const position of SKILL_POSITIONS) {
      availableByPosition[position] = initialByPosition[position];
    }
    unfilledInRun.set(initialUnfilled);
    remainingInRun.set(initialRemaining);

    for (let step = 0; step < picks.length && poolLeft > 0; step += 1) {
      if (saturatedPlan !== null) {
        if (saturatedPlan[step] === true) continue;
      } else {
        const team = teamIndexByStep[step]!;
        const remaining = remainingInRun[team]!;
        remainingInRun[team] = remaining - 1;
        const chance = kdstPickChance(unfilledInRun[team]!, remaining, earlyWindow);
        if (chance >= 1 || (chance > 0 && random() < chance)) {
          unfilledInRun[team] = unfilledInRun[team]! - 1;
          continue; // Spent on K/DST — no skill player leaves the board (🔶 AS-7).
        }
      }

      const pick = picks[step]!;
      const reach = config.reachAdjustmentPerPick * pick.averageReach;

      let chosen = -1;
      if (pick.bentDistribution !== undefined) {
        const position = drawPosition(pick.bentDistribution, availableByPosition, random);
        if (position !== null) {
          chosen = drawPlayer(positionPools[position], availableInRun, reach, random);
        }
      }
      // Both the no-need-signal regime (Terms) and a need the board can no longer fill land here.
      if (chosen < 0) chosen = drawPlayer(allPool, availableInRun, reach, random);
      if (chosen < 0) break;

      availableInRun[chosen] = 0;
      availableByPosition[positionByIndex[chosen]!] -= 1;
      poolLeft -= 1;
    }

    survivors.set(availableInRun, run * size);
  }

  const survivedRuns = new Float64Array(size);
  for (let run = 0; run < runCount; run += 1) {
    const base = run * size;
    for (let i = 0; i < size; i += 1) survivedRuns[i]! += survivors[base + i]!;
  }

  const survivalByPlayerId = new Map<string, Survival>();
  const indexByPlayerId = new Map<string, number>();
  for (const player of universe) {
    const probability = survivedRuns[player.index]! / runCount;
    survivalByPlayerId.set(player.sleeperPlayerId, {
      probability,
      band: survivalBand(probability, config),
    });
    indexByPlayerId.set(player.sleeperPlayerId, player.index);
  }

  return {
    suppressed: false,
    degraded,
    runCount,
    universe,
    survivors,
    survivalByPlayerId,
    indexByPlayerId,
  };
}
