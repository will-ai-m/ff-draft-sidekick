/**
 * The flight recorder: every observability sample, persisted as one JSON line each.
 *
 * The in-memory ring buffer (`Observability`) answers "how is the draft going right now"; this
 * file answers "what exactly happened last Tuesday". One file per server process, append-only,
 * written synchronously — a crash mid-draft must not take the record of what led to it, and at
 * this app's event rate (one poll a second, one recompute a pick) a sync append is nothing.
 *
 * Tracing must never end a draft: any filesystem failure disables the recorder with one loud
 * console line and the app runs on without it. `npm run trace:report` reads these files back.
 */
import { appendFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

export interface TraceLogOptions {
  /** Directory the trace files live in; created on demand. */
  dir: string;
  now?: () => number;
  /** How many trace files to retain, newest first, this process's own included. */
  maxFiles?: number;
  /** Where the "trace disabled" complaint goes; defaults to `console.error`. */
  warn?: (message: string) => void;
}

const DEFAULT_MAX_FILES = 50;

export const TRACE_FILE_PREFIX = 'trace-';
export const TRACE_FILE_SUFFIX = '.jsonl';

/** ISO timestamp with `:`/`.` flattened, so the name sorts chronologically and stays a valid path. */
const stampFor = (at: number): string => new Date(at).toISOString().replace(/[:.]/g, '-');

export class TraceLog {
  /** Absolute path of this process's trace file. The file itself appears on the first write. */
  readonly filePath: string;

  private readonly dir: string;
  private readonly now: () => number;
  private readonly warn: (message: string) => void;
  private seq = 0;
  private disabled = false;
  private dirReady = false;

  constructor(options: TraceLogOptions) {
    this.dir = options.dir;
    this.now = options.now ?? Date.now;
    this.warn = options.warn ?? ((message) => console.error(message));
    this.filePath = join(
      this.dir,
      `${TRACE_FILE_PREFIX}${stampFor(this.now())}-p${process.pid}${TRACE_FILE_SUFFIX}`,
    );
    this.prune(options.maxFiles ?? DEFAULT_MAX_FILES);
  }

  get isDisabled(): boolean {
    return this.disabled;
  }

  /**
   * Appends one record as one JSON line, stamped with a wall-clock ISO `ts` and a monotonic `seq`
   * (two events inside the same millisecond keep their order in the file).
   */
  write(record: object): void {
    if (this.disabled) return;
    this.seq += 1;
    const line = JSON.stringify({
      ts: new Date(this.now()).toISOString(),
      seq: this.seq,
      ...record,
    });
    try {
      if (!this.dirReady) {
        mkdirSync(this.dir, { recursive: true });
        this.dirReady = true;
      }
      appendFileSync(this.filePath, `${line}\n`, 'utf8');
    } catch (error) {
      this.disable(`could not write ${this.filePath}: ${(error as Error).message}`);
    }
  }

  /** Deletes the oldest trace files beyond the retention count. Best-effort, like everything here. */
  private prune(maxFiles: number): void {
    let names: string[];
    try {
      names = readdirSync(this.dir);
    } catch {
      return; // Directory does not exist yet — nothing to prune.
    }
    const traces = names
      .filter((name) => name.startsWith(TRACE_FILE_PREFIX) && name.endsWith(TRACE_FILE_SUFFIX))
      .sort() // Names begin with an ISO timestamp, so lexical order is chronological order.
      .reverse();
    // This process's file is about to exist, so it occupies one retention slot already.
    for (const name of traces.slice(Math.max(0, maxFiles - 1))) {
      try {
        unlinkSync(join(this.dir, name));
      } catch {
        // A file someone holds open or already removed is not worth failing startup over.
      }
    }
  }

  private disable(reason: string): void {
    if (this.disabled) return;
    this.disabled = true;
    this.warn(
      `[sidekick] trace log disabled — ${reason}. ` +
        'The draft continues; only the on-disk record stops.',
    );
  }
}
