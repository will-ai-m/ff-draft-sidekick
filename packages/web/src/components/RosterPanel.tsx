/**
 * The **roster panel** (FR-5) — mount point.
 *
 * T13 renders the user's filled starting slots, unfilled starting slots by position (the need
 * vector in count form), the bench count, and the K/DST slots that are tracked on the roster even
 * though the prediction math excludes them (AC-33). `data` is null until a seat is resolved.
 */
import type { Insight, RosterPanelData } from '@sidekick/shared';

import { Panel, PanelPlaceholder } from './Panel';

export interface RosterPanelProps {
  userRoster: Insight<RosterPanelData | null>;
}

export function RosterPanel({ userRoster }: RosterPanelProps) {
  return (
    <Panel title="Roster panel" badge={userRoster.recomputing ? 'recomputing' : null}>
      {userRoster.data === null ? (
        <p className="text-slate-500">No roster yet — your draft slot is not resolved.</p>
      ) : (
        <PanelPlaceholder task="T13" />
      )}
    </Panel>
  );
}
