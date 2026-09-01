import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  createRequestCounts,
  ecrFixture,
  ecrFixtureHtml,
  snapshotHandlers,
} from '../../test/msw/snapshotHandlers';
import { fetchEcrSnapshot, parseEcrHtml, snapshotHasKickersAndDefenses , FANTASYPROS_POSITIONAL_TIER_URLS, fetchPositionalTiers } from './fantasypros';

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

describe('fetchPositionalTiers (amended 2026-09-01)', () => {
  const page = (players: Record<string, unknown>[]): string =>
    `<html><body><script>var ecrData = ${JSON.stringify({ scoring: 'HALF', players })};</script></body></html>`;

  const row = (id: number, name: string, position: string, rank: number, tier: number | null) => ({
    player_id: id,
    player_name: name,
    player_position_id: position,
    rank_ecr: rank,
    pos_rank: `${position}${rank}`,
    tier,
  });

  const stub = (bodies: Partial<Record<string, string | Error>>): typeof fetch =>
    (async (url: unknown) => {
      const body = bodies[String(url)];
      if (body instanceof Error) throw body;
      if (body === undefined) return new Response(null, { status: 404 });
      return new Response(body, { status: 200 });
    }) as typeof fetch;

  it('joins tiers by FantasyPros id across all four pages', async () => {
    const tiers = await fetchPositionalTiers({
      fetchImpl: stub({
        [FANTASYPROS_POSITIONAL_TIER_URLS.QB]: page([row(17298, 'Josh Allen', 'QB', 1, 1)]),
        [FANTASYPROS_POSITIONAL_TIER_URLS.RB]: page([row(22968, 'Jahmyr Gibbs', 'RB', 1, 1)]),
        [FANTASYPROS_POSITIONAL_TIER_URLS.WR]: page([row(19788, "Ja'Marr Chase", 'WR', 1, 1)]),
        [FANTASYPROS_POSITIONAL_TIER_URLS.TE]: page([
          row(22955, 'Brock Bowers', 'TE', 1, 1),
          row(23982, 'Chig Okonkwo', 'TE', 2, 3),
        ]),
      }),
    });

    expect(tiers.errors).toEqual({});
    expect(tiers.byFantasyProsId.get(17298)).toBe(1);
    expect(tiers.byFantasyProsId.get(23982)).toBe(3);
  });

  it('records a per-position error for a failed page and keeps the others', async () => {
    const tiers = await fetchPositionalTiers({
      fetchImpl: stub({
        [FANTASYPROS_POSITIONAL_TIER_URLS.QB]: new Error('socket hang up'),
        [FANTASYPROS_POSITIONAL_TIER_URLS.RB]: page([row(22968, 'Jahmyr Gibbs', 'RB', 1, 2)]),
        [FANTASYPROS_POSITIONAL_TIER_URLS.WR]: page([row(19788, "Ja'Marr Chase", 'WR', 1, 1)]),
        [FANTASYPROS_POSITIONAL_TIER_URLS.TE]: page([row(22955, 'Brock Bowers', 'TE', 1, 1)]),
      }),
    });

    expect(tiers.errors.QB).toMatch(/socket hang up/);
    expect(tiers.errors.RB).toBeUndefined();
    expect(tiers.byFantasyProsId.get(22968)).toBe(2);
    expect(tiers.byFantasyProsId.has(17298)).toBe(false);
  });

  it('treats a page that parses but ships no tier column as an error, not silent nulls', async () => {
    const tiers = await fetchPositionalTiers({
      fetchImpl: stub({
        [FANTASYPROS_POSITIONAL_TIER_URLS.QB]: page([row(17298, 'Josh Allen', 'QB', 1, null)]),
        [FANTASYPROS_POSITIONAL_TIER_URLS.RB]: page([row(22968, 'Jahmyr Gibbs', 'RB', 1, 1)]),
        [FANTASYPROS_POSITIONAL_TIER_URLS.WR]: page([row(19788, "Ja'Marr Chase", 'WR', 1, 1)]),
        [FANTASYPROS_POSITIONAL_TIER_URLS.TE]: page([row(22955, 'Brock Bowers', 'TE', 1, 1)]),
      }),
    });

    expect(tiers.errors.QB).toMatch(/no tiers/);
  });

  it('ignores rows whose position does not match the page they came from', async () => {
    const tiers = await fetchPositionalTiers({
      fetchImpl: stub({
        [FANTASYPROS_POSITIONAL_TIER_URLS.QB]: page([
          row(17298, 'Josh Allen', 'QB', 1, 1),
          row(22968, 'Jahmyr Gibbs', 'RB', 2, 9),
        ]),
        [FANTASYPROS_POSITIONAL_TIER_URLS.RB]: page([row(22968, 'Jahmyr Gibbs', 'RB', 1, 1)]),
        [FANTASYPROS_POSITIONAL_TIER_URLS.WR]: page([row(19788, "Ja'Marr Chase", 'WR', 1, 1)]),
        [FANTASYPROS_POSITIONAL_TIER_URLS.TE]: page([row(22955, 'Brock Bowers', 'TE', 1, 1)]),
      }),
    });

    expect(tiers.byFantasyProsId.get(22968)).toBe(1);
  });
});
