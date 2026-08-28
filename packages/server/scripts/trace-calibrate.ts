/**
 * Survival-forecast calibration from flight-recorder traces — `npm run trace:calibrate [files…]`.
 *
 * Every recompute event records the survival probability shown for each top candidate, and the
 * picks-observed events record what actually happened — so each finished draft is a free
 * calibration sample for FR-8's Monte Carlo model (OQ-1's "availability-projection calibration
 * scored against reality", made runnable). With no arguments it scores every trace in
 * `data/traces/`; pass file paths to score specific ones.
 *
 * **Horizon discipline** — the one methodological trap, learned the hard way (2026-08-27: a
 * first-pass analysis mis-scored max-lead forecasts against a one-pick horizon and read the
 * model as far more pessimistic than it is). A recompute made at `picksMade = pm` projects
 * survival to the user's *next* turn, which is the smallest user pick strictly greater than
 * `pm + 1` (when the user is on the clock at `pm + 1`, survival means "if you pass now").
 * Every forecast here is scored against exactly that pick.
 *
 * Two views are reported:
 *  - **decision-time** (primary): the recompute in force at the moment of each user pick — the
 *    forecast the user actually acted on;
 *  - **all recomputes** (secondary): every recompute scored, more samples but serially
 *    correlated, so treat its n as optimistic.
 *
 * A candidate the *user* drafted is censored, not scored — the model predicts opponent
 * behaviour, and the user taking the player is the intervention the forecast informed.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TRACE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../data/traces');

interface TraceRecord {
  ts?: string;
  type?: string;
  event?: string;
  draftId?: string | null;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

interface Forecast {
  draftId: string;
  playerId: string;
  playerName: string;
  probability: number;
  survived: boolean;
  picksMade: number;
  horizon: number;
}

// ---------------------------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------------------------

function traceFiles(): string[] {
  const args = process.argv.slice(2);
  if (args.length > 0) return args.map((a) => resolve(a));
  let names: string[] = [];
  try {
    names = readdirSync(TRACE_DIR)
      .filter((name) => name.startsWith('trace-') && name.endsWith('.jsonl'))
      .sort();
  } catch {
    /* fall through to the empty-check below */
  }
  if (names.length === 0) {
    console.error(`No trace files found in ${TRACE_DIR}. Run a draft first.`);
    process.exit(1);
  }
  return names.map((name) => join(TRACE_DIR, name));
}

function loadRecords(path: string): TraceRecord[] {
  const records: TraceRecord[] = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (line.trim() === '') continue;
    try {
      records.push(JSON.parse(line) as TraceRecord);
    } catch {
      // A hard kill can truncate the last line; everything before it still counts.
    }
  }
  return records;
}

const isEvent = (r: TraceRecord, event: string): boolean =>
  r.type === 'app-event' && r.event === event;

// ---------------------------------------------------------------------------------------------
// Forecast extraction — one draft at a time
// ---------------------------------------------------------------------------------------------

interface DraftHistory {
  draftId: string;
  userPickNos: number[];
  userPickSet: Set<number>;
  draftedNoByPlayer: Map<string, number>;
  /** picksMade → the latest recompute at that board state, in trace order. */
  recomputes: { picksMade: number; rows: { playerId: string; playerName: string; p: number }[] }[];
}

function draftHistories(records: TraceRecord[]): DraftHistory[] {
  const byDraft = new Map<string, TraceRecord[]>();
  for (const r of records) {
    const id = typeof r.draftId === 'string' ? r.draftId : null;
    if (id === null) continue;
    let list = byDraft.get(id);
    if (list === undefined) byDraft.set(id, (list = []));
    list.push(r);
  }

  const histories: DraftHistory[] = [];
  for (const [draftId, rs] of byDraft) {
    const userPickNos: number[] = [];
    const draftedNoByPlayer = new Map<string, number>();
    for (const r of rs) {
      if (!isEvent(r, 'picks-observed')) continue;
      for (const p of (r.data?.['picks'] as Record<string, unknown>[] | undefined) ?? []) {
        const pickNo = p['pickNo'] as number;
        draftedNoByPlayer.set(p['playerId'] as string, pickNo);
        if (p['isUserPick'] === true) userPickNos.push(pickNo);
      }
    }
    userPickNos.sort((a, b) => a - b);

    const recomputes: DraftHistory['recomputes'] = [];
    for (const r of rs) {
      if (!isEvent(r, 'recompute')) continue;
      const output = (r.data?.['output'] ?? {}) as Record<string, unknown>;
      const rows: DraftHistory['recomputes'][number]['rows'] = [];
      for (const row of (output['topRows'] as Record<string, unknown>[] | undefined) ?? []) {
        const survival = row['survival'] as { probability?: number } | null;
        if (survival == null || typeof survival.probability !== 'number') continue;
        rows.push({
          playerId: row['playerId'] as string,
          playerName: (row['playerName'] as string | undefined) ?? (row['playerId'] as string),
          p: survival.probability,
        });
      }
      if (rows.length > 0) {
        recomputes.push({ picksMade: (r.data?.['picksMade'] as number | undefined) ?? 0, rows });
      }
    }

    if (userPickNos.length >= 2 && recomputes.length > 0) {
      histories.push({
        draftId,
        userPickNos,
        userPickSet: new Set(userPickNos),
        draftedNoByPlayer,
        recomputes,
      });
    }
  }
  return histories;
}

/** The user pick a recompute at `picksMade` projects to — see the header's horizon discipline. */
const horizonFor = (picksMade: number, userPickNos: readonly number[]): number | null =>
  userPickNos.find((u) => u > picksMade + 1) ?? null;

function scoreRecompute(
  history: DraftHistory,
  recompute: DraftHistory['recomputes'][number],
): Forecast[] {
  const horizon = horizonFor(recompute.picksMade, history.userPickNos);
  if (horizon === null) return [];

  const forecasts: Forecast[] = [];
  for (const row of recompute.rows) {
    const draftedNo = history.draftedNoByPlayer.get(row.playerId);
    const goneBeforeHorizon = draftedNo !== undefined && draftedNo < horizon;
    // Censored: the user took the player themselves — that is the forecast doing its job, not
    // an opponent falsifying it.
    if (goneBeforeHorizon && history.userPickSet.has(draftedNo)) continue;
    forecasts.push({
      draftId: history.draftId,
      playerId: row.playerId,
      playerName: row.playerName,
      probability: row.p,
      survived: !goneBeforeHorizon,
      picksMade: recompute.picksMade,
      horizon,
    });
  }
  return forecasts;
}

function extractForecasts(history: DraftHistory): { decision: Forecast[]; all: Forecast[] } {
  const all: Forecast[] = [];
  for (const recompute of history.recomputes) all.push(...scoreRecompute(history, recompute));

  // Decision-time: the recompute in force at each user pick U — the latest one whose board
  // state precedes U (picksMade < U), scored at its own horizon.
  const decision: Forecast[] = [];
  for (const userPick of history.userPickNos) {
    const inForce = [...history.recomputes].reverse().find((r) => r.picksMade < userPick);
    if (inForce === undefined) continue;
    decision.push(...scoreRecompute(history, inForce));
  }
  return { decision, all };
}

// ---------------------------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------------------------

const mean = (xs: number[]): number => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

function reportView(label: string, forecasts: Forecast[]): void {
  console.log(`\n=== ${label} ${'='.repeat(Math.max(0, 66 - label.length))}`);
  if (forecasts.length === 0) {
    console.log('  No scorable forecasts.');
    return;
  }

  const observed = mean(forecasts.map((f) => (f.survived ? 1 : 0)));
  const predicted = mean(forecasts.map((f) => f.probability));
  const brier = mean(forecasts.map((f) => (f.probability - (f.survived ? 1 : 0)) ** 2));
  const baseRateBrier = mean(forecasts.map((f) => (observed - (f.survived ? 1 : 0)) ** 2));
  console.log(
    `  n=${forecasts.length}  mean predicted=${predicted.toFixed(3)}  observed=${observed.toFixed(3)}`,
  );
  console.log(
    `  Brier=${brier.toFixed(4)}  vs constant-base-rate Brier=${baseRateBrier.toFixed(4)}  ` +
      `(${brier < baseRateBrier ? 'model BEATS the constant' : 'model LOSES to the constant'})`,
  );

  const buckets: [string, (p: number) => boolean][] = [
    ['likely-gone      (p ≤ .25)', (p) => p <= 0.25],
    ['coin-flip   (.25 < p < .75)', (p) => p > 0.25 && p < 0.75],
    ['likely-available (p ≥ .75)', (p) => p >= 0.75],
  ];
  for (const [name, test] of buckets) {
    const inBucket = forecasts.filter((f) => test(f.probability));
    if (inBucket.length === 0) {
      console.log(`  ${name}: n=0`);
      continue;
    }
    const rate = mean(inBucket.map((f) => (f.survived ? 1 : 0)));
    const predictedInBucket = mean(inBucket.map((f) => f.probability));
    console.log(
      `  ${name}: n=${inBucket.length}  predicted=${predictedInBucket.toFixed(2)}  ` +
        `survived=${(rate * 100).toFixed(0)}%`,
    );
  }

  const surprises = forecasts
    .filter((f) => (f.probability >= 0.75 && !f.survived) || (f.probability <= 0.25 && f.survived))
    .sort((a, b) => Math.abs(b.probability - 0.5) - Math.abs(a.probability - 0.5))
    .slice(0, 8);
  if (surprises.length > 0) {
    console.log('  biggest surprises:');
    for (const s of surprises) {
      console.log(
        `    ${s.playerName}: p=${s.probability.toFixed(2)} but ${s.survived ? 'SURVIVED' : 'was GONE'} ` +
          `(board@${s.picksMade} → pick ${s.horizon}, draft ${s.draftId.slice(-6)})`,
      );
    }
  }
}

function main(): void {
  const files = traceFiles();
  const decision: Forecast[] = [];
  const all: Forecast[] = [];
  let drafts = 0;

  for (const file of files) {
    for (const history of draftHistories(loadRecords(file))) {
      drafts += 1;
      const extracted = extractForecasts(history);
      decision.push(...extracted.decision);
      all.push(...extracted.all);
      console.log(
        `${history.draftId}  (${file.split('/').pop()}): ${history.userPickNos.length} user picks, ` +
          `${history.recomputes.length} forecasting recomputes`,
      );
    }
  }

  if (drafts === 0) {
    console.log('No drafts with scorable forecasts found in the given trace files.');
    return;
  }

  reportView('Decision-time forecasts (what the user acted on)', decision);
  reportView('All recomputes (more samples, serially correlated)', all);
  console.log(
    '\nEach new mock adds samples — re-run after every rehearsal, and tune ' +
      'reachAdjustmentPerPick / kdstEarlyPickWindow in config.local.json against these numbers.',
  );
}

main();
