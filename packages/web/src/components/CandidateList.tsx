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
  CandidateExplanation,
  CandidateListData,
  CandidateRow,
  HighlightReasonKind,
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

/** Audit math keeps hundredths so a 1.742 plan is visible as 1.74, not rounded into a tie. */
const formatMath = (value: number): string => value.toFixed(2);

/** AC-49's positional rank, shown the way FantasyPros writes it: "RB1", "WR12". */
const positionalLabel = (row: Pick<CandidateRow, 'position' | 'positionalRank'>): string =>
  row.positionalRank === null ? row.position : `${row.position}${row.positionalRank}`;

const planLabel = (plan: Plan): string => `${plan.nowPosition} now / ${plan.nextPosition} next`;

const REASON_EXPLANATIONS: Readonly<Record<HighlightReasonKind, string>> = {
  'plan-survival':
    'Two-pick plans were compared in projected points. This position is more valuable now because the alternative is more likely to survive to your next turn, or because waiting crosses a tier drop.',
  need: 'The higher-ranked player was passed over because their position fills no open starting slot, while this pick fills one.',
  value:
    'No stronger roster or plan override applied. This player leads the available board and is going materially later than their market ADP.',
  'best-available':
    'No plan, open-starter, roster-balance or value rule produced a stronger override, so the recommendation stays with the best available player by raw overall ECR.',
  'too-close-to-call':
    'The leading choices are inside the configured noise band. Sidekick breaks that tie with depth now while a safe starter waits, then an open starting slot that will not wait, then a position that actually flexes in this league (RB/WR with standard scoring) over a single-slot one, then tier-break risk, then better consensus rank.',
  'lookahead-not-applicable':
    'There are fewer than two of your picks left, so Sidekick cannot compare a pick-now / pick-next plan and falls back to the current board.',
  'endgame-starter':
    'The value and tier comparison supported waiting, but there are now only enough picks left to fill the remaining required starters plus K/DST. A skill-position starter is filled first.',
  'endgame-kdst':
    'Your remaining picks have caught up with your unfilled kicker or defense slots, so the endgame guard reserves this pick before the draft ends.',
  'bench-depth':
    'Your starting skill slots are filled, so the engine favors the thinnest eligible bench position instead of blindly following the top ECR row.',
};

const QB_POLICY =
  'In a 1-QB league, QB2 is blocked until the positions whose depth starts games — RB and WR with standard scoring, since TE does not flex in practice — each carry two backups. It may then become eligible as bench insurance, but QB3 and beyond are blocked by the roster cap. Bench value is measured above the league-size replacement line using this league’s scoring, so streamable QBs are discounted.';

const UNCLASSIFIED_EXPLANATION =
  'The recommendation engine supplied the decision shown above, but this snapshot does not carry its structured rule label. The displayed reason and plan totals remain the authoritative explanation.';

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

/**
 * The per-player explanation card (FR-9, added 2026-09-01).
 *
 * Positioned `fixed` against the hovered name's own bounding box rather than absolutely inside
 * the row: both the panel body and the table's horizontal scroller clip their overflow, so an
 * absolutely-positioned card would be cut off by whichever edge the row sits near. Fixed
 * coordinates escape both, and the card is clamped so it never runs off the right edge.
 *
 * The background is **solid**, never a translucent tint: the card floats over the panel's own
 * dark surface and over its own rows, and any alpha at all makes the text unreadable against
 * them. A `bg-slate-900/98` shipped here once — 98 is not a value in Tailwind's opacity scale,
 * so the class generated nothing and the card rendered with no background whatsoever.
 *
 * Content is the server's, rendered verbatim — the same rule the highlight's reason line follows.
 */
function ExplanationCard({
  explanation,
  anchor,
  id,
}: {
  explanation: CandidateExplanation;
  anchor: DOMRect;
  id: string;
}) {
  const WIDTH = 300;
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - WIDTH - 8));
  // Flip above the name when there is not enough room below it.
  const below = anchor.bottom + 8;
  const flip = below + 180 > window.innerHeight && anchor.top > 190;

  return (
    <div
      id={id}
      role="tooltip"
      style={{
        position: 'fixed',
        left,
        width: WIDTH,
        ...(flip ? { bottom: window.innerHeight - anchor.top + 8 } : { top: below }),
      }}
      className="pointer-events-none z-50 rounded-md border border-slate-600 bg-slate-900 p-3 text-xs shadow-2xl ring-1 ring-black/40"
    >
      <p className="font-semibold text-slate-100">{explanation.headline}</p>
      <ul className="mt-2 flex flex-col gap-1.5 text-slate-300">
        {explanation.factors.map((factor) => (
          <li key={factor} className="flex gap-1.5">
            <span aria-hidden="true" className="text-slate-600">
              •
            </span>
            <span>{factor}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface RowsTableProps {
  rows: readonly CandidateRow[];
  highlightPlayerId: string | null;
  showSurvival: boolean;
  recomputing: boolean;
  nextUserPickNo: number | null;
  explanations: Record<string, CandidateExplanation> | undefined;
}

function RowsTable({
  rows,
  highlightPlayerId,
  showSurvival,
  recomputing,
  nextUserPickNo,
  explanations,
}: RowsTableProps) {
  // One card at a time, anchored to whichever name is hovered or keyboard-focused.
  const [hovered, setHovered] = useState<{ playerId: string; anchor: DOMRect } | null>(null);
  const show = (playerId: string, element: HTMLElement): void => {
    setHovered({ playerId, anchor: element.getBoundingClientRect() });
  };
  const hoveredExplanation =
    hovered === null ? undefined : explanations?.[hovered.playerId];

  return (
    <>
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
              {/* Survival is always "to the user's next turn" — naming the pick number is what
                  stops a 27% from reading as this-pick availability. */}
              {nextUserPickNo === null ? 'Survival' : `Lasts to #${nextUserPickNo}`}
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
                  aria-describedby={
                    hovered?.playerId === row.playerId && hoveredExplanation !== undefined
                      ? `why-${row.playerId}`
                      : undefined
                  }
                  onMouseEnter={(event) => {
                    show(row.playerId, event.currentTarget);
                  }}
                  onMouseLeave={() => {
                    setHovered(null);
                  }}
                  onFocus={(event) => {
                    show(row.playerId, event.currentTarget);
                  }}
                  onBlur={() => {
                    setHovered(null);
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
      {hovered !== null && hoveredExplanation !== undefined && (
        <ExplanationCard
          explanation={hoveredExplanation}
          anchor={hovered.anchor}
          id={`why-${hovered.playerId}`}
        />
      )}
    </>
  );
}

/**
 * AC-51's one highlight plus AC-57's plan comparison. The reason line is printed as it arrived;
 * the plan rows below it are the same comparison in its structured form, so a user can see *which*
 * two plans the sentence is about without the sentence having to carry both totals.
 */
function Recommendation({ data }: { data: CandidateListData }) {
  const { highlightPlayerId, reason, reasonKind, planComparison } = data;
  if (highlightPlayerId === null && reason === null) return null;

  const player = data.rows.find((row) => row.playerId === highlightPlayerId) ?? null;
  const winner = planComparison?.winner ?? null;
  const runnerUp = planComparison?.runnerUp ?? null;
  const separatingFact = planComparison?.separatingFact ?? null;
  const candidateAt = (position: Position): CandidateRow | null =>
    data.rowsByPosition?.[position]?.[0] ??
    data.rows.find((row) => row.position === position) ??
    null;
  const valueBasis = reasonKind === 'bench-depth' ? 'points above replacement' : 'projected pts/gm';
  const rawPlanLabels = planComparison?.tooClose === true;
  const auditedPlans = [
    ...(winner === null
      ? []
      : [{ label: rawPlanLabels ? 'Raw plan winner' : 'Chosen', plan: winner }]),
    ...(runnerUp === null
      ? []
      : [{ label: rawPlanLabels ? 'Raw plan alternative' : 'Alternative', plan: runnerUp }]),
  ];

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

      {reason !== null && (
        <details open className="mt-2 border-t border-emerald-500/20 pt-2 text-xs">
          <summary className="cursor-pointer font-medium text-emerald-200">
            Why did Sidekick choose this?
          </summary>
          <div className="mt-2 space-y-2 text-slate-300">
            {auditedPlans.length > 0 ? (
              <>
                <p>
                  Each total is <span className="font-medium text-slate-200">current pick</span> +{' '}
                  <span className="font-medium text-slate-200">expected next-turn pick</span> +{' '}
                  <span className="font-medium text-slate-200">remaining starter value</span>, in{' '}
                  {valueBasis}.
                </p>
                <div className="overflow-x-auto">
                  <table aria-label="Recommendation math" className="w-full text-left tabular-nums">
                    <thead className="text-slate-500">
                      <tr>
                        <th className="pr-3 font-medium">Plan</th>
                        <th className="pr-3 font-medium">Pick now</th>
                        <th className="pr-3 font-medium">Now</th>
                        <th className="pr-3 font-medium">Next</th>
                        <th className="pr-3 font-medium">Remaining</th>
                        <th className="font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditedPlans.map(({ label, plan }) => {
                        const nowCandidate = candidateAt(plan.nowPosition);
                        return (
                          <tr key={`${label}-${plan.nowPosition}-${plan.nextPosition}`}>
                            <td className="py-1 pr-3 text-slate-400">
                              {label}: {planLabel(plan)}
                            </td>
                            <td className="py-1 pr-3 text-slate-200">
                              {nowCandidate?.playerName ?? `Best ${plan.nowPosition}`}
                            </td>
                            <td className="py-1 pr-3">{formatMath(plan.nowValue)}</td>
                            <td className="py-1 pr-3">{formatMath(plan.nextValue)}</td>
                            <td className="py-1 pr-3">{formatMath(plan.fillValue)}</td>
                            <td className="py-1 font-semibold text-slate-100">
                              {formatMath(plan.score)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {winner !== null && runnerUp !== null && (
                  <p>
                    <span className="font-medium text-slate-200">Raw margin: </span>
                    {formatMath(winner.score - runnerUp.score)} {valueBasis}.{' '}
                    {planComparison?.tooClose === true
                      ? 'That is inside the near-tie band, so the reason above states the tie-break that decided the displayed player.'
                      : 'The higher plan total determines the recommendation.'}
                  </p>
                )}
              </>
            ) : (
              <p>
                <span className="font-medium text-slate-200">Active rule: </span>
                {reasonKind === null ? UNCLASSIFIED_EXPLANATION : REASON_EXPLANATIONS[reasonKind]}
              </p>
            )}
            {player?.position === 'QB' && (
              <p>
                <span className="font-medium text-slate-200">Why another QB can appear: </span>
                {QB_POLICY}
              </p>
            )}
            <ol className="list-decimal space-y-1 pl-4 text-slate-400">
              <li>Apply phase and roster-eligibility gates.</li>
              <li>Compare pick-now / pick-next plans when at least two picks remain.</li>
              <li>Choose the decisive need, value, survival or ECR rule.</li>
              <li>Apply near-tie rules, then the final K/DST guard.</li>
            </ol>
          </div>
        </details>
      )}
    </section>
  );
}

export interface CandidateListProps {
  candidateList: Insight<CandidateListData>;
  /** FR-6's next user pick — names the survival column's horizon ("Lasts to #36"). */
  nextUserPickNo?: number | null;
}

export function CandidateList({ candidateList, nextUserPickNo = null }: CandidateListProps) {
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
              nextUserPickNo={nextUserPickNo}
              explanations={data.explanations}
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
