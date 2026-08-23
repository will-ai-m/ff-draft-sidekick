/**
 * FR-4 — matching snapshot entries to Sleeper players (AC-25, AC-26).
 *
 * Three paths, in this order:
 *  1. **crosswalk id** — `ecrData.player_id` -> `db_playerids.fantasypros_id` -> `sleeper_id`.
 *     Verified live end to end (Jahmyr Gibbs: FantasyPros 22968 -> Sleeper 9221). Carries
 *     ~90% of the real ECR board.
 *  2. **normalized name** — the fallback for rows the crosswalk misses or where its
 *     `fantasypros_id` has drifted from the feed's. Load-bearing, not an edge case.
 *  3. **team abbreviation**, for DST only. The crosswalk is players-only, so team defenses
 *     have no row in it at all; Sleeper models them as pseudo-players keyed by team code.
 *
 * FFC's ADP feed has no crosswalkable id of any kind, so every ADP row travels path 2 or 3.
 *
 * Anything that reaches no Sleeper player is reported, never guessed at: a wrong join puts a
 * live player's rank on someone else's board row, which is worse than an explicit gap.
 *
 * An ADP row that reaches a Sleeper player no ECR row claimed is neither matched into the board
 * nor thrown away: it is emitted separately as `adpOnlyPlayers`, which is what AC-50's K/DST
 * filter falls back to when the cheat sheet ships without kickers and defenses (AC-23).
 */
import { POSITIONS, type Position } from '@sidekick/shared';

import type {
  AdpEntry,
  AdpOnlyPlayer,
  AdpSnapshot,
  Crosswalk,
  EcrEntry,
  EcrMatchedPlayer,
  EcrSnapshot,
  MatchCounts,
  MatchMethod,
  MatchResult,
  SleeperPlayerRecord,
  UnmatchedEntry,
} from './types';

/** Trailing generational suffixes the crosswalk's own `merge_name` convention drops. */
const NAME_SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);

/**
 * Canonical name key. Mirrors the crosswalk's `merge_name` convention (lowercase, punctuation
 * and suffixes gone) and then removes whitespace as well, so that convention and Sleeper's own
 * `search_full_name` ("jahmyrgibbs") land on the same key from either direction.
 */
export function normalizeName(raw: string): string {
  const stripped = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[.'’`,]/g, '');

  const tokens = stripped.split(/[\s]+/).filter(Boolean);
  while (tokens.length > 1 && NAME_SUFFIXES.has(tokens[tokens.length - 1]!)) tokens.pop();

  return tokens.join('').replace(/[^a-z0-9]/g, '');
}

/**
 * Team-abbreviation aliases, mapped onto Sleeper's spelling because Sleeper ids are the
 * canonical key everywhere downstream.
 *
 * Not hypothetical: verified live against the real feeds, FantasyPros ships the Jacksonville
 * defense as `JAC` while Sleeper keys it `JAX`, so a literal abbreviation compare silently
 * drops one DST off the board. The relocated and three-letter-convention franchises are
 * included for the same reason — a mismatch here costs a real player, not an error message.
 */
const TEAM_ALIASES: Record<string, string> = {
  JAC: 'JAX',
  LVR: 'LV',
  OAK: 'LV',
  SD: 'LAC',
  SDG: 'LAC',
  STL: 'LAR',
  LA: 'LAR',
  RAM: 'LAR',
  WSH: 'WAS',
  ARZ: 'ARI',
  BLT: 'BAL',
  CLV: 'CLE',
  HST: 'HOU',
  NWE: 'NE',
  NEP: 'NE',
  GNB: 'GB',
  KAN: 'KC',
  SFO: 'SF',
  TAM: 'TB',
  NOR: 'NO',
};

/** Canonical team code, or null for a free agent / missing team. */
export function normalizeTeam(raw: string | null | undefined): string | null {
  const upper = raw?.trim().toUpperCase();
  if (!upper || upper === 'FA' || upper === 'FA*' || upper === 'NA') return null;
  return TEAM_ALIASES[upper] ?? upper;
}

/** Every source spells positions differently: FFC says `PK`/`DEF`, Sleeper says `DEF`. */
export function normalizePosition(raw: string | null | undefined): Position | null {
  if (!raw) return null;
  const upper = raw.trim().toUpperCase();
  if (upper === 'PK') return 'K';
  if (upper === 'DEF' || upper === 'D/ST' || upper === 'DEFENSE') return 'DST';
  return (POSITIONS as readonly string[]).includes(upper) ? (upper as Position) : null;
}

const sleeperName = (record: SleeperPlayerRecord): string =>
  record.full_name?.trim() ||
  [record.first_name, record.last_name].filter(Boolean).join(' ').trim() ||
  '';

const sleeperPositions = (record: SleeperPlayerRecord): Position[] => {
  const raw = [record.position, ...(record.fantasy_positions ?? [])];
  const out = new Set<Position>();
  for (const value of raw) {
    const position = normalizePosition(value);
    if (position) out.add(position);
  }
  return [...out];
};

interface SleeperIndex {
  byId: Map<string, SleeperPlayerRecord>;
  byNormalizedName: Map<string, { id: string; record: SleeperPlayerRecord }[]>;
  defensesByTeam: Map<string, { id: string; record: SleeperPlayerRecord }>;
}

export function buildSleeperIndex(dump: Record<string, SleeperPlayerRecord>): SleeperIndex {
  const byId = new Map<string, SleeperPlayerRecord>();
  const byNormalizedName = new Map<string, { id: string; record: SleeperPlayerRecord }[]>();
  const defensesByTeam = new Map<string, { id: string; record: SleeperPlayerRecord }>();

  for (const [key, record] of Object.entries(dump)) {
    const id = record.player_id ?? key;
    byId.set(id, record);

    const positions = sleeperPositions(record);
    if (positions.includes('DST')) {
      // Defenses are pseudo-players keyed by team code, with no name to match on.
      const team = normalizeTeam(record.team) ?? normalizeTeam(id);
      if (team) defensesByTeam.set(team, { id, record });
      continue;
    }

    const name = normalizeName(sleeperName(record));
    if (!name) continue;
    const bucket = byNormalizedName.get(name);
    if (bucket) bucket.push({ id, record });
    else byNormalizedName.set(name, [{ id, record }]);
  }

  return { byId, byNormalizedName, defensesByTeam };
}

/**
 * Resolves a name to exactly one Sleeper player, or to nothing.
 *
 * Filters, applied in order and only while more than one candidate survives: position, then
 * team, then `active`. Two survivors after all three means the data genuinely cannot tell
 * them apart, and the entry is left unmatched rather than assigned by coin flip.
 */
function resolveByName(
  index: SleeperIndex,
  name: string,
  position: Position,
  team: string | null,
  claimed: Set<string>,
): string | null {
  let candidates = (index.byNormalizedName.get(normalizeName(name)) ?? []).filter(
    (c) => !claimed.has(c.id),
  );
  if (candidates.length === 0) return null;

  const byPosition = candidates.filter((c) => sleeperPositions(c.record).includes(position));
  if (byPosition.length > 0) candidates = byPosition;
  if (candidates.length === 1) return candidates[0]!.id;

  const canonicalTeam = normalizeTeam(team);
  if (canonicalTeam) {
    const byTeam = candidates.filter((c) => normalizeTeam(c.record.team) === canonicalTeam);
    if (byTeam.length > 0) candidates = byTeam;
  }
  if (candidates.length === 1) return candidates[0]!.id;

  const active = candidates.filter((c) => c.record.active !== false);
  if (active.length === 1) return active[0]!.id;

  return null;
}

interface Resolution {
  sleeperPlayerId: string;
  matchedBy: MatchMethod;
}

function resolveEcrEntry(
  entry: EcrEntry,
  crosswalk: Crosswalk,
  index: SleeperIndex,
  claimed: Set<string>,
): Resolution | null {
  if (entry.position === 'DST') {
    const team = normalizeTeam(entry.team);
    const defense = team ? index.defensesByTeam.get(team) : undefined;
    if (defense && !claimed.has(defense.id)) {
      return { sleeperPlayerId: defense.id, matchedBy: 'team-defense' };
    }
    return null;
  }

  const row = crosswalk.byFantasyProsId.get(String(entry.fantasyProsId));
  if (row?.sleeperId && index.byId.has(row.sleeperId) && !claimed.has(row.sleeperId)) {
    return { sleeperPlayerId: row.sleeperId, matchedBy: 'crosswalk-id' };
  }

  // The crosswalk's own `merge_name` is the better name to try when it has a row for this
  // player but no usable `sleeper_id`; otherwise fall back to the feed's own spelling.
  for (const candidateName of [row?.mergeName, entry.playerName]) {
    if (!candidateName) continue;
    const id = resolveByName(index, candidateName, entry.position, entry.team, claimed);
    if (id) return { sleeperPlayerId: id, matchedBy: 'normalized-name' };
  }

  return null;
}

function resolveAdpEntry(entry: AdpEntry, index: SleeperIndex): Resolution | null {
  if (entry.position === 'DST') {
    const team = normalizeTeam(entry.team);
    const defense = team ? index.defensesByTeam.get(team) : undefined;
    return defense ? { sleeperPlayerId: defense.id, matchedBy: 'team-defense' } : null;
  }
  const id = resolveByName(index, entry.playerName, entry.position, entry.team, new Set());
  return id === null ? null : { sleeperPlayerId: id, matchedBy: 'normalized-name' };
}

interface RankableEntry {
  ecrRank: number;
  adp: number | null;
}

/**
 * Assigns each player a 1-based sampling order within their position (AC-26).
 *
 * Players with an ADP are ranked by ADP. A player with no ADP entry "falls back to ECR order
 * within their position" — literally: their rank is their ECR position rank. That keeps a
 * high-ECR player who simply isn't in FFC's ~230-row board near the front of their position
 * where they belong, instead of banished behind every player who happens to carry a number.
 * Ties resolve on ECR, keeping FantasyPros the ordering authority (🔶 AS-8).
 */
export function assignSamplingRanks<T extends RankableEntry>(
  entries: T[],
): (T & { samplingRank: number })[] {
  const byAdp = entries
    .filter((e) => e.adp !== null)
    .sort((a, b) => a.adp! - b.adp! || a.ecrRank - b.ecrRank);
  const adpRank = new Map<T, number>(byAdp.map((e, i) => [e, i + 1]));

  const byEcr = [...entries].sort((a, b) => a.ecrRank - b.ecrRank);
  const ecrRank = new Map<T, number>(byEcr.map((e, i) => [e, i + 1]));

  return entries
    .map((entry) => ({
      ...entry,
      samplingRank: (entry.adp !== null ? adpRank.get(entry) : ecrRank.get(entry)) ?? 1,
    }))
    .sort((a, b) => a.samplingRank - b.samplingRank || a.ecrRank - b.ecrRank);
}

export interface MatchSnapshotsInput {
  ecr: EcrSnapshot | null;
  adp: AdpSnapshot | null;
  crosswalk: Crosswalk;
  /** Sleeper's `/v1/players/nfl` dump, keyed by `player_id`. Owned and fetched by T2. */
  sleeperPlayers: Record<string, SleeperPlayerRecord>;
}

export function matchSnapshots(input: MatchSnapshotsInput): MatchResult {
  const index = buildSleeperIndex(input.sleeperPlayers);
  const claimed = new Set<string>();
  const unmatched: UnmatchedEntry[] = [];
  const counts: MatchCounts = {
    ecrTotal: input.ecr?.entries.length ?? 0,
    matchedByCrosswalkId: 0,
    matchedByName: 0,
    matchedByTeamDefense: 0,
    unmatchedEcr: 0,
    unmatchedAdp: 0,
  };

  // ---- ADP index, built first so matched players can pick their number up in one pass ----
  const adpByPlayerKey = new Map<string, AdpEntry>();
  const adpBySleeperId = new Map<string, AdpEntry>();
  const adpResolutions = new Map<AdpEntry, Resolution>();
  for (const entry of input.adp?.entries ?? []) {
    const resolved = resolveAdpEntry(entry, index);
    if (resolved) {
      adpBySleeperId.set(resolved.sleeperPlayerId, entry);
      adpResolutions.set(entry, resolved);
    }
    adpByPlayerKey.set(`${entry.position}:${normalizeName(entry.playerName)}`, entry);
    if (!resolved) {
      counts.unmatchedAdp += 1;
      unmatched.push({ name: entry.playerName, position: entry.position, source: 'adp' });
    }
  }

  // ---- ECR pass, in the feed's own order (🔶 AS-8 — never re-sorted) ----------------------
  const staged: Omit<EcrMatchedPlayer, 'samplingRank'>[] = [];
  /** ADP entries an ECR row has already taken its number from, by either join path. */
  const spentAdp = new Set<AdpEntry>();
  for (const entry of input.ecr?.entries ?? []) {
    const resolution = resolveEcrEntry(entry, input.crosswalk, index, claimed);
    if (!resolution) {
      counts.unmatchedEcr += 1;
      unmatched.push({ name: entry.playerName, position: entry.position, source: 'ecr' });
      continue;
    }

    claimed.add(resolution.sleeperPlayerId);
    if (resolution.matchedBy === 'crosswalk-id') counts.matchedByCrosswalkId += 1;
    else if (resolution.matchedBy === 'normalized-name') counts.matchedByName += 1;
    else counts.matchedByTeamDefense += 1;

    const adpEntry =
      adpBySleeperId.get(resolution.sleeperPlayerId) ??
      adpByPlayerKey.get(`${entry.position}:${normalizeName(entry.playerName)}`);
    if (adpEntry !== undefined) spentAdp.add(adpEntry);

    staged.push({
      sleeperPlayerId: resolution.sleeperPlayerId,
      playerName: entry.playerName,
      position: entry.position,
      team: entry.team,
      ecrRank: entry.ecrRank,
      positionalRank: entry.positionalRank,
      tier: entry.tier,
      byeWeek: entry.byeWeek,
      adp: adpEntry?.adp ?? null,
      adpMissing: adpEntry === undefined,
      matchedBy: resolution.matchedBy,
      fantasyProsId: entry.fantasyProsId,
    });
  }

  // ---- ADP-only rows: what the ADP feed carries and the ECR feed does not (AC-50) ----------
  // The K/DST filter is the one surface that may show these, and only for a position the ECR
  // snapshot ranks not at all — AC-23's degenerate cheat sheet. They stay out of `players` and
  // out of `byPlayerId`, both of which mean "the ECR board".
  const stagedAdpOnly: Omit<AdpOnlyPlayer, 'samplingRank'>[] = [];
  for (const [entry, resolution] of adpResolutions) {
    if (spentAdp.has(entry) || claimed.has(resolution.sleeperPlayerId)) continue;
    claimed.add(resolution.sleeperPlayerId);
    stagedAdpOnly.push({
      sleeperPlayerId: resolution.sleeperPlayerId,
      playerName: entry.playerName,
      position: entry.position,
      team: entry.team,
      ecrRank: null,
      positionalRank: null,
      tier: null,
      byeWeek: null,
      adp: entry.adp,
      adpMissing: false,
      matchedBy: resolution.matchedBy,
      fantasyProsId: null,
    });
  }

  // ---- Sampling order, computed per position (AC-26) --------------------------------------
  const samplingRankById = new Map<string, number>();
  for (const position of POSITIONS) {
    const group = staged.filter((p) => p.position === position);
    if (group.length === 0) continue;
    for (const ranked of assignSamplingRanks(group)) {
      samplingRankById.set(ranked.sleeperPlayerId, ranked.samplingRank);
    }
  }

  const players: EcrMatchedPlayer[] = staged.map((player) => ({
    ...player,
    samplingRank: samplingRankById.get(player.sleeperPlayerId) ?? 1,
  }));

  // ADP is the only order an ADP-only row has, so it is also its sampling order.
  const adpOnlyPlayers: AdpOnlyPlayer[] = [];
  for (const position of POSITIONS) {
    const group = stagedAdpOnly
      .filter((p) => p.position === position)
      .sort((a, b) => a.adp - b.adp || a.playerName.localeCompare(b.playerName));
    for (const [offset, player] of group.entries()) {
      adpOnlyPlayers.push({ ...player, samplingRank: offset + 1 });
    }
  }

  return {
    players,
    byPlayerId: new Map(players.map((p) => [p.sleeperPlayerId, p])),
    adpOnlyPlayers,
    unmatched,
    playersMissingAdp: players
      .filter((p) => p.adpMissing)
      .map((p) => ({ playerId: p.sleeperPlayerId, name: p.playerName })),
    counts,
  };
}
