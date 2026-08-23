import { NO_NEED_SIGNAL, PARAMETER_DEFAULTS } from '@sidekick/shared';
import type { Board, PickFeedEntry, Position, SlotConfig } from '@sidekick/shared';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import windowBundleJson from '../../test/fixtures/sleeper-window-traded-draft.json';
import { SleeperScenario, TEST_BASE_URL } from '../../test/msw/sleeperHandlers';
import type { SleeperFixtureBundle } from '../../test/msw/sleeperHandlers';
import { RosterPanelTracker, computeRosterPanel } from '../roster/needvectors';
import { SleeperClient } from '../sleeper/client';
import { BoardSync, buildPickOwnerResolver, deriveDraftState } from '../sleeper/sync';
import type { SleeperIngest } from '../sleeper/sync';
import {
  buildOpponentPanel,
  buildPickSequence,
  computeOpponentPanel,
  computeWindow,
  countRemainingPicks,
} from './window';
import type { ExampleCandidate, PickOwnerResolver } from './window';

const bundle = windowBundleJson as unknown as SleeperFixtureBundle;

/** Seat 5 in the 10-team fixture — the seat every window case below is anchored on. */
const USER_ID = '700000000000000005';
const USER_TEAM = 'slot-5';

const ingestOf = (pickCount?: number): SleeperIngest =>
  ({
    draft: bundle.draft,
    picks: bundle.picks.slice(0, pickCount ?? bundle.picks.length),
    tradedPicks: bundle.tradedPicks,
    leagueUsers: bundle.leagueUsers,
  }) as unknown as SleeperIngest;

const stateOf = (pickCount?: number) => deriveDraftState(ingestOf(pickCount), { userId: USER_ID });

const ownerOfFixture = (): PickOwnerResolver => {
  const ingest = ingestOf();
  return buildPickOwnerResolver(ingest.draft, ingest.tradedPicks);
};

const windowAt = (picksMade: number) =>
  computeWindow({
    teamCount: 10,
    rounds: 15,
    picksMade,
    userTeamId: USER_TEAM,
    ownerOf: ownerOfFixture(),
  });

// ---------------------------------------------------------------------------------------------
// Example-player universe. Hand-built so every expected ordering below is computable by eye:
// real Sleeper ids and names, deliberately chosen ECR/ADP numbers.
//
//  - Within RB, Bucky Irving carries no ADP (AC-26) and must slot in by ECR *ahead* of an
//    ADP-carrying player he out-ranks.
//  - Within WR and QB, ADP order differs from ECR order, so an ECR-sorted implementation fails.
//  - Bijan Robinson and Ja'Marr Chase are already drafted in the fixture and must never appear.
// ---------------------------------------------------------------------------------------------

const CANDIDATES: ExampleCandidate[] = [
  { sleeperPlayerId: '9509', playerName: 'Bijan Robinson', position: 'RB', ecrRank: 1, adp: 1.2 },
  { sleeperPlayerId: '7564', playerName: "Ja'Marr Chase", position: 'WR', ecrRank: 2, adp: 1.8 },
  { sleeperPlayerId: '9226', playerName: "De'Von Achane", position: 'RB', ecrRank: 10, adp: 11.1 },
  { sleeperPlayerId: '12527', playerName: 'Ashton Jeanty', position: 'RB', ecrRank: 12, adp: 15.4 },
  { sleeperPlayerId: '11584', playerName: 'Bucky Irving', position: 'RB', ecrRank: 18, adp: null },
  { sleeperPlayerId: '9224', playerName: 'Chase Brown', position: 'RB', ecrRank: 22, adp: 20.6 },
  { sleeperPlayerId: '8112', playerName: 'Drake London', position: 'WR', ecrRank: 14, adp: 13.0 },
  { sleeperPlayerId: '8146', playerName: 'Garrett Wilson', position: 'WR', ecrRank: 16, adp: 19.9 },
  { sleeperPlayerId: '6801', playerName: 'Tee Higgins', position: 'WR', ecrRank: 20, adp: 17.2 },
  { sleeperPlayerId: '11635', playerName: 'Ladd McConkey', position: 'WR', ecrRank: 24, adp: 26.0 },
  { sleeperPlayerId: '6904', playerName: 'Jalen Hurts', position: 'QB', ecrRank: 28, adp: 35.0 },
  {
    sleeperPlayerId: '4046',
    playerName: 'Patrick Mahomes',
    position: 'QB',
    ecrRank: 34,
    adp: 31.5,
  },
  { sleeperPlayerId: '11563', playerName: 'Bo Nix', position: 'QB', ecrRank: 50, adp: 58.0 },
  { sleeperPlayerId: '4217', playerName: 'George Kittle', position: 'TE', ecrRank: 30, adp: 33.5 },
  { sleeperPlayerId: '5012', playerName: 'Mark Andrews', position: 'TE', ecrRank: 44, adp: 41.0 },
  {
    sleeperPlayerId: '10236',
    playerName: 'Dalton Kincaid',
    position: 'TE',
    ecrRank: 52,
    adp: 60.2,
  },
];

const names = (ids: readonly { playerId: string }[]): string[] =>
  ids.map((entry) => entry.playerId);

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

const feed = (teamId: string, positions: (Position | null)[]): PickFeedEntry[] =>
  positions.map((position, index) => ({
    pickNo: index + 1,
    round: index + 1,
    draftSlot: 1,
    teamId,
    playerId: `p${index + 1}`,
    playerName: `Player ${index + 1}`,
    position,
    isUserPick: false,
    matchedToSnapshot: true,
  }));

const emptyBoard: Pick<Board, 'players'> = { players: {} };

// ---------------------------------------------------------------------------------------------
// The window itself — AC-34.
// ---------------------------------------------------------------------------------------------

describe('snake pick sequence (AC-34)', () => {
  it('reverses the seat order every other round', () => {
    const sequence = buildPickSequence(
      { teamCount: 3, rounds: 3 },
      (_round, slot) => `slot-${slot}`,
    );

    expect(sequence).toHaveLength(9);
    expect(sequence.map((pick) => pick.teamId)).toEqual([
      'slot-1',
      'slot-2',
      'slot-3',
      'slot-3',
      'slot-2',
      'slot-1',
      'slot-1',
      'slot-2',
      'slot-3',
    ]);
    expect(sequence.map((pick) => pick.pickNo)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(sequence.map((pick) => pick.round)).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3]);
  });

  it('takes ownership from the resolver, not from the board column', () => {
    const sequence = buildPickSequence({ teamCount: 10, rounds: 15 }, ownerOfFixture());

    // Round 3, seat 8's pick was traded to seat 2; round 4, seat 6's went to seat 10.
    expect(sequence[27]).toEqual({ pickNo: 28, round: 3, teamId: 'slot-2' });
    expect(sequence[34]).toEqual({ pickNo: 35, round: 4, teamId: 'slot-10' });
    // The round-2 trade the fixture inherits from T2: seat 7's pick belongs to seat 2.
    expect(sequence[13]).toEqual({ pickNo: 14, round: 2, teamId: 'slot-2' });
  });
});

describe('the window while the user is on the clock (AC-34)', () => {
  it('runs from the pick after the user’s in-progress pick to the one before their next turn', () => {
    const draftWindow = windowAt(24);

    expect(draftWindow.inProgressPickNo).toBe(25);
    expect(draftWindow.userOnTheClock).toBe(true);
    // The in-progress slot is the user's own and is never part of the window (PRD §9 Terms).
    expect(draftWindow.currentUserPickNo).toBe(25);
    expect(draftWindow.nextUserPickNo).toBe(36);
    expect(draftWindow.picks.map((pick) => pick.pickNo)).toEqual([
      26, 27, 28, 29, 30, 31, 32, 33, 34, 35,
    ]);
  });

  it('attributes a traded pick inside the window to the acquiring seat', () => {
    const draftWindow = windowAt(24);

    expect(draftWindow.picks.map((pick) => pick.teamId)).toEqual([
      'slot-6',
      'slot-7',
      'slot-2', // round 3, board column 8 — traded to seat 2
      'slot-9',
      'slot-10',
      'slot-10',
      'slot-9',
      'slot-8',
      'slot-7',
      'slot-10', // round 4, board column 6 — traded to seat 10
    ]);

    const byPick = new Map(draftWindow.picks.map((pick) => [pick.pickNo, pick.teamId]));
    expect(byPick.get(28)).toBe('slot-2');
    expect(byPick.get(28)).not.toBe('slot-8');
    expect(byPick.get(35)).toBe('slot-10');
    expect(byPick.get(35)).not.toBe('slot-6');
  });

  it('lists a team once per pick it owns in the window, never deduped by team', () => {
    const draftWindow = windowAt(24);
    const appearances = draftWindow.picks.reduce<Record<string, number>>((counts, pick) => {
      counts[pick.teamId] = (counts[pick.teamId] ?? 0) + 1;
      return counts;
    }, {});

    expect(appearances).toEqual({
      'slot-2': 1,
      'slot-6': 1,
      'slot-7': 2,
      'slot-8': 1,
      'slot-9': 2,
      'slot-10': 3,
    });
    expect(draftWindow.picks).toHaveLength(10);
    expect(new Set(draftWindow.picks.map((pick) => pick.teamId)).size).toBe(6);
  });
});

describe('the window while the user is not on the clock (AC-34)', () => {
  it('runs from the in-progress pick through the one before the user’s next turn', () => {
    const draftWindow = windowAt(22);

    expect(draftWindow.inProgressPickNo).toBe(23);
    expect(draftWindow.userOnTheClock).toBe(false);
    // Terms only names a "current pick" for the on-the-clock branch; there is none here.
    expect(draftWindow.currentUserPickNo).toBeNull();
    expect(draftWindow.nextUserPickNo).toBe(25);
    expect(draftWindow.picks).toEqual([
      { pickNo: 23, round: 3, teamId: 'slot-3' },
      { pickNo: 24, round: 3, teamId: 'slot-4' },
    ]);
  });

  it('includes the in-progress pick, which the on-the-clock branch excludes', () => {
    expect(windowAt(22).picks[0]!.pickNo).toBe(23);
    expect(windowAt(24).picks[0]!.pickNo).toBe(26);
  });
});

describe('windows that close on nothing (AC-45’s suppression trigger)', () => {
  const smallOwner: PickOwnerResolver = (_round, slot) => `slot-${slot}`;
  const small = (picksMade: number, userTeamId: string | null) =>
    computeWindow({ teamCount: 4, rounds: 2, picksMade, userTeamId, ownerOf: smallOwner });

  it('is empty when the user is on the clock with no later pick', () => {
    // 4 teams x 2 rounds: seat 2 picks 2nd and 7th. On the clock at 7 = their last.
    const draftWindow = small(6, 'slot-2');

    expect(draftWindow.userOnTheClock).toBe(true);
    expect(draftWindow.currentUserPickNo).toBe(7);
    expect(draftWindow.nextUserPickNo).toBeNull();
    expect(draftWindow.picks).toEqual([]);
  });

  it('is empty when the user has no pick left at all', () => {
    const draftWindow = small(7, 'slot-2');

    expect(draftWindow.inProgressPickNo).toBe(8);
    expect(draftWindow.userOnTheClock).toBe(false);
    expect(draftWindow.nextUserPickNo).toBeNull();
    expect(draftWindow.picks).toEqual([]);
  });

  it('is empty once every pick has been made', () => {
    const draftWindow = small(8, 'slot-2');

    expect(draftWindow.inProgressPickNo).toBeNull();
    expect(draftWindow.picks).toEqual([]);
    expect(draftWindow.nextUserPickNo).toBeNull();
  });

  it('is empty while the user’s own seat is unresolved (AC-5)', () => {
    const draftWindow = small(3, null);

    expect(draftWindow.inProgressPickNo).toBe(4);
    expect(draftWindow.userOnTheClock).toBe(false);
    expect(draftWindow.currentUserPickNo).toBeNull();
    expect(draftWindow.nextUserPickNo).toBeNull();
    expect(draftWindow.picks).toEqual([]);
  });
});

describe('remaining picks per team (AC-35)', () => {
  it('counts every pick a team still owns, trades included, from the in-progress pick on', () => {
    const remaining = countRemainingPicks(
      buildPickSequence({ teamCount: 10, rounds: 15 }, ownerOfFixture()),
      24,
    );

    // Seat 2 owns 17 picks (15 + a round-2 and a round-3 acquisition) and has made 4.
    expect(remaining.get('slot-2')).toBe(13);
    // Seat 6 traded its round-4 pick away: 14 owned, 2 made.
    expect(remaining.get('slot-6')).toBe(12);
    // Seat 7 traded its round-2 pick away: 14 owned, 1 made.
    expect(remaining.get('slot-7')).toBe(13);
    // Seat 8 traded its round-3 pick away: 14 owned, 2 made.
    expect(remaining.get('slot-8')).toBe(12);
    expect(remaining.get('slot-9')).toBe(13);
    // Seat 10 acquired a round-4 pick: 16 owned, 2 made.
    expect(remaining.get('slot-10')).toBe(14);
    // The user's own in-progress pick counts as still owed to them.
    expect(remaining.get('slot-5')).toBe(13);
  });

  it('counts nothing once the draft is over', () => {
    const remaining = countRemainingPicks(
      buildPickSequence({ teamCount: 4, rounds: 2 }, (_round, slot) => `slot-${slot}`),
      8,
    );
    expect([...remaining.values()].every((count) => count === 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// The panel — AC-35, AC-36, AC-37.
// ---------------------------------------------------------------------------------------------

const panelAt = (picksMade: number, examplesPerPosition?: number) => {
  const state = stateOf(picksMade);
  const draftWindow = windowAt(picksMade);
  const sequence = buildPickSequence({ teamCount: 10, rounds: 15 }, ownerOfFixture());

  return buildOpponentPanel({
    window: draftWindow,
    panelFor: (teamId) =>
      computeRosterPanel({ teamId, slots: state.meta.slots, pickFeed: state.pickFeed }),
    remainingPicks: countRemainingPicks(sequence, picksMade),
    players: CANDIDATES,
    board: state.board,
    ...(examplesPerPosition === undefined ? {} : { examplesPerPosition }),
  });
};

describe('per-team need, slots and remaining picks (AC-35)', () => {
  it('gives one entry per window pick, in window order', () => {
    const entries = panelAt(24);

    expect(entries.map((entry) => entry.pickNo)).toEqual([26, 27, 28, 29, 30, 31, 32, 33, 34, 35]);
    expect(entries.map((entry) => entry.teamId)).toEqual([
      'slot-6',
      'slot-7',
      'slot-2',
      'slot-9',
      'slot-10',
      'slot-10',
      'slot-9',
      'slot-8',
      'slot-7',
      'slot-10',
    ]);
    expect(entries.map((entry) => entry.round)).toEqual([3, 3, 3, 3, 3, 4, 4, 4, 4, 4]);
  });

  it('reports each team’s unfilled starting slots, need vector and remaining picks', () => {
    const entries = panelAt(24);

    // Seat 6 has taken a WR and an RB; nothing else is filled.
    const seat6 = entries.find((entry) => entry.teamId === 'slot-6')!;
    expect(seat6.unfilledStartingSlots.dedicated).toEqual({
      QB: 1,
      RB: 1,
      WR: 1,
      TE: 1,
      K: 1,
      DST: 1,
    });
    expect(seat6.unfilledStartingSlots.flex).toBe(1);
    expect(seat6.remainingPicks).toBe(12);
    const seat6Need = seat6.needVector as Record<Position, number>;
    expect(seat6Need.QB).toBe(1);
    expect(seat6Need.RB).toBeCloseTo(1 + 1 / 3, 10);
    expect(seat6Need.K).toBe(0);
    expect(seat6Need.DST).toBe(0);

    // Seat 2's two TEs fill the TE slot and the FLEX; its QB came in by trade.
    const seat2 = entries.find((entry) => entry.teamId === 'slot-2')!;
    expect(seat2.unfilledStartingSlots.dedicated).toEqual({
      QB: 0,
      RB: 2,
      WR: 1,
      TE: 0,
      K: 1,
      DST: 1,
    });
    expect(seat2.unfilledStartingSlots.flex).toBe(0);
    expect(seat2.remainingPicks).toBe(13);
    expect(seat2.needVector).toEqual({ QB: 0, RB: 2, WR: 1, TE: 0, K: 0, DST: 0 });
  });

  it('repeats a team’s row without collapsing it, one row per owned pick', () => {
    const entries = panelAt(24).filter((entry) => entry.teamId === 'slot-10');

    expect(entries.map((entry) => entry.pickNo)).toEqual([30, 31, 35]);
    expect(entries[0]!.needDistribution).toEqual(entries[2]!.needDistribution);
    expect(entries[0]!.remainingPicks).toBe(14);
    expect(entries[2]!.remainingPicks).toBe(14);
  });
});

describe('most-likely positions from the normalized need vector (AC-36)', () => {
  it('normalizes need weights to sum 1', () => {
    for (const entry of panelAt(24)) {
      const distribution = entry.needDistribution!;
      const total = Object.values(distribution).reduce((sum, value) => sum + value, 0);
      expect(total).toBeCloseTo(1, 10);
    }
  });

  it('ranks the positions a team actually needs, and omits the ones it does not', () => {
    const entries = panelAt(24);

    // Seat 10 has its QB; RB (2 open) leads WR and TE (1 open each, plus a third of the FLEX).
    const seat10 = entries.find((entry) => entry.teamId === 'slot-10')!;
    expect(seat10.needDistribution!.QB).toBe(0);
    expect(seat10.mostLikelyPositions.map((likely) => likely.position)).toEqual(['RB', 'WR', 'TE']);
    expect(seat10.mostLikelyPositions[0]!.likelihood).toBeCloseTo(7 / 15, 10);
    expect(seat10.mostLikelyPositions[1]!.likelihood).toBeCloseTo(4 / 15, 10);

    // Seat 2 needs only RB and WR — a distribution over two positions, not four.
    const seat2 = entries.find((entry) => entry.teamId === 'slot-2')!;
    expect(seat2.mostLikelyPositions.map((likely) => likely.position)).toEqual(['RB', 'WR']);
    expect(seat2.mostLikelyPositions[0]!.likelihood).toBeCloseTo(2 / 3, 10);
    expect(seat2.mostLikelyPositions[1]!.likelihood).toBeCloseTo(1 / 3, 10);

    // Seat 9 has an RB and a TE: WR leads, TE trails on nothing but its share of the FLEX.
    const seat9 = entries.find((entry) => entry.teamId === 'slot-9')!;
    expect(seat9.mostLikelyPositions.map((likely) => likely.position)).toEqual([
      'WR',
      'RB',
      'QB',
      'TE',
    ]);
  });

  it('breaks ties in the canonical QB/RB/WR/TE order so the panel never reshuffles', () => {
    const seat6 = panelAt(24).find((entry) => entry.teamId === 'slot-6')!;

    // RB, WR and TE are all one dedicated slot plus a third of the FLEX; QB is one slot.
    expect(seat6.mostLikelyPositions.map((likely) => likely.position)).toEqual([
      'RB',
      'WR',
      'TE',
      'QB',
    ]);
    expect(seat6.mostLikelyPositions[0]!.likelihood).toBeCloseTo(4 / 15, 10);
    expect(seat6.mostLikelyPositions[1]!.likelihood).toBeCloseTo(4 / 15, 10);
    expect(seat6.mostLikelyPositions[2]!.likelihood).toBeCloseTo(4 / 15, 10);
    expect(seat6.mostLikelyPositions[3]!.likelihood).toBeCloseTo(3 / 15, 10);
  });

  it('carries no bent distribution — bending is FR-7’s, applied after this (AC-36)', () => {
    for (const entry of panelAt(24)) {
      expect(entry.bentDistribution).toBeUndefined();
      expect(entry.tendencyProfile).toBeUndefined();
    }
  });
});

describe('example players drawn from ADP order within those positions (AC-36)', () => {
  it('orders examples by ADP, not by ECR', () => {
    const seat2 = panelAt(24).find((entry) => entry.teamId === 'slot-2')!;

    // RB then WR, two apiece. Achane (11.1) before Jeanty (15.4); Higgins (17.2) before
    // Wilson (19.9), which ECR order — Wilson 16, Higgins 20 — would have inverted.
    expect(names(seat2.examplePlayers)).toEqual(['9226', '12527', '8112', '6801']);
    expect(seat2.examplePlayers.map((example) => example.position)).toEqual([
      'RB',
      'RB',
      'WR',
      'WR',
    ]);
    expect(seat2.examplePlayers[0]!.adp).toBe(11.1);
  });

  it('slots a player with no ADP in by ECR order within the position (AC-26)', () => {
    const seat2 = panelAt(24, 4).find((entry) => entry.teamId === 'slot-2')!;
    const rbs = seat2.examplePlayers.filter((example) => example.position === 'RB');

    // Bucky Irving carries no ADP but out-ranks Chase Brown on ECR, so he comes first.
    expect(names(rbs)).toEqual(['9226', '12527', '11584', '9224']);
    expect(rbs[2]!.adp).toBeNull();
  });

  it('never offers a player the board has already drafted', () => {
    const drafted = new Set(
      Object.entries(stateOf(24).board.players)
        .filter(([, player]) => player.drafted)
        .map(([playerId]) => playerId),
    );
    expect(drafted.has('9509')).toBe(true); // Bijan Robinson, pick 1

    for (const entry of panelAt(24, 4)) {
      for (const example of entry.examplePlayers) {
        expect(drafted.has(example.playerId)).toBe(false);
      }
    }
  });

  it('offers one example per likely position when asked for one', () => {
    const seat6 = panelAt(24, 1).find((entry) => entry.teamId === 'slot-6')!;

    expect(names(seat6.examplePlayers)).toEqual(['9226', '8112', '4217', '4046']);
    expect(seat6.examplePlayers.map((example) => example.position)).toEqual([
      'RB',
      'WR',
      'TE',
      'QB',
    ]);
  });
});

describe('a team with no need signal drafts best available (PRD §9 Terms)', () => {
  const fullRoster = (): PickFeedEntry[] =>
    feed('slot-1', ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'RB', 'K', 'DST']);

  const noNeedPanel = (examplesPerPosition?: number) =>
    buildOpponentPanel({
      window: {
        picks: [{ pickNo: 40, round: 4, teamId: 'slot-1' }],
        userOnTheClock: true,
        inProgressPickNo: 39,
        currentUserPickNo: 39,
        nextUserPickNo: 41,
      },
      panelFor: (teamId) => computeRosterPanel({ teamId, slots: slots(), pickFeed: fullRoster() }),
      remainingPicks: new Map([['slot-1', 6]]),
      players: CANDIDATES,
      board: emptyBoard,
      ...(examplesPerPosition === undefined ? {} : { examplesPerPosition }),
    });

  it('shows no position-level prediction at all, rather than a fake uniform one', () => {
    const entry = noNeedPanel()[0]!;

    expect(entry.needVector).toBe(NO_NEED_SIGNAL);
    expect(entry.needDistribution).toBeNull();
    expect(entry.mostLikelyPositions).toEqual([]);
  });

  it('draws its examples from ADP order across the skill positions', () => {
    const entry = noNeedPanel(3)[0]!;

    // Cross-position ADP order over the whole available universe: Bijan (1.2), Chase (1.8),
    // Achane (11.1) — nothing here is drafted, so the top of the board leads.
    expect(names(entry.examplePlayers)).toEqual(['9509', '7564', '9226']);
    expect(entry.examplePlayers.every((example) => example.confidence === 'player-example')).toBe(
      true,
    );
  });

  it('still reports its unfilled K/DST slots and remaining picks', () => {
    const entry = noNeedPanel()[0]!;

    expect(entry.unfilledStartingSlots.dedicated.K).toBe(0);
    expect(entry.unfilledStartingSlots.dedicated.DST).toBe(0);
    expect(entry.remainingPicks).toBe(6);
  });
});

describe('position predictions and player examples are separately tagged (AC-37)', () => {
  it('tags every position prediction “position” and every player example “player-example”', () => {
    const entries = panelAt(24);
    expect(entries.length).toBeGreaterThan(0);

    for (const entry of entries) {
      expect(entry.mostLikelyPositions.length).toBeGreaterThan(0);
      for (const likely of entry.mostLikelyPositions) {
        expect(likely.confidence).toBe('position');
      }
      expect(entry.examplePlayers.length).toBeGreaterThan(0);
      for (const example of entry.examplePlayers) {
        expect(example.confidence).toBe('player-example');
      }
    }
  });

  it('keeps the two in separate fields, so a player example can never read as the prediction', () => {
    const seat2 = panelAt(24)[2]!;
    expect(seat2.teamId).toBe('slot-2');

    // A prediction carries a likelihood and no player; an example carries a player and no
    // likelihood. Nothing in the payload lets one be rendered as the other.
    expect(seat2.mostLikelyPositions[0]).toEqual({
      position: 'RB',
      likelihood: 2 / 3,
      confidence: 'position',
    });
    expect(seat2.examplePlayers[0]).toEqual({
      playerId: '9226',
      playerName: "De'Von Achane",
      position: 'RB',
      adp: 11.1,
      confidence: 'player-example',
    });
  });
});

describe('an empty window produces an empty panel', () => {
  it('returns no rows when the user has no next pick', () => {
    const entries = buildOpponentPanel({
      window: {
        picks: [],
        userOnTheClock: true,
        inProgressPickNo: 150,
        currentUserPickNo: 150,
        nextUserPickNo: null,
      },
      panelFor: () => computeRosterPanel({ teamId: 'slot-1', slots: slots(), pickFeed: [] }),
      remainingPicks: new Map(),
      players: CANDIDATES,
      board: emptyBoard,
    });

    expect(entries).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// The seams T5 is meant to be wired through — T2's owner resolver and T4's panel tracker.
// ---------------------------------------------------------------------------------------------

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const syncFor = (visiblePicks: number): { sync: BoardSync; scenario: SleeperScenario } => {
  const scenario = new SleeperScenario({ bundle, visiblePicks });
  server.use(...scenario.handlers());
  const client = new SleeperClient({ baseUrl: TEST_BASE_URL, apiBudgetPerMin: 120 });
  const sync = new BoardSync({
    client,
    config: PARAMETER_DEFAULTS,
    ingest: ingestOf(visiblePicks),
    userId: USER_ID,
  });
  return { sync, scenario };
};

describe('composed against the live board (AC-34, AC-35)', () => {
  it('builds the window and panel from BoardSync and the roster tracker', () => {
    const { sync } = syncFor(24);
    const tracker = new RosterPanelTracker({ sync });

    const { window: draftWindow, entries } = computeOpponentPanel({
      teamCount: sync.state.meta.teamCount,
      rounds: sync.state.meta.rounds,
      picksMade: sync.state.pickFeed.length,
      userTeamId: sync.state.userTeamId,
      ownerOf: sync.pickOwnerResolver,
      panelFor: (teamId) => tracker.panelFor(teamId),
      players: CANDIDATES,
      board: sync.state.board,
    });

    expect(sync.state.userTeamId).toBe(USER_TEAM);
    expect(draftWindow.currentUserPickNo).toBe(25);
    expect(draftWindow.nextUserPickNo).toBe(36);
    expect(entries.map((entry) => entry.pickNo)).toEqual([26, 27, 28, 29, 30, 31, 32, 33, 34, 35]);
    expect(entries[2]!.teamId).toBe('slot-2');
    expect(entries[2]!.remainingPicks).toBe(13);
  });

  it('moves the window forward as the draft advances', async () => {
    const { sync, scenario } = syncFor(22);
    const tracker = new RosterPanelTracker({ sync });
    const build = () =>
      computeOpponentPanel({
        teamCount: sync.state.meta.teamCount,
        rounds: sync.state.meta.rounds,
        picksMade: sync.state.pickFeed.length,
        userTeamId: sync.state.userTeamId,
        ownerOf: sync.pickOwnerResolver,
        panelFor: (teamId) => tracker.panelFor(teamId),
        players: CANDIDATES,
        board: sync.state.board,
      });

    const before = build();
    expect(before.window.userOnTheClock).toBe(false);
    expect(before.entries.map((entry) => entry.pickNo)).toEqual([23, 24]);
    expect(before.entries.map((entry) => entry.teamId)).toEqual(['slot-3', 'slot-4']);

    scenario.advance(2);
    expect((await sync.pollOnce()).status).toBe('applied');

    const after = build();
    expect(after.window.userOnTheClock).toBe(true);
    expect(after.entries).toHaveLength(10);
    expect(after.entries[0]!.pickNo).toBe(26);
  });
});
