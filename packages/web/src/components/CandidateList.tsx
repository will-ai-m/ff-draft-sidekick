/**
 * The **candidate list** (FR-9/FR-10) — mount point.
 *
 * The rows, the highlighted recommendation, its verbatim reason line, the position filter (read
 * off `rowsByPosition`) and the recomputing-but-visible treatment are T12's. What lives here now
 * is the frame, the props T12 builds against, and the one state the shell owes AC-28: when the
 * server publishes a `disabledReason` — no ECR snapshot loaded, or a seat still unresolved — the
 * list says so explicitly instead of rendering as an empty list of candidates. **Keep that branch
 * when this component is filled in**: "no rankings loaded" is a stated mode, not an empty table.
 */
import type { CandidateListData, Insight } from '@sidekick/shared';

import { Panel, PanelPlaceholder } from './Panel';

export interface CandidateListProps {
  candidateList: Insight<CandidateListData>;
}

export function CandidateList({ candidateList }: CandidateListProps) {
  const { disabledReason } = candidateList.data;

  return (
    <Panel
      title="Candidate list"
      badge={candidateList.recomputing ? 'recomputing' : candidateList.degraded ? 'degraded' : null}
    >
      {disabledReason !== null ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-200">
          {disabledReason}
        </p>
      ) : (
        <PanelPlaceholder task="T12" />
      )}
    </Panel>
  );
}
