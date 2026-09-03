/**
 * FR-4 — the Fantasy Football Calculator ADP snapshot (AC-24), in the attached draft's rankings
 * format.
 *
 * Free, no auth, plain JSON. FFC publishes ADP only for a fixed set of team-count pools
 * (`adpPoolTeamSizes` in config); an unsupported count answers HTTP 200 with an
 * `{status: "Error"}` envelope, so a 2xx is not by itself a success.
 *
 * FFC's `player_id` is FFC-internal and appears in no crosswalk — every row here is matched
 * by normalized name (see `match.ts`). That is a property of the data, not a shortcut.
 */
import { RANKINGS_FORMAT_LABELS } from '@sidekick/shared';
import type { RankingsFormat } from '@sidekick/shared';
import { z } from 'zod';

import { normalizePosition, normalizeTeam } from './match';
import type { AdpEntry, AdpSnapshot } from './types';

export const FFC_ADP_BASE_URL = 'https://fantasyfootballcalculator.com/api/v1/adp';

/**
 * FFC's path slug per rankings format (2026-09-02). FFC also serves standard/2qb/dynasty/rookie
 * pools; Sidekick ingests rankings for none of those, so they have no slug here. A PPR pool is a
 * different set of mock drafts from the half-PPR one, with its own ADP for every player — which
 * is exactly why the ADP must follow the format the rankings do.
 */
export const FFC_FORMAT_SLUGS: Readonly<Record<RankingsFormat, string>> = Object.freeze({
  half_ppr: 'half-ppr',
  ppr: 'ppr',
});

const adpPlayerSchema = z
  .object({
    player_id: z.number(),
    name: z.string(),
    position: z.string(),
    team: z.string().nullish(),
    adp: z.number(),
    times_drafted: z.number().nullish(),
  })
  .passthrough();

const adpResponseSchema = z
  .object({
    status: z.string(),
    meta: z
      .object({
        type: z.string().nullish(),
        teams: z.number().nullish(),
        rounds: z.number().nullish(),
        total_drafts: z.number().nullish(),
        start_date: z.string().nullish(),
        end_date: z.string().nullish(),
      })
      .passthrough()
      .nullish(),
    players: z.array(adpPlayerSchema),
  })
  .passthrough();

export interface AdpPoolSelection {
  teamCount: number;
  exact: boolean;
}

/**
 * Picks the ADP pool to fetch (AC-24, 🔶 AS-6). Nearest supported team count wins; an exact
 * tie resolves toward the larger pool, because a larger pool's later rounds are the ones a
 * smaller league's board actually reaches.
 *
 * `supported` comes from `adpPoolTeamSizes` in config — never a literal at a call site.
 */
export function selectAdpPool(
  leagueTeamCount: number,
  supported: readonly number[],
): AdpPoolSelection {
  if (supported.length === 0) {
    throw new Error('adpPoolTeamSizes is empty; no ADP pool can be selected.');
  }

  const sorted = [...supported].sort((a, b) => a - b);
  let best = sorted[0]!;
  for (const candidate of sorted) {
    const bestDistance = Math.abs(best - leagueTeamCount);
    const candidateDistance = Math.abs(candidate - leagueTeamCount);
    // `<=` on a tie takes the later (larger) entry of the ascending list.
    if (candidateDistance <= bestDistance) best = candidate;
  }

  return { teamCount: best, exact: best === leagueTeamCount };
}

export function buildAdpUrl(format: RankingsFormat, teamCount: number, season: number): string {
  const url = new URL(`${FFC_ADP_BASE_URL}/${FFC_FORMAT_SLUGS[format]}`);
  url.searchParams.set('teams', String(teamCount));
  url.searchParams.set('year', String(season));
  return url.toString();
}

export function describeAdpPool(
  format: RankingsFormat,
  selection: AdpPoolSelection,
  requested: number,
): string {
  const base = `${RANKINGS_FORMAT_LABELS[format]}, ${selection.teamCount}-team pool`;
  return selection.exact
    ? base
    : `${base} (no ${requested}-team pool is published; nearest match used)`;
}

export interface ParseAdpContext {
  source: string;
  format: RankingsFormat;
  teamCountRequested: number;
  teamCountUsed: number;
  exactPool: boolean;
  poolDescription?: string;
}

export function parseAdpResponse(raw: unknown, context: ParseAdpContext): AdpSnapshot {
  const envelope = raw as { status?: unknown; errors?: unknown };
  if (typeof envelope?.status === 'string' && envelope.status.toLowerCase() !== 'success') {
    const detail = Array.isArray(envelope.errors) ? envelope.errors.join('; ') : envelope.status;
    throw new Error(`FFC ADP request rejected: ${detail}`);
  }

  const parsed = adpResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`FFC ADP payload failed validation: ${parsed.error.issues[0]?.message}`);
  }

  const entries: AdpEntry[] = [];
  for (const player of parsed.data.players) {
    const position = normalizePosition(player.position);
    if (!position) continue;
    entries.push({
      ffcPlayerId: player.player_id,
      playerName: player.name,
      position,
      team: normalizeTeam(player.team),
      adp: player.adp,
      timesDrafted: player.times_drafted ?? 0,
    });
  }

  const meta = parsed.data.meta;
  return {
    source: context.source,
    scoring: meta?.type ?? FFC_FORMAT_SLUGS[context.format],
    teamCountRequested: context.teamCountRequested,
    teamCountUsed: context.teamCountUsed,
    exactPool: context.exactPool,
    poolDescription:
      context.poolDescription ??
      describeAdpPool(
        context.format,
        { teamCount: context.teamCountUsed, exact: context.exactPool },
        context.teamCountRequested,
      ),
    rounds: meta?.rounds ?? 0,
    totalDrafts: meta?.total_drafts ?? 0,
    capturedAt: meta?.end_date ? new Date(`${meta.end_date}T00:00:00.000Z`).toISOString() : null,
    entries,
  };
}

export interface FetchAdpOptions {
  /** Which FFC pool — the same format the ECR board and tier pages were fetched in. */
  format: RankingsFormat;
  leagueTeamCount: number;
  season: number;
  /** `adpPoolTeamSizes` from config — the caller passes it, this module never hardcodes it. */
  pools: readonly number[];
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

/** Fetches the ADP snapshot once. AC-29 forbids any re-fetch for an attached draft. */
export async function fetchAdpSnapshot(options: FetchAdpOptions): Promise<AdpSnapshot> {
  const selection = selectAdpPool(options.leagueTeamCount, options.pools);
  const url = buildAdpUrl(options.format, selection.teamCount, options.season);
  const doFetch = options.fetchImpl ?? fetch;

  const response = await doFetch(url, {
    signal: options.signal,
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`FFC ADP fetch failed: HTTP ${response.status} from ${url}`);
  }

  return parseAdpResponse(await response.json(), {
    source: url,
    format: options.format,
    teamCountRequested: options.leagueTeamCount,
    teamCountUsed: selection.teamCount,
    exactPool: selection.exact,
    poolDescription: describeAdpPool(options.format, selection, options.leagueTeamCount),
  });
}
