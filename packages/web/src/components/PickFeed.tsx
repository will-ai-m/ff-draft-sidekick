/**
 * The **pick feed** (PRD §9 Terms, FR-2).
 *
 * AC-11 asks for two things per entry: attribution to the team that made the pick, and a
 * mine-vs-opponent flag. Both are rendered, and both are carried in the accessible name as well as
 * in colour — the flag is the one reading the user acts on under a pick clock, so it must not be
 * available only to someone who can distinguish two shades of slate.
 *
 * **Order.** The feed runs most-recent-first. Design.md calls it a "chronological pick list" and
 * both directions order by pick number; newest-first is the one that keeps the pick that just
 * landed visible in a scrolling panel after 150 of them, which is the entire reason the surface
 * exists.
 *
 * **AC-20.** A player Sidekick could not match to the rankings snapshot still appears, under the
 * raw Sleeper name the pick carried, with a warning badge that *names* the player — the AC's
 * wording, and the reason the badge's accessible name is a sentence rather than the word
 * "unmatched". Such a player is excluded from every rankings-driven output upstream; the badge is
 * what makes that exclusion visible instead of silent.
 *
 * **AC-61.** Every entry's player name is a real `<button>`, so one click — or Enter/Space from the
 * keyboard, or a screen reader's activate — opens that player's card over the draft screen through
 * T14's `openPlayerCard`. The card is an overlay, so the feed stays mounted and keeps taking SSE
 * frames underneath it.
 */
import { useMemo, useState } from 'react';
import type { PickFeedEntry, Team } from '@sidekick/shared';

import { openPlayerCard } from '../state/playerCard';
import { Panel } from './Panel';
import { makeTeamLabeller } from './teamLabel';

export interface PickFeedProps {
  pickFeed: PickFeedEntry[];
  /** The seats, for canonical team attribution — `AppStateSnapshot.board.teams`. */
  teams: Team[];
}

/** Draft-room coordinates: round and board column, e.g. pick 21 of a 10-team draft is `3.01`. */
const coordinates = (entry: PickFeedEntry): string =>
  `${entry.round}.${String(entry.draftSlot).padStart(2, '0')}`;

const unmatchedWarning = (entry: PickFeedEntry): string =>
  `${entry.playerName} is not in the rankings snapshot — shown under the raw Sleeper name and ` +
  `excluded from the candidate list and simulation.`;

/** Feed rows shown by default; the rest stay one click away (user request, 2026-08-23). */
const PICK_FEED_VISIBLE_COUNT = 10;

export function PickFeed({ pickFeed, teams }: PickFeedProps) {
  const labelFor = useMemo(() => makeTeamLabeller(teams), [teams]);
  const [showAll, setShowAll] = useState(false);
  const newestFirst = useMemo(() => [...pickFeed].sort((a, b) => b.pickNo - a.pickNo), [pickFeed]);
  const visible = showAll ? newestFirst : newestFirst.slice(0, PICK_FEED_VISIBLE_COUNT);
  const hiddenCount = newestFirst.length - visible.length;
  const unmatched = pickFeed.filter((entry) => !entry.matchedToSnapshot).length;

  return (
    <Panel
      title="Pick feed"
      badge={
        <>
          {pickFeed.length} picks
          {unmatched > 0 && <span className="text-amber-400"> · {unmatched} unmatched</span>}
        </>
      }
    >
      {newestFirst.length === 0 ? (
        <p className="text-slate-500">No picks yet.</p>
      ) : (
        <ol aria-label="Picks, most recent first" className="space-y-1">
          {visible.map((entry) => {
            const team = labelFor(entry.teamId);
            return (
              <li
                key={entry.pickNo}
                aria-label={`Pick ${entry.pickNo}, ${team}${entry.isUserPick ? ', your pick' : ''}`}
                data-pick-no={entry.pickNo}
                data-owner={entry.isUserPick ? 'mine' : 'opponent'}
                className={
                  entry.isUserPick
                    ? 'flex flex-wrap items-baseline gap-x-2 rounded border-l-2 border-emerald-400 bg-emerald-500/10 px-2 py-1'
                    : 'flex flex-wrap items-baseline gap-x-2 rounded border-l-2 border-transparent px-2 py-1'
                }
              >
                <span className="w-10 shrink-0 tabular-nums text-xs text-slate-500">
                  {coordinates(entry)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    openPlayerCard(entry.playerId);
                  }}
                  className="rounded font-medium text-slate-100 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
                >
                  {entry.playerName}
                </button>
                {entry.position !== null && (
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {entry.position}
                  </span>
                )}
                <span className="ml-auto truncate text-xs text-slate-400">{team}</span>
                {entry.isUserPick && (
                  <span
                    aria-label="Your pick"
                    className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-emerald-300"
                  >
                    You
                  </span>
                )}
                {!entry.matchedToSnapshot && (
                  <span
                    role="note"
                    aria-label={unmatchedWarning(entry)}
                    title={unmatchedWarning(entry)}
                    className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-amber-300"
                  >
                    Unmatched
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {(hiddenCount > 0 || showAll) && newestFirst.length > PICK_FEED_VISIBLE_COUNT && (
        <button
          type="button"
          onClick={() => {
            setShowAll((v) => !v);
          }}
          className="mt-2 text-xs font-medium text-slate-400 hover:text-slate-200"
        >
          {showAll
            ? `Show latest ${PICK_FEED_VISIBLE_COUNT}`
            : `Show all ${newestFirst.length} picks`}
        </button>
      )}
    </Panel>
  );
}
