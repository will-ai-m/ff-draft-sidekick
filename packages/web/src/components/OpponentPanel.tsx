/**
 * The **opponent panel** (FR-6/FR-7) — mount point.
 *
 * T13 renders the window's pick sequence, each team's unfilled slots/need vector/remaining picks,
 * the tendency summary, and the AC-37 distinction between position-level predictions and
 * illustrative player examples. The window anchors it captions with live in `data.window`.
 */
import type { Insight, OpponentPanelData } from '@sidekick/shared';

import { Panel, PanelPlaceholder } from './Panel';

export interface OpponentPanelProps {
  opponentPanel: Insight<OpponentPanelData>;
}

export function OpponentPanel({ opponentPanel }: OpponentPanelProps) {
  const { window } = opponentPanel.data;
  const badge = opponentPanel.recomputing
    ? 'recomputing'
    : window.nextUserPickNo === null
      ? 'no pick left'
      : `${window.picks.length} picks until pick ${window.nextUserPickNo}`;

  return (
    <Panel title="Opponent panel" badge={badge}>
      <PanelPlaceholder task="T13" />
    </Panel>
  );
}
