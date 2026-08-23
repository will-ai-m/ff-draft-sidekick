/**
 * FR-4 — the player-ID crosswalk (AC-25).
 *
 * The PRD's dependency note assumes Sleeper's own dump carries usable cross-platform ids.
 * It largely does not: of ~1k active skill-position players, `gsis_id` is populated on ~17%
 * and `espn_id`/`yahoo_id` on ~23% each, and neither FantasyPros nor FFC expose the one id
 * Sleeper does populate (`sportradar_id`). The working path, verified end to end, runs
 * through dynastyprocess/data's `db_playerids.csv`:
 *
 *     ecrData.players[].player_id  ->  fantasypros_id  ->  sleeper_id
 *
 * The same file also carries `gsis_id`, which is why T9's game-log prep imports this loader
 * rather than downloading the CSV a second time.
 *
 * Two file-format details that a naive reader gets wrong:
 *  - it is an R-generated CSV, so missing values are the literal string `"NA"`, not empty;
 *  - fields are quoted and can contain commas, so it is parsed with papaparse, never `split(',')`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import Papa from 'papaparse';

import type { Crosswalk, CrosswalkRow } from './types';

export const CROSSWALK_URL =
  'https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv';

export const CROSSWALK_CACHE_FILENAME = 'crosswalk.json';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

/** Gitignored; rebuilt on demand and by `npm run prep:nflverse`. */
export const DEFAULT_CROSSWALK_CACHE_DIR = resolve(REPO_ROOT, 'data/cache');

/** The CSV's missing-value sentinel is R's `NA`, which must not become a lookup key. */
const cell = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return !trimmed || trimmed === 'NA' ? null : trimmed;
};

export function parseCrosswalkCsv(csv: string): Crosswalk {
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  });

  const rows: CrosswalkRow[] = [];
  for (const raw of parsed.data) {
    const name = cell(raw.name);
    if (!name) continue;
    rows.push({
      fantasyProsId: cell(raw.fantasypros_id),
      sleeperId: cell(raw.sleeper_id),
      gsisId: cell(raw.gsis_id),
      name,
      mergeName: cell(raw.merge_name) ?? name,
      position: cell(raw.position),
      team: cell(raw.team),
    });
  }

  return {
    rows,
    byFantasyProsId: indexBy(rows, (r) => r.fantasyProsId),
    byGsisId: indexBy(rows, (r) => r.gsisId),
    fetchedAt: new Date().toISOString(),
    fromStaleCache: false,
  };
}

/**
 * Indexes on a nullable key. Duplicate keys do occur (the file keeps historical rows), so a
 * row that actually carries a `sleeper_id` always beats one that doesn't — otherwise a stale
 * duplicate could shadow the live player and silently push them onto the unmatched list.
 */
function indexBy(
  rows: CrosswalkRow[],
  keyOf: (row: CrosswalkRow) => string | null,
): Map<string, CrosswalkRow> {
  const index = new Map<string, CrosswalkRow>();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    const existing = index.get(key);
    if (!existing || (!existing.sleeperId && row.sleeperId)) index.set(key, row);
  }
  return index;
}

interface CachedCrosswalk {
  fetchedAt: string;
  rows: CrosswalkRow[];
}

const rehydrate = (cached: CachedCrosswalk, fromStaleCache: boolean): Crosswalk => ({
  rows: cached.rows,
  byFantasyProsId: indexBy(cached.rows, (r) => r.fantasyProsId),
  byGsisId: indexBy(cached.rows, (r) => r.gsisId),
  fetchedAt: cached.fetchedAt,
  fromStaleCache,
});

const readCache = (path: string): CachedCrosswalk | null => {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as CachedCrosswalk;
    if (!Array.isArray(parsed?.rows) || typeof parsed.fetchedAt !== 'string') return null;
    return parsed;
  } catch {
    // A corrupt cache is a re-download, never a crash — it is a derived file, not user data.
    return null;
  }
};

export interface LoadCrosswalkOptions {
  /** Directory holding `crosswalk.json`. Defaults to the repo's gitignored `data/cache/`. */
  cacheDir?: string;
  /** Re-download once the cached copy is older than this. Callers pass a config value. */
  maxAgeHours: number;
  url?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  signal?: AbortSignal;
}

/**
 * Returns the crosswalk, downloading it only when there is no cached copy or the cached copy
 * has aged past `maxAgeHours`. If the download fails but a stale cache exists, the stale copy
 * is served with `fromStaleCache: true` — a slightly old crosswalk is a far better outcome
 * than taking every ranking offline over a transient GitHub hiccup.
 */
export async function loadCrosswalk(options: LoadCrosswalkOptions): Promise<Crosswalk> {
  const cacheDir = options.cacheDir ?? DEFAULT_CROSSWALK_CACHE_DIR;
  const cachePath = resolve(cacheDir, CROSSWALK_CACHE_FILENAME);
  const now = options.now?.() ?? new Date();

  const cached = readCache(cachePath);
  if (cached) {
    const ageHours = (now.getTime() - Date.parse(cached.fetchedAt)) / 3_600_000;
    if (Number.isFinite(ageHours) && ageHours < options.maxAgeHours) {
      return rehydrate(cached, false);
    }
  }

  const url = options.url ?? CROSSWALK_URL;
  const doFetch = options.fetchImpl ?? fetch;

  let crosswalk: Crosswalk;
  try {
    const response = await doFetch(url, { signal: options.signal, headers: { accept: 'text/csv' } });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    crosswalk = parseCrosswalkCsv(await response.text());
    crosswalk.fetchedAt = now.toISOString();
  } catch (error) {
    if (cached) return rehydrate(cached, true);
    throw new Error(
      `Player-ID crosswalk unavailable: could not download ${url} (${(error as Error).message}) ` +
        'and no cached copy exists.',
    );
  }

  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(
    cachePath,
    JSON.stringify({ fetchedAt: crosswalk.fetchedAt, rows: crosswalk.rows }),
    'utf8',
  );

  return crosswalk;
}
