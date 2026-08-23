import { execFile } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it, vi } from 'vitest';

import { installProcessGuards } from './processGuards';
import type { ProcessFault, ProcessGuardTarget } from './processGuards';

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const CHILD = resolve(HERE, '../test/fixtures/processGuardsChild.ts');

/** A stand-in for `process`, so the unit tests can fire a fault without faulting the runner. */
const fakeTarget = (): {
  target: ProcessGuardTarget;
  fire: (event: string, value: unknown) => void;
  exitCodes: number[];
} => {
  const listeners = new Map<string, (value: unknown) => void>();
  const exitCodes: number[] = [];
  return {
    target: {
      on(event, listener) {
        listeners.set(event, listener);
        return this;
      },
      exit(code) {
        exitCodes.push(code);
        return undefined as never;
      },
    },
    fire: (event, value) => {
      listeners.get(event)?.(value);
    },
    exitCodes,
  };
};

describe('installProcessGuards', () => {
  it('reports an uncaught exception and keeps the process running', () => {
    const { target, fire, exitCodes } = fakeTarget();
    const faults: ProcessFault[] = [];

    installProcessGuards({ log: (fault) => faults.push(fault), target });
    fire('uncaughtException', new Error('the cascade exploded'));

    expect(faults).toHaveLength(1);
    expect(faults[0]).toMatchObject({
      kind: 'uncaughtException',
      message: 'the cascade exploded',
    });
    expect(faults[0]?.stack).toContain('Error: the cascade exploded');
    expect(exitCodes).toEqual([]);
  });

  it('reports an unhandled rejection the same way, including a non-Error reason', () => {
    const { target, fire, exitCodes } = fakeTarget();
    const faults: ProcessFault[] = [];

    installProcessGuards({ log: (fault) => faults.push(fault), target });
    fire('unhandledRejection', 'a string nobody wrapped');

    expect(faults[0]).toMatchObject({
      kind: 'unhandledRejection',
      message: 'a string nobody wrapped',
      stack: null,
    });
    expect(exitCodes).toEqual([]);
  });

  it('exits only when reporting the fault itself fails — the documented last resort', () => {
    const { target, fire, exitCodes } = fakeTarget();

    installProcessGuards({
      log: () => {
        throw new Error('the log sink is gone too');
      },
      target,
    });
    fire('uncaughtException', new Error('the cascade exploded'));

    expect(exitCodes).toEqual([1]);
  });

  it('registers on the real process by default', () => {
    const on = vi.spyOn(process, 'on').mockReturnValue(process);
    try {
      installProcessGuards({ log: () => undefined });
      expect(on.mock.calls.map(([event]) => event)).toEqual([
        'uncaughtException',
        'unhandledRejection',
      ]);
    } finally {
      on.mockRestore();
    }
  });

  it('really does keep Node alive through both crash paths', async () => {
    // The unit tests above prove the wrapper's shape; only a child process proves the claim, since
    // an unguarded throw-from-a-timer and an unguarded floating rejection both exit 1 on Node 20+.
    const { stdout } = await run(process.execPath, ['--import', 'tsx', CHILD], { timeout: 20_000 });
    const report = JSON.parse(stdout.trim().split('\n').at(-1) ?? '{}') as {
      alive: boolean;
      faults: string[];
    };

    expect(report.alive).toBe(true);
    expect(report.faults).toEqual([
      'uncaughtException: the recompute cascade exploded',
      'unhandledRejection: a route promise rejected',
    ]);
  }, 30_000);
});
