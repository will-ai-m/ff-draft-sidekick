import type { Position, SkillPosition } from './board';
import type { NeedVector, NoNeedSignal, UnfilledStartingSlots } from './roster';

/**
 * One pick inside the **window** (PRD §9 Terms) — the sequence of picks between the user's
 * current pick and their next pick, snake order and traded picks respected (AC-34). A team
 * picking twice before the user's next turn appears twice; the window is never deduped by team.
 */
export interface WindowPick {
  /** 1-based overall pick number. */
  pickNo: number;
  round: number;
  /** Owning team *after* traded picks are applied, not the original slot (AC-12). */
  teamId: string;
}

/** The window, plus the user's own bracketing picks so downstream tasks need no re-derivation. */
export interface DraftWindow {
  picks: WindowPick[];
  /** The user's current pick number; null when the user has no pick left. */
  currentUserPickNo: number | null;
  /** The user's next pick number; null when there is none (AC-45 suppression trigger). */
  nextUserPickNo: number | null;
}

/**
 * A team's within-draft **tendency profile** (FR-7). Discarded on detach/draft end (AC-41) —
 * nothing here ever persists across drafts.
 */
export interface TendencyProfile {
  teamId: string;
  /** Picks this team has made so far in this draft. */
  pickCount: number;
  /** Mean of (player's ADP − pick number taken); positive = taken ahead of market (AC-38). */
  averageReach: number;
  /** Fraction of picks that filled a then-unfilled starting slot (AC-38). */
  needAdherence: number;
  /** Observed share of this team's picks per position. */
  observedPositionalShare: Record<Position, number>;
  /** The league's starting-slot proportions, the baseline the observed share is read against. */
  expectedPositionalShare: Record<Position, number>;
  /**
   * `'early'` until the team has made `tendencyColdStartPicks` picks, during which neutral
   * priors are used (AC-39). Carried in the type so the UI grays it out consistently.
   */
  confidence: 'early' | 'established';
}

/**
 * How firm a piece of opponent-panel guidance is. Position-level predictions are high
 * confidence; player-level examples are illustrative only and must never be rendered as
 * certainties (AC-37).
 */
export type OpponentPredictionConfidence = 'position' | 'player-example';

/** An example player the panel may show for a likely position, drawn from ADP order. */
export interface OpponentExamplePlayer {
  playerId: string;
  playerName: string;
  position: SkillPosition;
  adp: number | null;
  confidence: OpponentPredictionConfidence;
}

/** One row of the **opponent panel** (FR-6) — one entry per window pick, not per team. */
export interface OpponentPanelEntry {
  pickNo: number;
  teamId: string;
  unfilledStartingSlots: UnfilledStartingSlots;
  needVector: NeedVector | NoNeedSignal;
  /** Need weights normalized to sum 1, *prior* to FR-7 bending (AC-36). */
  needDistribution: Record<Position, number>;
  /** The FR-7 tendency-bent distribution FR-8 samples from (AC-40). */
  bentDistribution: Record<Position, number>;
  /** Picks this team still has left in the draft (AC-35). */
  remainingPicks: number;
  /** Positions carrying the most weight, with `confidence: 'position'` (AC-36, AC-37). */
  mostLikelyPositions: { position: SkillPosition; likelihood: number; confidence: 'position' }[];
  /** Illustrative players for those positions, tagged `'player-example'` (AC-37). */
  examplePlayers: OpponentExamplePlayer[];
  tendencyProfile: TendencyProfile;
}
