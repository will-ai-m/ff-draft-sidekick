/**
 * FR-4 — the FantasyPros ECR snapshot (AC-23), in the attached draft's rankings format.
 *
 * The cheat-sheet page is plain HTML with no auth, and embeds the whole ranking set as a
 * `var ecrData = {...};` literal. There is no free JSON endpoint for it, so the embed *is*
 * the feed: extract it, validate it, and surface `rank_ecr` untouched (🔶 AS-8 — Sidekick
 * never re-sorts or blends FantasyPros' ordering).
 *
 * Half-PPR and full-PPR are different boards (2026-09-02), not one board re-labelled: the PPR
 * pages rank and tier the same players differently (receiving-heavy RBs and target-hog WRs
 * move up), and the embed's own `scoring` field says which one answered. Every URL below is
 * keyed by {@link RankingsFormat} so no caller can reach one board's page from the other's name.
 */
import { SKILL_POSITIONS } from '@sidekick/shared';
import type { RankingsFormat, SkillPosition } from '@sidekick/shared';
import { z } from 'zod';

import { normalizePosition, normalizeTeam } from './match';
import type { EcrEntry, EcrSnapshot } from './types';

const FANTASYPROS_RANKINGS_BASE = 'https://www.fantasypros.com/nfl/rankings';

/** The overall cheat sheet per rankings format — the board the candidate list follows. */
export const FANTASYPROS_ECR_URLS: Readonly<Record<RankingsFormat, string>> = Object.freeze({
  half_ppr: `${FANTASYPROS_RANKINGS_BASE}/half-point-ppr-cheatsheets.php`,
  ppr: `${FANTASYPROS_RANKINGS_BASE}/ppr-cheatsheets.php`,
});

/**
 * The per-position cheat sheets whose `tier` field is the **positional** tiering — "where does
 * the run at this position pause" (amended 2026-09-01: the user draft-preps on positional tiers,
 * and the overall board's cross-position tiers slice the same players differently — the 2026 TE
 * board reads Bowers/McBride/Loveland/Warren as one positional Tier 1 where the overall board
 * splits them 2/3/3/4). QB pages are scoring-independent, so both formats share the one QB page;
 * RB/WR/TE take the format's own variant. K/DST are absent by design: 🔶 AS-7 keeps them out
 * of every piece of prediction math.
 */
export const FANTASYPROS_POSITIONAL_TIER_URLS: Readonly<
  Record<RankingsFormat, Readonly<Record<SkillPosition, string>>>
> = Object.freeze({
  half_ppr: Object.freeze({
    QB: `${FANTASYPROS_RANKINGS_BASE}/qb-cheatsheets.php`,
    RB: `${FANTASYPROS_RANKINGS_BASE}/half-point-ppr-rb-cheatsheets.php`,
    WR: `${FANTASYPROS_RANKINGS_BASE}/half-point-ppr-wr-cheatsheets.php`,
    TE: `${FANTASYPROS_RANKINGS_BASE}/half-point-ppr-te-cheatsheets.php`,
  }),
  ppr: Object.freeze({
    QB: `${FANTASYPROS_RANKINGS_BASE}/qb-cheatsheets.php`,
    RB: `${FANTASYPROS_RANKINGS_BASE}/ppr-rb-cheatsheets.php`,
    WR: `${FANTASYPROS_RANKINGS_BASE}/ppr-wr-cheatsheets.php`,
    TE: `${FANTASYPROS_RANKINGS_BASE}/ppr-te-cheatsheets.php`,
  }),
});

/**
 * The K/DST cheat sheets — research tooling only (`npm run tiers:positional`). Scoring-
 * independent, and never fetched by the app (🔶 AS-7).
 */
export const FANTASYPROS_KDST_TIER_URLS: Readonly<Record<'K' | 'DST', string>> = Object.freeze({
  DST: `${FANTASYPROS_RANKINGS_BASE}/dst-cheatsheets.php`,
  K: `${FANTASYPROS_RANKINGS_BASE}/k-cheatsheets.php`,
});

/**
 * Non-greedy up to the first `};` that closes the object literal. The page declares several
 * other `var ...Data = {...}` blocks in the same script tag, so anchoring on the exact name
 * matters.
 */
const ECR_DATA_PATTERN = /var\s+ecrData\s*=\s*(\{[\s\S]*?\});/;

/** Only the fields Sidekick reads are required; the feed carries ~18 per player. */
const ecrPlayerSchema = z
  .object({
    player_id: z.union([z.number(), z.string()]),
    player_name: z.string(),
    player_team_id: z.string().nullish(),
    player_position_id: z.string(),
    player_bye_week: z.union([z.number(), z.string()]).nullish(),
    rank_ecr: z.number(),
    pos_rank: z.string().nullish(),
    tier: z.number().nullish(),
  })
  .passthrough();

const ecrDataSchema = z
  .object({
    scoring: z.string().nullish(),
    year: z.union([z.number(), z.string()]).nullish(),
    last_updated_ts: z.number().nullish(),
    players: z.array(ecrPlayerSchema),
  })
  .passthrough();

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

/** "RB1" -> 1, "DST12" -> 12, "" -> null. */
const positionalRankOf = (posRank: string | null | undefined): number | null => {
  if (!posRank) return null;
  const digits = /(\d+)\s*$/.exec(posRank);
  return digits?.[1] ? Number.parseInt(digits[1], 10) : null;
};

/**
 * Parses the cheat-sheet HTML into a snapshot.
 *
 * Rows at positions Sidekick doesn't track are dropped rather than failing the whole parse —
 * a new position appearing in the feed must not take the rankings offline. A structurally
 * invalid embed, by contrast, throws: the caller turns that into AC-28's "no rankings loaded"
 * state, which is an explicit, visible outcome rather than a silently empty board.
 */
export function parseEcrHtml(html: string, source: string): EcrSnapshot {
  const match = ECR_DATA_PATTERN.exec(html);
  if (!match?.[1]) {
    throw new Error(
      `No "var ecrData = {...}" embed found at ${source}. The cheat-sheet page shape has changed.`,
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(match[1]);
  } catch (error) {
    throw new Error(`FantasyPros ecrData embed is not valid JSON: ${(error as Error).message}`);
  }

  const parsed = ecrDataSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`FantasyPros ecrData failed validation: ${parsed.error.issues[0]?.message}`);
  }

  const entries: EcrEntry[] = [];
  for (const player of parsed.data.players) {
    const position = normalizePosition(player.player_position_id);
    if (!position) continue;

    const fantasyProsId = toNumber(player.player_id);
    if (fantasyProsId === null) continue;

    entries.push({
      fantasyProsId,
      playerName: player.player_name,
      position,
      // Canonicalized here so one spelling reaches every consumer (FantasyPros says "JAC").
      team: normalizeTeam(player.player_team_id),
      ecrRank: player.rank_ecr,
      positionalRank: positionalRankOf(player.pos_rank),
      tier: player.tier ?? null,
      byeWeek: toNumber(player.player_bye_week),
    });
  }

  return {
    source,
    scoring: parsed.data.scoring ?? 'UNKNOWN',
    season: toNumber(parsed.data.year) ?? new Date().getUTCFullYear(),
    capturedAt: parsed.data.last_updated_ts
      ? new Date(parsed.data.last_updated_ts * 1000).toISOString()
      : null,
    entries,
  };
}

/** AC-23's K/DST presence check — a fetched snapshot missing either warrants a warning. */
export function snapshotHasKickersAndDefenses(snapshot: EcrSnapshot): boolean {
  const positions = new Set(snapshot.entries.map((e) => e.position));
  return positions.has('K') && positions.has('DST');
}

export interface FetchEcrOptions {
  /** The overall board of this format. Exactly one of `format` and `url` must be given. */
  format?: RankingsFormat;
  /** An explicit page (a positional cheat sheet, the research script's K/DST pages). */
  url?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

/** The positional tier join: FantasyPros id → that player's own position-page tier. */
export interface PositionalTiers {
  byFantasyProsId: Map<number, number>;
  /**
   * Positions whose page could not supply tiers, with why — surfaced by the pre-draft check.
   * A failed page degrades that position to per-player tier steps; it never fails the attach.
   */
  errors: Partial<Record<SkillPosition, string>>;
}

export interface FetchPositionalTiersOptions {
  /** Whose RB/WR/TE tier pages to read; the QB page is the same in both. */
  format: RankingsFormat;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

/**
 * Fetches the four positional cheat sheets of one rankings format and joins their tiers by
 * FantasyPros id — once per attach, alongside the overall snapshot (AC-29 freezes both for the
 * draft's lifetime).
 *
 * Each page degrades independently: a fetch failure, a changed embed, or a page shipping no
 * tier column records an error for that position and moves on. Rows whose position does not
 * match the page they came from are ignored rather than trusted (a defense against the shared
 * embed shape ever serving the wrong table).
 */
export async function fetchPositionalTiers(
  options: FetchPositionalTiersOptions,
): Promise<PositionalTiers> {
  const byFantasyProsId = new Map<number, number>();
  const errors: Partial<Record<SkillPosition, string>> = {};
  const urls = FANTASYPROS_POSITIONAL_TIER_URLS[options.format];

  await Promise.all(
    SKILL_POSITIONS.map(async (position) => {
      try {
        const snapshot = await fetchEcrSnapshot({
          fetchImpl: options.fetchImpl,
          signal: options.signal,
          url: urls[position],
        });
        let tiered = 0;
        for (const entry of snapshot.entries) {
          if (entry.position !== position || entry.tier === null) continue;
          byFantasyProsId.set(entry.fantasyProsId, entry.tier);
          tiered += 1;
        }
        if (tiered === 0) {
          errors[position] = `page parsed (${snapshot.entries.length} rows) but carried no tiers`;
        }
      } catch (error) {
        errors[position] = (error as Error).message;
      }
    }),
  );

  return { byFantasyProsId, errors };
}

/**
 * Fetches one cheat sheet. AC-29 forbids any re-fetch for an attached draft.
 *
 * There is no default board: a caller names the format or the page, so a half-PPR URL can
 * never be reached by omission from a full-PPR attach.
 */
export async function fetchEcrSnapshot(options: FetchEcrOptions): Promise<EcrSnapshot> {
  const url = options.url ?? (options.format === undefined ? null : FANTASYPROS_ECR_URLS[options.format]);
  if (url === null) {
    throw new Error('fetchEcrSnapshot needs a rankings format or an explicit page URL.');
  }
  const doFetch = options.fetchImpl ?? fetch;

  const response = await doFetch(url, {
    signal: options.signal,
    headers: { accept: 'text/html' },
  });
  if (!response.ok) {
    throw new Error(`FantasyPros ECR fetch failed: HTTP ${response.status} from ${url}`);
  }

  return parseEcrHtml(await response.text(), url);
}
