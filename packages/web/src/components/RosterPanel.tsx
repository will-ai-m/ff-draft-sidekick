/**
 * The **roster panel** (PRD §9 Terms, FR-5).
 *
 * AC-31 names three things this surface must show at all times: filled starting slots, unfilled
 * starting slots by position (the need vector in its count-shaped form), and the bench count. They
 * are rendered as three separate readings rather than one table, because they answer three
 * different questions — what is locked in, what is still owed, and how deep the bench is.
 *
 * Two rules the component does not get to bend:
 * - **Every number comes off `RosterPanelData`, none is re-derived here.** `filledFlexSlots` exists
 *   precisely so roster math stays in T4's module (a FLEX slot filled by positional surplus is not
 *   `slots.FLEX − unfilled.flex` in general), and the unfilled counts are read, never subtracted.
 * - **K and DST are shown like any other slot (AC-33)** even though 🔶 AS-7 keeps them out of every
 *   prediction. Bookkeeping and prediction are different jobs; the only place the distinction
 *   surfaces is the need-signal line, which says so in words instead of hiding the slots.
 *
 * Which slots exist at all comes from `slots` (AC-30/AC-32): a league with no kicker has no kicker
 * row, not a "0 of 0" one.
 *
 * **AC-61** wants one click from a *roster entry* to that player's card. `RosterPanelData` is
 * counts only — T4 publishes no slot-to-player assignment — so the players themselves come in
 * separately as the user's own picks, which is the same pick feed T4 derives those counts from and
 * therefore cannot disagree with them. Each is a real `<button>`, so the card opens from a click,
 * from Enter/Space, and from a screen reader's activate alike.
 */
import { NO_NEED_SIGNAL, POSITIONS, SKILL_POSITIONS, isSkillPosition } from '@sidekick/shared';
import type { Insight, Position, RosterPanelData } from '@sidekick/shared';

import { openPlayerCard } from '../state/playerCard';
import { Panel } from './Panel';

/**
 * One player on the user's roster. Structurally a `PickFeedEntry`, declared narrowly so the panel
 * states the four fields it actually reads rather than taking a dependency on the whole feed entry.
 */
export interface RosterPlayer {
  playerId: string;
  playerName: string;
  position: Position | null;
  pickNo: number;
}

export interface RosterPanelProps {
  userRoster: Insight<RosterPanelData | null>;
  /** The user's own picks, in any order — rendered in draft order (AC-61's clickable entries). */
  players: RosterPlayer[];
}

/** A starting-slot row: one dedicated position, or the FLEX pool. */
interface SlotRow {
  label: string;
  filled: number;
  total: number;
}

/** FLEX sits with the skill positions it draws from, ahead of the non-scoring K/DST slots. */
const NON_SKILL_POSITIONS = POSITIONS.filter((position) => !isSkillPosition(position));

const startingSlotRows = (panel: RosterPanelData): SlotRow[] => {
  const dedicated = (position: (typeof POSITIONS)[number]): SlotRow[] =>
    panel.slots[position] > 0
      ? [
          {
            label: position,
            filled: panel.filledStartingSlots[position],
            total: panel.slots[position],
          },
        ]
      : [];

  return [
    ...SKILL_POSITIONS.flatMap(dedicated),
    ...(panel.slots.FLEX > 0
      ? [{ label: 'FLEX', filled: panel.filledFlexSlots, total: panel.slots.FLEX }]
      : []),
    ...NON_SKILL_POSITIONS.flatMap(dedicated),
  ];
};

/** The count-shaped need view AC-31 asks for: what is still open, by position, FLEX included. */
const unfilledRows = (panel: RosterPanelData): { label: string; count: number }[] => [
  ...SKILL_POSITIONS.filter((position) => panel.unfilledStartingSlots.dedicated[position] > 0).map(
    (position) => ({ label: position, count: panel.unfilledStartingSlots.dedicated[position] }),
  ),
  ...(panel.unfilledStartingSlots.flex > 0
    ? [{ label: 'FLEX', count: panel.unfilledStartingSlots.flex }]
    : []),
  ...NON_SKILL_POSITIONS.filter(
    (position) => panel.unfilledStartingSlots.dedicated[position] > 0,
  ).map((position) => ({
    label: position,
    count: panel.unfilledStartingSlots.dedicated[position],
  })),
];

/**
 * What the sentinel means here. `computeNeedVector` returns `NO_NEED_SIGNAL` whenever every weight
 * is zero — which is true both for a finished roster and for one whose only open slots are K/DST,
 * since those carry no weight (🔶 AS-7). Collapsing the two into "starters complete" would tell the
 * user their kicker slot is filled when it is not.
 */
const needSignalNote = (panel: RosterPanelData): string | null => {
  if (panel.needVector !== NO_NEED_SIGNAL) return null;
  const openNonScoring = NON_SKILL_POSITIONS.filter(
    (position) => panel.unfilledStartingSlots.dedicated[position] > 0,
  );
  return openNonScoring.length === 0
    ? 'Every starting slot filled — drafting best available.'
    : 'No skill-position need — only K/DST slots are open, and they carry no prediction weight.';
};

export function RosterPanel({ userRoster, players }: RosterPanelProps) {
  const panel = userRoster.data;
  const { recomputing } = userRoster;

  return (
    <Panel title="Roster panel" badge={recomputing ? 'recomputing' : null}>
      {panel === null ? (
        <p className="text-slate-500">No roster yet — your draft slot is not resolved.</p>
      ) : (
        <div
          aria-label="Roster"
          aria-busy={recomputing}
          className={recomputing ? 'space-y-3 opacity-60' : 'space-y-3'}
        >
          <ul aria-label="Starting slots" className="grid grid-cols-2 gap-x-4 gap-y-1">
            {startingSlotRows(panel).map((row) => (
              <li
                key={row.label}
                aria-label={`${row.label}: ${row.filled} of ${row.total} starting slots filled`}
                data-slot={row.label}
                className="flex items-baseline justify-between gap-2"
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {row.label}
                </span>
                <span
                  className={
                    row.filled >= row.total
                      ? 'tabular-nums text-slate-500'
                      : 'tabular-nums text-slate-100'
                  }
                >
                  {row.filled} / {row.total}
                </span>
              </li>
            ))}
          </ul>

          <p
            aria-label={`Bench: ${panel.benchCount} of ${panel.benchSlots} filled`}
            className="flex items-baseline justify-between gap-2 border-t border-slate-800 pt-2"
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Bench
            </span>
            <span className="tabular-nums">
              {panel.benchCount} / {panel.benchSlots}
            </span>
          </p>

          <NeedView panel={panel} />
          <DraftedPlayers players={players} />
        </div>
      )}
    </Panel>
  );
}

/** AC-61's roster entries: one click (or Enter/Space) per player opens that player's card. */
function DraftedPlayers({ players }: { players: RosterPlayer[] }) {
  if (players.length === 0) return null;
  const inDraftOrder = [...players].sort((a, b) => a.pickNo - b.pickNo);

  return (
    <div className="space-y-1 border-t border-slate-800 pt-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Drafted</h3>
      <ul aria-label="Drafted players" className="space-y-0.5">
        {inDraftOrder.map((player) => (
          <li key={player.playerId} className="flex items-baseline gap-2">
            <span className="w-8 shrink-0 tabular-nums text-xs text-slate-500">
              {player.pickNo}
            </span>
            <button
              type="button"
              onClick={() => {
                openPlayerCard(player.playerId);
              }}
              className="rounded text-left text-slate-100 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
            >
              {player.playerName}
            </button>
            {player.position !== null && (
              <span className="ml-auto text-xs font-semibold uppercase tracking-wide text-slate-400">
                {player.position}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function NeedView({ panel }: { panel: RosterPanelData }) {
  const rows = unfilledRows(panel);
  const note = needSignalNote(panel);

  return (
    <div className="space-y-1 border-t border-slate-800 pt-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Still needed</h3>
      {rows.length > 0 && (
        <ul aria-label="Unfilled starting slots" className="flex flex-wrap gap-1.5">
          {rows.map((row) => (
            <li
              key={row.label}
              aria-label={`${row.label}: ${row.count} unfilled`}
              data-slot={row.label}
              className="rounded bg-slate-800 px-1.5 py-0.5 text-xs font-medium text-slate-200"
            >
              {row.label} {row.count}
            </li>
          ))}
        </ul>
      )}
      {note !== null && (
        <p aria-label="Need signal" className="text-xs text-slate-500">
          {note}
        </p>
      )}
    </div>
  );
}
