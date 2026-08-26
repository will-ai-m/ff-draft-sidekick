/**
 * Post-draft trace reading — `npm run trace:report [path/to/trace.jsonl]`.
 *
 * Turns one flight-recorder file (`data/traces/trace-*.jsonl`, newest by default) into the
 * after-action summary the PRD's §14 post-draft checklist is answered against: was the board
 * trustworthy (degraded episodes, poll success rate), were the latency bars met (pick-reflection
 * and burst-refresh p95 against their budgets), what did the recommendation say at every board
 * state, and what broke (cascade failures, client errors, process faults, Sleeper errors).
 *
 * Read-only and dependency-free on purpose: it must be runnable months later against an old file
 * with no server up.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PARAMETER_DEFAULTS } from '@sidekick/shared';

const TRACE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../data/traces');

interface TraceRecord {
  ts?: string;
  seq?: number;
  type?: string;
  event?: string;
  draftId?: string | null;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------------------------

function newestTraceFile(): string {
  let names: string[];
  try {
    names = readdirSync(TRACE_DIR).filter(
      (name) => name.startsWith('trace-') && name.endsWith('.jsonl'),
    );
  } catch {
    names = [];
  }
  if (names.length === 0) {
    console.error(`No trace files found in ${TRACE_DIR}. Run the app first — every launch writes one.`);
    process.exit(1);
  }
  names.sort(); // Timestamp-prefixed names: lexical order is chronological order.
  return join(TRACE_DIR, names[names.length - 1]!);
}

function loadRecords(path: string): { records: TraceRecord[]; badLines: number } {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    console.error(`Could not read ${path}: ${(error as Error).message}`);
    process.exit(1);
  }
  const records: TraceRecord[] = [];
  let badLines = 0;
  for (const line of raw.split('\n')) {
    if (line.trim() === '') continue;
    try {
      records.push(JSON.parse(line) as TraceRecord);
    } catch {
      badLines += 1; // A crash can truncate the final line; that is not worth dying over.
    }
  }
  return { records, badLines };
}

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

const isEvent = (record: TraceRecord, event: string): boolean =>
  record.type === 'app-event' && record.event === event;

const num = (value: unknown): number | null => (typeof value === 'number' ? value : null);
const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1);
  return sorted[index]!;
}

function latencyLine(label: string, values: number[], budgetMs: number | null): string {
  if (values.length === 0) return `  ${label}: no samples`;
  const p50 = percentile(values, 0.5)!;
  const p95 = percentile(values, 0.95)!;
  const max = Math.max(...values);
  const budget =
    budgetMs === null ? '' : `  budget ${budgetMs} ms → ${p95 <= budgetMs ? 'PASS' : 'FAIL'}`;
  return `  ${label}: n=${values.length}  p50=${p50} ms  p95=${p95} ms  max=${max} ms${budget}`;
}

const fmtMs = (ms: number): string =>
  ms >= 60_000 ? `${(ms / 60_000).toFixed(1)} min` : `${(ms / 1000).toFixed(1)} s`;

function heading(title: string): void {
  console.log(`\n=== ${title} ${'='.repeat(Math.max(0, 70 - title.length))}`);
}

// ---------------------------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------------------------

function reportHeader(path: string, records: TraceRecord[], badLines: number): void {
  const first = records[0];
  const last = records[records.length - 1];
  console.log(`Trace: ${path}`);
  console.log(
    `Events: ${records.length}${badLines > 0 ? ` (+${badLines} unparseable line(s))` : ''}` +
      `  span: ${first?.ts ?? '?'} → ${last?.ts ?? '?'}`,
  );

  const started = records.find((r) => isEvent(r, 'server-started'));
  if (started !== undefined) {
    const data = started.data ?? {};
    console.log(
      `Server: pid ${num(data['pid']) ?? '?'} on port ${num(data['port']) ?? '?'}, ` +
        `node ${str(data['nodeVersion']) ?? '?'}, game-log cache ${
          data['gameLogCacheLoaded'] === true ? 'loaded' : 'MISSING'
        }`,
    );
    const config = data['config'];
    if (typeof config === 'object' && config !== null) {
      const overrides = Object.entries(config as Record<string, unknown>).filter(
        ([key, value]) =>
          key in PARAMETER_DEFAULTS &&
          JSON.stringify(value) !==
            JSON.stringify(PARAMETER_DEFAULTS[key as keyof typeof PARAMETER_DEFAULTS]),
      );
      console.log(
        overrides.length === 0
          ? 'Config: all defaults'
          : `Config overrides: ${overrides.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')}`,
      );
    }
  }
  const stopped = records.some((r) => r.type === 'server-stopped');
  if (!stopped) console.log('Note: no server-stopped event — process still running or killed hard.');
}

function reportAttaches(records: TraceRecord[]): void {
  heading('Sessions');
  const attaches = records.filter((r) => isEvent(r, 'attach-succeeded'));
  const failures = records.filter((r) => isEvent(r, 'attach-failed'));
  if (attaches.length === 0 && failures.length === 0) {
    console.log('  No attach was attempted.');
    return;
  }
  for (const attach of attaches) {
    const d = attach.data ?? {};
    console.log(
      `  ${attach.ts}  attached ${str(d['draftId'])} (${d['isMock'] === true ? 'mock' : 'league'}, ` +
        `${num(d['teamCount'])}×${num(d['rounds'])}, season ${str(d['season'])}, ` +
        `status ${str(d['draftStatus'])}) seat=${str(d['userTeamId']) ?? 'unresolved'} ` +
        `picksAlready=${num(d['picksAlreadyMade'])} matchedPlayers=${num(d['matchedPlayers'])}`,
    );
    const check = d['preDraftCheck'];
    if (typeof check === 'object' && check !== null) {
      const warnings = (check as Record<string, unknown>)['warnings'];
      if (Array.isArray(warnings) && warnings.length > 0) {
        for (const warning of warnings as Record<string, unknown>[]) {
          console.log(`      warning: ${str(warning['code']) ?? '?'} — ${str(warning['message']) ?? ''}`);
        }
      }
    }
  }
  for (const failure of failures) {
    const d = failure.data ?? {};
    console.log(`  ${failure.ts}  attach FAILED: ${str(d['kind'])} — ${str(d['message'])}`);
  }
  for (const detach of records.filter((r) => isEvent(r, 'detached'))) {
    const d = detach.data ?? {};
    console.log(
      `  ${detach.ts}  detached ${str(d['draftId'])} after ${fmtMs(num(d['attachedForMs']) ?? 0)} ` +
        `(${num(d['picksSeen'])} picks seen, ${num(d['recomputes'])} recomputes)`,
    );
  }
}

function reportSync(records: TraceRecord[]): void {
  heading('Board sync');
  const polls = records.filter((r) => isEvent(r, 'poll'));
  if (polls.length === 0) {
    console.log('  No polls recorded.');
    return;
  }
  const byOutcome = new Map<string, number>();
  const durations: number[] = [];
  for (const poll of polls) {
    const outcome = str(poll.data?.['outcome']) ?? '?';
    byOutcome.set(outcome, (byOutcome.get(outcome) ?? 0) + 1);
    const duration = num(poll.data?.['durationMs']);
    if (duration !== null) durations.push(duration);
  }
  const degradedCount = byOutcome.get('degraded') ?? 0;
  const successRate = (((polls.length - degradedCount) / polls.length) * 100).toFixed(1);
  console.log(
    `  ${polls.length} polls — ${[...byOutcome.entries()].map(([k, v]) => `${k}: ${v}`).join(', ')} ` +
      `(success ${successRate}%)`,
  );
  console.log(latencyLine('poll duration', durations, null));

  const episodes = records.filter((r) => isEvent(r, 'sync-degraded'));
  const recoveries = records.filter((r) => isEvent(r, 'sync-recovered'));
  if (episodes.length === 0) {
    console.log('  Degraded episodes: none');
  } else {
    console.log(`  Degraded episodes: ${episodes.length} (recovered: ${recoveries.length})`);
    for (const episode of episodes) {
      const d = episode.data ?? {};
      console.log(`      ${episode.ts}  ${str(d['kind'])}: ${str(d['message'])}`);
    }
    for (const recovery of recoveries) {
      console.log(`      ${recovery.ts}  recovered after ${fmtMs(num(recovery.data?.['outageMs']) ?? 0)}`);
    }
  }

  const resyncs = records.filter((r) => isEvent(r, 'resync'));
  if (resyncs.length > 0) {
    for (const resync of resyncs) {
      const d = resync.data ?? {};
      console.log(
        `  Re-sync at ${resync.ts}: ${d['ok'] === true ? 'ok' : `FAILED (${str(d['failureKind'])})`} ` +
          `in ${num(d['durationMs'])} ms`,
      );
    }
  }

  const sleeperErrors = records.filter(
    (r) => isEvent(r, 'sleeper-request') && r.data?.['ok'] === false,
  );
  if (sleeperErrors.length > 0) {
    const byKind = new Map<string, number>();
    for (const error of sleeperErrors) {
      const kind = str(error.data?.['errorKind']) ?? '?';
      byKind.set(kind, (byKind.get(kind) ?? 0) + 1);
    }
    console.log(
      `  Sleeper request failures: ${[...byKind.entries()].map(([k, v]) => `${k}: ${v}`).join(', ')}`,
    );
  }
}

function reportLatency(records: TraceRecord[]): void {
  heading('Latency vs budgets');
  const started = records.find((r) => isEvent(r, 'server-started'));
  const config = (started?.data?.['config'] ?? {}) as Record<string, unknown>;
  const pickBudget = num(config['pickReflectionLatencyMs']) ?? PARAMETER_DEFAULTS.pickReflectionLatencyMs;
  const burstBudget = num(config['insightRefreshLatencyMs']) ?? PARAMETER_DEFAULTS.insightRefreshLatencyMs;

  const pickLags = records
    .filter((r) => r.type === 'pick-reflected')
    .map((r) => num(r['lagMs']))
    .filter((v): v is number => v !== null);
  const burstLatencies = records
    .filter((r) => r.type === 'burst-refreshed')
    .map((r) => num(r['latencyMs']))
    .filter((v): v is number => v !== null);
  console.log(latencyLine('pick reflection (SC-1)', pickLags, pickBudget));
  console.log(latencyLine('burst refresh (SC-2)', burstLatencies, burstBudget));

  const recomputes = records.filter((r) => isEvent(r, 'recompute'));
  const recomputeDurations = recomputes
    .map((r) => num(r.data?.['durationMs']))
    .filter((v): v is number => v !== null);
  console.log(latencyLine('recompute cascade', recomputeDurations, null));
  const slowest = [...recomputes]
    .sort((a, b) => (num(b.data?.['durationMs']) ?? 0) - (num(a.data?.['durationMs']) ?? 0))
    .slice(0, 3);
  for (const recompute of slowest) {
    const d = recompute.data ?? {};
    const phases = (d['phases'] ?? {}) as Record<string, unknown>;
    console.log(
      `      slow recompute at ${recompute.ts}: ${num(d['durationMs'])} ms ` +
        `(panel ${num(phases['opponentPanelMs'])} / sim ${num(phases['simulationMs'])} / ` +
        `candidates ${num(phases['candidateListMs'])}), picksMade=${num(d['picksMade'])}`,
    );
  }
}

function reportPicksAndRecommendations(records: TraceRecord[]): void {
  heading('Picks and recommendations');
  const pickEvents = records.filter((r) => isEvent(r, 'picks-observed'));
  const totalPicks = pickEvents.reduce((sum, r) => sum + (num(r.data?.['count']) ?? 0), 0);
  console.log(`  Picks observed: ${totalPicks} across ${pickEvents.length} poll(s)/re-ingest(s)`);

  const recomputes = records.filter((r) => isEvent(r, 'recompute'));
  let lastHighlight: string | null = 'nothing-yet';
  let shown = 0;
  for (const recompute of recomputes) {
    const d = recompute.data ?? {};
    const output = (d['output'] ?? {}) as Record<string, unknown>;
    const highlight = str(output['highlightPlayerName']) ?? str(output['highlightPlayerId']);
    if (highlight === lastHighlight) continue; // Only transitions are worth a line.
    lastHighlight = highlight;
    shown += 1;
    const reason = str(output['reason']) ?? str(output['disabledReason']) ?? '';
    console.log(
      `  after pick ${num(d['picksMade']) ?? '?'}: → ${highlight ?? '(none)'}` +
        `${str(output['reasonKind']) === null ? '' : ` [${str(output['reasonKind'])}]`}` +
        `${reason === '' ? '' : ` — ${reason}`}`,
    );
  }
  if (shown === 0 && recomputes.length > 0) console.log('  Recommendation never changed.');
  if (recomputes.length === 0) console.log('  No recomputes recorded.');
}

function reportFaults(records: TraceRecord[]): void {
  heading('Faults');
  const cascades = records.filter((r) => r.type === 'cascade-failed');
  const clientErrors = records.filter((r) => isEvent(r, 'client-error'));
  const routeErrors = records.filter((r) => isEvent(r, 'route-error'));
  const processFaults = records.filter((r) => r.type === 'process-fault');
  const httpErrors = records.filter(
    (r) => isEvent(r, 'http') && (num(r.data?.['status']) ?? 0) >= 400,
  );

  if (
    cascades.length + clientErrors.length + routeErrors.length + processFaults.length + httpErrors.length ===
    0
  ) {
    console.log('  None. Clean run.');
    return;
  }
  for (const fault of processFaults) {
    console.log(`  ${fault.ts}  PROCESS FAULT ${str(fault['kind'])}: ${str(fault['message'])}`);
  }
  for (const cascade of cascades) {
    console.log(`  ${cascade.ts}  cascade failed @ board v${num(cascade['boardVersion'])}: ${str(cascade['message'])}`);
  }
  for (const error of routeErrors) {
    const d = error.data ?? {};
    console.log(`  ${error.ts}  route error ${str(d['method'])} ${str(d['path'])}: ${str(d['message'])}`);
  }
  for (const error of clientErrors) {
    const d = error.data ?? {};
    console.log(`  ${error.ts}  client ${str(d['kind'])}: ${str(d['message'])}`);
  }
  if (httpErrors.length > 0) {
    const byPath = new Map<string, number>();
    for (const error of httpErrors) {
      const key = `${num(error.data?.['status'])} ${str(error.data?.['method'])} ${str(error.data?.['path'])}`;
      byPath.set(key, (byPath.get(key) ?? 0) + 1);
    }
    console.log(`  HTTP ≥400: ${[...byPath.entries()].map(([k, v]) => `${k} ×${v}`).join(', ')}`);
  }
}

// ---------------------------------------------------------------------------------------------

function main(): void {
  const argPath = process.argv[2];
  const path = argPath === undefined ? newestTraceFile() : resolve(argPath);
  const { records, badLines } = loadRecords(path);
  if (records.length === 0) {
    console.error(`${path} holds no parseable events.`);
    process.exit(1);
  }

  reportHeader(path, records, badLines);
  reportAttaches(records);
  reportSync(records);
  reportLatency(records);
  reportPicksAndRecommendations(records);
  reportFaults(records);
  console.log('');
}

main();
