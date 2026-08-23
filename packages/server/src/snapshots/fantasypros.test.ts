import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  createRequestCounts,
  ecrFixture,
  ecrFixtureHtml,
  snapshotHandlers,
} from '../../test/msw/snapshotHandlers';
import { fetchEcrSnapshot, parseEcrHtml, snapshotHasKickersAndDefenses } from './fantasypros';

const server = setupServer(...snapshotHandlers());
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('parseEcrHtml (AC-23)', () => {
  it('extracts the embedded ecrData JSON and normalizes every row', () => {
    const snapshot = parseEcrHtml(ecrFixtureHtml());

    expect(snapshot.scoring).toBe('HALF');
    expect(snapshot.season).toBe(2026);
    expect(snapshot.entries).toHaveLength(10);

    const gibbs = snapshot.entries.find((e) => e.fantasyProsId === 22968);
    expect(gibbs).toMatchObject({
      playerName: 'Jahmyr Gibbs',
      position: 'RB',
      team: 'DET',
      ecrRank: 1,
      positionalRank: 1,
      tier: 1,
      byeWeek: 6,
    });

    // Ordering is FantasyPros' own `rank_ecr`, surfaced raw and never re-sorted (AS-8).
    expect(snapshot.entries.map((e) => e.ecrRank)).toEqual([
      ...snapshot.entries.map((e) => e.ecrRank),
    ].sort((a, b) => a - b));
  });

  it('reads the positional rank out of the "RB1"-style pos_rank string', () => {
    const snapshot = parseEcrHtml(ecrFixtureHtml());
    const wilson = snapshot.entries.find((e) => e.playerName === 'Roman Wilson');
    expect(wilson?.positionalRank).toBe(128);
  });

  it('derives capturedAt from last_updated_ts (AC-22)', () => {
    const snapshot = parseEcrHtml(ecrFixtureHtml());
    const raw = ecrFixture() as { last_updated_ts: number };
    expect(snapshot.capturedAt).toBe(new Date(raw.last_updated_ts * 1000).toISOString());
  });

  it('throws when the page carries no ecrData embed', () => {
    expect(() => parseEcrHtml('<html><body>nothing here</body></html>')).toThrow(/ecrData/i);
  });

  it('throws when the embed is present but fails schema validation', () => {
    const html = ecrFixtureHtml({ players: [{ player_name: 'No Rank' }] });
    expect(() => parseEcrHtml(html)).toThrow(/FantasyPros/i);
  });

  it('drops rows whose position is not one Sidekick tracks, without failing the parse', () => {
    const raw = ecrFixture() as { players: Record<string, unknown>[] };
    const html = ecrFixtureHtml({
      ...raw,
      players: [...raw.players, { ...raw.players[0], player_id: 999, player_position_id: 'OL' }],
    });
    const snapshot = parseEcrHtml(html);
    expect(snapshot.entries.map((e) => e.fantasyProsId)).not.toContain(999);
    expect(snapshot.entries).toHaveLength(10);
  });
});

describe('snapshotHasKickersAndDefenses (AC-23)', () => {
  it('is true for the fixture, which carries a K and a DST row', () => {
    expect(snapshotHasKickersAndDefenses(parseEcrHtml(ecrFixtureHtml()))).toBe(true);
  });

  it('is false once K and DST rows are removed', () => {
    const raw = ecrFixture() as { players: { player_position_id: string }[] };
    const html = ecrFixtureHtml({
      ...raw,
      players: raw.players.filter((p) => p.player_position_id !== 'K' && p.player_position_id !== 'DST'),
    });
    expect(snapshotHasKickersAndDefenses(parseEcrHtml(html))).toBe(false);
  });
});

describe('fetchEcrSnapshot', () => {
  it('fetches the cheat-sheet page and returns the parsed snapshot', async () => {
    const counts = createRequestCounts();
    server.use(...snapshotHandlers({ counts }));

    const snapshot = await fetchEcrSnapshot();

    expect(counts.ecr).toBe(1);
    expect(snapshot.entries).toHaveLength(10);
    expect(snapshot.source).toContain('fantasypros.com');
  });

  it('throws on a non-200 response so the caller can fall back to "no rankings loaded" (AC-28)', async () => {
    server.use(...snapshotHandlers({ ecrStatus: 503 }));
    await expect(fetchEcrSnapshot()).rejects.toThrow(/503/);
  });
});
