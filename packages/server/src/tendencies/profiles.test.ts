import { NO_NEED_SIGNAL, PARAMETER_DEFAULTS } from '@sidekick/shared';
import type { Board, PickFeedEntry, Position, SlotConfig, TendencyProfile } from '@sidekick/shared';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import windowBundleJson from '../../test/fixtures/sleeper-window-traded-draft.json';
import { SleeperScenario, TEST_BASE_URL } from '../../test/msw/sleeperHandlers';
import type { SleeperFixtureBundle } from '../../test/msw/sleeperHandlers';
import { buildOpponentPanel } from '../opponent/window';
import { computeRosterPanel } from '../roster/needvectors';
import { SleeperClient } from '../sleeper/client';
import { BoardSync } from '../sleeper/sync';
import type { SleeperIngest } from '../sleeper/sync';
import {
  TendencyProfileTracker,
  applyTendencyProfiles,
  bendDistribution,
  computeBpaDistribution,
  computeExpectedPositionalShare,
  computeTendencyProfile,
  neutralTendencyProfile,
} from './profiles';
import type { BpaCandidate } from './profiles';

// ---------------------------------------------------------------------------------------------
// The league every hand-computed number below is read against: 1 QB, 2 RB, 2 WR, 1 TE, 1 FLEX,
// 1 K, 1 DST = **9 starting slots**, which is exactly design.md §T6's worked example ("a 10-team
// league with 2 starting RB slots per team out of 9 total starters has an expected RB share of
// 2/9").
// ---------------------------------------------------------------------------------------------

const slots = (overrides: Partial<SlotConfig> = {}): SlotConfig => ({
  QB: 1,
  RB: 2,
  WR: 2,
  TE: 1,
  FLEX: 1,
  K: 1,
  DST: 1,
  BN: 6,
  ...overrides,
});

interface FixturePick {
  pickNo: number;
  teamId: string;
  position: Position | null;
  playerId: string;
  /** The player's ADP in the snapshot, or null when the snapshot carries none (AC-26). */
  adp: number | null;
}

const feedOf = (picks: readonly FixturePick[]): PickFeedEntry[] =>
  [...picks]
    .sort((a, b) => a.pickNo - b.pickNo)
    .map((pick) => ({
      pickNo: pick.pickNo,
      round: Math.ceil(pick.pickNo / 10),
      draftSlot: 1,
      teamId: pick.teamId,
      playerId: pick.playerId,
      playerName: pick.playerId,
      position: pick.position,
      isUserPick: false,
      matchedToSnapshot: true,
    }));

const adpLookup =
  (picks: readonly FixturePick[]) =>
  (playerId: string): number | null =>
    picks.find((pick) => pick.playerId === playerId)?.adp ?? null;

/**
 * Three opponents drafting in one interleaved feed, so every assertion below also proves the
 * profile reads only its own team's picks.
 *
 *  - **slot-3** — five picks, one of them off-need, reaches in both directions.
 *  - **slot-7** — three picks, one of whose players carries no ADP.
 *  - **slot-9** — three picks, one of whose positions never resolved.
 */
const OPPONENT_PICKS: FixturePick[] = [
  // slot-3: RB(+2), RB(-6), QB(+7), RB(-13), QB(+17)
  { pickNo: 3, teamId: 'slot-3', position: 'RB', playerId: 'a1', adp: 5 },
  { pickNo: 18, teamId: 'slot-3', position: 'RB', playerId: 'a2', adp: 12 },
  { pickNo: 23, teamId: 'slot-3', position: 'QB', playerId: 'a3', adp: 30 },
  { pickNo: 38, teamId: 'slot-3', position: 'RB', playerId: 'a4', adp: 25 },
  { pickNo: 43, teamId: 'slot-3', position: 'QB', playerId: 'a5', adp: 60 },
  // slot-7: WR(-1), WR(no ADP), TE(+15)
  { pickNo: 5, teamId: 'slot-7', position: 'WR', playerId: 'b1', adp: 4 },
  { pickNo: 16, teamId: 'slot-7', position: 'WR', playerId: 'b2', adp: null },
  { pickNo: 25, teamId: 'slot-7', position: 'TE', playerId: 'b3', adp: 40 },
  // slot-9: RB(-3), ?(+8), WR(no ADP)
  { pickNo: 9, teamId: 'slot-9', position: 'RB', playerId: 'c1', adp: 6 },
  { pickNo: 12, teamId: 'slot-9', position: null, playerId: 'c2', adp: 20 },
  { pickNo: 29, teamId: 'slot-9', position: 'WR', playerId: 'c3', adp: null },
];

const profileOf = (teamId: string, picks: readonly FixturePick[] = OPPONENT_PICKS) =>
  computeTendencyProfile({
    teamId,
    slots: slots(),
    pickFeed: feedOf(picks),
    adpFor: adpLookup(picks),
    coldStartPicks: PARAMETER_DEFAULTS.tendencyColdStartPicks,
  });

/** slot-3's picks truncated to the first `count`, for the cold-start boundary. */
const firstPicksOfSlot3 = (count: number): FixturePick[] =>
  OPPONENT_PICKS.filter((pick) => pick.teamId === 'slot-3').slice(0, count);

// ---------------------------------------------------------------------------------------------
// The league's starting-slot proportions — the baseline positional counts are read against.
// ---------------------------------------------------------------------------------------------

describe('the league baseline positional share (AC-38)', () => {
  it('is each position’s starting slots over the league’s total starting slots', () => {
    expect(computeExpectedPositionalShare(slots())).toEqual({
      QB: 1 / 9,
      RB: 2 / 9,
      WR: 2 / 9,
      TE: 1 / 9,
      K: 1 / 9,
      DST: 1 / 9,
    });
  });

  it('reads the league’s own settings, never a default shape (AC-30, AC-32)', () => {
    // 3 WR, no kicker: 1 + 2 + 3 + 1 + 2 + 0 + 1 = 10 starting slots.
    const share = computeExpectedPositionalShare(slots({ WR: 3, FLEX: 2, K: 0 }));

    expect(share.WR).toBeCloseTo(3 / 10, 12);
    expect(share.RB).toBeCloseTo(2 / 10, 12);
    expect(share.K).toBe(0);
  });

  it('is all-zero for a league with no starting slots at all, rather than NaN', () => {
    const share = computeExpectedPositionalShare({
      QB: 0,
      RB: 0,
      WR: 0,
      TE: 0,
      FLEX: 0,
      K: 0,
      DST: 0,
      BN: 15,
    });

    expect(share).toEqual({ QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 });
  });
});

// ---------------------------------------------------------------------------------------------
// AC-38 — the three running stats.
// ---------------------------------------------------------------------------------------------

describe('average reach (AC-38)', () => {
  it('is the mean of ADP minus the pick number taken, positive when ahead of market', () => {
    // +2, -6, +7, -13, +17 => 7 / 5.
    expect(profileOf('slot-3').averageReach).toBeCloseTo(1.4, 12);
    expect(profileOf('slot-3').reachSampleCount).toBe(5);
  });

  it('skips a pick whose player carries no ADP rather than scoring it as zero reach', () => {
    // slot-7: (4 - 5) and (40 - 25) average to 7; a zero for the ADP-less pick would give 14/3.
    const profile = profileOf('slot-7');

    expect(profile.averageReach).toBeCloseTo(7, 12);
    expect(profile.reachSampleCount).toBe(2);
    expect(profile.pickCount).toBe(3);
  });

  it('reports zero reach with zero samples when no pick had an ADP at all', () => {
    const picks: FixturePick[] = [
      { pickNo: 4, teamId: 'slot-4', position: 'RB', playerId: 'd1', adp: null },
      { pickNo: 17, teamId: 'slot-4', position: 'WR', playerId: 'd2', adp: null },
      { pickNo: 24, teamId: 'slot-4', position: 'TE', playerId: 'd3', adp: null },
    ];
    const profile = profileOf('slot-4', picks);

    expect(profile.confidence).toBe('established');
    expect(profile.averageReach).toBe(0);
    expect(profile.reachSampleCount).toBe(0);
  });
});

describe('need-adherence (AC-38)', () => {
  it('is judged against the roster as of just before each pick, not the final roster', () => {
    // slot-3's first four picks all filled a then-open slot (the 4th took the FLEX); the fifth,
    // a second QB, did not. Judged against the *final* roster, the 3rd QB-filling pick would
    // read as off-need too, giving 3/5.
    expect(profileOf('slot-3').needAdherence).toBeCloseTo(0.8, 12);
  });

  it('counts a pick that fills an open FLEX slot as need-driven', () => {
    // RB, RB, RB against 2 RB slots + 1 FLEX: the third RB takes the FLEX.
    const picks: FixturePick[] = [
      { pickNo: 6, teamId: 'slot-6', position: 'RB', playerId: 'e1', adp: 10 },
      { pickNo: 15, teamId: 'slot-6', position: 'RB', playerId: 'e2', adp: 20 },
      { pickNo: 26, teamId: 'slot-6', position: 'RB', playerId: 'e3', adp: 30 },
    ];
    expect(profileOf('slot-6', picks).needAdherence).toBe(1);

    // A fourth RB has no slot left to fill: 3/4.
    const withFourth = [
      ...picks,
      { pickNo: 35, teamId: 'slot-6', position: 'RB' as const, playerId: 'e4', adp: 40 },
    ];
    expect(profileOf('slot-6', withFourth).needAdherence).toBeCloseTo(0.75, 12);
  });

  it('counts an open K or DST slot as a starting slot a pick can fill (AC-33)', () => {
    const picks: FixturePick[] = [
      { pickNo: 8, teamId: 'slot-8', position: 'K', playerId: 'f1', adp: 150 },
      { pickNo: 13, teamId: 'slot-8', position: 'DST', playerId: 'f2', adp: 155 },
      { pickNo: 28, teamId: 'slot-8', position: 'K', playerId: 'f3', adp: 160 },
    ];
    // The first K and the DST fill their slots; the second K has none left.
    expect(profileOf('slot-8', picks).needAdherence).toBeCloseTo(2 / 3, 12);
  });

  it('excludes a pick whose position never resolved from the fraction', () => {
    // slot-9: RB and WR both fit; the unknown-position pick is judged neither way.
    expect(profileOf('slot-9').needAdherence).toBe(1);
  });
});

describe('positional counts against the league baseline (AC-38)', () => {
  it('reports the team’s observed share beside the league’s expected share', () => {
    const profile = profileOf('slot-3');

    // 3 RB and 2 QB across 5 picks.
    expect(profile.observedPositionalShare).toEqual({
      QB: 0.4,
      RB: 0.6,
      WR: 0,
      TE: 0,
      K: 0,
      DST: 0,
    });
    expect(profile.expectedPositionalShare).toEqual(computeExpectedPositionalShare(slots()));
  });

  it('divides by the picks whose position is known, not by every pick', () => {
    // slot-9 made 3 picks, one of unknown position: RB and WR are half each, not a third.
    const profile = profileOf('slot-9');

    expect(profile.pickCount).toBe(3);
    expect(profile.observedPositionalShare.RB).toBeCloseTo(0.5, 12);
    expect(profile.observedPositionalShare.WR).toBeCloseTo(0.5, 12);
  });

  it('reads only its own team’s picks out of the shared feed', () => {
    const profile = profileOf('slot-7');

    expect(profile.teamId).toBe('slot-7');
    expect(profile.pickCount).toBe(3);
    expect(profile.observedPositionalShare.WR).toBeCloseTo(2 / 3, 12);
    expect(profile.observedPositionalShare.TE).toBeCloseTo(1 / 3, 12);
    expect(profile.observedPositionalShare.RB).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
// AC-39 — cold start.
// ---------------------------------------------------------------------------------------------

describe('cold start (AC-39)', () => {
  it('uses neutral priors and the early label before the team’s 3rd pick', () => {
    for (const count of [0, 1, 2]) {
      const profile = profileOf('slot-3', firstPicksOfSlot3(count));

      expect(profile).toEqual(neutralTendencyProfile('slot-3', slots(), count));
      expect(profile.confidence).toBe('early');
      expect(profile.averageReach).toBe(0);
      expect(profile.needAdherence).toBe(1);
      expect(profile.observedPositionalShare).toEqual(profile.expectedPositionalShare);
      expect(profile.pickCount).toBe(count);
    }
  });

  it('drops the early label exactly at the 3rd pick, and only then reports observations', () => {
    const two = profileOf('slot-3', firstPicksOfSlot3(2));
    const three = profileOf('slot-3', firstPicksOfSlot3(3));

    expect(two.confidence).toBe('early');
    expect(three.confidence).toBe('established');

    // The first two picks really do average -2 reach and 100% RB; the early profile hides both.
    expect(two.averageReach).toBe(0);
    expect(two.observedPositionalShare.RB).toBeCloseTo(2 / 9, 12);

    // (+2 - 6 + 7) / 3 = 1; 2 RB and 1 QB of 3 picks.
    expect(three.averageReach).toBeCloseTo(1, 12);
    expect(three.observedPositionalShare.RB).toBeCloseTo(2 / 3, 12);
    expect(three.observedPositionalShare.QB).toBeCloseTo(1 / 3, 12);
  });

  it('reads the cold-start threshold from config rather than a hardcoded 3', () => {
    const atFive = computeTendencyProfile({
      teamId: 'slot-3',
      slots: slots(),
      pickFeed: feedOf(OPPONENT_PICKS),
      adpFor: adpLookup(OPPONENT_PICKS),
      coldStartPicks: 5,
    });
    const atSix = computeTendencyProfile({
      teamId: 'slot-3',
      slots: slots(),
      pickFeed: feedOf(OPPONENT_PICKS),
      adpFor: adpLookup(OPPONENT_PICKS),
      coldStartPicks: 6,
    });

    expect(atFive.confidence).toBe('established');
    expect(atSix.confidence).toBe('early');
  });

  it('keeps the PRD’s own default of 3 in the shared parameter module (AS-2)', () => {
    expect(PARAMETER_DEFAULTS.tendencyColdStartPicks).toBe(3);
  });
});

// ---------------------------------------------------------------------------------------------
// The best-player-available distribution the bend blends against.
// ---------------------------------------------------------------------------------------------

const BPA_PLAYERS: BpaCandidate[] = [
  { sleeperPlayerId: 'p-rb1', position: 'RB', ecrRank: 1 },
  { sleeperPlayerId: 'p-wr1', position: 'WR', ecrRank: 2 },
  { sleeperPlayerId: 'p-rb2', position: 'RB', ecrRank: 10 },
  { sleeperPlayerId: 'p-wr2', position: 'WR', ecrRank: 14 },
  { sleeperPlayerId: 'p-qb1', position: 'QB', ecrRank: 28 },
  { sleeperPlayerId: 'p-te1', position: 'TE', ecrRank: 30 },
  { sleeperPlayerId: 'p-k1', position: 'K', ecrRank: 200 },
  { sleeperPlayerId: 'p-dst1', position: 'DST', ecrRank: 210 },
];

const boardWith = (draftedIds: readonly string[]): Pick<Board, 'players'> => ({
  players: Object.fromEntries(draftedIds.map((id) => [id, { drafted: true }])),
});

describe('the best-player-available distribution', () => {
  it('weights each position by 1 / the best available ECR rank there, renormalized', () => {
    // Best available after the top RB and WR go: QB 28, RB 10, WR 14, TE 30.
    // 1/28 : 1/10 : 1/14 : 1/30 = 15 : 42 : 30 : 14 over 420, so the total is 101/420.
    const bpa = computeBpaDistribution(BPA_PLAYERS, boardWith(['p-rb1', 'p-wr1']))!;

    expect(bpa.QB).toBeCloseTo(15 / 101, 12);
    expect(bpa.RB).toBeCloseTo(42 / 101, 12);
    expect(bpa.WR).toBeCloseTo(30 / 101, 12);
    expect(bpa.TE).toBeCloseTo(14 / 101, 12);
  });

  it('gives K and DST no mass at all, however early they rank (AS-7)', () => {
    const bpa = computeBpaDistribution(BPA_PLAYERS, boardWith([]))!;

    expect(bpa.K).toBe(0);
    expect(bpa.DST).toBe(0);
    expect(bpa.QB + bpa.RB + bpa.WR + bpa.TE).toBeCloseTo(1, 12);
  });

  it('gives a position with nothing available zero mass rather than dropping the column', () => {
    const bpa = computeBpaDistribution(BPA_PLAYERS, boardWith(['p-qb1']))!;

    expect(bpa.QB).toBe(0);
    expect(bpa.RB).toBeGreaterThan(0);
  });

  it('is null when no skill player is available at all', () => {
    const everyoneGone = BPA_PLAYERS.map((player) => player.sleeperPlayerId);
    expect(computeBpaDistribution(BPA_PLAYERS, boardWith(everyoneGone))).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// AC-40 — the bend.
// ---------------------------------------------------------------------------------------------

const NEED_DIST: Record<Position, number> = { QB: 0.2, RB: 0.4, WR: 0.3, TE: 0.1, K: 0, DST: 0 };
const BPA_DIST: Record<Position, number> = { QB: 0.1, RB: 0.5, WR: 0.3, TE: 0.1, K: 0, DST: 0 };

const syntheticProfile = (overrides: Partial<TendencyProfile> = {}): TendencyProfile => ({
  teamId: 'slot-3',
  pickCount: 5,
  averageReach: 0,
  reachSampleCount: 5,
  needAdherence: 1,
  observedPositionalShare: computeExpectedPositionalShare(slots()),
  expectedPositionalShare: computeExpectedPositionalShare(slots()),
  confidence: 'established',
  ...overrides,
});

const bend = (
  profile: TendencyProfile,
  nudgeClamp = PARAMETER_DEFAULTS.tendencyPositionalNudgeClamp,
) =>
  bendDistribution({
    needDistribution: NEED_DIST,
    bpaDistribution: BPA_DIST,
    profile,
    nudgeClamp,
  });

describe('bending the displayed likelihoods by the profile (AC-40)', () => {
  it('leaves a neutral team’s distribution exactly where FR-6 displayed it', () => {
    // needAdherence 1 and no positional lean: blended = needDist, nudge = 1.
    const bent = bend(syntheticProfile())!;

    for (const position of ['QB', 'RB', 'WR', 'TE', 'K', 'DST'] as const) {
      expect(bent[position]).toBeCloseTo(NEED_DIST[position], 12);
    }
  });

  it('shifts a low-need-adherence, RB-leaning team’s distribution visibly away from neutral', () => {
    const neutral = bend(syntheticProfile())!;
    const bent = bend(
      syntheticProfile({
        // High reach is deliberately part of this profile and deliberately changes nothing here:
        // reach adjusts FR-8's *player* draw within a position, never the position draw itself.
        averageReach: 8,
        needAdherence: 0.2,
        observedPositionalShare: { QB: 0.4, RB: 0.6, WR: 0, TE: 0, K: 0, DST: 0 },
      }),
    )!;

    // blended = 0.2*need + 0.8*bpa = QB .12, RB .48, WR .30, TE .10.
    // delta   = observed - expected = QB 13/45, RB 17/45, WR -2/9, TE -1/9 (none clamped).
    // raw     = QB 348/2250, RB 1488/2250, WR 525/2250, TE 200/2250; total 2561/2250.
    expect(bent.QB).toBeCloseTo(348 / 2561, 12);
    expect(bent.RB).toBeCloseTo(1488 / 2561, 12);
    expect(bent.WR).toBeCloseTo(525 / 2561, 12);
    expect(bent.TE).toBeCloseTo(200 / 2561, 12);

    // ...and the shift is visible, not a rounding difference.
    expect(bent.RB).toBeGreaterThan(neutral.RB + 0.15);
    expect(bent.WR).toBeLessThan(neutral.WR - 0.09);
    expect(Object.values(bent).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
  });

  it('keeps K and DST at zero however the profile leans (AS-7)', () => {
    const bent = bend(
      syntheticProfile({
        needAdherence: 0.5,
        observedPositionalShare: { QB: 0, RB: 0, WR: 0, TE: 0, K: 0.5, DST: 0.5 },
      }),
    )!;

    expect(bent.K).toBe(0);
    expect(bent.DST).toBe(0);
  });

  it('clamps the positional nudge at the configured bound', () => {
    const allRb = syntheticProfile({
      observedPositionalShare: { QB: 0, RB: 1, WR: 0, TE: 0, K: 0, DST: 0 },
    });

    // delta_RB is 1 - 2/9 = 7/9, clamped to the 0.5 default: RB's factor is 1.5, not 16/9.
    // raw = QB 1.6/9, RB 0.6, WR 2.1/9, TE 0.8/9; total 1.1.
    const clamped = bend(allRb)!;
    expect(clamped.QB).toBeCloseTo(16 / 99, 12);
    expect(clamped.RB).toBeCloseTo(6 / 11, 12);
    expect(clamped.WR).toBeCloseTo(7 / 33, 12);
    expect(clamped.TE).toBeCloseTo(8 / 99, 12);

    // Raising the bound past 7/9 lets the whole lean through: RB becomes 6.4/10.9.
    const loose = bend(allRb, 1)!;
    expect(loose.RB).toBeCloseTo(64 / 109, 12);
    expect(loose.RB).toBeGreaterThan(clamped.RB);
  });

  it('reads the clamp from the shared parameter module, not an inline literal', () => {
    expect(PARAMETER_DEFAULTS.tendencyPositionalNudgeClamp).toBe(0.5);
  });

  it('returns null for a team with no need signal — that team is FR-8’s best-available regime', () => {
    expect(
      bendDistribution({
        needDistribution: null,
        bpaDistribution: BPA_DIST,
        profile: syntheticProfile({ needAdherence: 0.2 }),
        nudgeClamp: PARAMETER_DEFAULTS.tendencyPositionalNudgeClamp,
      }),
    ).toBeNull();
  });

  it('falls back to need alone when no skill player is left to form a BPA distribution', () => {
    const bent = bendDistribution({
      needDistribution: NEED_DIST,
      bpaDistribution: null,
      profile: syntheticProfile({ needAdherence: 0 }),
      nudgeClamp: PARAMETER_DEFAULTS.tendencyPositionalNudgeClamp,
    })!;

    expect(bent.RB).toBeCloseTo(NEED_DIST.RB, 12);
    expect(bent.QB).toBeCloseTo(NEED_DIST.QB, 12);
  });
});

// ---------------------------------------------------------------------------------------------
// AC-40's other half — the panel carries the profile and the bent weights.
// ---------------------------------------------------------------------------------------------

const FULL_ROSTER_POSITIONS: Position[] = ['QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE', 'K', 'DST'];

const panelFixture = () => {
  const needyFeed = feedOf([
    { pickNo: 2, teamId: 'slot-2', position: 'RB', playerId: 'p-rb1', adp: 1.2 },
  ]);
  const fullFeed = feedOf(
    FULL_ROSTER_POSITIONS.map((position, index) => ({
      pickNo: index + 1,
      teamId: 'slot-1',
      position,
      playerId: `full-${index}`,
      adp: index + 1,
    })),
  );

  return buildOpponentPanel({
    window: {
      picks: [
        { pickNo: 40, round: 4, teamId: 'slot-2' },
        { pickNo: 41, round: 5, teamId: 'slot-1' },
      ],
      userOnTheClock: true,
      inProgressPickNo: 39,
      currentUserPickNo: 39,
      nextUserPickNo: 42,
    },
    panelFor: (teamId) =>
      computeRosterPanel({
        teamId,
        slots: slots(),
        pickFeed: teamId === 'slot-1' ? fullFeed : needyFeed,
      }),
    remainingPicks: new Map([
      ['slot-1', 11],
      ['slot-2', 12],
    ]),
    players: BPA_PLAYERS.map((player) => ({
      ...player,
      playerName: player.sleeperPlayerId,
      adp: player.ecrRank,
    })),
    board: boardWith(['p-rb1']),
  });
};

describe('the panel carries each team’s profile and bent weights (AC-40)', () => {
  const profiles = new Map<string, TendencyProfile>([
    [
      'slot-2',
      syntheticProfile({
        teamId: 'slot-2',
        needAdherence: 0.2,
        observedPositionalShare: { QB: 0.4, RB: 0.6, WR: 0, TE: 0, K: 0, DST: 0 },
      }),
    ],
    ['slot-1', syntheticProfile({ teamId: 'slot-1' })],
  ]);

  const enriched = () =>
    applyTendencyProfiles({
      entries: panelFixture(),
      profileFor: (teamId) => profiles.get(teamId)!,
      bpaDistribution: computeBpaDistribution(BPA_PLAYERS, boardWith(['p-rb1'])),
      nudgeClamp: PARAMETER_DEFAULTS.tendencyPositionalNudgeClamp,
    });

  it('fills the two fields FR-6 deliberately left open', () => {
    const before = panelFixture();
    expect(before[0]!.bentDistribution).toBeUndefined();
    expect(before[0]!.tendencyProfile).toBeUndefined();

    const after = enriched()[0]!;
    expect(after.tendencyProfile).toBe(profiles.get('slot-2'));
    expect(after.bentDistribution).toBeDefined();
  });

  it('leaves every other field of the FR-6 row untouched, including the unbent distribution', () => {
    const before = panelFixture()[0]!;
    const after = enriched()[0]!;

    expect(after.needDistribution).toEqual(before.needDistribution);
    expect(after.mostLikelyPositions).toEqual(before.mostLikelyPositions);
    expect(after.examplePlayers).toEqual(before.examplePlayers);
    expect(after.remainingPicks).toBe(before.remainingPicks);
    expect(after.bentDistribution).not.toEqual(after.needDistribution);
  });

  it('gives a no-need-signal team its profile but no bent distribution', () => {
    const fullRosterRow = enriched()[1]!;

    expect(fullRosterRow.needVector).toBe(NO_NEED_SIGNAL);
    expect(fullRosterRow.needDistribution).toBeNull();
    expect(fullRosterRow.tendencyProfile).toBe(profiles.get('slot-1'));
    expect(fullRosterRow.bentDistribution).toBeUndefined();
  });

  it('does not mutate the rows FR-6 built', () => {
    const entries = panelFixture();
    applyTendencyProfiles({
      entries,
      profileFor: (teamId) => profiles.get(teamId)!,
      bpaDistribution: computeBpaDistribution(BPA_PLAYERS, boardWith(['p-rb1'])),
      nudgeClamp: PARAMETER_DEFAULTS.tendencyPositionalNudgeClamp,
    });

    expect(entries[0]!.bentDistribution).toBeUndefined();
    expect(entries[0]!.tendencyProfile).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------
// The per-attach tracker, and AC-41 — profiles never outlive the draft they were learned in.
// ---------------------------------------------------------------------------------------------

const bundle = windowBundleJson as unknown as SleeperFixtureBundle;
const USER_ID = '700000000000000005';

const ingestOf = (pickCount: number): SleeperIngest =>
  ({
    draft: bundle.draft,
    picks: bundle.picks.slice(0, pickCount),
    tradedPicks: bundle.tradedPicks,
    leagueUsers: bundle.leagueUsers,
  }) as unknown as SleeperIngest;

/**
 * ADP for the fixture picks these tests read.
 *  - seat 1: Bijan (pick 1), Burrow (20), Warren (21)
 *  - seat 3: Gibbs (3), Maye (18), Nico Collins (23)
 */
const FIXTURE_ADP: Record<string, number> = {
  '9509': 1.2,
  '6770': 25,
  '12518': 32,
  '9221': 3,
  '11564': 24,
  '7569': 29,
};

const trackerFor = (sync: BoardSync): TendencyProfileTracker =>
  new TendencyProfileTracker({
    sync,
    players: BPA_PLAYERS,
    adpFor: (playerId) => FIXTURE_ADP[playerId] ?? null,
    config: PARAMETER_DEFAULTS,
  });

const attach = (pickCount: number): { sync: BoardSync; tracker: TendencyProfileTracker } => {
  const sync = new BoardSync({
    client: new SleeperClient({ baseUrl: TEST_BASE_URL, apiBudgetPerMin: 120 }),
    config: PARAMETER_DEFAULTS,
    ingest: ingestOf(pickCount),
    userId: USER_ID,
  });
  return { sync, tracker: trackerFor(sync) };
};

describe('the tracker, composed against the live board', () => {
  it('profiles a seat from the board’s own pick feed', () => {
    const { tracker } = attach(24);
    const profile = tracker.profileFor('slot-1');

    // Bijan at pick 1 (ADP 1.2), Burrow at 20 (ADP 25), Warren at 21 (ADP 32).
    expect(profile.pickCount).toBe(3);
    expect(profile.confidence).toBe('established');
    expect(profile.averageReach).toBeCloseTo((0.2 + 5 + 11) / 3, 10);
    expect(profile.needAdherence).toBe(1);
    expect(profile.observedPositionalShare.RB).toBeCloseTo(1 / 3, 12);
    expect(profile.observedPositionalShare.QB).toBeCloseTo(1 / 3, 12);
    expect(profile.observedPositionalShare.TE).toBeCloseTo(1 / 3, 12);
  });

  it('still labels a two-pick seat early (AC-39)', () => {
    const { tracker } = attach(24);

    // Seats 5..10 have made only two picks after 24 of 150.
    expect(tracker.profileFor('slot-8').pickCount).toBe(2);
    expect(tracker.profileFor('slot-8').confidence).toBe('early');
  });

  it('re-derives from the board rather than accumulating, so it cannot drift', () => {
    const { tracker } = attach(24);
    const first = tracker.profileFor('slot-1');

    expect(tracker.profileFor('slot-1')).toBe(first); // memoised at one board version
    expect(tracker.boardVersion).toBe(1);
    expect(attach(20).tracker.profileFor('slot-1').pickCount).toBe(2);
  });

  it('bends the panel it is handed, end to end', () => {
    const { tracker } = attach(24);
    const entries = tracker.enrichPanel(panelFixture());

    expect(entries[0]!.tendencyProfile!.teamId).toBe('slot-2');
    expect(entries[0]!.bentDistribution).toBeDefined();
    expect(entries[1]!.bentDistribution).toBeUndefined();
  });
});

describe('the profile updates after each opponent pick (AC-38)', () => {
  const server = setupServer();
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('picks up a landing pick on the next poll, and drops the early label with it', async () => {
    const scenario = new SleeperScenario({ bundle, visiblePicks: 22 });
    server.use(...scenario.handlers());
    const sync = new BoardSync({
      client: new SleeperClient({ baseUrl: TEST_BASE_URL, apiBudgetPerMin: 120 }),
      config: PARAMETER_DEFAULTS,
      ingest: ingestOf(22),
      userId: USER_ID,
    });
    const tracker = trackerFor(sync);

    // Seat 3 has taken Gibbs (pick 3) and Maye (18): two picks, so still on neutral priors.
    const before = tracker.profileFor('slot-3');
    expect(before.pickCount).toBe(2);
    expect(before.confidence).toBe('early');
    expect(before.averageReach).toBe(0);

    scenario.advance(2); // picks 23 (Nico Collins, seat 3) and 24 (Kyren Williams, seat 4)
    expect((await sync.pollOnce()).status).toBe('applied');

    // (3 - 3) + (24 - 18) + (29 - 23) = 12 across three picks, one apiece at RB, QB and WR.
    const after = tracker.profileFor('slot-3');
    expect(after.pickCount).toBe(3);
    expect(after.confidence).toBe('established');
    expect(after.averageReach).toBeCloseTo(4, 10);
    expect(after.needAdherence).toBe(1);
    expect(after.observedPositionalShare.WR).toBeCloseTo(1 / 3, 12);
  });
});

describe('profiles are discarded on detach and draft end (AC-41)', () => {
  it('returns to neutral priors the moment the tracker is discarded', () => {
    const { tracker } = attach(24);
    expect(tracker.profileFor('slot-1').confidence).toBe('established');

    tracker.discard();

    expect(tracker.discarded).toBe(true);
    expect(tracker.profileFor('slot-1')).toEqual(neutralTendencyProfile('slot-1', slots(), 0));
  });

  it('carries nothing into a fresh attach of the same draft id', () => {
    const before = attach(24);
    expect(before.tracker.profileFor('slot-1').averageReach).not.toBe(0);
    before.tracker.discard();

    // Same draft object, same id — re-attached at the top of the draft.
    const after = attach(0);
    expect(after.sync.state.meta.draftId).toBe(before.sync.state.meta.draftId);

    for (const team of after.sync.state.teams) {
      expect(after.tracker.profileFor(team.teamId)).toEqual(
        neutralTendencyProfile(team.teamId, slots(), 0),
      );
    }
  });

  it('holds no state outside the attach that owns it', () => {
    const live = attach(24);
    const fresh = attach(0);

    // Two attaches alive at once disagree, which a module-level profile store could not do.
    expect(live.tracker.profileFor('slot-1').pickCount).toBe(3);
    expect(fresh.tracker.profileFor('slot-1').pickCount).toBe(0);

    fresh.tracker.discard();
    expect(live.tracker.profileFor('slot-1').pickCount).toBe(3);
  });
});
