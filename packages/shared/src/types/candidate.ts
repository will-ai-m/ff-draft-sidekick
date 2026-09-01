import type { Position, SkillPosition } from './board';

/** Survival band (AC-44). Thresholds come from config, never from inline literals. */
export type SurvivalBand = 'likely-gone' | 'coin-flip' | 'likely-available';

/**
 * A player's projected availability at the user's next pick (FR-8). Absent entirely — not
 * zeroed — when the user has no subsequent pick (AC-45) or for K/DST (🔶 AS-7).
 */
export interface Survival {
  /** Marginal survival probability across all Monte Carlo runs, 0..1. */
  probability: number;
  band: SurvivalBand;
}

/** One row of the **candidate list** (FR-9), in raw ECR order — never re-sorted (AS-8). */
export interface CandidateRow {
  playerId: string;
  playerName: string;
  position: Position;
  team: string | null;
  /**
   * FantasyPros overall half-PPR ECR rank, surfaced raw (AS-8). **Null only** on a row the ECR
   * snapshot does not carry at all — AC-50's "falling back to ADP order when the snapshot carries
   * no K/DST rankings", where the row's whole ordering comes from ADP. Every skill-position row
   * carries a rank, since the candidate list itself is ECR-ordered.
   */
  ecrRank: number | null;
  /** FantasyPros positional rank, e.g. the numeric part of "RB1". */
  positionalRank: number | null;
  /**
   * The player's **positional** tier, from their position's own FantasyPros cheat sheet (FR-4,
   * amended 2026-09-01 — the overall board's cross-position tiers are ignored). This is the
   * structure FR-10's dropoff model reads: the 2026 TE page holds Bowers/McBride/Loveland/Warren
   * as one Tier 1. Null on an ADP-only row, on K/DST, or when the position's tier page failed.
   */
  tier: number | null;
  /** FFC ADP for the league's team-count pool; null when the player has no ADP entry (AC-26). */
  adp: number | null;
  /** Present only while the user has a subsequent pick (AC-44, AC-45). */
  survival: Survival | null;
  /** True when this row is only present because the FR-10 highlight fell outside the default
   *  rows (AC-49) — the UI may mark it, but must still render it as an ordinary row. */
  addedForHighlight: boolean;
}

/** The single decisive factor named on the recommendation's one-line reason (AC-51). */
export type HighlightReasonKind =
  | 'plan-survival'
  | 'need'
  | 'value'
  | 'best-available'
  | 'too-close-to-call'
  | 'lookahead-not-applicable'
  /**
   * FR-9's endgame guard (added 2026-08-27): the user's remaining picks have caught up with
   * their unfilled K/DST starting slots, so the highlight is the top available K/DST.
   */
  | 'endgame-kdst'
  /**
   * The bench phase's roster-balance redirect (added 2026-08-27): starters are full, the raw
   * top-ECR player sits at a capped position the roster already holds enough of, so the
   * highlight is the best player at a position that still adds bench value.
   */
  | 'bench-depth';

/**
 * Exactly one highlighted candidate plus its reason. The reason string is produced server-side
 * and rendered verbatim by the UI — the frontend never re-derives or rewords it.
 */
export interface Recommendation {
  highlightPlayerId: string | null;
  reasonKind: HighlightReasonKind | null;
  reason: string | null;
}

/**
 * A two-pick lookahead **plan** (FR-10): an ordered (now, next) position pair drawn only from
 * positions with an unfilled starting slot (AC-54). `nowPosition === nextPosition` is valid.
 *
 * Scored in **projected points per game** (AC-55 as amended 2026-08-31), not ECR ranks: each
 * term is a shaded positional value from FR-10's value model, so a plan total is "the
 * starter points this route through the draft expects to bank". Rank sums were the 08-31
 * rehearsal's root failure — rank arithmetic priced Josh Allen (ECR 27) at pick 1 level with
 * Gibbs (ECR 1), because a rank gap carries no points.
 */
export interface Plan {
  nowPosition: SkillPosition;
  nextPosition: SkillPosition;
  /** Shaded value (proj pts/gm) of the best available player at `nowPosition`, present tense. */
  nowValue: number;
  /** Mean across runs of the best surviving shaded value at `nextPosition` at the next turn. */
  nextValue: number;
  /**
   * Expected shaded value summed over every *other* starting slot still unfilled after this
   * plan's two picks — dedicated slots at the expected j-th-best survivor of their position,
   * then each open FLEX slot at the best remaining flex-eligible survivor (priced for every
   * plan symmetrically). 0 when the caller supplies no slot picture.
   */
  fillValue: number;
  /** `nowValue + nextValue + fillValue`; **higher** wins (AC-55, amended 2026-08-31). */
  score: number;
}

/** The plan comparison surfaced to the user: winner, closest alternative, separating fact. */
export interface PlanComparison {
  /**
   * The highest-scoring plan, or **null when no plan was scored** — either because lookahead does
   * not apply (`applicable: false`, AC-59) or because the user has no unfilled starting slot with
   * an available player to fill it, which is the best-available regime rather than a plan.
   */
  winner: Plan | null;
  runnerUp: Plan | null;
  /** The specific survival fact separating the two, drawn from the same per-run data (AC-57). */
  separatingFact: string | null;
  /** True when the top two totals are within `planTotalTooClosePoints` (AC-58). */
  tooClose: boolean;
  /**
   * Every plan scoring within `planTotalTooClosePoints` of the winner, winner first (AC-58 as
   * amended 2026-08-31): the set the near-tie fallback chooses over — need first, consensus
   * second — so a plan sitting third by 0.1 points is not invisible to the tiebreak. Absent on
   * payloads built before the amendment; the UI reads only `winner`/`runnerUp`.
   */
  contenders?: Plan[];
  /** False when the user has fewer than two picks remaining (AC-59). */
  applicable: boolean;
}

/** The whole candidate-list payload: rows plus the one embedded recommendation (FR-9/FR-10). */
export interface CandidateListData {
  rows: CandidateRow[];
  highlightPlayerId: string | null;
  reason: string | null;
  reasonKind: HighlightReasonKind | null;
  planComparison: PlanComparison | null;
  /**
   * Explicit disabled state: no ECR snapshot loaded (AC-28), or the user's seat is still
   * unresolved so there is no next pick to recommend against (AC-5).
   */
  disabledReason: string | null;
  /**
   * AC-50's one-interaction position filter, precomputed per position.
   *
   * The filter is a *server-side* ordering rule (positional ECR order, ADP-order fallback for a
   * K/DST-less snapshot, no survival math for K/DST), and the browser cannot re-derive it from
   * `rows` — eight ECR-ordered rows might hold two receivers. Shipping the per-position sets
   * inside the same `Insight` keeps the filter instant and keeps it under the same
   * recomputing/degraded flags as the list it filters, rather than opening a second channel that
   * could disagree with the snapshot on screen. Filled by the orchestrator; absent on any payload
   * built before rankings loaded.
   */
  rowsByPosition?: Partial<Record<Position, CandidateRow[]>>;
}
