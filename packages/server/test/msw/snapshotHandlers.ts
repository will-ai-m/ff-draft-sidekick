/**
 * msw handlers for FR-4's three external snapshot sources, plus loaders for the trimmed
 * real-data fixtures every T3 suite shares.
 *
 * Kept separate from `test/msw/handlers.ts` (T2's Sleeper handlers) so the two tasks own
 * disjoint files; a later task can compose both arrays into one `setupServer(...)` call.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { delay, http, HttpResponse } from 'msw';

import { CROSSWALK_URL } from '../../src/snapshots/crosswalk';
import {
  FANTASYPROS_HALF_PPR_URL,
  FANTASYPROS_POSITIONAL_TIER_URLS,
} from '../../src/snapshots/fantasypros';
import { FFC_ADP_BASE_URL } from '../../src/snapshots/ffc';

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures');

const read = (name: string): string => readFileSync(resolve(FIXTURES, name), 'utf8');

/** The FantasyPros half-PPR cheat-sheet slice: 10 real rows spanning QB/RB/WR/TE/K/DST. */
export const ecrFixture = (): Record<string, unknown> =>
  JSON.parse(read('ecrData-slice.json')) as Record<string, unknown>;

/** The same slice wrapped in the `var ecrData = {...};` embed the real page ships. */
export const ecrFixtureHtml = (data: unknown = ecrFixture()): string =>
  [
    '<!doctype html><html><head><title>Half PPR Cheat Sheet</title></head><body>',
    '<script>',
    '  var ecrTiers = {"tier1": []};',
    `  var ecrData = ${JSON.stringify(data)};`,
    '  var somethingElse = 1;',
    '</script>',
    '</body></html>',
  ].join('\n');

/**
 * Positional tiers per fixture player, keyed player_id — deliberately different numbers from
 * the overall slice's `tier` column wherever that matters (Josh Allen: overall tier 3,
 * positional QB Tier 1), so a test asserting a positional tier cannot pass by reading the
 * overall one.
 */
export const positionalTiersFixture: Readonly<Record<'QB' | 'RB' | 'WR' | 'TE', Record<string, number>>> = {
  QB: { '17298': 1 },
  RB: { '22968': 1, '28114': 6 },
  WR: { '19788': 1, '28896': 5 },
  TE: { '22955': 1, '22936': 1, '23982': 3 },
};

/** One positional cheat-sheet page: the slice's players of that position, positionally tiered. */
export const positionalTierPageHtml = (position: 'QB' | 'RB' | 'WR' | 'TE'): string => {
  const players = (ecrFixture()['players'] as Record<string, unknown>[])
    .filter((player) => player['player_position_id'] === position)
    .map((player, index) => ({
      ...player,
      rank_ecr: index + 1,
      pos_rank: `${position}${index + 1}`,
      tier: positionalTiersFixture[position][String(player['player_id'])] ?? null,
    }));
  return ecrFixtureHtml({ scoring: position === 'QB' ? 'STD' : 'HALF', players });
};

/** The Fantasy Football Calculator half-PPR ADP slice (10-team pool). */
export const ffcFixture = (): Record<string, unknown> =>
  JSON.parse(read('ffc-slice.json')) as Record<string, unknown>;

/** The DynastyProcess `db_playerids.csv` slice, real header, 10 real rows. */
export const crosswalkFixtureCsv = (): string => read('crosswalk-slice.csv');

/** A slice of Sleeper's `/v1/players/nfl` dump covering every matchable fixture player. */
export const sleeperPlayersFixture = (): Record<string, Record<string, unknown>> =>
  JSON.parse(read('sleeper-players-slice.json')) as Record<string, Record<string, unknown>>;

/** Counts every request msw served, so "fetched exactly once" (AC-29) is assertable. */
export interface RequestCounts {
  ecr: number;
  adp: number;
  crosswalk: number;
  /** Requests across all four positional tier pages. */
  positionalTiers: number;
}

export const createRequestCounts = (): RequestCounts => ({
  ecr: 0,
  adp: 0,
  crosswalk: 0,
  positionalTiers: 0,
});

export interface SnapshotHandlerOptions {
  counts?: RequestCounts;
  /** Override the ecrData payload embedded in the served HTML. */
  ecrData?: unknown;
  /** Serve this instead of the fixture HTML (e.g. a page with no embed at all). */
  ecrHtml?: string;
  /** Serve a non-200 for the ECR page, to exercise AC-28's "no rankings loaded" path. */
  ecrStatus?: number;
  /** Stall the ECR response this long, so a caller's own timeout is what ends the wait. */
  ecrDelayMs?: number;
  /** Override the FFC payload served, e.g. an ADP board carrying K/DST the ECR one does not. */
  adpData?: Record<string, unknown>;
  adpStatus?: number;
  /** The ADP half of {@link SnapshotHandlerOptions.ecrDelayMs}. */
  adpDelayMs?: number;
  crosswalkStatus?: number;
  crosswalkDelayMs?: number;
  /** Serve a non-200 for every positional tier page, to exercise the degraded-tier path. */
  positionalTierStatus?: number;
}

export const snapshotHandlers = (options: SnapshotHandlerOptions = {}) => {
  const counts = options.counts ?? createRequestCounts();
  return [
    http.get(FANTASYPROS_HALF_PPR_URL, async () => {
      counts.ecr += 1;
      if (options.ecrDelayMs) await delay(options.ecrDelayMs);
      if (options.ecrStatus && options.ecrStatus !== 200) {
        return new HttpResponse(null, { status: options.ecrStatus });
      }
      const html = options.ecrHtml ?? ecrFixtureHtml(options.ecrData ?? ecrFixture());
      return HttpResponse.text(html);
    }),
    http.get(`${FFC_ADP_BASE_URL}/:format`, async ({ request }) => {
      counts.adp += 1;
      if (options.adpDelayMs) await delay(options.adpDelayMs);
      if (options.adpStatus && options.adpStatus !== 200) {
        return new HttpResponse(null, { status: options.adpStatus });
      }
      const teams = Number(new URL(request.url).searchParams.get('teams'));
      // The live API answers an unsupported team count with HTTP 200 + an error envelope.
      if (![8, 10, 12, 14].includes(teams)) {
        return HttpResponse.json({ status: 'Error', errors: ['Invalid teams'] });
      }
      const body = (options.adpData ?? ffcFixture()) as { meta: Record<string, unknown> };
      return HttpResponse.json({ ...body, meta: { ...body.meta, teams } });
    }),
    ...(['QB', 'RB', 'WR', 'TE'] as const).map((position) =>
      http.get(FANTASYPROS_POSITIONAL_TIER_URLS[position], () => {
        counts.positionalTiers += 1;
        if (options.positionalTierStatus && options.positionalTierStatus !== 200) {
          return new HttpResponse(null, { status: options.positionalTierStatus });
        }
        return HttpResponse.text(positionalTierPageHtml(position));
      }),
    ),
    http.get(CROSSWALK_URL, async () => {
      counts.crosswalk += 1;
      if (options.crosswalkDelayMs) await delay(options.crosswalkDelayMs);
      if (options.crosswalkStatus && options.crosswalkStatus !== 200) {
        return new HttpResponse(null, { status: options.crosswalkStatus });
      }
      return HttpResponse.text(crosswalkFixtureCsv());
    }),
  ];
};
