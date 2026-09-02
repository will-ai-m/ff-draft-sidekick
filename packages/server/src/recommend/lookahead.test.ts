import { PARAMETER_DEFAULTS, NO_NEED_SIGNAL } from '@sidekick/shared';
import type { Board, NeedVector, Position, SkillPosition, Survival } from '@sidekick/shared';
import { describe, expect, it } from 'vitest';

import { survivalBand } from '../simulation/montecarlo';
import type { SurvivalProjection } from '../simulation/montecarlo';
import {
  bestAvailableByPosition,
  comparePlans,
  enumeratePlans,
  expectedKthBestSurvivingValue,
  outOfUniverseFloors,
  planPositions,
  tierHoldProbability,
} from './lookahead';
import type { LookaheadConfig, PlanPlayer } from './lookahead';
import { buildPlayerValueModel } from './value';

// ---------------------------------------------------------------------------------------------
// Fixture. Small enough that every term below is computed by eye: the whole point of AC-55 is an
// exact arithmetic claim, so nothing here is asserted against a number the code produced.
//
// The model is built with rank shading 0, so every player prices at exactly the curve entry
// for their own positional rank and the arithmetic stays round:
//   RB curve [20, 18, 12, 10]  rb1 20, rb2 18, rb3 12, rb4 10  (tiers {rb1,rb2}=T1, {rb3}=T2, {rb4}=T3)
//   WR curve [18, 16, 14, 12]  wr1 18, wr2 16, wr3 14, wr4 12  (tiers {wr1}=T1, {wr2,wr3}=T2, {wr4}=T3)
//   TE curve [12, 6]           te1 12, te2 6                    (tiers {te1}=T2, {te2}=T4)
//   QB curve [22, 21]          qb1 22, qb2 21                   (flat — the 1-QB shape)
// ---------------------------------------------------------------------------------------------

type FixturePlayer = PlanPlayer & { tier: number | null };

const player = (
  sleeperPlayerId: string,
  playerName: string,
  position: Position,
  ecrRank: number,
  tier: number | null = null,
  adp: number | null = null,
): FixturePlayer => ({ sleeperPlayerId, playerName, position, ecrRank, tier, adp });

// ADPs track ECR near the top; the tails (rb4/wr4/te2/qb2) deliberately last into the 20s–70s so
// the fill term's market replay has depth to price deferred slots against.
const SNAPSHOT: FixturePlayer[] = [
  player('rb1', 'Bijan Robinson', 'RB', 1, 1, 1.5),
  player('wr1', "Ja'Marr Chase", 'WR', 2, 1, 2.5),
  player('rb2', 'Jahmyr Gibbs', 'RB', 3, 1, 3.5),
  player('wr2', 'Justin Jefferson', 'WR', 4, 2, 4.5),
  player('te1', 'Brock Bowers', 'TE', 5, 2, 5.5),
  player('qb1', 'Josh Allen', 'QB', 6, 3, 6.5),
  player('rb3', 'Saquon Barkley', 'RB', 7, 2, 7.5),
  player('wr3', 'CeeDee Lamb', 'WR', 8, 2, 8.5),
  player('te2', 'Trey McBride', 'TE', 9, 4, 70),
  player('qb2', 'Lamar Jackson', 'QB', 10, 4, 45),
  player('rb4', 'Derrick Henry', 'RB', 11, 3, 24),
  player('wr4', 'Amon-Ra St. Brown', 'WR', 12, 3, 25),
  player('k1', 'Brandon Aubrey', 'K', 150),
  player('dst1', 'Houston Texans', 'DST', 155),
];

const CURVES: Record<SkillPosition, number[]> = {
  QB: [22, 21],
  RB: [20, 18, 12, 10],
  WR: [18, 16, 14, 12],
  TE: [12, 6],
};

const MODEL = buildPlayerValueModel(SNAPSHOT, CURVES, { rankShadingRanks: 0 });

const UNIVERSE = SNAPSHOT.filter((p) => p.position !== 'K' && p.position !== 'DST').map((p) => ({
  id: p.sleeperPlayerId,
  position: p.position as SkillPosition,
  ecrRank: p.ecrRank!,
}));

const boardOf = (drafted: readonly string[] = []): Pick<Board, 'players'> => ({
  players: Object.fromEntries(drafted.map((id) => [id, { drafted: true }])),
});

const need = (weights: Partial<Record<Position, number>>): NeedVector => ({
  QB: 0,
  RB: 0,
  WR: 0,
  TE: 0,
  K: 0,
  DST: 0,
  ...weights,
});

const config = (overrides: Partial<LookaheadConfig> = {}): LookaheadConfig => ({
  planTotalTooClosePoints: PARAMETER_DEFAULTS.planTotalTooClosePoints,
  lookaheadMaxPicks: PARAMETER_DEFAULTS.lookaheadMaxPicks,
  flexEligiblePositions: PARAMETER_DEFAULTS.flexEligiblePositions,
  ...overrides,
});

/**
 * A survival projection built from an explicit per-run survivor list — AC-43's matrix, stated by
 * hand so every AC-55 expectation in this file is arithmetic rather than a sampled number.
 */
const projectionOf = (
  runs: readonly (readonly string[])[],
  universe: readonly { id: string; position: SkillPosition; ecrRank: number }[] = UNIVERSE,
): SurvivalProjection => {
  const size = universe.length;
  const runCount = runs.length;
  const survivors = new Uint8Array(runCount * size);
  const indexByPlayerId = new Map<string, number>();
  universe.forEach((entry, index) => indexByPlayerId.set(entry.id, index));

  runs.forEach((survivorIds, run) => {
    for (const id of survivorIds) {
      const index = indexByPlayerId.get(id);
      if (index === undefined)
        throw new Error(`fixture names a survivor outside the universe: ${id}`);
      survivors[run * size + index] = 1;
    }
  });

  const survivalByPlayerId = new Map<string, Survival>();
  universe.forEach((entry, index) => {
    let survived = 0;
    for (let run = 0; run < runCount; run += 1) survived += survivors[run * size + index]!;
    const probability = survived / runCount;
    survivalByPlayerId.set(entry.id, {
      probability,
      band: survivalBand(probability, PARAMETER_DEFAULTS),
    });
  });

  return {
    suppressed: false,
    degraded: false,
    runCount,
    universe: universe.map((entry, index) => ({
      sleeperPlayerId: entry.id,
      position: entry.position,
      ecrRank: entry.ecrRank,
      adp: null,
      index,
      samplingRank: index + 1,
      addedForDisplay: false,
    })),
    survivors,
    survivalByPlayerId,
    indexByPlayerId,
  };
};

/** The elite RB tier survives (rb1); WR Tier 1 is gone by the next turn. Waiting on RB is free. */
const RB_HOLDS_WR_BREAKS = projectionOf([
  ['rb1', 'rb4', 'wr3', 'wr4', 'te1', 'te2', 'qb1', 'qb2'],
  ['rb1', 'rb4', 'wr3', 'wr4', 'te1', 'te2', 'qb1', 'qb2'],
]);

// ---------------------------------------------------------------------------------------------

describe('the plan set (AC-54)', () => {
  it('draws positions from the user’s unfilled starting slots, never from the candidate list', () => {
    expect(planPositions(need({ RB: 1, TE: 0.33 }))).toEqual(['RB', 'TE']);
  });

  it('gives a team with no need signal no plan positions at all', () => {
    expect(planPositions(NO_NEED_SIGNAL)).toEqual([]);
  });

  it('never admits K or DST, whatever weight a caller hands it (🔶 AS-7)', () => {
    expect(planPositions(need({ K: 1, DST: 1 }))).toEqual([]);
  });

  it('enumerates ordered pairs including now === next', () => {
    expect(enumeratePlans(['RB', 'WR'])).toEqual([
      { nowPosition: 'RB', nextPosition: 'RB' },
      { nowPosition: 'RB', nextPosition: 'WR' },
      { nowPosition: 'WR', nextPosition: 'RB' },
      { nowPosition: 'WR', nextPosition: 'WR' },
    ]);
  });
});

describe('bench plan capacity', () => {
  it('never scores QB-now / QB-next when only one backup-QB slot remains', () => {
    const comparison = comparePlans({
      players: SNAPSHOT,
      board: boardOf(),
      needVector: NO_NEED_SIGNAL,
      projection: RB_HOLDS_WR_BREAKS,
      valueModel: MODEL,
      userRemainingPicks: 4,
      config: config(),
      benchPositions: ['QB', 'RB', 'WR', 'TE'],
      benchPickCapacity: { QB: 1 },
    });

    const scored = [comparison.winner, comparison.runnerUp, ...(comparison.contenders ?? [])].filter(
      (plan) => plan !== null,
    );
    expect(scored).not.toContainEqual(
      expect.objectContaining({ nowPosition: 'QB', nextPosition: 'QB' }),
    );
  });

  it('prices bench choices above the league replacement line, not as extra starters', () => {
    const comparison = comparePlans({
      players: SNAPSHOT,
      board: boardOf(),
      needVector: NO_NEED_SIGNAL,
      projection: RB_HOLDS_WR_BREAKS,
      valueModel: MODEL,
      userRemainingPicks: 4,
      config: config(),
      benchPositions: ['QB', 'RB', 'WR', 'TE'],
      benchPickCapacity: { QB: 1 },
      replacementRanks: { QB: 11, RB: 28, WR: 28, TE: 18 },
    });

    // The raw QB curve is largest (22/21), but it is flat through the streamable replacement
    // line. RB's drop over replacement is much larger, so a 10-team bench plan starts RB.
    expect(comparison.winner?.nowPosition).toBe('RB');
    expect(comparison.winner?.nextPosition).not.toBe('QB');
  });
});

describe('the best available player at a position, present tense (AC-55)', () => {
  it('is the numerically lowest overall ECR rank still on the board', () => {
    const best = bestAvailableByPosition(SNAPSHOT, boardOf());
    expect(best.get('RB')?.sleeperPlayerId).toBe('rb1');
    expect(best.get('WR')?.ecrRank).toBe(2);
  });

  it('skips drafted players before ranking, never after (AC-53)', () => {
    const best = bestAvailableByPosition(SNAPSHOT, boardOf(['rb1', 'rb2']));
    expect(best.get('RB')?.sleeperPlayerId).toBe('rb3');
  });

  it('omits a position with nobody left rather than inventing one', () => {
    const best = bestAvailableByPosition(SNAPSHOT, boardOf(['te1', 'te2']));
    expect(best.has('TE')).toBe(false);
  });
});

describe('nextValue — the expected best surviving tier value at the user’s next turn (AC-55)', () => {
  it('averages the per-run best surviving value, never marginal percentages combined', () => {
    // Run 1's best surviving RB is rb1 (20); run 2's is rb3 (12). Mean = 16.
    const projection = projectionOf([['rb1', 'rb3'], ['rb3']]);
    expect(expectedKthBestSurvivingValue(projection, MODEL, 'RB', 1, 0)).toBe(16);
  });

  it('scores a run with no survivor at that position at the caller’s floor value', () => {
    // Run 1: best WR is wr2 (16). Run 2: no WR survives -> floor 4. Mean = (16 + 4) / 2 = 10.
    const projection = projectionOf([['wr2', 'rb1'], ['rb1']]);
    expect(expectedKthBestSurvivingValue(projection, MODEL, 'WR', 1, 4)).toBe(10);
  });

  it('excludes the player the plan already takes now, so a same-position plan cannot count him twice', () => {
    // rb1 survives both runs, but an RB-now/RB-next plan spends him now: rb4 (10) is what is left.
    const projection = projectionOf([
      ['rb1', 'rb4'],
      ['rb1', 'rb4'],
    ]);
    expect(expectedKthBestSurvivingValue(projection, MODEL, 'RB', 1, 0)).toBe(20);
    expect(expectedKthBestSurvivingValue(projection, MODEL, 'RB', 1, 0, 'rb1')).toBe(10);
  });

  it('walks to the k-th survivor and floors past the last one', () => {
    const projection = projectionOf([
      ['rb1', 'rb3'],
      ['rb1', 'rb3'],
    ]);
    expect(expectedKthBestSurvivingValue(projection, MODEL, 'RB', 1, 0)).toBe(20);
    expect(expectedKthBestSurvivingValue(projection, MODEL, 'RB', 2, 0)).toBe(12);
    expect(expectedKthBestSurvivingValue(projection, MODEL, 'RB', 3, 0.5)).toBe(0.5);
    // Exclusion composes: with rb1 spent by the plan, the 1st survivor IS rb3.
    expect(expectedKthBestSurvivingValue(projection, MODEL, 'RB', 1, 0, 'rb1')).toBe(12);
  });
});

describe('the out-of-universe floor (AC-55, amended 2026-08-31)', () => {
  it('prices a dried-up position at the best available player outside the simulation universe', () => {
    const universe = UNIVERSE.filter((entry) => entry.id !== 'rb4' && entry.id !== 'wr4');
    const projection = projectionOf([['rb1']], universe);
    const floors = outOfUniverseFloors(SNAPSHOT, boardOf(), projection, MODEL);
    expect(floors.RB).toBe(10); // rb4, tier value 10, survives every run by construction
    expect(floors.WR).toBe(12); // wr4
    expect(floors.TE).toBe(0); // whole position inside the universe
    expect(floors.QB).toBe(0);
  });

  it('never counts a drafted player as a floor', () => {
    const universe = UNIVERSE.filter((entry) => entry.id !== 'rb4');
    const projection = projectionOf([['rb1']], universe);
    const floors = outOfUniverseFloors(SNAPSHOT, boardOf(['rb4']), projection, MODEL);
    expect(floors.RB).toBe(0);
  });
});

describe('tier hold probability (AC-57, amended 2026-08-31)', () => {
  it('is the fraction of runs in which any available member of the current tier survived', () => {
    // RB Tier 1 = {rb1, rb2}: run 1 keeps rb1, run 2 keeps neither.
    const projection = projectionOf([['rb1'], ['wr3']]);
    expect(tierHoldProbability(projection, boardOf(), MODEL, 'RB')).toBe(0.5);
  });

  it('reads 1 when a tier member sits outside the simulation universe', () => {
    const universe = UNIVERSE.filter((entry) => entry.id !== 'rb2');
    const projection = projectionOf([['wr3']], universe);
    expect(tierHoldProbability(projection, boardOf(), MODEL, 'RB')).toBe(1);
  });

  it('is null when the position has nobody left in the model', () => {
    const projection = projectionOf([[]]);
    expect(
      tierHoldProbability(projection, boardOf(['rb1', 'rb2', 'rb3', 'rb4']), MODEL, 'RB'),
    ).toBeNull();
  });
});

describe('plan scoring and comparison (AC-55, AC-57, AC-58, AC-59)', () => {
  const compare = (overrides: Partial<Parameters<typeof comparePlans>[0]> = {}) =>
    comparePlans({
      players: SNAPSHOT,
      board: boardOf(),
      needVector: need({ RB: 1, WR: 1 }),
      projection: RB_HOLDS_WR_BREAKS,
      valueModel: MODEL,
      userRemainingPicks: 4,
      config: config(),
      ...overrides,
    });

  it('scores every plan as nowValue + nextValue and lets the higher total win', () => {
    const comparison = compare();
    // nowValue: RB 20 (rb1), WR 18 (wr1). nextValue: RB 20 (rb1 survives), RB-less-rb1 10 (rb4),
    // WR 14 (wr3). (RB,RB) 30 | (RB,WR) 34 | (WR,RB) 38 | (WR,WR) 32.
    expect(comparison.winner).toEqual({
      nowPosition: 'WR',
      nextPosition: 'RB',
      nowValue: 18,
      nextValue: 20,
      fillValue: 0, // no slot picture supplied — nowValue + nextValue alone
      score: 38,
    });
    expect(comparison.runnerUp?.score).toBe(34);
    expect(comparison.tooClose).toBe(false);
    expect(comparison.applicable).toBe(true);
  });

  it('takes replacement-adjusted depth now when the lone missing starter safely survives', () => {
    const comparison = compare({
      needVector: need({ TE: 1 }),
      projection: projectionOf([
        ['te1', 'rb2', 'wr2'],
        ['te1', 'rb2', 'wr2'],
      ]),
      unfilledDedicatedSlots: { TE: 1, RB: 0, WR: 0, QB: 0 },
      unfilledFlexSlots: 0,
      deferredStarterDepthPositions: ['RB', 'WR'],
      replacementRanks: { RB: 4, WR: 4, TE: 3 },
    });

    // RB depth adds 20 - replacement 10 = 10 now, then the safely surviving TE adds 12.
    expect(comparison.winner).toMatchObject({
      nowPosition: 'RB',
      nextPosition: 'TE',
      nowValue: 10,
      nextValue: 12,
      score: 22,
    });
  });

  it('fills the lone missing starter now when that player will not survive', () => {
    const comparison = compare({
      needVector: need({ TE: 1 }),
      projection: projectionOf([
        ['rb2', 'wr2'],
        ['rb2', 'wr2'],
      ]),
      unfilledDedicatedSlots: { TE: 1, RB: 0, WR: 0, QB: 0 },
      unfilledFlexSlots: 0,
      deferredStarterDepthPositions: ['RB', 'WR'],
      replacementRanks: { RB: 4, WR: 4, TE: 3 },
    });

    expect(comparison.winner).toMatchObject({
      nowPosition: 'TE',
      nextPosition: 'TE',
      nowValue: 12,
      nextValue: 0,
      score: 12,
    });
  });

  it('prices the other unfilled slots at their own later turns — a double no longer wins on unpriced deferral (AC-55 amendment)', () => {
    // The #28 regression from the 08-27/08-28 rehearsals, in miniature. Two WR starting slots
    // open, one RB slot; wr2 and the deep RBs survive to the next turn.
    const projection = projectionOf([
      ['wr2', 'rb2', 'rb3'],
      ['wr2', 'rb2', 'rb3'],
    ]);
    const slots = {
      unfilledDedicatedSlots: { WR: 2, RB: 1 },
      unfilledFlexSlots: 0,
      futureUserPickNos: [10, 20],
    };

    // With no slot picture the second WR slot's collapse is priced at nothing, and doubling up
    // on the deep RB shelf wins: (RB,RB) = 20 + 18 (rb2) = 38.
    const before = compare({ projection, needVector: need({ WR: 2, RB: 1 }) });
    expect(before.winner?.nowPosition).toBe('RB');
    expect(before.winner?.score).toBe(38);

    // With it, the starter cap zeroes the slotless second RB — (RB,RB) collapses to 20 + the
    // WR slot the market still allows at pick 20 (wr4, 12) — and the winner banks a WR before
    // the shelf dies: (RB,WR) = 20 + 16 (wr2) + 12 (wr4 at pick 20) = 48.
    const after = compare({ projection, needVector: need({ WR: 2, RB: 1 }), ...slots });
    expect(after.winner).toMatchObject({ nowPosition: 'RB', nextPosition: 'WR', score: 48 });
    expect(after.winner!.fillValue).toBe(12);
    expect(after.winner!.score).toBe(
      after.winner!.nowValue + after.winner!.nextValue + after.winner!.fillValue,
    );
  });

  it('never defers a position the market will have eaten by the turn its slot would fill (the round-6 no-WR regression)', () => {
    // Rehearsal #6's failure in miniature: every WR survives to the NEXT turn (so one-turn
    // deferral looks free, as it always did), but no WR's ADP outlasts pick 66 — while te2
    // lasts to ADP 70. Next-turn pricing called this "too close" at every pick and let a
    // roster reach round 6 with one WR; horizon pricing takes both WRs while they exist.
    const projection = projectionOf([
      ['wr1', 'wr2', 'wr3', 'wr4', 'te1', 'te2'],
      ['wr1', 'wr2', 'wr3', 'wr4', 'te1', 'te2'],
    ]);
    const comparison = compare({
      projection,
      needVector: need({ WR: 2, TE: 1 }),
      unfilledDedicatedSlots: { WR: 2, TE: 1 },
      unfilledFlexSlots: 0,
      futureUserPickNos: [50, 66, 75],
    });

    // (WR,WR) = 18 + 16 + te2-at-66 (6) = 40 beats deferring a WR slot to a turn with no WRs
    // left: (TE,WR) = 12 + 18 + 0 = 30.
    expect(comparison.winner).toMatchObject({ nowPosition: 'WR', nextPosition: 'WR', score: 40 });
    expect(comparison.winner!.fillValue).toBe(6);
  });

  it('lets an open FLEX slot lift the starter cap for an eligible position', () => {
    // One dedicated RB slot, so the RB-double's second pick starts only when a FLEX is open —
    // capped it prices at 0, lifted it prices at rb2's full 18. Its overflow also consumes the
    // FLEX, so the fill term prices no flex slot on top (no double counting).
    const projection = projectionOf([
      ['wr2', 'rb2', 'rb3'],
      ['wr2', 'rb2', 'rb3'],
    ]);
    const rbDoubleWith = (unfilledFlexSlots: number) =>
      compare({
        projection,
        needVector: need({ RB: 1 }),
        unfilledDedicatedSlots: { RB: 1 },
        unfilledFlexSlots,
      }).winner;
    expect(rbDoubleWith(0)?.nextValue).toBe(0);
    expect(rbDoubleWith(1)?.nextValue).toBe(18);
    expect(rbDoubleWith(1)?.fillValue).toBe(0);
  });

  it('seats a surplus pick in FLEX only at a position that flexes in this league (2026-09-02)', () => {
    // One dedicated TE slot and one open FLEX. Under the uniform split a TE-now/TE-next double
    // seats its second tight end in the FLEX and banks te2's 6; with the league's own share
    // (RB/WR only) that second pick is a bench pick and prices at 0 — the FLEX seat is not a TE's.
    const projection = projectionOf([
      ['te1', 'te2', 'rb2', 'wr2'],
      ['te1', 'te2', 'rb2', 'wr2'],
    ]);
    const teDoubleWith = (flexShare?: { RB: number; WR: number }) =>
      (
        compare({
          projection,
          needVector: need({ TE: 1 }),
          unfilledDedicatedSlots: { TE: 1 },
          unfilledFlexSlots: 1,
          ...(flexShare === undefined ? {} : { flexShare }),
        }).contenders ?? []
      ).find((plan) => plan.nowPosition === 'TE' && plan.nextPosition === 'TE');

    expect(teDoubleWith()?.nextValue).toBe(6);
    expect(teDoubleWith({ RB: 0.5, WR: 0.5 })?.nextValue).toBe(0);
  });

  it('never lets two different positions bank the same single FLEX seat (rehearsal #8)', () => {
    // The pick-53 regression: no dedicated RB or WR slot left, one open FLEX. Each pick of a
    // WR-now/RB-next plan used to ask "dedicated + openFlex >= 1?" on its own and both said
    // yes, banking ~2 starters against 1 seat — a phantom that beat every TE plan and passed
    // over the last member of the TE board's top tier, who went the very next pick.
    const projection = projectionOf([
      ['rb1', 'rb2', 'wr1', 'wr2', 'te1', 'te2'],
      ['rb1', 'rb2', 'wr1', 'wr2', 'te1', 'te2'],
    ]);
    const crossFlex = compare({
      projection,
      needVector: need({ RB: 1 / 3, WR: 1 / 3, TE: 1 + 1 / 3 }),
      unfilledDedicatedSlots: { RB: 0, WR: 0, TE: 1 },
      unfilledFlexSlots: 1,
      futureUserPickNos: [20, 30, 40],
      // A band wide enough that `contenders` carries every scored plan, so this test can read
      // the losers' terms rather than only the two the near-tie rule would surface.
      config: config({ planTotalTooClosePoints: 999 }),
    });
    const planFor = (nowPosition: SkillPosition, nextPosition: SkillPosition) =>
      (crossFlex.contenders ?? []).find(
        (plan) => plan.nowPosition === nowPosition && plan.nextPosition === nextPosition,
      );

    // The FLEX seat goes to the now-pick; the next-pick at another slotless position banks 0.
    expect(planFor('WR', 'RB')?.nowValue).toBe(18);
    expect(planFor('WR', 'RB')?.nextValue).toBe(0);
    // A next-pick that fills its own dedicated slot is untouched by the allocation.
    expect(planFor('WR', 'TE')?.nextValue).toBeGreaterThan(0);
    // ...so stacking two flex-only positions can no longer out-score filling the open TE slot.
    expect(planFor('WR', 'TE')!.score).toBeGreaterThan(planFor('WR', 'RB')!.score);
  });

  it('names the tier facts separating the winner from the alternative (AC-57)', () => {
    expect(compare().separatingFact).toBe(
      'WR Tier 1: 1 of 1 left, 0% chance one lasts to your next pick (next tier −3.0 pts/gm). ' +
        'RB Tier 1: 2 of 2 left, 100% chance one lasts to your next pick (next tier −7.0 pts/gm).',
    );
  });

  it('reports no separating survival fact when there is no alternative plan to separate from', () => {
    // Only RB is needed, so RB-now/RB-next is the whole plan set — nothing to compare it against.
    const comparison = compare({ needVector: need({ RB: 1 }) });
    expect(comparison.runnerUp).toBeNull();
    expect(comparison.separatingFact).toBeNull();
  });

  it('flags plan totals within `planTotalTooClosePoints` of each other (AC-58)', () => {
    // Both tier-1 anchors survive: (WR,RB) = 18 + 20 = 38 ties (RB,WR) = 20 + 18 = 38.
    const projection = projectionOf([
      ['rb1', 'wr1', 'rb4', 'wr4'],
      ['rb1', 'wr1', 'rb4', 'wr4'],
    ]);
    const comparison = compare({ projection });
    expect(comparison.winner?.score).toBe(38);
    expect(comparison.runnerUp?.score).toBe(38);
    expect(comparison.tooClose).toBe(true);
  });

  it('skips the comparison entirely when the user has fewer than two picks left (AC-59, AC-60)', () => {
    const comparison = compare({ userRemainingPicks: 1 });
    expect(comparison.applicable).toBe(false);
    expect(comparison.winner).toBeNull();
    expect(comparison.runnerUp).toBeNull();
  });

  it('reads the fewer-than-two bound from `lookaheadMaxPicks`, never an inline 2', () => {
    expect(
      compare({ userRemainingPicks: 2, config: config({ lookaheadMaxPicks: 3 }) }).applicable,
    ).toBe(false);
    expect(
      compare({ userRemainingPicks: 3, config: config({ lookaheadMaxPicks: 3 }) }).applicable,
    ).toBe(true);
  });

  it('scores no plan without a value model, leaving the best-available regime standing', () => {
    const comparison = compare({ valueModel: null });
    expect(comparison.applicable).toBe(true);
    expect(comparison.winner).toBeNull();
  });

  it('produces no winner — but stays applicable — for a roster with no unfilled starting slot', () => {
    const comparison = compare({ needVector: NO_NEED_SIGNAL });
    expect(comparison.applicable).toBe(true);
    expect(comparison.winner).toBeNull();
  });

  it('produces no winner when every needed position is picked clean', () => {
    const comparison = compare({
      needVector: need({ TE: 1 }),
      board: boardOf(['te1', 'te2']),
    });
    expect(comparison.winner).toBeNull();
  });

  it('cannot score a plan without survival data, so it reports lookahead as inapplicable', () => {
    expect(compare({ projection: null }).applicable).toBe(false);
    expect(compare({ projection: { ...RB_HOLDS_WR_BREAKS, suppressed: true } }).applicable).toBe(
      false,
    );
  });

  it('orders equal-scoring plans deterministically, so an unchanged board renders unchanged', () => {
    const projection = projectionOf([
      ['rb1', 'wr1', 'rb4', 'wr4'],
      ['rb1', 'wr1', 'rb4', 'wr4'],
    ]);
    // (RB,WR) = 20 + 18 = 38 and (WR,RB) = 18 + 20 = 38 tie; QB/RB/WR/TE order breaks it toward
    // RB-now.
    const first = compare({ projection });
    const second = compare({ projection });
    expect(first.winner?.nowPosition).toBe('RB');
    expect(second.winner).toEqual(first.winner);
    expect(second.runnerUp).toEqual(first.runnerUp);
  });
});
