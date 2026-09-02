/**
 * The **opponent panel** (PRD §9 Terms, FR-6/FR-7).
 *
 * One row per pick in the **window** — not per team: a team picking twice before the user's next
 * turn appears twice, and its row is the same team read at two different pick numbers (AC-34).
 * Ordering, ownership and the window's anchors all come off `OpponentPanelData` exactly as the
 * server computed them; nothing here re-derives snake order, trades, or the off-by-one that Terms'
 * two branches turn on.
 *
 * **AC-37 is the load-bearing rule of this file.** A position-level prediction and a player-level
 * example are two different kinds of claim, and the panel must never let the second read as the
 * first. The distinction is not inferred here — T5 tags every prediction `'position'` and every
 * example `'player-example'` in the data — but it *is* rendered here, three ways at once: a solid
 * badge versus lighter italic text, a visible "e.g." hedge, and an accessible name that says
 * "illustrative example, not a prediction" out loud.
 *
 * **AC-36 and AC-40 both bind, and they say different things.** AC-36 requires the *unbent*
 * need-derived likelihood be displayed; AC-40 requires the displayed likelihoods be bent by the
 * team's tendency profile. Both are shown — `50% → 60%` — so neither AC is satisfied by quietly
 * replacing the other, and the profile's effect is legible rather than baked in invisibly.
 *
 * **K/DST is a chip of its own (2026-09-02).** FR-8 spends a team's last few picks on its kicker
 * and defense with a modelled chance; the row states that chance beside the skill positions,
 * whose likelihoods the server has already scaled by the remainder, so a row's chips sum to 1
 * and "RB 33%" in round 13 is not read as if the team could not be taking a DST.
 */
import type {
  AttachState,
  DraftWindow,
  Insight,
  OpponentExamplePlayer,
  OpponentPanelData,
  OpponentPanelEntry,
  Team,
  TendencyProfile,
} from '@sidekick/shared';
import { POSITIONS } from '@sidekick/shared';
import { useMemo } from 'react';

import { Panel } from './Panel';
import { makeTeamLabeller } from './teamLabel';

export interface OpponentPanelProps {
  opponentPanel: Insight<OpponentPanelData>;
  /** The seats, for canonical team attribution — `AppStateSnapshot.board.teams`. */
  teams: Team[];
  /**
   * An empty window means "nothing between now and your next turn" *or* "your seat is unresolved"
   * (AC-5), and only the attach state tells the two apart. Passed in rather than guessed.
   */
  attachStatus: AttachState['status'];
}

// -------------------------------------------------------------------------------------------
// Display thresholds.
//
// These turn FR-7's numbers into words. The PRD gives no values for them because they are display
// copy, not prediction math — nothing downstream reads them, and changing one changes only what
// this panel says, never what FR-8 samples. They are named here rather than inlined so a reader
// can see what "reaches" is claimed to mean.
// -------------------------------------------------------------------------------------------

/** Average reach inside ±1 pick is noise, not a lean either way. */
const REACH_NEUTRAL_PICKS = 1;
/** Need-adherence at or above this reads as need-driven; at or below the low mark, best-available. */
const NEED_ADHERENCE_HIGH = 0.6;
const NEED_ADHERENCE_LOW = 0.4;
/** Observed-minus-expected positional share below this is not worth naming as a lean. */
const POSITIONAL_LEAN_MIN = 0.1;
/** A bent likelihood within half a percentage point of the unbent one is not a visible shift. */
const BEND_VISIBLE_MIN = 0.005;
/** A K/DST chance under half a percentage point is the middle rounds — nothing to show. */
const KDST_VISIBLE_MIN = 0.005;
/** At or above this the pick is, for display purposes, spoken for. */
const KDST_CERTAIN_MIN = 0.995;

const pct = (value: number): string => `${Math.round(value * 100)}%`;

/**
 * What a no-need-signal row says (Terms' best-available regime), with FR-8's K/DST timing
 * folded in: a team out of skill starters in round 13 is more likely reaching for a defense than
 * for the best available skill player, and the row should say so in the same breath.
 */
const bestAvailableNote = (entry: OpponentPanelEntry): string => {
  const kdst = entry.kdstLikelihood;
  if (kdst >= KDST_CERTAIN_MIN) return 'Starters full — this pick goes to K/DST.';
  if (kdst >= KDST_VISIBLE_MIN) {
    return `Starters full — ${pct(1 - kdst)} best available from ADP order, ${pct(kdst)} K/DST.`;
  }
  return 'Starters full — drafting best available from ADP order.';
};

const windowCaption = (window: DraftWindow, attachStatus: AttachState['status']): string => {
  if (attachStatus === 'needs-manual-slot') {
    return 'Pick your draft slot to see the window between your picks.';
  }
  if (window.nextUserPickNo === null) {
    return 'No pick left — nothing between here and the end of the draft is yours.';
  }

  const onTheClock =
    window.userOnTheClock && window.currentUserPickNo !== null
      ? `You are on the clock at pick ${window.currentUserPickNo}. `
      : '';
  const size = window.picks.length;
  return size === 0
    ? `${onTheClock}No picks between now and your pick ${window.nextUserPickNo}.`
    : `${onTheClock}${size} ${size === 1 ? 'pick' : 'picks'} before your pick ${window.nextUserPickNo}.`;
};

/**
 * The compact profile summary AC-40 asks for.
 *
 * A cold-start profile (AC-39) reports only what it actually knows — how many picks it has seen —
 * and says the rest is a prior. T6's neutral prior sets `needAdherence` to 1.0 and the positional
 * share to the league baseline exactly; printing "drafts to need (100%)" off those would assert a
 * tendency observed from zero evidence, which is precisely what the `'early'` label exists to
 * prevent. `reachSampleCount` draws the same line for reach on an established profile: no pick
 * carrying an ADP means reach is unknown, not zero (AC-26).
 */
const profileSummary = (profile: TendencyProfile): string => {
  const parts: string[] = [];
  if (profile.confidence === 'early') parts.push('early');
  parts.push(`${profile.pickCount} ${profile.pickCount === 1 ? 'pick' : 'picks'}`);

  if (profile.reachSampleCount === 0) {
    parts.push('reach unknown');
  } else if (profile.averageReach >= REACH_NEUTRAL_PICKS) {
    parts.push(`reaches +${profile.averageReach.toFixed(1)}`);
  } else if (profile.averageReach <= -REACH_NEUTRAL_PICKS) {
    parts.push(`waits ${Math.abs(profile.averageReach).toFixed(1)}`);
  } else {
    parts.push('drafts at market');
  }

  if (profile.confidence === 'early') {
    parts.push('neutral priors');
    return parts.join(' · ');
  }

  if (profile.needAdherence >= NEED_ADHERENCE_HIGH) {
    parts.push(`drafts to need (${pct(profile.needAdherence)})`);
  } else if (profile.needAdherence <= NEED_ADHERENCE_LOW) {
    parts.push(`drafts best available (${pct(profile.needAdherence)} need)`);
  } else {
    parts.push(`mixed need and best-available (${pct(profile.needAdherence)} need)`);
  }

  const lean = POSITIONS.map((position) => ({
    position,
    delta: profile.observedPositionalShare[position] - profile.expectedPositionalShare[position],
  })).reduce((best, next) => (next.delta > best.delta ? next : best));
  if (lean.delta >= POSITIONAL_LEAN_MIN) parts.push(`${lean.position}-heavy`);

  return parts.join(' · ');
};

const exampleText = (example: OpponentExamplePlayer): string =>
  example.adp === null
    ? `e.g. ${example.playerName} (${example.position})`
    : `e.g. ${example.playerName} (${example.position}, ADP ${example.adp})`;

const exampleLabel = (example: OpponentExamplePlayer): string => {
  const adp = example.adp === null ? '' : `, ADP ${example.adp}`;
  return `e.g. ${example.playerName}, ${example.position}${adp} — illustrative example, not a prediction`;
};

export function OpponentPanel({ opponentPanel, teams, attachStatus }: OpponentPanelProps) {
  const { data, recomputing } = opponentPanel;
  const labelFor = useMemo(() => makeTeamLabeller(teams), [teams]);

  return (
    <Panel
      title="Opponent panel"
      badge={recomputing ? 'recomputing' : `${data.window.picks.length} picks`}
    >
      <div
        aria-label="Opponent window"
        aria-busy={recomputing}
        className={recomputing ? 'space-y-2 opacity-60' : 'space-y-2'}
      >
        <p aria-label="Window" className="text-xs text-slate-400">
          {windowCaption(data.window, attachStatus)}
        </p>

        {data.entries.length > 0 && (
          <ol aria-label="Window picks" className="space-y-2">
            {data.entries.map((entry) => (
              <WindowRow key={entry.pickNo} entry={entry} teamName={labelFor(entry.teamId)} />
            ))}
          </ol>
        )}
      </div>
    </Panel>
  );
}

function WindowRow({ entry, teamName }: { entry: OpponentPanelEntry; teamName: string }) {
  return (
    <li
      aria-label={`Pick ${entry.pickNo}, ${teamName}`}
      data-pick-no={entry.pickNo}
      data-team-id={entry.teamId}
      className="space-y-1 rounded border border-slate-800 bg-slate-900/40 px-2 py-1.5"
    >
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="tabular-nums text-xs text-slate-500">
          {entry.pickNo} · R{entry.round}
        </span>
        <span className="truncate font-medium text-slate-100">{teamName}</span>
        <span aria-label="Remaining picks" className="ml-auto text-xs text-slate-500">
          {entry.remainingPicks} left
        </span>
      </div>

      <UnfilledSlots entry={entry} />
      <LikelyPositions entry={entry} />
      <ExamplePlayers examples={entry.examplePlayers} />

      {entry.needDistribution === null && (
        <p aria-label="Need signal" className="text-xs italic text-slate-500">
          {bestAvailableNote(entry)}
        </p>
      )}

      {entry.tendencyProfile !== undefined && (
        <p
          aria-label="Tendency profile"
          data-confidence={entry.tendencyProfile.confidence}
          className={
            entry.tendencyProfile.confidence === 'early'
              ? 'text-xs text-slate-600'
              : 'text-xs text-slate-400'
          }
        >
          {profileSummary(entry.tendencyProfile)}
        </p>
      )}
    </li>
  );
}

/** AC-35's count-shaped view, K and DST included — they are roster slots even with zero weight. */
function UnfilledSlots({ entry }: { entry: OpponentPanelEntry }) {
  const dedicated = POSITIONS.filter(
    (position) => entry.unfilledStartingSlots.dedicated[position] > 0,
  ).map((position) => ({
    label: position as string,
    count: entry.unfilledStartingSlots.dedicated[position],
  }));
  const rows =
    entry.unfilledStartingSlots.flex > 0
      ? [...dedicated, { label: 'FLEX', count: entry.unfilledStartingSlots.flex }]
      : dedicated;

  if (rows.length === 0) return null;

  return (
    <ul aria-label="Unfilled starting slots" className="flex flex-wrap gap-1">
      {rows.map((row) => (
        <li
          key={row.label}
          aria-label={`${row.label}: ${row.count} unfilled`}
          className="rounded bg-slate-800/70 px-1 py-0.5 text-[0.65rem] text-slate-400"
        >
          {row.label} {row.count}
        </li>
      ))}
    </ul>
  );
}

/**
 * AC-36's likelihoods, bent per AC-40 where FR-7 has a bend to apply, plus the K/DST chance FR-8
 * spends the pick with (2026-09-02). The badge is deliberately solid and high-contrast: this is
 * the high-confidence half of AC-37's distinction.
 *
 * The server scales `mostLikelyPositions` by `1 − kdstLikelihood`; the bent distribution is
 * conditional on a skill pick (it is what FR-8 draws from), so it is scaled here by the same
 * factor before the two are compared, or every row near a deadline would read as "shifted".
 */
function LikelyPositions({ entry }: { entry: OpponentPanelEntry }) {
  const kdst = entry.kdstLikelihood;
  const showKdst = kdst >= KDST_VISIBLE_MIN;
  if (entry.mostLikelyPositions.length === 0 && !showKdst) return null;

  return (
    <ul aria-label="Likely positions" className="flex flex-wrap gap-1">
      {entry.mostLikelyPositions.map(({ position, likelihood }) => {
        const bentRaw = entry.bentDistribution?.[position];
        const bent = bentRaw === undefined ? undefined : bentRaw * (1 - kdst);
        const shifted = bent !== undefined && Math.abs(bent - likelihood) >= BEND_VISIBLE_MIN;
        return (
          <li
            key={position}
            data-confidence="position"
            aria-label={
              shifted
                ? `${position}, ${pct(likelihood)} from need, ${pct(bent)} after tendency profile — position-level prediction`
                : `${position}, ${pct(likelihood)} likely — position-level prediction`
            }
            className="rounded bg-sky-500/20 px-1.5 py-0.5 text-xs font-semibold text-sky-200 ring-1 ring-sky-400/40"
          >
            {position} {pct(likelihood)}
            {shifted && <span className="font-normal text-sky-300/80"> → {pct(bent)}</span>}
          </li>
        );
      })}
      {showKdst && (
        <li
          key="K/DST"
          data-confidence="position"
          data-position="K/DST"
          aria-label={`K/DST, ${pct(kdst)} likely — position-level prediction`}
          className="rounded bg-violet-500/20 px-1.5 py-0.5 text-xs font-semibold text-violet-200 ring-1 ring-violet-400/40"
        >
          K/DST {pct(kdst)}
        </li>
      )}
    </ul>
  );
}

/**
 * The illustrative half of AC-37. Lighter, italic, hedged with "e.g." in the visible text and with
 * "illustrative example, not a prediction" in the accessible name — a player-level guess is never
 * presented as a certainty, in either channel.
 */
function ExamplePlayers({ examples }: { examples: OpponentExamplePlayer[] }) {
  if (examples.length === 0) return null;

  return (
    <ul aria-label="Example players" className="flex flex-wrap gap-x-2 gap-y-0.5">
      {examples.map((example) => (
        <li
          key={example.playerId}
          data-confidence={example.confidence}
          aria-label={exampleLabel(example)}
          className="text-[0.7rem] italic text-slate-500"
        >
          {exampleText(example)}
        </li>
      ))}
    </ul>
  );
}
