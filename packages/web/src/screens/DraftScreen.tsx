/**
 * The draft screen — the layout UJ-2 lives in.
 *
 * This task owns the frame and the sync indicator; the four panels below it are mount points for
 * T12 (candidate list) and T13 (opponent panel, roster panel, pick feed), each already wired to
 * its slice of the snapshot so filling one in is a change to that component alone.
 *
 * `PlayerCardHost` (FR-11) is mounted once, here, and renders nothing until a row calls
 * `openPlayerCard(playerId)` from `state/playerCard.ts` — the card is an overlay over this screen,
 * not a route away from it (AC-61), so every panel stays mounted and keeps taking SSE frames while
 * it is open. Any panel's row opens it through that one function; none of them own the card.
 *
 * Every panel reads from the one snapshot the store last replaced wholesale, so no two panels can
 * be showing different board versions.
 */
import type { AppStateSnapshot } from '@sidekick/shared';

import { CandidateList } from '../components/CandidateList';
import { DraftChat } from '../components/DraftChat';
import { OpponentPanel } from '../components/OpponentPanel';
import { PickFeed } from '../components/PickFeed';
import { PlayerCardHost } from '../components/PlayerCard';
import { RosterPanel } from '../components/RosterPanel';
import { SyncIndicator } from '../components/SyncIndicator';
import { isRecomputing } from '../state/store';

export interface DraftScreenProps {
  snapshot: AppStateSnapshot;
  /** AC-41's explicit trigger: stop following this draft and discard everything scoped to it. */
  onDetach: () => void;
}

export function DraftScreen({ snapshot, onDetach }: DraftScreenProps) {
  return (
    <main className="flex min-h-screen flex-col gap-4 px-4 py-4 text-slate-100">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">Draft Sidekick</h1>
        <span className="text-xs text-slate-500">
          Draft {snapshot.attach.draftId} · {snapshot.attach.isMock === true ? 'mock' : 'league'}
        </span>
        <div className="ml-auto flex items-center gap-3">
          <SyncIndicator sync={snapshot.sync} recomputing={isRecomputing(snapshot)} />
          <button
            type="button"
            onClick={onDetach}
            className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm font-medium hover:bg-slate-700"
          >
            Detach
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[18rem_minmax(0,1fr)_20rem]">
        <div className="flex min-h-0 flex-col gap-4">
          <RosterPanel
            userRoster={snapshot.userRoster}
            players={snapshot.pickFeed.filter((entry) => entry.isUserPick)}
          />
          <PickFeed pickFeed={snapshot.pickFeed} teams={snapshot.board.teams} />
        </div>
        <div className="flex min-h-0 flex-col gap-4">
          <DraftChat
            draftId={snapshot.attach.draftId ?? 'attached-draft'}
            boardVersion={snapshot.sync.boardVersion}
          />
          <CandidateList
            candidateList={snapshot.candidateList}
            nextUserPickNo={snapshot.opponentPanel.data.window.nextUserPickNo}
          />
        </div>
        <OpponentPanel
          opponentPanel={snapshot.opponentPanel}
          teams={snapshot.board.teams}
          attachStatus={snapshot.attach.status}
        />
      </div>

      <PlayerCardHost />
    </main>
  );
}
