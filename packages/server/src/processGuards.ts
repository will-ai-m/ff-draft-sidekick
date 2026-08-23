/**
 * The process's last error boundary: an uncaught exception or an unhandled rejection reports
 * itself and the draft session stays up.
 *
 * Every layer below this one has its own containment — `BoardSync.tick()` swallows a throw so the
 * poll loop survives it, `Orchestrator.settleBurst()` degrades the panels instead of propagating,
 * and every route answers 5xx rather than rejecting. This exists for the throw nobody predicted,
 * and its justification is the setting: a live draft has a 60-second pick clock and no way to
 * replay the minutes an exited process costs. Node's default for both events is `exit(1)`, so
 * without this the cheapest possible bug — a typo on a rarely-taken branch — ends the draft.
 *
 * **The one deliberate crash.** If reporting the fault *itself* throws, this exits 1 rather than
 * looping. A guard that cannot say what went wrong is worse than no guard: it would keep a process
 * alive in an unknown state while emitting nothing, and the operator would be left with a browser
 * showing plausible numbers and a terminal showing silence. Failing loudly is the honest answer.
 *
 * Recovery is not attempted here and never should be — this reports and returns. The state each
 * fault leaves behind is the owning module's problem, not this one's.
 */

export interface ProcessFault {
  kind: 'uncaughtException' | 'unhandledRejection';
  message: string;
  /** The stack when the fault carried an `Error`; null for a thrown/rejected non-Error value. */
  stack: string | null;
}

/** The slice of `process` these guards use — injectable so a test can fire a fault safely. */
export interface ProcessGuardTarget {
  on(event: string, listener: (value: unknown) => void): unknown;
  exit(code: number): never;
}

export interface ProcessGuardOptions {
  /** Where a fault is reported. `index.ts` passes the AC-66 log sink. */
  log: (fault: ProcessFault) => void;
  /** Defaults to the real `process`. */
  target?: ProcessGuardTarget;
}

const describe = (kind: ProcessFault['kind'], value: unknown): ProcessFault =>
  value instanceof Error
    ? { kind, message: value.message, stack: value.stack ?? null }
    : { kind, message: String(value), stack: null };

/**
 * Registers the two handlers. Call once, as early in startup as the log sink allows.
 *
 * Registering a listener for either event replaces Node's default handler, which is what keeps
 * the process alive; that is the whole mechanism.
 */
export function installProcessGuards(options: ProcessGuardOptions): void {
  const target = options.target ?? (process as unknown as ProcessGuardTarget);

  const report = (kind: ProcessFault['kind']) => (value: unknown) => {
    try {
      options.log(describe(kind, value));
    } catch {
      // Documented above: the log sink is the only thing this guard promises, so losing it is
      // the one failure it will not survive quietly.
      target.exit(1);
    }
  };

  target.on('uncaughtException', report('uncaughtException'));
  target.on('unhandledRejection', report('unhandledRejection'));
}
