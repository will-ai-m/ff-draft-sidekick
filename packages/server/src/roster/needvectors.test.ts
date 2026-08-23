import { NO_NEED_SIGNAL, PARAMETER_DEFAULTS } from '@sidekick/shared';
import type { PickFeedEntry, Position, SlotConfig } from '@sidekick/shared';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import mockBundleJson from '../../test/fixtures/sleeper-mock-draft.json';
import nonStandardBundleJson from '../../test/fixtures/sleeper-12team-3wr-draft.json';
import realBundleJson from '../../test/fixtures/sleeper-real-league-draft.json';
import { SleeperScenario, TEST_BASE_URL } from '../../test/msw/sleeperHandlers';
import type { SleeperFixtureBundle } from '../../test/msw/sleeperHandlers';
import { Observability } from '../observability';
import type { PickReflectedSample } from '../observability';
import { SleeperClient } from '../sleeper/client';
import { BoardSync, deriveDraftState } from '../sleeper/sync';
import type { SleeperIngest } from '../sleeper/sync';
import { RosterPanelTracker, computeRosterPanel, countDraftedByPosition } from './needvectors';

const realBundle = realBundleJson as unknown as SleeperFixtureBundle;
const mockBundle = mockBundleJson as unknown as SleeperFixtureBundle;
const nonStandardBundle = nonStandardBundleJson as unknown as SleeperFixtureBundle;

const REAL_USER_ID = '700000000000000004'; // seat 4 in the 10-team fixture
const NON_STANDARD_USER_ID = '700000000000000105'; // seat 5 in the 12-team fixture

const ingestOf = (bundle: SleeperFixtureBundle, pickCount?: number): SleeperIngest =>
  ({
    draft: bundle.draft,
    picks: bundle.picks.slice(0, pickCount ?? bundle.picks.length),
    tradedPicks: bundle.tradedPicks,
    leagueUsers: bundle.leagueUsers,
  }) as unknown as SleeperIngest;

const stateOf = (bundle: SleeperFixtureBundle, userId: string | null, pickCount?: number) =>
  deriveDraftState(ingestOf(bundle, pickCount), { userId });

/** A hand-built pick feed, for roster shapes no fixture happens to contain. */
const feed = (teamId: string, positions: (Position | null)[]): PickFeedEntry[] =>
  positions.map((position, index) => ({
    pickNo: index + 1,
    round: index + 1,
    draftSlot: 1,
    teamId,
    playerId: `p${index + 1}`,
    playerName: `Player ${index + 1}`,
    position,
    isUserPick: true,
    matchedToSnapshot: true,
  }));

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

// ---------------------------------------------------------------------------------------------
// The panel itself — pure, no network.
// ---------------------------------------------------------------------------------------------

describe('roster panel from the default-shaped league fixture (AC-31)', () => {
  it('reports filled, unfilled and bench purely from the settings and the pick feed', () => {
    const state = stateOf(realBundle, REAL_USER_ID);
    const panel = computeRosterPanel({
      teamId: state.userTeamId!,
      slots: state.meta.slots,
      pickFeed: state.pickFeed,
    });

    // Seat 4 took Puka Nacua (WR, pick 4) and Christian McCaffrey (RB, pick 17).
    expect(panel.filledStartingSlots).toEqual({ QB: 0, RB: 1, WR: 1, TE: 0, K: 0, DST: 0 });
    expect(panel.filledFlexSlots).toBe(0);
    expect(panel.unfilledStartingSlots.dedicated).toEqual({
      QB: 1,
      RB: 1,
      WR: 1,
      TE: 1,
      K: 1,
      DST: 1,
    });
    expect(panel.unfilledStartingSlots.flex).toBe(1);
    expect(panel.benchCount).toBe(0);
    expect(panel.benchSlots).toBe(6);
  });

  it('splits the unfilled FLEX slot across the eligible positions in the need vector', () => {
    const state = stateOf(realBundle, REAL_USER_ID);
    const panel = computeRosterPanel({
      teamId: state.userTeamId!,
      slots: state.meta.slots,
      pickFeed: state.pickFeed,
    });

    expect(panel.needVector).not.toBe(NO_NEED_SIGNAL);
    const need = panel.needVector as Record<Position, number>;
    expect(need.QB).toBe(1);
    expect(need.RB).toBeCloseTo(1 + 1 / 3, 10);
    expect(need.WR).toBeCloseTo(1 + 1 / 3, 10);
    expect(need.TE).toBeCloseTo(1 + 1 / 3, 10);
  });
});

describe('non-default league settings, same code path (AC-30, AC-32)', () => {
  it('honours 12 teams / 3 WR / 2 FLEX / no K slot with no special-casing', () => {
    const state = stateOf(nonStandardBundle, NON_STANDARD_USER_ID);
    expect(state.meta.teamCount).toBe(12);
    expect(state.meta.slots).toEqual({ QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 2, K: 0, DST: 1, BN: 5 });

    const panel = computeRosterPanel({
      teamId: state.userTeamId!,
      slots: state.meta.slots,
      pickFeed: state.pickFeed,
    });

    // Seat 5 took four WRs and one RB — the fourth WR is surplus and consumes one FLEX slot.
    expect(panel.filledStartingSlots).toEqual({ QB: 0, RB: 1, WR: 3, TE: 0, K: 0, DST: 0 });
    expect(panel.filledFlexSlots).toBe(1);
    expect(panel.unfilledStartingSlots.dedicated).toEqual({
      QB: 1,
      RB: 1,
      WR: 0,
      TE: 1,
      K: 0,
      DST: 1,
    });
    expect(panel.unfilledStartingSlots.flex).toBe(1);
    expect(panel.benchCount).toBe(0);
    expect(panel.benchSlots).toBe(5);

    const need = panel.needVector as Record<Position, number>;
    expect(need.QB).toBe(1);
    expect(need.RB).toBeCloseTo(1 + 1 / 3, 10);
    expect(need.WR).toBeCloseTo(1 / 3, 10);
    expect(need.TE).toBeCloseTo(1 + 1 / 3, 10);
  });

  it('counts a pick acquired by trade on the acquiring roster, not the original seat', () => {
    const state = stateOf(nonStandardBundle, NON_STANDARD_USER_ID);

    // Pick 16 was made from board column 9 but belongs to the user's seat by trade.
    const traded = state.pickFeed.find((entry) => entry.pickNo === 16)!;
    expect(traded.draftSlot).toBe(9);
    expect(traded.teamId).toBe(state.userTeamId);

    const { counts } = countDraftedByPosition(state.pickFeed, state.userTeamId!);
    expect(counts.WR).toBe(4);

    // …and the seat that traded it away is one player lighter.
    const seat9 = computeRosterPanel({
      teamId: 'slot-9',
      slots: state.meta.slots,
      pickFeed: state.pickFeed,
    });
    expect(seat9.filledStartingSlots).toEqual({ QB: 0, RB: 2, WR: 1, TE: 0, K: 0, DST: 0 });
    expect(seat9.filledFlexSlots).toBe(0);
    expect(seat9.benchCount).toBe(0);
  });

  it('serves an opponent seat whose surplus TE consumes a FLEX slot', () => {
    const state = stateOf(nonStandardBundle, NON_STANDARD_USER_ID);
    const seat4 = computeRosterPanel({
      teamId: 'slot-4',
      slots: state.meta.slots,
      pickFeed: state.pickFeed,
    });

    expect(seat4.filledStartingSlots).toEqual({ QB: 1, RB: 1, WR: 0, TE: 1, K: 0, DST: 0 });
    expect(seat4.filledFlexSlots).toBe(1);
    expect(seat4.unfilledStartingSlots.flex).toBe(1);
  });

  it('handles a league shape the defaults never anticipated (2 QB, no FLEX, no K/DST, no bench)', () => {
    const superflex = { QB: 2, RB: 2, WR: 2, TE: 1, FLEX: 0, K: 0, DST: 0, BN: 0 };
    const panel = computeRosterPanel({
      teamId: 'slot-1',
      slots: superflex,
      pickFeed: feed('slot-1', ['QB', 'QB', 'RB']),
    });

    expect(panel.filledStartingSlots).toEqual({ QB: 2, RB: 1, WR: 0, TE: 0, K: 0, DST: 0 });
    expect(panel.unfilledStartingSlots.dedicated).toEqual({
      QB: 0,
      RB: 1,
      WR: 2,
      TE: 1,
      K: 0,
      DST: 0,
    });
    expect(panel.unfilledStartingSlots.flex).toBe(0);
    expect(panel.benchCount).toBe(0);
    expect(panel.benchSlots).toBe(0);
  });

  it('reads a non-standard FLEX eligibility set from config rather than assuming RB/WR/TE', () => {
    const panel = computeRosterPanel({
      teamId: 'slot-1',
      slots: slots({ FLEX: 1, K: 0, DST: 0 }),
      pickFeed: feed('slot-1', ['QB', 'QB']),
      flexEligiblePositions: ['QB', 'RB', 'WR', 'TE'],
    });

    // The surplus QB is only FLEX-eligible because config says so.
    expect(panel.filledFlexSlots).toBe(1);
    expect(panel.benchCount).toBe(0);
  });
});

describe('K/DST are tracked on the roster but carry no need weight (AC-33, 🔶 AS-7)', () => {
  it('shows unfilled K and DST slots while giving them zero need weight', () => {
    const state = stateOf(realBundle, REAL_USER_ID);
    const panel = computeRosterPanel({
      teamId: state.userTeamId!,
      slots: state.meta.slots,
      pickFeed: state.pickFeed,
    });

    expect(panel.unfilledStartingSlots.dedicated.K).toBe(1);
    expect(panel.unfilledStartingSlots.dedicated.DST).toBe(1);
    const need = panel.needVector as Record<Position, number>;
    expect(need.K).toBe(0);
    expect(need.DST).toBe(0);
  });

  it('reports no need signal when only K/DST slots are still open, yet still shows them', () => {
    const panel = computeRosterPanel({
      teamId: 'slot-1',
      slots: slots({ FLEX: 0 }),
      pickFeed: feed('slot-1', ['QB', 'RB', 'RB', 'WR', 'WR', 'TE']),
    });

    expect(panel.needVector).toBe(NO_NEED_SIGNAL);
    expect(panel.unfilledStartingSlots.dedicated.K).toBe(1);
    expect(panel.unfilledStartingSlots.dedicated.DST).toBe(1);
    expect(panel.filledStartingSlots).toEqual({ QB: 1, RB: 2, WR: 2, TE: 1, K: 0, DST: 0 });
  });

  it('fills a K/DST slot when one is drafted, without touching the need vector', () => {
    const panel = computeRosterPanel({
      teamId: 'slot-1',
      slots: slots(),
      pickFeed: feed('slot-1', ['K', 'DST']),
    });

    expect(panel.filledStartingSlots.K).toBe(1);
    expect(panel.filledStartingSlots.DST).toBe(1);
    expect(panel.benchCount).toBe(0);
    const need = panel.needVector as Record<Position, number>;
    expect(need.K).toBe(0);
    expect(need.DST).toBe(0);
  });
});

describe('bench counting', () => {
  it('counts everything past the starting slots and the FLEX as bench', () => {
    // 3 TEs against 1 TE slot + 1 FLEX: one starts, one takes the FLEX, one is bench.
    const panel = computeRosterPanel({
      teamId: 'slot-1',
      slots: slots(),
      pickFeed: feed('slot-1', ['TE', 'TE', 'TE']),
    });

    expect(panel.filledStartingSlots.TE).toBe(1);
    expect(panel.filledFlexSlots).toBe(1);
    expect(panel.benchCount).toBe(1);
  });

  it('does not let a surplus K count toward a FLEX slot', () => {
    const panel = computeRosterPanel({
      teamId: 'slot-1',
      slots: slots(),
      pickFeed: feed('slot-1', ['K', 'K']),
    });

    expect(panel.filledStartingSlots.K).toBe(1);
    expect(panel.filledFlexSlots).toBe(0);
    expect(panel.benchCount).toBe(1);
  });

  it('benches a pick whose position the API did not report, rather than dropping it', () => {
    const panel = computeRosterPanel({
      teamId: 'slot-1',
      slots: slots(),
      pickFeed: feed('slot-1', ['RB', null]),
    });

    expect(panel.filledStartingSlots.RB).toBe(1);
    expect(panel.benchCount).toBe(1);
  });

  it('uses the supplied position resolver when the pick metadata carries no position', () => {
    const panel = computeRosterPanel({
      teamId: 'slot-1',
      slots: slots(),
      pickFeed: feed('slot-1', ['RB', null]),
      resolvePosition: (playerId) => (playerId === 'p2' ? 'WR' : null),
    });

    expect(panel.filledStartingSlots).toEqual({ QB: 0, RB: 1, WR: 1, TE: 0, K: 0, DST: 0 });
    expect(panel.benchCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
// The tracker — the roster panel keeping up with the poll loop.
// ---------------------------------------------------------------------------------------------

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const syncFor = (
  bundle: SleeperFixtureBundle,
  options: { userId?: string | null; visiblePicks: number; observability?: Observability },
): { sync: BoardSync; scenario: SleeperScenario } => {
  const scenario = new SleeperScenario({ bundle, visiblePicks: options.visiblePicks });
  server.use(...scenario.handlers());
  const client = new SleeperClient({ baseUrl: TEST_BASE_URL, apiBudgetPerMin: 120 });
  const sync = new BoardSync({
    client,
    config: PARAMETER_DEFAULTS,
    ingest: ingestOf(bundle, options.visiblePicks),
    userId: options.userId ?? null,
    observability: options.observability,
  });
  return { sync, scenario };
};

const rosterSamples = (observability: Observability): PickReflectedSample[] =>
  observability
    .samples()
    .filter(
      (sample): sample is PickReflectedSample =>
        sample.type === 'pick-reflected' && sample.view === 'roster',
    );

describe('RosterPanelTracker (AC-31, AC-66)', () => {
  it('reflects the user’s own pick from the poll that carried it, and records the lag', async () => {
    const observability = new Observability();
    const { sync, scenario } = syncFor(nonStandardBundle, {
      userId: NON_STANDARD_USER_ID,
      visiblePicks: 4, // the user's first pick is pick 5
      observability,
    });
    const tracker = new RosterPanelTracker({ sync, observability });
    tracker.start();

    expect(tracker.userPanel()!.filledStartingSlots.WR).toBe(0);

    scenario.advance(1);
    const outcome = await sync.pollOnce();
    expect(outcome.status).toBe('applied');

    expect(tracker.userPanel()!.filledStartingSlots.WR).toBe(1);

    const samples = rosterSamples(observability);
    expect(samples).toHaveLength(1);
    const sample = samples[0]!;
    expect(sample.pickNo).toBe(5);
    expect(sample.lagMs).toBeGreaterThanOrEqual(0);
    expect(sample.lagMs).toBeLessThan(PARAMETER_DEFAULTS.pickReflectionLatencyMs);

    tracker.stop();
  });

  it('records nothing for an opponent’s pick, but still serves that opponent’s panel', async () => {
    const observability = new Observability();
    const { sync, scenario } = syncFor(nonStandardBundle, {
      userId: NON_STANDARD_USER_ID,
      visiblePicks: 5,
      observability,
    });
    const tracker = new RosterPanelTracker({ sync, observability });
    tracker.start();

    scenario.advance(1); // pick 6 — seat 6's
    await sync.pollOnce();

    expect(rosterSamples(observability)).toHaveLength(0);
    expect(tracker.panelFor('slot-6').filledStartingSlots.WR).toBe(1);

    tracker.stop();
  });

  it('picks up a pick that arrived by trade on the user’s roster', async () => {
    const { sync, scenario } = syncFor(nonStandardBundle, {
      userId: NON_STANDARD_USER_ID,
      visiblePicks: 15,
    });
    const tracker = new RosterPanelTracker({ sync });
    tracker.start();

    expect(tracker.userPanel()!.filledStartingSlots.WR).toBe(1);
    scenario.advance(1); // pick 16 — board column 9, owned by the user's seat
    await sync.pollOnce();
    expect(tracker.userPanel()!.filledStartingSlots.WR).toBe(2);

    tracker.stop();
  });

  it('has no panel until the user’s seat is known, and produces one the moment it is (AC-5)', () => {
    const { sync } = syncFor(mockBundle, { userId: null, visiblePicks: 22 });
    const tracker = new RosterPanelTracker({ sync });
    tracker.start();

    expect(sync.state.userTeamId).toBeNull();
    expect(tracker.userPanel()).toBeNull();

    sync.setUserSlot(4);
    const panel = tracker.userPanel();
    expect(panel).not.toBeNull();
    expect(panel!.teamId).toBe('slot-4');
    expect(panel!.filledStartingSlots).toEqual({ QB: 0, RB: 1, WR: 1, TE: 0, K: 0, DST: 0 });

    tracker.stop();
  });

  it('stops recording once stopped', async () => {
    const observability = new Observability();
    const { sync, scenario } = syncFor(nonStandardBundle, {
      userId: NON_STANDARD_USER_ID,
      visiblePicks: 4,
      observability,
    });
    const tracker = new RosterPanelTracker({ sync, observability });
    tracker.start();
    tracker.stop();

    scenario.advance(1);
    await sync.pollOnce();

    expect(rosterSamples(observability)).toHaveLength(0);
    // The panel is still correct on read — the tracker derives, it does not accumulate.
    expect(tracker.userPanel()!.filledStartingSlots.WR).toBe(1);
  });
});
