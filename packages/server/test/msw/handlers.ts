/**
 * The aggregate handler module design.md's §T1 dependency note asks for.
 *
 * T2 and T3 were developed concurrently and each kept its own handler file so neither task had to
 * edit the other's (see dev-notes-T2, decision 8). T10 is the first task that needs both at once —
 * the orchestrator drives Sleeper *and* the ECR/ADP/crosswalk sources in one attach — so this is
 * the promised one-liner that composes them.
 */
import type { HttpHandler } from 'msw';

import { snapshotHandlers } from './snapshotHandlers';
import type { SnapshotHandlerOptions } from './snapshotHandlers';
import { SleeperScenario, TEST_BASE_URL } from './sleeperHandlers';

export * from './sleeperHandlers';
export * from './snapshotHandlers';

export interface AllHandlerOptions extends SnapshotHandlerOptions {
  scenario: SleeperScenario;
  baseUrl?: string;
}

/** Every external dependency one attach touches, in one array. */
export const allHandlers = (options: AllHandlerOptions): HttpHandler[] => {
  const { scenario, baseUrl = TEST_BASE_URL, ...snapshotOptions } = options;
  return [...scenario.handlers(baseUrl), ...snapshotHandlers(snapshotOptions)];
};
