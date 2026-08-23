/**
 * Second-instance budget sharing (AC-8) and reactive rate-limit back-off.
 *
 * Sleeper's request budget is per IP, so two Sidekick instances on one machine share it. Rather
 * than real IPC, each instance drops a heartbeat entry in a shared file under the OS temp dir; on
 * every tick it counts the *other* entries that are still fresh and raises its own poll interval
 * proportionally. Nothing here needs the other process to cooperate beyond writing its own line,
 * and a crashed instance simply stops refreshing its entry and ages out.
 *
 * Layered on top: any HTTP 429 doubles the interval (capped by `rateLimitBackoffMaxMs`), decaying
 * back toward the heartbeat-derived baseline after a run of clean polls.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ParameterValues } from '@sidekick/shared';

/**
 * How often an instance refreshes its heartbeat entry. An implementation detail of the mechanism
 * rather than a product default, so it stays a named constant here (injectable for tests) instead
 * of joining the 🔶 AS-N table — nothing in the PRD names it.
 */
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 5000;

/**
 * Clean polls required before the reactive 429 back-off halves itself. design.md fixes this at 10;
 * same reasoning as above — a knob of the back-off mechanism, not an AS-N default.
 */
export const RATE_LIMIT_DECAY_AFTER_SUCCESSES = 10;

/** An entry is "live" while its heartbeat is younger than this many heartbeat intervals. */
const LIVENESS_INTERVALS = 2;

export const INSTANCES_FILE_NAME = 'draft-sidekick-instances.json';

export interface InstanceHeartbeatEntry {
  pid: number;
  startedAt: string;
  lastHeartbeat: string;
}

export const defaultInstancesFilePath = (): string => join(tmpdir(), INSTANCES_FILE_NAME);

export interface HeartbeatFileOptions {
  pid: number;
  now?: () => number;
  heartbeatIntervalMs?: number;
}

const isEntry = (value: unknown): value is InstanceHeartbeatEntry =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as InstanceHeartbeatEntry).pid === 'number' &&
  typeof (value as InstanceHeartbeatEntry).lastHeartbeat === 'string';

/**
 * Every live entry in the shared file. A missing, unreadable or corrupt file means "no other
 * instances" — a broken heartbeat file must never stop a draft from syncing.
 */
export function readLiveInstances(
  filePath: string,
  options: { now?: () => number; heartbeatIntervalMs?: number } = {},
): InstanceHeartbeatEntry[] {
  const now = (options.now ?? Date.now)();
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
  const maxAgeMs = heartbeatIntervalMs * LIVENESS_INTERVALS;

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return parsed.filter(isEntry).filter((entry) => {
    const last = Date.parse(entry.lastHeartbeat);
    return Number.isFinite(last) && now - last <= maxAgeMs;
  });
}

/** How many *other* instances are live right now. */
export function countOtherLiveInstances(filePath: string, options: HeartbeatFileOptions): number {
  return readLiveInstances(filePath, options).filter((entry) => entry.pid !== options.pid).length;
}

/**
 * Refreshes this instance's entry, prunes entries that have aged out, and returns how many other
 * instances are live. Failure to write is deliberately swallowed: losing the back-off is far less
 * bad than losing the draft.
 */
export function writeHeartbeat(
  filePath: string,
  options: HeartbeatFileOptions & { startedAt: string },
): number {
  const now = (options.now ?? Date.now)();
  const others = readLiveInstances(filePath, options).filter((e) => e.pid !== options.pid);
  const entries: InstanceHeartbeatEntry[] = [
    ...others,
    { pid: options.pid, startedAt: options.startedAt, lastHeartbeat: new Date(now).toISOString() },
  ];

  try {
    writeFileSync(filePath, `${JSON.stringify(entries)}\n`, 'utf8');
  } catch {
    // Best effort only.
  }
  return others.length;
}

/** Removes this instance's entry on shutdown so the next instance is not throttled by a ghost. */
export function clearHeartbeat(filePath: string, options: HeartbeatFileOptions): void {
  try {
    const remaining = readLiveInstances(filePath, options).filter((e) => e.pid !== options.pid);
    writeFileSync(filePath, `${JSON.stringify(remaining)}\n`, 'utf8');
  } catch {
    // Best effort only.
  }
}

export interface EffectivePollIntervalArgs {
  /** 🔶 AS-5 `pollIntervalMs`. */
  pollIntervalMs: number;
  /** 🔶 AS-5 `secondInstanceBackoffFactor`. */
  secondInstanceBackoffFactor: number;
  otherLiveInstances: number;
}

/** `pollIntervalMs * (1 + secondInstanceBackoffFactor * otherLiveInstances)` — AC-8. */
export function computeEffectivePollInterval({
  pollIntervalMs,
  secondInstanceBackoffFactor,
  otherLiveInstances,
}: EffectivePollIntervalArgs): number {
  return pollIntervalMs * (1 + secondInstanceBackoffFactor * Math.max(0, otherLiveInstances));
}

export type PollIntervalConfig = Pick<
  ParameterValues,
  'pollIntervalMs' | 'secondInstanceBackoffFactor' | 'rateLimitBackoffMaxMs'
>;

export interface PollIntervalControllerOptions {
  config: PollIntervalConfig;
  filePath?: string;
  pid?: number;
  now?: () => number;
  heartbeatIntervalMs?: number;
  decayAfterSuccesses?: number;
}

/**
 * The single authority on "how long until the next poll" — the heartbeat-derived baseline, raised
 * further while Sleeper is rate-limiting us. The sync loop asks it before every scheduled tick.
 */
export class PollIntervalController {
  private readonly config: PollIntervalConfig;
  private readonly filePath: string;
  private readonly pid: number;
  private readonly now: () => number;
  private readonly heartbeatIntervalMs: number;
  private readonly decayAfterSuccesses: number;
  private readonly startedAt: string;

  private otherLive = 0;
  private rateLimitedIntervalMs: number | null = null;
  private successStreak = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(options: PollIntervalControllerOptions) {
    this.config = options.config;
    this.filePath = options.filePath ?? defaultInstancesFilePath();
    this.pid = options.pid ?? process.pid;
    this.now = options.now ?? Date.now;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
    this.decayAfterSuccesses = options.decayAfterSuccesses ?? RATE_LIMIT_DECAY_AFTER_SUCCESSES;
    this.startedAt = new Date(this.now()).toISOString();
  }

  get otherLiveInstances(): number {
    return this.otherLive;
  }

  /** Refreshes this instance's heartbeat and recounts the others. */
  tick(): void {
    this.otherLive = writeHeartbeat(this.filePath, {
      pid: this.pid,
      startedAt: this.startedAt,
      now: this.now,
      heartbeatIntervalMs: this.heartbeatIntervalMs,
    });
  }

  start(): void {
    if (this.timer !== null) return;
    this.tick();
    this.timer = setInterval(() => this.tick(), this.heartbeatIntervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    clearHeartbeat(this.filePath, {
      pid: this.pid,
      now: this.now,
      heartbeatIntervalMs: this.heartbeatIntervalMs,
    });
  }

  /** The interval the heartbeat count alone calls for, before any rate-limit penalty. */
  baselineIntervalMs(): number {
    return computeEffectivePollInterval({
      pollIntervalMs: this.config.pollIntervalMs,
      secondInstanceBackoffFactor: this.config.secondInstanceBackoffFactor,
      otherLiveInstances: this.otherLive,
    });
  }

  effectiveIntervalMs(): number {
    const baseline = this.baselineIntervalMs();
    return Math.max(baseline, this.rateLimitedIntervalMs ?? baseline);
  }

  recordRateLimited(): void {
    const current = this.rateLimitedIntervalMs ?? this.baselineIntervalMs();
    this.rateLimitedIntervalMs = Math.min(current * 2, this.config.rateLimitBackoffMaxMs);
    this.successStreak = 0;
  }

  recordSuccess(): void {
    if (this.rateLimitedIntervalMs === null) {
      this.successStreak = 0;
      return;
    }
    this.successStreak += 1;
    if (this.successStreak < this.decayAfterSuccesses) return;

    this.successStreak = 0;
    const decayed = this.rateLimitedIntervalMs / 2;
    this.rateLimitedIntervalMs = decayed <= this.baselineIntervalMs() ? null : decayed;
  }
}
