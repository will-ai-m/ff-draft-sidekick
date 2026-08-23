import { describe, expect, it } from 'vitest';

import {
  crosswalkFixtureCsv,
  ecrFixtureHtml,
  ffcFixture,
  sleeperPlayersFixture,
} from '../../test/msw/snapshotHandlers';
import { parseCrosswalkCsv } from './crosswalk';
import { parseEcrHtml } from './fantasypros';
import { parseAdpResponse } from './ffc';
import {
  assignSamplingRanks,
  matchSnapshots,
  normalizeName,
  normalizePosition,
  normalizeTeam,
} from './match';
import type { SleeperPlayerRecord } from './types';

const ecr = () => parseEcrHtml(ecrFixtureHtml());
const adp = () =>
  parseAdpResponse(ffcFixture(), {
    source: 'ffc',
    teamCountRequested: 10,
    teamCountUsed: 10,
    exactPool: true,
  });
const crosswalk = () => parseCrosswalkCsv(crosswalkFixtureCsv());
const sleeper = () => sleeperPlayersFixture() as unknown as Record<string, SleeperPlayerRecord>;

const runMatch = (overrides: Partial<Parameters<typeof matchSnapshots>[0]> = {}) =>
  matchSnapshots({
    ecr: ecr(),
    adp: adp(),
    crosswalk: crosswalk(),
    sleeperPlayers: sleeper(),
    ...overrides,
  });

describe('normalizeName (AC-25)', () => {
  it('mirrors the crosswalk merge_name convention and collapses to a whitespace-free key', () => {
    expect(normalizeName('Jahmyr Gibbs')).toBe(normalizeName('jahmyr gibbs'));
    expect(normalizeName("Ja'Marr Chase")).toBe(normalizeName('jamarr chase'));
    expect(normalizeName('A.J. Brown')).toBe(normalizeName('aj brown'));
  });

  it('strips generational suffixes so "Marvin Harrison Jr." meets "marvin harrison"', () => {
    expect(normalizeName('Marvin Harrison Jr.')).toBe(normalizeName('marvin harrison'));
    expect(normalizeName('Kenneth Walker III')).toBe(normalizeName('kenneth walker'));
    expect(normalizeName('Michael Penix Jr.')).toBe(normalizeName('Michael Penix'));
  });

  it('does not strip a suffix that is part of the name proper', () => {
    expect(normalizeName('Amon-Ra St. Brown')).toBe('amonrastbrown');
  });
});

describe('normalizePosition', () => {
  it('maps every source feed\'s position spelling onto Sidekick positions', () => {
    expect(normalizePosition('PK')).toBe('K'); // FFC kickers
    expect(normalizePosition('DEF')).toBe('DST'); // FFC + Sleeper defenses
    expect(normalizePosition('DST')).toBe('DST'); // FantasyPros defenses
    expect(normalizePosition('RB')).toBe('RB');
    expect(normalizePosition('OL')).toBeNull();
  });
});

describe('normalizeTeam', () => {
  it('reconciles the abbreviations the feeds spell differently', () => {
    // Verified live: FantasyPros ships the Jacksonville DST as "JAC", Sleeper keys it "JAX".
    expect(normalizeTeam('JAC')).toBe('JAX');
    // The crosswalk uses the three-letter-everywhere convention for the Raiders.
    expect(normalizeTeam('LVR')).toBe('LV');
    expect(normalizeTeam('OAK')).toBe('LV');
    expect(normalizeTeam('WSH')).toBe('WAS');
    expect(normalizeTeam('LA')).toBe('LAR');
    expect(normalizeTeam('SD')).toBe('LAC');
  });

  it('leaves an already-canonical code and a free agent alone', () => {
    expect(normalizeTeam('DET')).toBe('DET');
    expect(normalizeTeam('FA')).toBeNull();
    expect(normalizeTeam(null)).toBeNull();
  });
});

describe('matchSnapshots — ID-first path (AC-25)', () => {
  it('joins ECR rows to Sleeper ids through the crosswalk fantasypros_id', () => {
    const result = runMatch();

    const byFpId = new Map(result.players.map((p) => [p.fantasyProsId, p]));
    expect(byFpId.get(22968)).toMatchObject({ sleeperPlayerId: '9221', matchedBy: 'crosswalk-id' });
    expect(byFpId.get(19788)).toMatchObject({ sleeperPlayerId: '7564', matchedBy: 'crosswalk-id' });
    expect(byFpId.get(22955)).toMatchObject({ sleeperPlayerId: '11604', matchedBy: 'crosswalk-id' });
    expect(byFpId.get(22936)).toMatchObject({ sleeperPlayerId: '8130', matchedBy: 'crosswalk-id' });
    expect(byFpId.get(17298)).toMatchObject({ sleeperPlayerId: '4984', matchedBy: 'crosswalk-id' });
    expect(byFpId.get(23982)).toMatchObject({ sleeperPlayerId: '8210', matchedBy: 'crosswalk-id' });
    expect(byFpId.get(26068)).toMatchObject({ sleeperPlayerId: '11533', matchedBy: 'crosswalk-id' });

    expect(result.counts.matchedByCrosswalkId).toBe(7);
  });
});

describe('matchSnapshots — normalized-name fallback (AC-25)', () => {
  it('matches Roman Wilson by name, because the crosswalk carries a stale fantasypros_id for him', () => {
    const result = runMatch();

    // ecrData says player_id 28896; db_playerids.csv still says 26160 — the ID hop dead-ends.
    expect(crosswalk().byFantasyProsId.has('28896')).toBe(false);

    const wilson = result.players.find((p) => p.fantasyProsId === 28896);
    expect(wilson).toMatchObject({
      sleeperPlayerId: '11630',
      matchedBy: 'normalized-name',
      position: 'WR',
    });
    expect(result.counts.matchedByName).toBe(1);
  });

  it('falls back to the name path when the crosswalk sleeper_id is absent from the live dump', () => {
    const dump = sleeper();
    const chase = dump['7564']!;
    // Same player, different Sleeper key: the crosswalk's 7564 no longer resolves.
    const result = runMatch({
      sleeperPlayers: { ...Object.fromEntries(Object.entries(dump).filter(([k]) => k !== '7564')), '99999': { ...chase, player_id: '99999' } },
    });

    expect(result.players.find((p) => p.fantasyProsId === 19788)).toMatchObject({
      sleeperPlayerId: '99999',
      matchedBy: 'normalized-name',
    });
  });

  it('leaves an ambiguous name unmatched rather than guessing between two players', () => {
    const dump = sleeper();
    const allen = dump['4984']!;
    // Same name, same position, same team: nothing left to disambiguate on.
    const result = runMatch({
      crosswalk: { ...crosswalk(), byFantasyProsId: new Map(), byGsisId: new Map() },
      sleeperPlayers: { ...dump, '4985': { ...allen, player_id: '4985' } },
    });

    expect(result.players.find((p) => p.fantasyProsId === 17298)).toBeUndefined();
    expect(result.unmatched).toContainEqual(
      expect.objectContaining({ name: 'Josh Allen', source: 'ecr' }),
    );
  });

  it('never assigns the same Sleeper player to two snapshot rows', () => {
    const ids = runMatch().players.map((p) => p.sleeperPlayerId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('matchSnapshots — DST by team abbreviation (AC-25)', () => {
  it('matches the Houston DST row to Sleeper\'s team-defense pseudo-player, not via the crosswalk', () => {
    const result = runMatch();

    const houston = result.players.find((p) => p.fantasyProsId === 8120);
    expect(houston).toMatchObject({
      sleeperPlayerId: 'HOU',
      position: 'DST',
      team: 'HOU',
      matchedBy: 'team-defense',
    });
    // The player crosswalk is players-only; no DST row exists in it at all.
    expect(crosswalk().rows.some((r) => r.name === 'Houston Texans')).toBe(false);
  });

  it('carries the DST ADP across from the FFC "Houston Defense" row', () => {
    const houston = runMatch().players.find((p) => p.sleeperPlayerId === 'HOU');
    expect(houston?.adp).toBe(100.5);
  });

  it('matches a DST across a team-abbreviation spelling difference between feeds', () => {
    const dump = sleeper();
    const source = parseEcrHtml(ecrFixtureHtml());
    const jacksonville = {
      ...source.entries.find((e) => e.position === 'DST')!,
      fantasyProsId: 8121,
      playerName: 'Jacksonville Jaguars',
      team: 'JAC', // FantasyPros' spelling
    };
    const result = runMatch({
      ecr: { ...source, entries: [...source.entries, jacksonville] },
      sleeperPlayers: {
        ...dump,
        // Sleeper's spelling.
        JAX: { player_id: 'JAX', position: 'DEF', team: 'JAX', fantasy_positions: ['DEF'] },
      },
    });

    expect(result.players.find((p) => p.fantasyProsId === 8121)).toMatchObject({
      sleeperPlayerId: 'JAX',
      matchedBy: 'team-defense',
    });
  });
});

describe('matchSnapshots — unmatched entries (AC-25)', () => {
  it('lists an ECR row that resolves through neither path and excludes it from the matched set', () => {
    const result = runMatch();

    // Chip Trayanum: crosswalk row exists but its sleeper_id is "NA", and no Sleeper record matches.
    expect(result.players.some((p) => p.fantasyProsId === 28114)).toBe(false);
    expect(result.unmatched).toContainEqual({
      name: 'Chip Trayanum',
      position: 'RB',
      source: 'ecr',
    });
  });

  it('lists an ADP row that resolves to no Sleeper player, separately from the ECR ones', () => {
    const result = runMatch();

    expect(result.unmatched).toContainEqual({
      name: 'Germie Bernard',
      position: 'WR',
      source: 'adp',
    });
    expect(result.counts.unmatchedEcr).toBe(1);
    expect(result.counts.unmatchedAdp).toBe(1);
  });

  it('produces no matches at all when no ECR snapshot loaded (AC-28)', () => {
    const result = runMatch({ ecr: null });
    expect(result.players).toHaveLength(0);
  });
});

describe('matchSnapshots — ADP attachment and the missing-ADP fallback (AC-26)', () => {
  it('attaches ADP to matched players by normalized name', () => {
    const byId = runMatch().byPlayerId;
    expect(byId.get('9221')?.adp).toBe(1.5);
    expect(byId.get('8130')?.adp).toBe(38.2);
    expect(byId.get('11533')?.adp).toBe(130);
  });

  it('flags a matched player with no ADP entry without listing them as unmatched', () => {
    const result = runMatch();

    const okonkwo = result.byPlayerId.get('8210');
    expect(okonkwo).toMatchObject({ adp: null, adpMissing: true, matchedBy: 'crosswalk-id' });
    expect(result.playersMissingAdp).toContainEqual({ playerId: '8210', name: 'Chig Okonkwo' });
    expect(result.unmatched.some((u) => u.name.includes('Okonkwo'))).toBe(false);
  });

  it('orders the position group by ADP, slotting the ADP-less player in by ECR order', () => {
    const result = runMatch();
    const tes = result.players
      .filter((p) => p.position === 'TE')
      .sort((a, b) => a.samplingRank - b.samplingRank);

    // ADP order (McBride 38.2 < Bowers 43) deliberately inverts ECR order (Bowers 17 < McBride 24),
    // and Okonkwo — no ADP — takes his ECR-within-position slot, third.
    expect(tes.map((p) => p.playerName)).toEqual(['Trey McBride', 'Brock Bowers', 'Chig Okonkwo']);
    expect(tes.map((p) => p.samplingRank)).toEqual([1, 2, 3]);
  });

  it('gives every player an ECR-ordered sampling rank when no ADP snapshot loaded at all', () => {
    const result = runMatch({ adp: null });
    const tes = result.players
      .filter((p) => p.position === 'TE')
      .sort((a, b) => a.samplingRank - b.samplingRank);

    expect(tes.map((p) => p.playerName)).toEqual(['Brock Bowers', 'Trey McBride', 'Chig Okonkwo']);
    expect(result.players.every((p) => p.adpMissing)).toBe(true);
  });
});

describe('matchSnapshots — ADP-only rows (AC-50\'s K/DST fallback)', () => {
  /** The AC-23 snapshot: a fetched cheat sheet whose K and DST rows are absent. */
  const skillOnlyEcr = () => {
    const source = ecr();
    return {
      ...source,
      entries: source.entries.filter((e) => e.position !== 'K' && e.position !== 'DST'),
    };
  };

  it('emits the ADP feed\'s K and DST as ADP-only rows when the ECR snapshot carries none', () => {
    const result = runMatch({ ecr: skillOnlyEcr() });

    expect(result.players.some((p) => p.position === 'K' || p.position === 'DST')).toBe(false);
    expect(result.adpOnlyPlayers.map((p) => p.sleeperPlayerId).sort()).toEqual(['11533', 'HOU']);
    expect(result.adpOnlyPlayers.find((p) => p.sleeperPlayerId === 'HOU')).toMatchObject({
      position: 'DST',
      ecrRank: null,
      positionalRank: null,
      fantasyProsId: null,
      adp: 100.5,
      adpMissing: false,
      matchedBy: 'team-defense',
    });
    expect(result.adpOnlyPlayers.find((p) => p.sleeperPlayerId === '11533')).toMatchObject({
      playerName: 'Brandon Aubrey',
      position: 'K',
      ecrRank: null,
      adp: 130,
      matchedBy: 'normalized-name',
    });
  });

  it('keeps the ADP-only rows out of the ECR-ordered board and its id index (AS-8)', () => {
    const result = runMatch({ ecr: skillOnlyEcr() });

    expect(result.players.every((p) => p.ecrRank !== null)).toBe(true);
    expect(result.byPlayerId.has('HOU')).toBe(false);
    expect(result.byPlayerId.has('11533')).toBe(false);
    // An ADP row that reached a Sleeper player is matched, not unmatched (AC-25).
    expect(result.unmatched.some((u) => u.name === 'Houston Defense')).toBe(false);
  });

  it('ranks the ADP-only rows of one position in ADP order', () => {
    const source = adp();
    const withSecondDefense = {
      ...source,
      entries: [
        ...source.entries,
        {
          ffcPlayerId: 9001,
          playerName: 'San Francisco Defense',
          position: 'DST' as const,
          team: 'SF',
          adp: 90.2,
          timesDrafted: 120,
        },
      ],
    };
    const result = runMatch({
      ecr: skillOnlyEcr(),
      adp: withSecondDefense,
      sleeperPlayers: {
        ...sleeper(),
        SF: { player_id: 'SF', position: 'DEF', fantasy_positions: ['DEF'], team: 'SF' },
      },
    });

    const defenses = result.adpOnlyPlayers.filter((p) => p.position === 'DST');
    // ADP order (SF 90.2 before HOU 100.5), which is the only order these rows can have.
    expect(defenses.map((p) => p.sleeperPlayerId)).toEqual(['SF', 'HOU']);
    expect(defenses.map((p) => p.samplingRank)).toEqual([1, 2]);
  });

  it('emits nothing extra when the ECR snapshot ranks the K and DST itself', () => {
    const result = runMatch();

    expect(result.players.some((p) => p.sleeperPlayerId === 'HOU')).toBe(true);
    expect(result.adpOnlyPlayers).toHaveLength(0);
  });
});

describe('assignSamplingRanks (AC-26)', () => {
  const entry = (playerName: string, ecrRank: number, adp: number | null) =>
    ({ playerName, ecrRank, adp }) as { playerName: string; ecrRank: number; adp: number | null };

  it('ranks ADP-having players by ADP and ADP-less players by ECR within the position', () => {
    const ranked = assignSamplingRanks([
      entry('has-adp-2', 10, 20),
      entry('no-adp-top', 1, null),
      entry('has-adp-1', 30, 5),
    ]);
    expect(ranked.map((r) => [r.playerName, r.samplingRank])).toEqual([
      ['no-adp-top', 1],
      ['has-adp-1', 1],
      ['has-adp-2', 2],
    ]);
  });

  it('breaks a rank tie on ECR, so the ordering authority stays FantasyPros (AS-8)', () => {
    const ranked = assignSamplingRanks([entry('worse-ecr', 50, 5), entry('better-ecr', 2, null)]);
    expect(ranked.map((r) => r.playerName)).toEqual(['better-ecr', 'worse-ecr']);
  });
});
