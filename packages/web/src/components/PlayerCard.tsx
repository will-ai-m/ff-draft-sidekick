/**
 * The **player card** (FR-11) — one click from any candidate row, pick-feed entry or roster entry
 * opens a player's per-game log *over* the draft screen (AC-61). An overlay driven by local UI
 * state, never a route change: the board, the candidate list and the opponent panel stay mounted
 * and keep receiving SSE frames while the card is open, so a pick landing mid-read is not missed.
 *
 * Everything on the card is `GET /api/player/:id/gamelog`'s payload rendered as it arrived. In
 * particular the **points are the server's** — recomputed per request from the attached league's
 * own scoring settings (AC-64) — and the **column set is the payload's**: which of the three stat
 * lines a game carries is decided by T9's reader from the player's position plus what he actually
 * did, so this component asks each season's games which lines they have rather than keeping its
 * own position→columns table that could drift from the one that built the data.
 *
 * Two states that are never an empty table: AC-65's explicit "no NFL game data" (a rookie, or a
 * local cache that was never built) and a failed fetch, which says what failed and offers a retry.
 */
import { useEffect, useRef, useState } from 'react';
import type { GameLogEntry, GameLogSeason, PlayerCard as PlayerCardData } from '@sidekick/shared';

import { PlayerCardController, playerCards, usePlayerCard } from '../state/playerCard';
import type { PlayerCardState } from '../state/playerCard';

/** What a cell shows for a stat line this game does not carry — never a fabricated 0. */
const DASH = '—';

type StatGroup = 'passing' | 'rushing' | 'receiving';

const GROUP_LABEL: Readonly<Record<StatGroup, string>> = {
  passing: 'Passing',
  rushing: 'Rushing',
  receiving: 'Receiving',
};

/** Integers print as integers; rates keep one decimal so a column of them lines up. */
const asCount = (value: number): string => String(value);
const asRate = (value: number): string => value.toFixed(1);

/**
 * Points to one decimal, or two when the league's settings actually land there. A custom scoring
 * dict has no obligation to produce a tenth, and rounding one away would misreport AC-64's number.
 */
const formatPoints = (points: number): string => {
  const tenth = points.toFixed(1);
  return Number(tenth) === points ? tenth : points.toFixed(2);
};

interface StatColumn {
  label: string;
  read: (game: GameLogEntry) => string | null;
}

/**
 * AC-62's column sets, verbatim — passing att/comp/yds/TD/INT, rushing att/yds/avg/TD,
 * receiving tgt/rec/yds/TD/long/yds-per-tgt. Fumbles sit outside the groups because AC-62 asks
 * for them on every line regardless of position.
 */
const GROUP_COLUMNS: Readonly<Record<StatGroup, readonly StatColumn[]>> = {
  passing: [
    { label: 'Att', read: (g) => (g.passing ? asCount(g.passing.att) : null) },
    { label: 'Comp', read: (g) => (g.passing ? asCount(g.passing.comp) : null) },
    { label: 'Yds', read: (g) => (g.passing ? asCount(g.passing.yds) : null) },
    { label: 'TD', read: (g) => (g.passing ? asCount(g.passing.td) : null) },
    { label: 'INT', read: (g) => (g.passing ? asCount(g.passing.int) : null) },
  ],
  rushing: [
    { label: 'Att', read: (g) => (g.rushing ? asCount(g.rushing.att) : null) },
    { label: 'Yds', read: (g) => (g.rushing ? asCount(g.rushing.yds) : null) },
    { label: 'Avg', read: (g) => (g.rushing ? asRate(g.rushing.avg) : null) },
    { label: 'TD', read: (g) => (g.rushing ? asCount(g.rushing.td) : null) },
  ],
  receiving: [
    { label: 'Tgt', read: (g) => (g.receiving ? asCount(g.receiving.tgt) : null) },
    { label: 'Rec', read: (g) => (g.receiving ? asCount(g.receiving.rec) : null) },
    { label: 'Yds', read: (g) => (g.receiving ? asCount(g.receiving.yds) : null) },
    { label: 'TD', read: (g) => (g.receiving ? asCount(g.receiving.td) : null) },
    { label: 'Long', read: (g) => (g.receiving ? asCount(g.receiving.long) : null) },
    { label: 'Yds/Tgt', read: (g) => (g.receiving ? asRate(g.receiving.ydsPerTgt) : null) },
  ],
};

const ALL_GROUPS: readonly StatGroup[] = ['passing', 'rushing', 'receiving'];

/**
 * Which stat groups this season's table shows: the ones some game in it actually carries.
 *
 * Taking the union across the season rather than per game is what keeps the columns from
 * appearing and disappearing between rows of one table — a WR's single carry adds a rushing
 * group for the whole season, and his other weeks read as a dash under it.
 */
const groupsFor = (season: GameLogSeason): StatGroup[] =>
  ALL_GROUPS.filter((group) => season.games.some((game) => game[group] !== undefined));

const subtitle = (card: PlayerCardData): string =>
  [card.position, card.team].filter((part) => part !== null && part !== '').join(' · ');

function GameLogTable({ season }: { season: GameLogSeason }) {
  const groups = groupsFor(season);

  return (
    <table className="w-full border-collapse text-left tabular-nums">
      <thead>
        <tr className="text-[0.65rem] uppercase tracking-wide text-slate-500">
          {/* Week / Opp / Pts belong to no group; an empty cell here is not a column header. */}
          <td colSpan={3} />
          {groups.map((group) => (
            <th
              key={group}
              scope="colgroup"
              colSpan={GROUP_COLUMNS[group].length}
              className="border-b border-slate-800 pb-0.5 text-center font-semibold text-slate-400"
            >
              {GROUP_LABEL[group]}
            </th>
          ))}
          <td />
        </tr>
        <tr
          data-testid="gamelog-columns"
          className="text-xs uppercase tracking-wide text-slate-500"
        >
          <th scope="col" className="py-1 pr-3 font-medium">
            Week
          </th>
          <th scope="col" className="py-1 pr-3 font-medium">
            Opp
          </th>
          <th scope="col" className="py-1 pr-4 font-medium">
            Pts
          </th>
          {groups.flatMap((group) =>
            GROUP_COLUMNS[group].map((column) => (
              <th key={`${group}-${column.label}`} scope="col" className="py-1 pr-3 font-medium">
                {/* The group name is on screen in the row above and in the accessible name here,
                    so "Att" under Passing and "Att" under Rushing are never the same column. */}
                <span className="sr-only">{GROUP_LABEL[group]} </span>
                {column.label}
              </th>
            )),
          )}
          <th scope="col" className="py-1 font-medium">
            Fum
          </th>
        </tr>
      </thead>
      <tbody>
        {season.games.map((game) => (
          <tr key={game.week} className="border-t border-slate-800/70">
            <th scope="row" className="py-1 pr-3 font-normal text-slate-400">
              {game.week}
            </th>
            <td className="py-1 pr-3 text-slate-400">{game.opponent}</td>
            <td className="py-1 pr-4 font-semibold text-slate-100">
              {formatPoints(game.fantasyPoints)}
            </td>
            {groups.flatMap((group) =>
              GROUP_COLUMNS[group].map((column) => {
                const value = column.read(game);
                return (
                  <td
                    key={`${group}-${column.label}`}
                    className={`py-1 pr-3 ${value === null ? 'text-slate-600' : 'text-slate-300'}`}
                  >
                    {value ?? DASH}
                  </td>
                );
              }),
            )}
            <td className="py-1 text-slate-300">{game.fumbles}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** AC-63's tabs. Rendered whenever the card has seasons — the payload is already newest-first. */
function SeasonTabs({
  seasons,
  active,
  onSelect,
}: {
  seasons: readonly GameLogSeason[];
  active: number;
  onSelect: (season: number) => void;
}) {
  return (
    <div role="tablist" aria-label="Season" className="flex flex-wrap gap-1">
      {seasons.map((season) => {
        const selected = season.season === active;
        return (
          <button
            key={season.season}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => {
              onSelect(season.season);
            }}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ring-1 ${
              selected
                ? 'bg-slate-200 text-slate-900 ring-slate-200'
                : 'bg-slate-800 text-slate-300 ring-slate-700 hover:bg-slate-700'
            }`}
          >
            {season.season}
          </button>
        );
      })}
    </div>
  );
}

/**
 * AC-64's other half: which of the league's own scoring rules these points could not include.
 * A real Sleeper dict carries dozens of defensive and kicking keys that no skill-position game
 * log can answer; naming them keeps the gap inspectable instead of silently under-reporting.
 */
function UnsupportedScoringNote({ keys }: { keys: readonly string[] }) {
  if (keys.length === 0) return null;

  return (
    <section
      aria-label="Scoring rules not reflected in these points"
      className="mt-3 rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-400"
    >
      <p>
        {keys.length} of your league’s scoring rules have no per-game column here (defensive,
        kicking and similar), so these points do not include them:
      </p>
      <p className="mt-1 max-h-16 overflow-auto font-mono text-[0.7rem] text-slate-500">
        {keys.join(', ')}
      </p>
    </section>
  );
}

/** AC-65 — a stated absence, never an empty table. */
function NoGameData({ card }: { card: PlayerCardData }) {
  const who = card.playerName === '' ? 'This player' : card.playerName;

  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-amber-200">
      <p className="font-medium">No NFL game data for {who}.</p>
      <p className="mt-1 text-sm text-amber-200/80">
        Rookies and anyone with no games in the local nflverse cache have no per-game log. If no
        player has one, the cache was never built — run <code>npm run prep:nflverse</code>.
      </p>
    </div>
  );
}

function CardBody({ card }: { card: PlayerCardData }) {
  const [selected, setSelected] = useState<number | null>(null);
  // Derived, not synced: a season that is no longer on this card falls back to the newest one,
  // so switching players cannot leave the table pointing at a tab that isn't there.
  const active = card.seasons.find((season) => season.season === selected) ?? card.seasons[0];

  if (!card.hasData || active === undefined) return <NoGameData card={card} />;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SeasonTabs seasons={card.seasons} active={active.season} onSelect={setSelected} />
        <p className="text-xs text-slate-500">Points are in your league’s scoring settings.</p>
      </div>
      <div
        role="tabpanel"
        aria-label={`${active.season} game log`}
        className="mt-3 overflow-x-auto text-sm"
      >
        <GameLogTable season={active} />
      </div>
      <UnsupportedScoringNote keys={card.unsupportedScoringKeys} />
    </>
  );
}

export interface PlayerCardModalProps {
  state: PlayerCardState;
  onClose: () => void;
  /** Re-runs the fetch after a failure; the card shows a retry only when this is given. */
  onRetry?: () => void;
}

/**
 * The overlay itself. Presentational: it takes a state and renders it, which is what lets every
 * AC-62/63/65 case be driven from a fixture payload rather than through a fetch.
 */
export function PlayerCardModal({ state, onClose, onRetry }: PlayerCardModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Focus lands inside the overlay, so Escape and the keyboard address the card, not the board.
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const card = state.card;

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4 sm:p-8"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Player card"
        tabIndex={-1}
        onClick={(event) => {
          event.stopPropagation();
        }}
        className="w-full max-w-3xl rounded-lg border border-slate-700 bg-slate-900 p-4 text-slate-100 shadow-xl outline-none"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-base font-semibold">
              {card?.playerName === undefined || card.playerName === ''
                ? 'Player card'
                : card.playerName}
            </h2>
            {card !== null && subtitle(card) !== '' && (
              <p className="text-xs uppercase tracking-wide text-slate-500">{subtitle(card)}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1 text-sm font-medium hover:bg-slate-700"
          >
            Close
          </button>
        </header>

        <div className="pt-3">
          {state.status === 'loading' && (
            <p role="status" className="text-sm text-slate-400">
              Loading game log…
            </p>
          )}

          {state.status === 'error' && (
            <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-rose-200">
              <p role="alert" className="text-sm">
                {state.error}
              </p>
              {onRetry !== undefined && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="mt-2 rounded-md border border-rose-400/40 px-2.5 py-1 text-xs font-medium hover:bg-rose-500/20"
                >
                  Try again
                </button>
              )}
            </div>
          )}

          {state.status === 'ready' && card !== null && <CardBody card={card} />}
        </div>
      </div>
    </div>
  );
}

export interface PlayerCardHostProps {
  /** Defaults to the shared controller `openPlayerCard` writes to; a test may pass its own. */
  controller?: PlayerCardController;
}

/**
 * The mount point the draft screen renders once. Nothing at all until a row calls
 * `openPlayerCard(playerId)` — see `state/playerCard.ts` for that hook.
 */
export function PlayerCardHost({ controller = playerCards }: PlayerCardHostProps) {
  const state = usePlayerCard(controller);
  if (state.playerId === null) return null;

  return (
    <PlayerCardModal
      state={state}
      onClose={controller.close}
      onRetry={() => {
        if (state.playerId !== null) controller.open(state.playerId);
      }}
    />
  );
}
