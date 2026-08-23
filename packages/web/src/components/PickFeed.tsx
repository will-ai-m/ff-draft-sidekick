/**
 * The **pick feed** (FR-2) — mount point.
 *
 * T13 renders the chronological list, each entry attributed to its team and flagged
 * mine-vs-opponent, with unmatched players shown under their raw Sleeper name plus a visible
 * warning badge (AC-20) rather than quietly omitted.
 */
import type { PickFeedEntry } from '@sidekick/shared';

import { Panel, PanelPlaceholder } from './Panel';

export interface PickFeedProps {
  pickFeed: PickFeedEntry[];
}

export function PickFeed({ pickFeed }: PickFeedProps) {
  return (
    <Panel title="Pick feed" badge={`${pickFeed.length} picks`}>
      <PanelPlaceholder task="T13" />
    </Panel>
  );
}
