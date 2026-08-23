/**
 * The **candidate list** and its recommendation (FR-9/FR-10).
 *
 * Everything on this surface is computed server-side and printed here as it arrived. The rows are
 * in raw ECR order (🔶 AS-8 — never re-sorted, never blended), the highlight is FR-10's output and
 * not a per-row rule this component could re-derive, and the one-line reason is T8's own string
 * rendered **verbatim**: rewording it here would be a second opinion competing with the one the
 * engine formed, which is exactly what AC-51's "single decisive factor" rules out.
 *
 * Three states the list must never render as an empty table, because each is a *stated mode*:
 * `disabledReason` (AC-28's "no rankings loaded", or AC-5's unresolved seat — the seat case still
 * ships rows, so the banner sits above them rather than replacing them), a position filter whose
 * position carries no ranked players (AC-23's degenerate snapshot), and `recomputing`, where the
 * previous board's list stays on screen dimmed and labelled rather than blanking (FR-3: stale is
 * flagged, never hidden and never presented as current).
 *
 * Each row's player name is a real `<button>` calling T14's `openPlayerCard` — AC-61's "one click
 * from any candidate row… without leaving the draft screen". A native button rather than a
 * clickable `<tr>`, so Enter/Space come from the platform rather than a hand-rolled key handler,
 * and so the click target is the name itself rather than the whole row (which also carries the
 * highlight state and, on a wide row, a lot of dead space between columns).
 */
import { useState } from 'react';
import { POSITIONS } from '@sidekick/shared';
import type {
  CandidateListData,
  CandidateRow,
  Insight,
  Plan,
  Position,
  Survival,
  SurvivalBand,
} from '@sidekick/shared';

import { Panel } from './Panel';
import { openPlayerCard } from '../state/playerCard';

/** What a cell shows for a number the snapshot does not carry — never a fabricated 0. */
const DASH = '—';

const BAND_LABELS: Readonly<Record<SurvivalBand, string>> = {
  'likely-gone': 'Likely gone',
  'coin-flip': 'Coin flip',
  'likely-available': 'Likely available',
};

const BAND_STYLES: Readonly<Record<SurvivalBand, string>> = {
  'likely-gone': 'text-rose-300',
  'coin-flip': 'text-amber-300',
  'likely-available': 'text-emerald-300',
};

const formatNumber = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

/** AC-49's positional rank, shown the way FantasyPros writes it: "RB1", "WR12". */
const positionalLabel = (row: Pick<CandidateRow, 'position' | 'positionalRank'>): string =>
  row.positionalRank === null ? row.position : `${row.position}${row.positionalRank}`;

const planLabel = (plan: Plan): string => `${plan.nowPosition} now / ${plan.nextPosition} next`;

const emptyMessage = (filter: Position | null): string =>
  filter === null
    ? 'No available candidates in the loaded rankings.'
    : `No available ${filter} in the loaded rankings.`;

/**
 * Why the survival column is absent, when it is. The two causes are distinguishable from the
 * payload — a K/DST filter is this component's own state, and an otherwise survival-less list is
 * AC-45's "no pick after this one" — so the note names the real one instead of a vague blank.
 */
const survivalNote = (filter: Position | null, showSurvival: boolean): string | null => {
  if (filter === 'K' || filter === 'DST') {
    return 'K and DST sit outside the simulation, so this view carries no survival math.';
  }
  return showSurvival ? null : 'No pick after this one, so survival percentages are suppressed.';
};

function SurvivalReading({ survival }: { survival: Survival | null }) {
  if (survival === null) return <span className="text-slate-600">{DASH}</span>;
  return (
    <span className={BAND_STYLES[survival.band]}>
      <span className="tabular-nums">{Math.round(survival.probability * 100)}%</span>{' '}
      <span className="text-xs">{BAND_LABELS[survival.band]}</span>
    </span>
  );
}

interface PositionFilterProps {
  active: Position | null;
  onChange: (position: Position | null) => void;
}

/** AC-50's filter: one click, no round trip — the per-position sets already rode in the snapshot. */
function PositionFilter({ active, onChange }: PositionFilterProps) {
  const choices: [Position | null, string][] = [
    [null, 'All'],
    ...POSITIONS.map((position): [Position | null, string] => [position, position]),
  ];

  return (
    <div role="group" aria-label="Position filter" className="flex flex-wrap gap-1">
      {choices.map(([value, label]) => {
        const pressed = active === value;
        return (
          <button
            key={label}
            type="button"
            aria-pressed={pressed}
            onClick={() => {
              onChange(value);
            }}
            className={`rounded-md px-2 py-1 text-xs font-medium ring-1 ${
              pressed
                ? 'bg-slate-200 text-slate-900 ring-slate-200'
                : 'bg-slate-800 text-slate-300 ring-slate-700 hover:bg-slate-700'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

interface RowsTableProps {
  rows: readonly CandidateRow[];
  highlightPlayerId: string | null;
  showSurvival: boolean;
  recomputing: boolean;
}

function RowsTable({ rows, highlightPlayerId, showSurvival, recomputing }: RowsTableProps) {
  return (
    <table
      aria-label="Candidate rows"
      aria-busy={recomputing}
      className={`w-full border-collapse text-left ${recomputing ? 'opacity-60' : ''}`}
    >
      <thead>
        <tr className="text-xs uppercase tracking-wide text-slate-500">
          <th scope="col" className="py-1 pr-3 font-medium">
            ECR
          </th>
          <th scope="col" className="py-1 pr-3 font-medium">
            Pos
          </th>
          <th scope="col" className="py-1 pr-3 font-medium">
            Player
          </th>
          <th scope="col" className="py-1 pr-3 font-medium">
            ADP
          </th>
          {showSurvival && (
            <th scope="col" className="py-1 font-medium">
              Survival
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const highlighted = row.playerId === highlightPlayerId;
          return (
            <tr
              key={row.playerId}
              data-player-id={row.playerId}
              aria-current={highlighted ? 'true' : undefined}
              className={
                highlighted
                  ? 'bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/40'
                  : 'border-t border-slate-800/70'
              }
            >
              <td className="py-1 pr-3 tabular-nums text-slate-400">{row.ecrRank ?? DASH}</td>
              <td className="py-1 pr-3 text-slate-400">{positionalLabel(row)}</td>
              <td className="py-1 pr-3">
                <button
                  type="button"
                  onClick={() => {
                    openPlayerCard(row.playerId);
                  }}
                  className="rounded-sm text-left font-medium text-slate-100 underline decoration-slate-600 decoration-dotted underline-offset-4 hover:decoration-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
                >
                  {row.playerName}
                </button>
                {row.team !== null && (
                  <span className="ml-1.5 text-xs text-slate-500">{row.team}</span>
                )}
                {highlighted && (
                  <span className="ml-2 rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-emerald-300">
                    Recommended
                  </span>
                )}
              </td>
              <td className="py-1 pr-3 tabular-nums text-slate-400">
                {row.adp === null ? DASH : formatNumber(row.adp)}
              </td>
              {showSurvival && (
                <td className="py-1">
                  <SurvivalReading survival={row.survival} />
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * AC-51's one highlight plus AC-57's plan comparison. The reason line is printed as it arrived;
 * the plan rows below it are the same comparison in its structured form, so a user can see *which*
 * two plans the sentence is about without the sentence having to carry both totals.
 */
function Recommendation({ data }: { data: CandidateListData }) {
  const { highlightPlayerId, reason, planComparison } = data;
  if (highlightPlayerId === null && reason === null) return null;

  const player = data.rows.find((row) => row.playerId === highlightPlayerId) ?? null;
  const winner = planComparison?.winner ?? null;
  const runnerUp = planComparison?.runnerUp ?? null;
  const separatingFact = planComparison?.separatingFact ?? null;

  return (
    <section
      aria-label="Recommendation"
      className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2"
    >
      {player !== null && (
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
            Recommended
          </span>
          <span className="text-base font-semibold text-slate-100">{player.playerName}</span>
          <span className="text-xs text-slate-400">
            {positionalLabel(player)}
            {player.team !== null && ` · ${player.team}`}
            {player.ecrRank !== null && ` · ECR ${player.ecrRank}`}
          </span>
        </p>
      )}

      {reason !== null && <p className="mt-1 text-slate-200">{reason}</p>}

      {winner !== null && (
        <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs text-slate-500">
          <dt>Winning plan</dt>
          <dd className="text-slate-300">{`${planLabel(winner)} · ${formatNumber(winner.score)}`}</dd>
          {runnerUp !== null && (
            <>
              <dt>Closest alternative</dt>
              <dd className="text-slate-300">{`${planLabel(runnerUp)} · ${formatNumber(runnerUp.score)}`}</dd>
            </>
          )}
        </dl>
      )}

      {winner !== null && separatingFact !== null && (
        <p className="mt-1 text-xs text-slate-400">{separatingFact}</p>
      )}
    </section>
  );
}

export interface CandidateListProps {
  candidateList: Insight<CandidateListData>;
}

export function CandidateList({ candidateList }: CandidateListProps) {
  const { data, recomputing, degraded } = candidateList;
  const [filter, setFilter] = useState<Position | null>(null);

  const disabled = data.disabledReason !== null;
  const rows = filter === null ? data.rows : (data.rowsByPosition?.[filter] ?? []);
  const showSurvival = rows.some((row) => row.survival !== null);
  const note = rows.length > 0 ? survivalNote(filter, showSurvival) : null;

  return (
    <Panel
      title="Candidate list"
      badge={
        recomputing || degraded ? (
          <span className="flex items-center gap-2">
            {recomputing && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-300">
                recomputing
              </span>
            )}
            {degraded && (
              <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-rose-300">
                degraded
              </span>
            )}
          </span>
        ) : null
      }
    >
      <div className="flex min-h-0 flex-col gap-3">
        {data.disabledReason !== null && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-200">
            {data.disabledReason}
          </p>
        )}

        {recomputing && (
          <p className="text-xs text-amber-300">
            Recomputing — showing the previous board until the new list lands.
          </p>
        )}
        {degraded && (
          <p className="text-xs text-rose-300">
            Board degraded — this list and its survival percentages carry that flag.
          </p>
        )}

        {!disabled && <Recommendation data={data} />}

        {data.rowsByPosition !== undefined && (
          <PositionFilter active={filter} onChange={setFilter} />
        )}

        {rows.length > 0 ? (
          <div className="flex flex-col gap-2">
            <RowsTable
              rows={rows}
              highlightPlayerId={disabled ? null : data.highlightPlayerId}
              showSurvival={showSurvival}
              recomputing={recomputing}
            />
            {note !== null && <p className="text-xs text-slate-500">{note}</p>}
          </div>
        ) : (
          !disabled && <p className="text-slate-500">{emptyMessage(filter)}</p>
        )}
      </div>
    </Panel>
  );
}
