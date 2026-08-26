import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { TraceLog } from './trace';

const dirs: string[] = [];
const tempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'sidekick-trace-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

const readLines = (path: string): Record<string, unknown>[] =>
  readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as Record<string, unknown>);

describe('TraceLog', () => {
  it('appends one JSON line per event, stamped with ts and a monotonic seq', () => {
    let clock = 1_724_000_000_000;
    const trace = new TraceLog({ dir: join(tempDir(), 'traces'), now: () => clock });

    trace.write({ type: 'app-event', event: 'first' });
    clock += 5;
    trace.write({ type: 'app-event', event: 'second', data: { n: 1 } });

    const lines = readLines(trace.filePath);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ seq: 1, event: 'first' });
    expect(lines[1]).toMatchObject({ seq: 2, event: 'second', data: { n: 1 } });
    expect(typeof lines[0]!['ts']).toBe('string');
    // Two events in the same file keep their order even across the clock tick.
    expect(Date.parse(lines[1]!['ts'] as string)).toBeGreaterThan(
      Date.parse(lines[0]!['ts'] as string),
    );
  });

  it('creates the trace directory on demand and names the file by timestamp and pid', () => {
    const dir = join(tempDir(), 'nested', 'traces');
    const trace = new TraceLog({ dir });
    expect(existsSync(dir)).toBe(false); // Lazy: nothing exists until the first write.

    trace.write({ type: 'app-event', event: 'x' });
    expect(existsSync(trace.filePath)).toBe(true);
    expect(trace.filePath).toContain(`p${process.pid}`);
  });

  it('prunes the oldest trace files past the retention count, its own slot included', () => {
    const dir = tempDir();
    for (let i = 0; i < 5; i += 1) {
      writeFileSync(join(dir, `trace-2026-01-0${i + 1}T00-00-00-000Z-p1.jsonl`), '{}\n');
    }

    const trace = new TraceLog({ dir, maxFiles: 3 });
    trace.write({ type: 'app-event', event: 'x' });

    const kept = readdirSync(dir).sort();
    // 3 retained total: this process's new file plus the 2 newest pre-existing ones.
    expect(kept).toHaveLength(3);
    expect(kept).toContain('trace-2026-01-04T00-00-00-000Z-p1.jsonl');
    expect(kept).toContain('trace-2026-01-05T00-00-00-000Z-p1.jsonl');
    expect(kept.some((name) => name.includes(`p${process.pid}`))).toBe(true);
  });

  it('disables itself with one warning instead of throwing when the filesystem refuses', () => {
    const parent = tempDir();
    // Make `dir` unusable: a plain FILE occupies the path mkdirSync would need.
    const blocked = join(parent, 'not-a-dir');
    writeFileSync(blocked, 'occupied');

    const warnings: string[] = [];
    const trace = new TraceLog({ dir: blocked, warn: (message) => warnings.push(message) });

    expect(() => {
      trace.write({ type: 'app-event', event: 'x' });
      trace.write({ type: 'app-event', event: 'y' });
    }).not.toThrow();
    expect(trace.isDisabled).toBe(true);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('trace log disabled');
  });

  it('ignores an unreadable pre-existing state while pruning', () => {
    const dir = tempDir();
    mkdirSync(join(dir, 'trace-2026-01-01T00-00-00-000Z-p1.jsonl')); // A directory, not a file.
    expect(() => new TraceLog({ dir, maxFiles: 1 })).not.toThrow();
  });
});
