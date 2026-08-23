import { PARAMETER_DEFAULTS } from '@sidekick/shared';
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
import type { AdpSnapshot, EcrSnapshot, SleeperPlayerRecord, SnapshotBundle } from './types';

const NOW = new Date('2026-08-22T18:00:00.000Z');
const FRESH = new Date('2026-08-22T12:00:00.000Z').toISOString(); // 6 h old
const STALE = new Date('2026-08-20T12:00:00.000Z').toISOString(); // 54 h old

const league = { teamCount: 10, scoringType: 'half_ppr', rounds: 15 };

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
    const raw = ecrFixture() as { players: { player_position_id: string }[] };
    const skillOnly = parseEcrHtml(
      ecrFixtureHtml({
        ...raw,
        players: raw.players.filter(
          (p) => p.player_position_id !== 'K' && p.player_position_id !== 'DST',
        ),
      }),
    );
    expect(codes(makeBundle({ ecr: { ...skillOnly, capturedAt: FRESH } }))).toContain(
      'kdst-missing',
    );
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
  it('does not warn for a half-PPR league', () => {
    expect(codes(makeBundle())).not.toContain('scoring-format-mismatch');
  });

  it('warns when the attached draft\'s scoring label is not half-PPR', () => {
    const check = buildPreDraftCheck({
      bundle: makeBundle(),
      league: { ...league, scoringType: 'ppr' },
      config: PARAMETER_DEFAULTS,
      now: NOW,
    });
    const warning = check.warnings.find((w) => w.code === 'scoring-format-mismatch');
    expect(warning?.message).toContain('ppr');
    expect(warning?.message).toMatch(/half/i);
  });

  it('echoes the league summary read from the draft API', () => {
    expect(build(makeBundle()).leagueSummary).toEqual(league);
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
