import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { crosswalkFixtureCsv, createRequestCounts, snapshotHandlers } from '../../test/msw/snapshotHandlers';
import { CROSSWALK_CACHE_FILENAME, loadCrosswalk, parseCrosswalkCsv } from './crosswalk';

const server = setupServer(...snapshotHandlers());
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

let cacheDir: string;
beforeEach(() => {
  cacheDir = mkdtempSync(join(tmpdir(), 'sidekick-crosswalk-'));
});
afterEach(() => rmSync(cacheDir, { recursive: true, force: true }));

describe('parseCrosswalkCsv', () => {
  it('indexes rows by fantasypros_id, the verified ECR -> Sleeper join key', () => {
    const crosswalk = parseCrosswalkCsv(crosswalkFixtureCsv());

    // The design pass verified this row directly against both source feeds.
    const gibbs = crosswalk.byFantasyProsId.get('22968');
    expect(gibbs).toMatchObject({ sleeperId: '9221', mergeName: 'jahmyr gibbs' });
  });

  it('treats the CSV\'s "NA" sentinel as a missing value, not the literal string', () => {
    const crosswalk = parseCrosswalkCsv(crosswalkFixtureCsv());

    // Chip Trayanum's real row carries fantasypros_id 28114 with sleeper_id "NA".
    const trayanum = crosswalk.byFantasyProsId.get('28114');
    expect(trayanum?.name).toBe('Chip Trayanum');
    expect(trayanum?.sleeperId).toBeNull();

    // Squirrel White's real row carries fantasypros_id "NA"; it must not be indexed under "NA".
    expect(crosswalk.byFantasyProsId.has('NA')).toBe(false);
    expect(crosswalk.rows.some((r) => r.name === 'Squirrel White' && r.fantasyProsId === null)).toBe(
      true,
    );
  });

  it('indexes by gsis_id too, which is T9\'s game-log join key', () => {
    const crosswalk = parseCrosswalkCsv(crosswalkFixtureCsv());
    expect(crosswalk.byGsisId.get('00-0039139')?.sleeperId).toBe('9221');
  });

  it('parses quoted fields containing commas rather than splitting on every comma', () => {
    const csv = [
      'fantasypros_id,sleeper_id,gsis_id,name,merge_name,position,team',
      '1,2,NA,"Doe, John",john doe,WR,SF',
    ].join('\n');
    const crosswalk = parseCrosswalkCsv(csv);
    expect(crosswalk.rows[0]?.name).toBe('Doe, John');
    expect(crosswalk.rows[0]?.team).toBe('SF');
  });
});

describe('loadCrosswalk', () => {
  it('downloads once, then serves the local cache on the next load', async () => {
    const counts = createRequestCounts();
    server.use(...snapshotHandlers({ counts }));

    const first = await loadCrosswalk({ cacheDir, maxAgeHours: 24 });
    expect(counts.crosswalk).toBe(1);
    expect(first.rows).toHaveLength(10);

    const second = await loadCrosswalk({ cacheDir, maxAgeHours: 24 });
    expect(counts.crosswalk).toBe(1);
    expect(second.byFantasyProsId.get('22968')?.sleeperId).toBe('9221');
  });

  it('writes the parsed rows to the cache file', async () => {
    await loadCrosswalk({ cacheDir, maxAgeHours: 24 });
    const cached = JSON.parse(readFileSync(join(cacheDir, CROSSWALK_CACHE_FILENAME), 'utf8')) as {
      fetchedAt: string;
      rows: unknown[];
    };
    expect(cached.rows).toHaveLength(10);
    expect(Date.parse(cached.fetchedAt)).not.toBeNaN();
  });

  it('re-downloads once the cache is older than maxAgeHours', async () => {
    const counts = createRequestCounts();
    server.use(...snapshotHandlers({ counts }));

    await loadCrosswalk({ cacheDir, maxAgeHours: 24 });
    expect(counts.crosswalk).toBe(1);

    const stale = new Date(Date.now() + 25 * 60 * 60 * 1000);
    await loadCrosswalk({ cacheDir, maxAgeHours: 24, now: () => stale });
    expect(counts.crosswalk).toBe(2);
  });

  it('falls back to a stale cache when the download fails', async () => {
    await loadCrosswalk({ cacheDir, maxAgeHours: 24 });

    server.use(...snapshotHandlers({ crosswalkStatus: 500 }));
    const stale = new Date(Date.now() + 25 * 60 * 60 * 1000);
    const crosswalk = await loadCrosswalk({ cacheDir, maxAgeHours: 24, now: () => stale });

    expect(crosswalk.rows).toHaveLength(10);
    expect(crosswalk.fromStaleCache).toBe(true);
  });

  it('re-downloads when the cache file is corrupt rather than throwing', async () => {
    const counts = createRequestCounts();
    server.use(...snapshotHandlers({ counts }));

    writeFileSync(join(cacheDir, CROSSWALK_CACHE_FILENAME), '{ not json');
    const crosswalk = await loadCrosswalk({ cacheDir, maxAgeHours: 24 });

    expect(counts.crosswalk).toBe(1);
    expect(crosswalk.rows).toHaveLength(10);
  });
});
