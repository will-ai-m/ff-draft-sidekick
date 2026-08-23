/**
 * A child process for `processGuards.test.ts` — the only honest way to assert that Node itself
 * keeps running.
 *
 * Both faults below exit code 1 on an unguarded process: a throw from a `setTimeout` callback is
 * exactly the burst-debounce cascade's crash path, and a rejected floating promise is exactly the
 * route `void (async …)()` one. Run under `node --import tsx`.
 */
import { installProcessGuards } from '../../src/processGuards';
import type { ProcessFault } from '../../src/processGuards';

const faults: ProcessFault[] = [];

installProcessGuards({
  log: (fault) => {
    faults.push(fault);
  },
});

setTimeout(() => {
  throw new Error('the recompute cascade exploded');
}, 1);

setTimeout(() => {
  void Promise.reject(new Error('a route promise rejected'));
}, 20);

setTimeout(() => {
  process.stdout.write(
    `${JSON.stringify({ alive: true, faults: faults.map((fault) => `${fault.kind}: ${fault.message}`) })}\n`,
  );
  process.exit(0);
}, 200);
