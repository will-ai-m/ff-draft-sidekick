/**
 * Within-draft tendency profiles — FR-7 (AC-38, AC-39, AC-40, AC-41).
 *
 * "Each opponent's observed drafting behavior sharpens predictions about them — learned live,
 * from this draft only." Three running stats per team (AC-38), neutral priors until the team has
 * shown enough of itself (AC-39), a bend of FR-6's displayed likelihoods that becomes FR-8's
 * sampling distribution (AC-40), and nothing that outlives the attach (AC-41).
 *
 * Two shapes of thing live here, deliberately separated:
 *
 *  - **Pure functions** — `computeTendencyProfile`, `computeBpaDistribution`, `bendDistribution`,
 *    `applyTendencyProfiles`. Every number FR-7 produces is a projection of `(the board's pick
 *    feed, the league's settings, the snapshot)`, so a profile can no more drift from the picks
 *    it was built from than FR-5's roster panel or FR-6's opponent panel can. Nothing accumulates.
 *  - **{@link TendencyProfileTracker}** — a per-attach holder that memoises those projections
 *    against `BoardSync`'s `boardVersion` and can be told to throw them away (AC-41).
 *
 * **The bending formula is architect-supplied, not spec text.** The PRD says only that the panel
 * "bends that team's displayed position likelihoods by its profile" (AC-40); design.md §T6
 * supplies the formula below and flags it as a first cut meant to be tuned during the PRD §14
 * mock-rehearsal loop. Both knobs it uses — `tendencyColdStartPicks` and
 * `tendencyPositionalNudgeClamp` — are read from the shared parameter module, never inlined, so
 * tuning it is a config edit rather than a code change.
 *
 * What this module deliberately does not do:
 *
 *  - **It does not reimplement the need vector or the fill model.** "Filled a then-unfilled
 *    starting slot" is answered by `computeUnfilledStartingSlots` from `@sidekick/shared`, the
 *    same function FR-5's roster panel and FR-6's need vectors are built on, so "filled" means
 *    one thing across the whole feature.
 *  - **It does not decide which teams to profile.** FR-6's `computeWindow` already says which
 *    picks are coming and who owns them; `applyTendencyProfiles` enriches exactly the rows
 *    `buildOpponentPanel` returned. A window never contains one of the user's own picks, so
 *    "opponents only" needs no guard here — the profile math itself is per-team and would answer
 *    for any seat that were asked.
 *  - **It does not record an observability sample.** AC-40's refresh rides the same burst-settled
 *    recompute cascade as AC-35/AC-46, which design.md §T10 instruments once for all of them.
 */

import {
  POSITIONS,
  PARAMETER_DEFAULTS,
  SKILL_POSITIONS,
  computeUnfilledStartingSlots,
  isSkillPosition,
} from '@sidekick/shared';
import type {
  Board,
  FlexEligiblePositions,
  OpponentPanelEntry,
  ParameterValues,
  PickFeedEntry,
  Position,
  SlotConfig,
  TendencyProfile,
} from '@sidekick/shared';

import type { PositionResolver } from '../roster/needvectors';
import type { BoardSync } from '../sleeper/sync';

const zeroByPosition = (): Record<Position, number> => ({
  QB: 0,
  RB: 0,
  WR: 0,
  TE: 0,
  K: 0,
  DST: 0,
});

const clamp = (value: number, bound: number): number => Math.min(bound, Math.max(-bound, value));

// ---------------------------------------------------------------------------------------------
// The league baseline
// ---------------------------------------------------------------------------------------------

/**
 * The league's starting-slot proportions — the baseline a team's positional counts are read
 * against (AC-38).
 *
 * Each position's share is its own dedicated starting slots over the league's total starting
 * slots, FLEX included in that total. design.md §T6 states this arithmetic outright: "a 10-team
 * league with 2 starting RB slots per team out of 9 total starters has an expected RB share of
 * 2/9".
 *
 * Note the consequence, which is deliberate rather than overlooked: the FLEX slot belongs to no
 * single position, so these shares sum to slightly under 1 in any league that has one. That
 * leaves every δ in {@link bendDistribution} carrying the same small positive offset, which the
 * renormalisation at the end of the bend absorbs. Spreading the FLEX across the eligible
 * positions the way the need vector does is the obvious alternative; it is a one-line change
 * here if the §14 rehearsal loop shows this reads wrong.
 *
 * Bench slots are excluded: a bench pick expresses no positional requirement.
 */
export function computeExpectedPositionalShare(slots: SlotConfig): Record<Position, number> {
  const share = zeroByPosition();
  const total = POSITIONS.reduce((sum, position) => sum + slots[position], 0) + slots.FLEX;
  if (total <= 0) return share;

  for (const position of POSITIONS) {
    share[position] = slots[position] / total;
  }
  return share;
}

/**
 * The profile a team gets before it has shown enough of itself to have one (AC-39).
 *
 * Neutral in every term design.md §T6 names: no reach, need-driven (`needAdherence` 1, so the
 * bend leaves FR-6's displayed likelihoods exactly where they were), and positional counts equal
 * to the league baseline, so the nudge is the identity. `pickCount` still reports the truth — the
 * profile is neutral, the count is a fact, and the UI needs it to say "1 of 3 picks seen".
 */
export function neutralTendencyProfile(
  teamId: string,
  slots: SlotConfig,
  pickCount = 0,
): TendencyProfile {
  const expectedPositionalShare = computeExpectedPositionalShare(slots);
  return {
    teamId,
    pickCount,
    averageReach: 0,
    reachSampleCount: 0,
    needAdherence: 1,
    observedPositionalShare: { ...expectedPositionalShare },
    expectedPositionalShare,
    confidence: 'early',
  };
}

// ---------------------------------------------------------------------------------------------
// The three running stats (AC-38)
// ---------------------------------------------------------------------------------------------

export interface TendencyProfileInput {
  teamId: string;
  /** Slot structure from the draft object's own settings — never a hardcoded shape (AC-30). */
  slots: SlotConfig;
  /** The whole board's pick feed; this team's own picks are selected out of it here. */
  pickFeed: readonly PickFeedEntry[];
  /**
   * The player's FFC ADP from the matched snapshot, or null when the snapshot carries none
   * (AC-26). Typically `matching.byPlayerId.get(id)?.adp ?? null`.
   */
  adpFor: (playerId: string) => number | null;
  /** 🔶 AS-2 `tendencyColdStartPicks` (AC-39). */
  coldStartPicks: number;
  /** 🔶 AS-5 `flexEligiblePositions`; callers holding a loaded config pass that config's value. */
  flexEligiblePositions?: FlexEligiblePositions;
  /** Looks a position up for a pick whose metadata carried none, as FR-5's panel does. */
  resolvePosition?: PositionResolver;
}

/**
 * One team's tendency profile, replayed from the board's own pick feed (AC-38).
 *
 * The replay is the point. Need-adherence asks whether each pick "filled a *then*-unfilled
 * starting slot", so the roster it is judged against is rebuilt pick by pick — a team's first
 * three picks can every one of them be need-fits even though the final roster shows the position
 * over-filled. Scoring against the finished roster would systematically under-report exactly the
 * need-driven teams the profile exists to spot.
 *
 * Two kinds of pick are counted for some stats and not others, rather than being scored as zero:
 *
 *  - **A player with no ADP** (AC-26) contributes no reach observation — a reach of zero would
 *    read as "took him at market", which is not what "we don't know where the market had him"
 *    means. `reachSampleCount` reports how many observations there really were.
 *  - **A pick whose position never resolved** can be judged neither for need-adherence nor for
 *    positional share, so it leaves both denominators. It still counts toward `pickCount`, which
 *    is a count of picks made, not of picks understood.
 */
export function computeTendencyProfile(input: TendencyProfileInput): TendencyProfile {
  const { teamId, slots, coldStartPicks } = input;
  const flexEligible = input.flexEligiblePositions ?? PARAMETER_DEFAULTS.flexEligiblePositions;
  const options =
    input.flexEligiblePositions === undefined
      ? {}
      : { flexEligiblePositions: input.flexEligiblePositions };

  const teamPicks = input.pickFeed
    .filter((pick) => pick.teamId === teamId)
    .sort((a, b) => a.pickNo - b.pickNo);

  // The roster as of just before the pick being judged, rebuilt as the replay walks forward.
  const counts = zeroByPosition();
  let reachTotal = 0;
  let reachSampleCount = 0;
  let needFittingPicks = 0;
  let positionedPicks = 0;

  for (const pick of teamPicks) {
    const adp = input.adpFor(pick.playerId);
    if (adp !== null) {
      reachTotal += adp - pick.pickNo;
      reachSampleCount += 1;
    }

    const position = pick.position ?? input.resolvePosition?.(pick.playerId) ?? null;
    if (position === null) continue;

    const unfilled = computeUnfilledStartingSlots(slots, counts, options);
    const filledANeed =
      unfilled.dedicated[position] > 0 ||
      (unfilled.flex > 0 && (flexEligible as readonly Position[]).includes(position));

    positionedPicks += 1;
    if (filledANeed) needFittingPicks += 1;
    counts[position] += 1;
  }

  const pickCount = teamPicks.length;
  if (pickCount < coldStartPicks) return neutralTendencyProfile(teamId, slots, pickCount);

  const expectedPositionalShare = computeExpectedPositionalShare(slots);
  const observedPositionalShare = zeroByPosition();
  if (positionedPicks > 0) {
    for (const position of POSITIONS) {
      observedPositionalShare[position] = counts[position] / positionedPicks;
    }
  } else {
    Object.assign(observedPositionalShare, expectedPositionalShare);
  }

  return {
    teamId,
    pickCount,
    averageReach: reachSampleCount === 0 ? 0 : reachTotal / reachSampleCount,
    reachSampleCount,
    needAdherence: positionedPicks === 0 ? 1 : needFittingPicks / positionedPicks,
    observedPositionalShare,
    expectedPositionalShare,
    confidence: 'established',
  };
}

// ---------------------------------------------------------------------------------------------
// The best-player-available distribution the bend blends against
// ---------------------------------------------------------------------------------------------

/**
 * The shape of a snapshot player this module needs. Declared structurally and narrowly, as FR-4
 * and FR-6 both do: T3's `MatchedPlayer` satisfies it without this module importing the
 * ingestion layer's full vocabulary.
 */
export interface BpaCandidate {
  sleeperPlayerId: string;
  position: Position;
  /** Overall ECR rank — FantasyPros stays the ordering authority (🔶 AS-8). */
  ecrRank: number;
}

/**
 * Probability mass on each skill position proportional to `1 / best available ECR rank there`,
 * renormalised to sum 1 — the "drafts the best player on the board" pole the bend blends toward.
 *
 * One board-wide distribution serves every row of the panel: it describes what the board looks
 * like *now*, and how it thins out as the window's earlier picks land is the simulation's job to
 * model per run (FR-8), not the panel's to guess at.
 *
 * K and DST are given no mass at all, however early they rank (🔶 AS-7). Returns null when no
 * skill player is available at all, so the caller branches rather than dividing by zero.
 */
export function computeBpaDistribution(
  players: readonly BpaCandidate[],
  board: Pick<Board, 'players'>,
): Record<Position, number> | null {
  const bestRank = new Map<Position, number>();
  for (const player of players) {
    if (!isSkillPosition(player.position)) continue;
    if (board.players[player.sleeperPlayerId]?.drafted === true) continue;
    if (!(player.ecrRank > 0)) continue;

    const current = bestRank.get(player.position);
    if (current === undefined || player.ecrRank < current)
      bestRank.set(player.position, player.ecrRank);
  }

  const weights = zeroByPosition();
  let total = 0;
  for (const position of SKILL_POSITIONS) {
    const rank = bestRank.get(position);
    if (rank === undefined) continue;
    weights[position] = 1 / rank;
    total += weights[position];
  }
  if (total <= 0) return null;

  for (const position of SKILL_POSITIONS) {
    weights[position] /= total;
  }
  return weights;
}

// ---------------------------------------------------------------------------------------------
// The bend (AC-40)
// ---------------------------------------------------------------------------------------------

export interface BendDistributionInput {
  /** FR-6's sum-1 need distribution (AC-36), or null for a no-need-signal team. */
  needDistribution: Record<Position, number> | null;
  /** {@link computeBpaDistribution}'s output; null falls the blend back to need alone. */
  bpaDistribution: Record<Position, number> | null;
  profile: TendencyProfile;
  /** 🔶 `tendencyPositionalNudgeClamp` — the bound on the observed-vs-expected nudge. */
  nudgeClamp: number;
}

/**
 * FR-6's displayed likelihoods bent by the team's profile — the weights FR-8 samples a position
 * from (AC-40). Architect-supplied formula (design.md §T6), in two steps:
 *
 * ```
 * blended[pos] = a * needDist[pos] + (1 - a) * bpaDist[pos]      // a = the team's need-adherence
 * δ[pos]       = clamp(observedShare[pos] - expectedShare[pos], ±tendencyPositionalNudgeClamp)
 * bent[pos]    = blended[pos] * (1 + δ[pos]),  renormalised to sum 1
 * ```
 *
 * A neutral profile (`a = 1`, `δ = 0`) therefore returns FR-6's distribution unchanged, which is
 * exactly what AC-39's cold start should mean: a team we have learned nothing about is predicted
 * from its needs alone.
 *
 * **Returns null for a no-need-signal team.** Per Terms such a team drafts best-available from
 * ADP order — a different regime, which FR-8 branches into rather than sampling a position at
 * all. Publishing a distribution for it would dress that regime up as a position prediction, the
 * same reason FR-6 leaves its `needDistribution` null. Its profile is still computed and still
 * matters: the reach half of it adjusts FR-8's player draw either way.
 *
 * The team's average reach is deliberately absent from this formula. Reach is a statement about
 * *which player* a team takes within a position (FR-8's `reachAdjustmentPerPick` weighting), not
 * about which position they take.
 */
export function bendDistribution(input: BendDistributionInput): Record<Position, number> | null {
  const { needDistribution, bpaDistribution, profile } = input;
  if (needDistribution === null) return null;

  const adherence = Math.min(1, Math.max(0, profile.needAdherence));

  const blended = zeroByPosition();
  let blendedTotal = 0;
  for (const position of POSITIONS) {
    blended[position] =
      bpaDistribution === null
        ? needDistribution[position]
        : adherence * needDistribution[position] + (1 - adherence) * bpaDistribution[position];
    blendedTotal += blended[position];
  }

  const bent = zeroByPosition();
  let bentTotal = 0;
  for (const position of POSITIONS) {
    const delta = clamp(
      profile.observedPositionalShare[position] - profile.expectedPositionalShare[position],
      input.nudgeClamp,
    );
    // A nudge can only ever scale a weight down to zero, never past it into negative mass — which
    // an override of the clamp above 1 would otherwise do.
    bent[position] = blended[position] * Math.max(0, 1 + delta);
    bentTotal += bent[position];
  }

  if (bentTotal > 0) {
    for (const position of POSITIONS) bent[position] /= bentTotal;
    return bent;
  }

  // Every position nudged to zero — only reachable under an extreme configured clamp. Fall back
  // to the unnudged blend rather than returning a vector of NaNs.
  if (blendedTotal <= 0) return null;
  for (const position of POSITIONS) blended[position] /= blendedTotal;
  return blended;
}

// ---------------------------------------------------------------------------------------------
// The panel (AC-40's other half)
// ---------------------------------------------------------------------------------------------

export interface ApplyTendencyProfilesInput {
  /** The rows FR-6's `buildOpponentPanel` returned, one per window pick. */
  entries: readonly OpponentPanelEntry[];
  profileFor: (teamId: string) => TendencyProfile;
  bpaDistribution: Record<Position, number> | null;
  nudgeClamp: number;
}

/**
 * Fills the two fields FR-6 deliberately publishes empty: each row's `tendencyProfile` (AC-40's
 * "compact summary" — rendered by T13, which grays it out on the profile's own `confidence`
 * field rather than on a UI-side rule) and its `bentDistribution`.
 *
 * Returns new rows; FR-6's are left untouched, so the unbent distribution AC-36 requires the
 * panel to display stays exactly as computed alongside the bent one AC-40 adds.
 */
export function applyTendencyProfiles(input: ApplyTendencyProfilesInput): OpponentPanelEntry[] {
  return input.entries.map((entry) => {
    const profile = input.profileFor(entry.teamId);
    const bent = bendDistribution({
      needDistribution: entry.needDistribution,
      bpaDistribution: input.bpaDistribution,
      profile,
      nudgeClamp: input.nudgeClamp,
    });

    return {
      ...entry,
      tendencyProfile: profile,
      ...(bent === null ? {} : { bentDistribution: bent }),
    };
  });
}

// ---------------------------------------------------------------------------------------------
// The per-attach tracker (AC-41)
// ---------------------------------------------------------------------------------------------

export type TendencyTrackerConfig = Pick<
  ParameterValues,
  'tendencyColdStartPicks' | 'tendencyPositionalNudgeClamp' | 'flexEligiblePositions'
>;

export interface TendencyProfileTrackerOptions {
  sync: BoardSync;
  /** The matched snapshot, immutable for this draft's lifetime (AC-29). */
  players: readonly BpaCandidate[];
  adpFor: (playerId: string) => number | null;
  config: TendencyTrackerConfig;
  resolvePosition?: PositionResolver;
}

/**
 * Holds one attached draft's tendency profiles — and only that draft's (AC-41).
 *
 * Profiles are derived from `BoardSync`'s pick feed on read and memoised against its
 * `boardVersion`, exactly as FR-5's roster panels are, so there is no accumulated state to carry
 * anywhere: a tracker built over a different attach answers from that attach's board and nothing
 * else. Nothing is written to disk, and no module-level registry exists for a profile to survive
 * in — which is what makes "none persist across drafts" a structural property rather than a
 * cleanup step that could be forgotten.
 *
 * {@link discard} covers the half of AC-41 that dropping the reference cannot: a draft that ends
 * while the app is still attached and still rendering the panel. After it, every team reads back
 * as a neutral prior — profiles discarded, no bending — rather than continuing to publish what
 * was learned.
 */
export class TendencyProfileTracker {
  private readonly sync: BoardSync;
  private readonly players: readonly BpaCandidate[];
  private readonly adpFor: (playerId: string) => number | null;
  private readonly config: TendencyTrackerConfig;
  private readonly resolvePosition: PositionResolver | undefined;

  private readonly profiles = new Map<string, TendencyProfile>();
  /** `undefined` = not computed for this board version; `null` = computed, no skill player left. */
  private bpa: Record<Position, number> | null | undefined = undefined;
  private cacheKey: number | null = null;
  private isDiscarded = false;

  constructor(options: TendencyProfileTrackerOptions) {
    this.sync = options.sync;
    this.players = options.players;
    this.adpFor = options.adpFor;
    this.config = options.config;
    this.resolvePosition = options.resolvePosition;
  }

  /** The board version these profiles were derived from — what T10 stamps the `Insight` with. */
  get boardVersion(): number {
    return this.sync.syncIndicator.boardVersion;
  }

  /** True once {@link discard} has run; every profile reads back neutral from then on (AC-41). */
  get discarded(): boolean {
    return this.isDiscarded;
  }

  /** One seat's profile. FR-7 consumers only ever ask about the window's opponent seats. */
  profileFor(teamId: string): TendencyProfile {
    const slots = this.sync.state.meta.slots;
    if (this.isDiscarded) return neutralTendencyProfile(teamId, slots);

    this.invalidateIfStale();
    const cached = this.profiles.get(teamId);
    if (cached !== undefined) return cached;

    const profile = computeTendencyProfile({
      teamId,
      slots,
      pickFeed: this.sync.state.pickFeed,
      adpFor: this.adpFor,
      coldStartPicks: this.config.tendencyColdStartPicks,
      flexEligiblePositions: this.config.flexEligiblePositions,
      ...(this.resolvePosition === undefined ? {} : { resolvePosition: this.resolvePosition }),
    });
    this.profiles.set(teamId, profile);
    return profile;
  }

  /** The board-wide BPA distribution the bend blends toward, memoised per board version. */
  bpaDistribution(): Record<Position, number> | null {
    this.invalidateIfStale();
    if (this.bpa === undefined) {
      this.bpa = computeBpaDistribution(this.players, this.sync.state.board);
    }
    return this.bpa;
  }

  /** FR-6's rows, with AC-40's profile and bent weights filled in — T10's one call per recompute. */
  enrichPanel(entries: readonly OpponentPanelEntry[]): OpponentPanelEntry[] {
    return applyTendencyProfiles({
      entries,
      profileFor: (teamId) => this.profileFor(teamId),
      bpaDistribution: this.bpaDistribution(),
      nudgeClamp: this.config.tendencyPositionalNudgeClamp,
    });
  }

  /** Throws every learned profile away — detach, a new attach, or the draft ending (AC-41). */
  discard(): void {
    this.profiles.clear();
    this.bpa = undefined;
    this.cacheKey = null;
    this.isDiscarded = true;
  }

  /** Profiles are only valid for the board version they were derived from. */
  private invalidateIfStale(): void {
    const version = this.sync.syncIndicator.boardVersion;
    if (version === this.cacheKey) return;
    this.profiles.clear();
    this.bpa = undefined;
    this.cacheKey = version;
  }
}
