import { SCORING_DEFAULTS } from '@sidekick/shared';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import mockBundleJson from '../../test/fixtures/sleeper-mock-draft.json';
import nonStandardBundleJson from '../../test/fixtures/sleeper-12team-3wr-draft.json';
import realBundleJson from '../../test/fixtures/sleeper-real-league-draft.json';
import { SleeperScenario, TEST_BASE_URL } from '../../test/msw/sleeperHandlers';
import type { SleeperFixtureBundle } from '../../test/msw/sleeperHandlers';
import { SleeperClient } from '../sleeper/client';
import { deriveDraftState } from '../sleeper/sync';
import type { SleeperIngest } from '../sleeper/sync';
import { resolveLeagueSettings } from './leagueSettings';

const realBundle = realBundleJson as unknown as SleeperFixtureBundle;
const mockBundle = mockBundleJson as unknown as SleeperFixtureBundle;
const nonStandardBundle = nonStandardBundleJson as unknown as SleeperFixtureBundle;

const ingestOf = (bundle: SleeperFixtureBundle): SleeperIngest =>
  ({
    draft: bundle.draft,
    picks: bundle.picks,
    tradedPicks: bundle.tradedPicks,
    leagueUsers: bundle.leagueUsers,
  }) as unknown as SleeperIngest;

const metaOf = (bundle: SleeperFixtureBundle) => deriveDraftState(ingestOf(bundle)).meta;

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const clientFor = (scenario: SleeperScenario): SleeperClient => {
  server.use(...scenario.handlers());
  return new SleeperClient({ baseUrl: TEST_BASE_URL, apiBudgetPerMin: 120 });
};

describe('league settings from the API, never from format constants (AC-30, AC-32)', () => {
  it('reads team count, slot structure and rounds from the default-shaped real league', async () => {
    const scenario = new SleeperScenario({ bundle: realBundle });
    const settings = await resolveLeagueSettings(metaOf(realBundle), 'half_ppr', {
      client: clientFor(scenario),
    });

    expect(settings.teamCount).toBe(10);
    expect(settings.rounds).toBe(15);
    expect(settings.slots).toEqual({ QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DST: 1, BN: 6 });
    expect(settings.isMock).toBe(false);
  });

  it('reads a non-default league — 12 teams, 3 WR, 2 FLEX, no K slot — through the same path', async () => {
    const scenario = new SleeperScenario({ bundle: nonStandardBundle });
    const settings = await resolveLeagueSettings(metaOf(nonStandardBundle), 'half_ppr', {
      client: clientFor(scenario),
    });

    expect(settings.teamCount).toBe(12);
    expect(settings.slots).toEqual({ QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 2, K: 0, DST: 1, BN: 5 });
  });
});

describe('scoring settings (AC-30, feeding AC-64)', () => {
  it('prefers the league’s own granular per-stat dict over its coarse label', async () => {
    const scenario = new SleeperScenario({ bundle: nonStandardBundle });
    const settings = await resolveLeagueSettings(metaOf(nonStandardBundle), 'half_ppr', {
      client: clientFor(scenario),
    });

    expect(settings.scoring.source).toBe('league-settings');
    expect(settings.scoring.fallbackFormat).toBeNull();
    // The fixture's label says half_ppr, but its granular dict pays 6 for a passing TD and adds a
    // TE reception bonus — exactly the divergence live-verified on a real league (a "ppr" league
    // paying 6 per passing TD). Reading the label instead of the dict would score every game wrong.
    expect(settings.scoring.settings['pass_td']).toBe(6);
    expect(settings.scoring.settings['bonus_rec_te']).toBe(0.5);
    expect(SCORING_DEFAULTS.half_ppr['pass_td']).not.toBe(6);
    // Sleeper serves float32 artifacts (0.03999999910593033), so nothing may compare exactly.
    expect(settings.scoring.settings['pass_yd']).toBeCloseTo(0.04, 6);
    expect(scenario.requests).toContain('league:1200000000000000011');
  });

  it('falls back to the named table for a mock, which has no league to read a dict from', async () => {
    const scenario = new SleeperScenario({ bundle: mockBundle });
    const settings = await resolveLeagueSettings(metaOf(mockBundle), 'half_ppr', {
      client: clientFor(scenario),
    });

    expect(settings.isMock).toBe(true);
    expect(settings.scoring.source).toBe('scoring-type-default');
    expect(settings.scoring.fallbackFormat).toBe('half_ppr');
    expect(settings.scoring.scoringType).toBe('half_ppr');
    expect(settings.scoring.settings).toEqual(SCORING_DEFAULTS.half_ppr);
    expect(settings.scoring.note).toMatch(/mock/i);
    // A mock must never trigger a league fetch: it has no league_id to fetch with.
    expect(scenario.requests.some((name) => name.startsWith('league:'))).toBe(false);
  });

  it('falls back to the named table — without throwing — when the league fetch fails', async () => {
    const scenario = new SleeperScenario({
      bundle: nonStandardBundle,
      failLeague: { status: 500 },
    });
    const settings = await resolveLeagueSettings(metaOf(nonStandardBundle), 'half_ppr', {
      client: clientFor(scenario),
    });

    expect(settings.scoring.source).toBe('scoring-type-default');
    expect(settings.scoring.fallbackFormat).toBe('half_ppr');
    expect(settings.scoring.settings).toEqual(SCORING_DEFAULTS.half_ppr);
    expect(settings.scoring.note).toMatch(/500|could not|failed/i);
    // The rest of the settings still come from the draft object, which was read successfully.
    expect(settings.slots.WR).toBe(3);
  });

  it('flags an unrecognised scoring label instead of silently claiming a format', async () => {
    const meta = { ...metaOf(mockBundle), scoringType: 'vampire_points' };
    const scenario = new SleeperScenario({ bundle: mockBundle });
    const settings = await resolveLeagueSettings(meta, 'half_ppr', { client: clientFor(scenario) });

    expect(settings.scoring.source).toBe('unrecognised-scoring-type');
    expect(settings.scoring.fallbackFormat).toBe('half_ppr');
    expect(settings.scoring.note).toContain('vampire_points');
  });

  it('falls back when a real league answers without a scoring_settings dict', async () => {
    const bundle: SleeperFixtureBundle = {
      ...nonStandardBundle,
      league: { ...(nonStandardBundle.league as Record<string, unknown>), scoring_settings: null },
    };
    const scenario = new SleeperScenario({ bundle });
    const settings = await resolveLeagueSettings(metaOf(bundle), 'half_ppr', { client: clientFor(scenario) });

    expect(settings.scoring.source).toBe('scoring-type-default');
    expect(settings.scoring.note).toMatch(/scoring_settings/);
  });

  it('resolves without a client at all, on the named table', async () => {
    const settings = await resolveLeagueSettings(metaOf(nonStandardBundle), 'half_ppr', {});

    expect(settings.scoring.source).toBe('scoring-type-default');
    expect(settings.slots.WR).toBe(3);
  });

  it('prices an unrecognised label on the rankings format the draft is attached on (2026-09-02)', async () => {
    const meta = { ...metaOf(mockBundle), scoringType: 'vampire_points' };
    const settings = await resolveLeagueSettings(meta, 'ppr', {});

    expect(settings.scoring.source).toBe('unrecognised-scoring-type');
    expect(settings.scoring.fallbackFormat).toBe('ppr');
    expect(settings.scoring.settings).toEqual(SCORING_DEFAULTS.ppr);
    expect(settings.scoring.note).toMatch(/rankings format/i);
  });

  it('keeps a recognised label ahead of the rankings format: a half_ppr mock in ppr mode scores half-PPR', async () => {
    // The label is real information about the draft; the format only decides which board is read.
    // AC-27's warning is what tells the user the two disagree.
    const settings = await resolveLeagueSettings(metaOf(mockBundle), 'ppr', {});

    expect(settings.scoring.fallbackFormat).toBe('half_ppr');
    expect(settings.scoring.settings).toEqual(SCORING_DEFAULTS.half_ppr);
  });
});
