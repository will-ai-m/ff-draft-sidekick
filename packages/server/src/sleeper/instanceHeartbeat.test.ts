import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PARAMETER_DEFAULTS } from '@sidekick/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  PollIntervalController,
  RATE_LIMIT_DECAY_AFTER_SUCCESSES,
  computeEffectivePollInterval,
  countOtherLiveInstances,
  defaultInstancesFilePath,
  writeHeartbeat,
} from './instanceHeartbeat';

let dir: string;
let filePath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sidekick-heartbeat-'));
  filePath = join(dir, 'draft-sidekick-instances.json');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const entry = (pid: number, lastHeartbeat: number) => ({
  pid,
  startedAt: new Date(lastHeartbeat - 1000).toISOString(),
  lastHeartbeat: new Date(lastHeartbeat).toISOString(),
});

describe('computeEffectivePollInterval (AC-8)', () => {
  const { pollIntervalMs, secondInstanceBackoffFactor } = PARAMETER_DEFAULTS;

  it('leaves the configured cadence alone when this is the only live instance', () => {
    expect(
      computeEffectivePollInterval({
        pollIntervalMs,
        secondInstanceBackoffFactor,
        otherLiveInstances: 0,
      }),
    ).toBe(pollIntervalMs);
  });

  it('raises the interval proportionally for each other live instance', () => {
    expect(
      computeEffectivePollInterval({
        pollIntervalMs,
        secondInstanceBackoffFactor,
        otherLiveInstances: 1,
      }),
    ).toBe(pollIntervalMs * 1.5);
    expect(
      computeEffectivePollInterval({
        pollIntervalMs,
        secondInstanceBackoffFactor,
        otherLiveInstances: 2,
      }),
    ).toBe(pollIntervalMs * 2);
  });

  it('reads the back-off factor from config rather than a baked-in constant', () => {
    expect(
      computeEffectivePollInterval({
        pollIntervalMs: 1000,
        secondInstanceBackoffFactor: 3,
        otherLiveInstances: 1,
      }),
    ).toBe(4000);
  });
});

describe('the heartbeat file', () => {
  it('counts only other instances whose heartbeat is inside two heartbeat intervals', () => {
    const now = 1_000_000;
    writeFileSync(
      filePath,
      JSON.stringify([
        entry(4242, now - 500), // live
        entry(4243, now - DEFAULT_HEARTBEAT_INTERVAL_MS * 3), // stale
        entry(process.pid, now - 10), // us, never counted as "other"
      ]),
    );

    expect(
      countOtherLiveInstances(filePath, {
        pid: process.pid,
        now: () => now,
        heartbeatIntervalMs: DEFAULT_HEARTBEAT_INTERVAL_MS,
      }),
    ).toBe(1);
  });

  it('raises this instance’s computed interval when two other instances are live', () => {
    const now = 2_000_000;
    writeFileSync(filePath, JSON.stringify([entry(11, now - 100), entry(12, now - 100)]));

    const controller = new PollIntervalController({
      config: PARAMETER_DEFAULTS,
      filePath,
      pid: process.pid,
      now: () => now,
    });
    controller.tick();

    expect(controller.otherLiveInstances).toBe(2);
    expect(controller.effectiveIntervalMs()).toBe(PARAMETER_DEFAULTS.pollIntervalMs * 2);
  });

  it('records its own entry and prunes dead ones when it writes a heartbeat', () => {
    const now = 3_000_000;
    writeFileSync(
      filePath,
      JSON.stringify([entry(11, now - 100), entry(12, now - DEFAULT_HEARTBEAT_INTERVAL_MS * 10)]),
    );

    const others = writeHeartbeat(filePath, {
      pid: 99,
      startedAt: new Date(now - 5000).toISOString(),
      now: () => now,
      heartbeatIntervalMs: DEFAULT_HEARTBEAT_INTERVAL_MS,
    });

    expect(others).toBe(1);
    const written = JSON.parse(readFileSync(filePath, 'utf8')) as { pid: number }[];
    expect(written.map((e) => e.pid).sort((a, b) => a - b)).toEqual([11, 99]);
  });

  it('treats an unreadable or corrupt heartbeat file as "no other instances"', () => {
    writeFileSync(filePath, '{ this is not json');
    expect(
      countOtherLiveInstances(filePath, {
        pid: process.pid,
        now: () => 1,
        heartbeatIntervalMs: DEFAULT_HEARTBEAT_INTERVAL_MS,
      }),
    ).toBe(0);

    expect(
      countOtherLiveInstances(join(dir, 'does-not-exist.json'), {
        pid: process.pid,
        now: () => 1,
        heartbeatIntervalMs: DEFAULT_HEARTBEAT_INTERVAL_MS,
      }),
    ).toBe(0);
  });

  it('defaults to a shared path under the OS temp dir', () => {
    expect(defaultInstancesFilePath()).toBe(join(tmpdir(), 'draft-sidekick-instances.json'));
  });
});

describe('reactive 429 back-off', () => {
  const controllerAt = (now: number) =>
    new PollIntervalController({
      config: PARAMETER_DEFAULTS,
      filePath,
      pid: process.pid,
      now: () => now,
    });

  it('doubles the interval on each 429 and caps it at rateLimitBackoffMaxMs', () => {
    const controller = controllerAt(1);
    const base = PARAMETER_DEFAULTS.pollIntervalMs;

    controller.recordRateLimited();
    expect(controller.effectiveIntervalMs()).toBe(base * 2);
    controller.recordRateLimited();
    expect(controller.effectiveIntervalMs()).toBe(base * 4);

    for (let i = 0; i < 10; i += 1) controller.recordRateLimited();
    expect(controller.effectiveIntervalMs()).toBe(PARAMETER_DEFAULTS.rateLimitBackoffMaxMs);
  });

  it('decays back toward the heartbeat baseline after a run of successful polls', () => {
    const controller = controllerAt(1);
    const base = PARAMETER_DEFAULTS.pollIntervalMs;

    controller.recordRateLimited();
    controller.recordRateLimited();
    expect(controller.effectiveIntervalMs()).toBe(base * 4);

    for (let i = 0; i < RATE_LIMIT_DECAY_AFTER_SUCCESSES - 1; i += 1) controller.recordSuccess();
    expect(controller.effectiveIntervalMs()).toBe(base * 4);

    controller.recordSuccess();
    expect(controller.effectiveIntervalMs()).toBe(base * 2);

    for (let i = 0; i < RATE_LIMIT_DECAY_AFTER_SUCCESSES; i += 1) controller.recordSuccess();
    expect(controller.effectiveIntervalMs()).toBe(base);
  });

  it('never decays below the interval the heartbeat count calls for', () => {
    const now = 4_000_000;
    writeFileSync(filePath, JSON.stringify([entry(11, now - 100), entry(12, now - 100)]));
    const controller = controllerAt(now);
    controller.tick();

    controller.recordRateLimited();
    for (let i = 0; i < RATE_LIMIT_DECAY_AFTER_SUCCESSES * 5; i += 1) controller.recordSuccess();

    expect(controller.effectiveIntervalMs()).toBe(PARAMETER_DEFAULTS.pollIntervalMs * 2);
  });

  it('keeps the effective request rate inside the configured per-minute budget (AC-10)', () => {
    const controller = controllerAt(1);
    const requestsPerMinute = 60_000 / controller.effectiveIntervalMs();
    expect(requestsPerMinute).toBeLessThanOrEqual(PARAMETER_DEFAULTS.apiBudgetPerMin);
  });
});
