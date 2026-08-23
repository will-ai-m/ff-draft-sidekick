import { PARAMETER_DEFAULTS, SCORING_DEFAULTS } from '@sidekick/shared';
import { describe, expect, it } from 'vitest';

import {
  crosswalkFixtureCsv,
  ecrFixture,
  ecrFixtureHtml,
  ffcFixture,
  sleeperPlayersFixture,
} from '../../test/msw/snapshotHandlers';
import { parseCrosswalkCsv } from './crosswalk';
import { parseEcrHtml } from './fantasypros';
import { parseAdpResponse } from './ffc';
import { matchSnapshots } from './match';
import { buildPreDraftCheck, rankingsDisabledReason } from './predraftCheck';
import type { LeagueSummary } from './predraftCheck';
import type { AdpSnapshot, EcrSnapshot, SleeperPlayerRecord, SnapshotBundle } from './types';

const NOW = new Date('2026-08-22T18:00:00.000Z');
const FRESH = new Date('2026-08-22T12:00:00.000Z').toISOString(); // 6 h old
const STALE = new Date('2026-08-20T12:00:00.000Z').toISOString(); // 54 h old

const league: LeagueSummary = { teamCount: 10, scoringType: 'half_ppr', rounds: 15 };
const HALF_PPR_SETTINGS: Record<string, number> = { ...SCORING_DEFAULTS.half_ppr };

const makeBundle = (overrides: Partial<SnapshotBundle> = {}): SnapshotBundle => {
  const ecr: EcrSnapshot = { ...parseEcrHtml(ecrFixtureHtml()), capturedAt: FRESH };
  const adp: AdpSnapshot = {
    ...parseAdpResponse(ffcFixture(), {
      source: 'https://fantasyfootballcalculator.com/api/v1/adp/half-ppr?teams=10&year=2026',
      teamCountRequested: 10,
      teamCountUsed: 10,
      exactPool: true,
    }),
    capturedAt: FRESH,
  };
  const crosswalk = parseCrosswalkCsv(crosswalkFixtureCsv());
  const base: SnapshotBundle = {
    ecr,
    ecrError: null,
    adp,
    adpError: null,
    crosswalk,
    matching: matchSnapshots({
      ecr,
      adp,
      crosswalk,
      sleeperPlayers: sleeperPlayersFixture() as unknown as Record<string, SleeperPlayerRecord>,
    }),
    loadedAt: NOW.toISOString(),
  };
  const merged = { ...base, ...overrides };
  if (overrides.ecr !== undefined || overrides.adp !== undefined) {
    merged.matching = matchSnapshots({
      ecr: merged.ecr,
      adp: merged.adp,
      crosswalk: merged.crosswalk,
      sleeperPlayers: sleeperPlayersFixture() as unknown as Record<string, SleeperPlayerRecord>,
    });
  }
  return merged;
};

/** AC-23's degenerate cheat sheet: a fetched ECR snapshot carrying no K and no DST rows. */
const skillOnlyEcr = (): EcrSnapshot => {
  const raw = ecrFixture() as { players: { player_position_id: string }[] };
  const parsed = parseEcrHtml(
    ecrFixtureHtml({
      ...raw,
      players: raw.players.filter(
        (p) => p.player_position_id !== 'K' && p.player_position_id !== 'DST',
      ),
    }),
  );
  return { ...parsed, capturedAt: FRESH };
};

const build = (bundle: SnapshotBundle) =>
  buildPreDraftCheck({ bundle, league, config: PARAMETER_DEFAULTS, now: NOW });

const codes = (bundle: SnapshotBundle) => build(bundle).warnings.map((w) => w.code);

describe('snapshot ages (AC-22)', () => {
  it('reports each snapshot\'s capture date and age in hours', () => {
    const check = build(makeBundle());
    expect(check.ecrSnapshot).toMatchObject({ capturedAt: FRESH, ageHours: 6 });
    expect(check.adpSnapshot).toMatchObject({ capturedAt: FRESH, ageHours: 6 });
    expect(check.ecrSnapshot?.source).toContain('fantasypros.com');
  });

  it('warns once per stale snapshot, at the configured threshold', () => {
    const bundle = makeBundle();
    const stale = makeBundle({
      ecr: { ...bundle.ecr!, capturedAt: STALE },
      adp: { ...bundle.adp!, capturedAt: STALE },
    });
    const check = build(stale);

    const staleWarnings = check.warnings.filter((w) => w.code === 'snapshot-stale');
    expect(staleWarnings).toHaveLength(2);
    expect(staleWarnings[0]?.message).toContain('24');
    expect(codes(makeBundle())).not.toContain('snapshot-stale');
  });

  it('reads the staleness threshold from config, not an inline 24', () => {
    const check = buildPreDraftCheck({
      bundle: makeBundle(),
      league,
      config: { ...PARAMETER_DEFAULTS, snapshotStalenessWarningHours: 1 },
      now: NOW,
    });
    expect(check.warnings.filter((w) => w.code === 'snapshot-stale')).toHaveLength(2);
  });
});

describe('K/DST presence (AC-23)', () => {
  it('does not warn when the ECR snapshot carries K and DST rows', () => {
    expect(codes(makeBundle())).not.toContain('kdst-missing');
  });

  it('warns when a fetched ECR snapshot has no K or DST rows', () => {
    expect(codes(makeBundle({ ecr: skillOnlyEcr() }))).toContain('kdst-missing');
  });

  it('promises the ADP fallback only when the ADP snapshot can actually supply it (AC-50)', () => {
    const warning = build(makeBundle({ ecr: skillOnlyEcr() })).warnings.find(
      (w) => w.code === 'kdst-missing',
    );
    expect(warning?.message).toMatch(/ADP order/);
  });

  it('says the filter will be empty when the ADP snapshot has no K/DST either', () => {
    const warning = build(makeBundle({ ecr: skillOnlyEcr(), adp: null })).warnings.find(
      (w) => w.code === 'kdst-missing',
    );
    expect(warning?.message).toMatch(/empty/);
    expect(warning?.message).not.toMatch(/fall back to ADP order/);
  });
});

describe('ADP pool (AC-24)', () => {
  it('names the source and pool parameters actually used', () => {
    const check = build(makeBundle());
    expect(check.adpSnapshot?.source).toContain('fantasyfootballcalculator.com');
    expect(check.adpSnapshot?.poolDescription).toContain('10-team');
  });

  it('warns when the pool substituted for the league\'s real team count', () => {
    const bundle = makeBundle();
    const substituted = makeBundle({
      adp: {
        ...bundle.adp!,
        teamCountRequested: 11,
        teamCountUsed: 12,
        exactPool: false,
        poolDescription: 'half-PPR, 12-team pool (no 11-team pool exists)',
      },
    });
    const warning = build(substituted).warnings.find((w) => w.code === 'adp-pool-substituted');
    expect(warning?.message).toMatch(/12-team/);
  });
});

describe('unmatched entries and missing ADP (AC-25, AC-26)', () => {
  it('lists every unmatched entry from both sources', () => {
    const check = build(makeBundle());
    expect(check.unmatchedEntries).toEqual(
      expect.arrayContaining([
        { name: 'Chip Trayanum', position: 'RB', source: 'ecr' },
        { name: 'Germie Bernard', position: 'WR', source: 'adp' },
      ]),
    );
    expect(check.unmatchedEntries).toHaveLength(2);
  });

  it('keeps matched-but-no-ADP players on a separate list', () => {
    const check = build(makeBundle());
    // Both are real: FFC's ~230-row board carries neither a TE19 nor a WR128.
    expect(check.playersMissingAdp).toEqual([
      { playerId: '8210', name: 'Chig Okonkwo' },
      { playerId: '11630', name: 'Roman Wilson' },
    ]);
    expect(check.unmatchedEntries.some((u) => u.name === 'Chig Okonkwo')).toBe(false);
    expect(check.unmatchedEntries.some((u) => u.name === 'Roman Wilson')).toBe(false);
  });
});

describe('scoring format (AC-27)', () => {
  /** A real league's granular dict, as `/v1/league/<id>` serves it (AC-30's read). */
  const leagueScoring = (settings: Record<string, number>): LeagueSummary => ({
    ...league,
    scoring: { source: 'league-settings', settings },
  });

  const warningFor = (summary: LeagueSummary | null) =>
    buildPreDraftCheck({
      bundle: makeBundle(),
      league: summary,
      config: PARAMETER_DEFAULTS,
      now: NOW,
    }).warnings.find((w) => w.code === 'scoring-format-mismatch');

  it('does not warn for a half-PPR league', () => {
    expect(codes(makeBundle())).not.toContain('scoring-format-mismatch');
  });

  it('does not warn when the league\'s own settings really are half-PPR', () => {
    expect(warningFor(leagueScoring({ ...HALF_PPR_SETTINGS }))).toBeUndefined();
  });

  it('lets the settings outrank the label in both directions', () => {
    // Labelled "ppr", but the dict pays 0.5 a reception: the rankings do fit this league.
    const summary = leagueScoring({ ...HALF_PPR_SETTINGS });
    expect(warningFor({ ...summary, scoringType: 'ppr' })).toBeUndefined();
  });

  it('warns on the settings, not the label, when a "half_ppr" league pays 1 per reception', () => {
    const warning = warningFor(leagueScoring({ ...HALF_PPR_SETTINGS, rec: 1 }));
    expect(warning?.message).toContain('rec 1 vs 0.5');
    // The label the user recognises is still in the text (it is what Sleeper shows them).
    expect(warning?.message).toContain('half_ppr');
  });

  it('warns for the live counterexample: 6-point passing TDs under a conventional label', () => {
    const warning = warningFor(leagueScoring({ ...HALF_PPR_SETTINGS, pass_td: 6, pass_int: -2 }));
    expect(warning?.message).toContain('pass_td 6 vs 4');
    expect(warning?.message).toContain('pass_int -2 vs -1');
  });

  it('warns for a TE-premium bonus, which no scoring label can express', () => {
    const warning = warningFor(leagueScoring({ ...HALF_PPR_SETTINGS, bonus_rec_te: 0.5 }));
    expect(warning?.message).toContain('bonus_rec_te 0.5 vs 0');
  });

  it('treats a key absent from the dict as zero, never as a match', () => {
    const noReception = Object.fromEntries(
      Object.entries(HALF_PPR_SETTINGS).filter(([key]) => key !== 'rec'),
    );
    expect(warningFor(leagueScoring(noReception))?.message).toContain('rec 0 vs 0.5');
  });

  it('ignores the keys half-PPR rankings do not depend on', () => {
    // A real dict carries ~81 keys; kicking distances and IDP move no skill player's rank.
    expect(
      warningFor(leagueScoring({ ...HALF_PPR_SETTINGS, fgm_40_49: 4, idp_sack: 2, def_st_td: 6 })),
    ).toBeUndefined();
  });

  it('falls back to the coarse label when there is no dict to read (a mock)', () => {
    // A mock has `league_id: null`, so nothing granular exists; the label is all there is.
    expect(warningFor({ ...league, scoringType: 'ppr' })?.message).toContain('ppr');
    expect(warningFor({ ...league, scoringType: 'half_ppr' })).toBeUndefined();
    // Sleeper qualifies the label for non-redraft formats; "half" still means half-PPR.
    expect(warningFor({ ...league, scoringType: 'dynasty_half_ppr' })).toBeUndefined();
  });

  it('ignores a fallback scoring table, which would only ever match itself', () => {
    const check = buildPreDraftCheck({
      bundle: makeBundle(),
      league: {
        ...league,
        scoringType: 'ppr',
        scoring: { source: 'scoring-type-default', settings: { ...HALF_PPR_SETTINGS, rec: 1 } },
      },
      config: PARAMETER_DEFAULTS,
      now: NOW,
    });
    const warning = check.warnings.find((w) => w.code === 'scoring-format-mismatch');
    // The label, not the table, is what carries the news here.
    expect(warning?.message).toContain('"ppr"');
    expect(warning?.message).not.toContain('rec 1 vs 0.5');
  });

  it('echoes the league summary read from the draft API, without the scoring dict', () => {
    const check = buildPreDraftCheck({
      bundle: makeBundle(),
      league: leagueScoring({ ...HALF_PPR_SETTINGS }),
      config: PARAMETER_DEFAULTS,
      now: NOW,
    });
    expect(check.leagueSummary).toEqual(league);
  });
});

describe('no ECR snapshot loaded (AC-28)', () => {
  const noEcr = () => makeBundle({ ecr: null, ecrError: 'HTTP 503 from FantasyPros' });

  it('warns explicitly and reports a disabled reason for the rankings-driven surfaces', () => {
    const check = build(noEcr());
    expect(codes(noEcr())).toContain('no-ecr-loaded');
    expect(check.ecrSnapshot).toBeNull();
    expect(rankingsDisabledReason(noEcr())).toMatch(/no rankings loaded/i);
    expect(rankingsDisabledReason(noEcr())).toContain('HTTP 503 from FantasyPros');
  });

  it('leaves the disabled reason null when rankings did load, so sync-only surfaces stay on', () => {
    expect(rankingsDisabledReason(makeBundle())).toBeNull();
  });
});
