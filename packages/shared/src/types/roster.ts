import type { Position, SkillPosition } from './board';

/**
 * Roster slot structure, read from the draft/league API at attach — never from hardcoded
 * format constants (AC-30, AC-32). `BN` is bench depth; `FLEX` slots are filled by the
 * configured eligible positions (`flexEligiblePositions`, 🔶 AS-5).
 */
export interface SlotConfig {
  QB: number;
  RB: number;
  WR: number;
  TE: number;
  FLEX: number;
  K: number;
  DST: number;
  BN: number;
}

/**
 * A **need vector** — per-position weights (PRD §9 Terms). Each unfilled dedicated starting
 * slot contributes 1 to its position; each unfilled FLEX slot contributes its {@link FlexShare}
 * to each eligible position (uniform 1/(eligible positions) — the original AS-5 split — when no
 * share is known); K/DST contribute nothing (🔶 AS-7).
 */
export type NeedVector = Record<Position, number>;

/**
 * A team with no unfilled starting slots has **no need signal** — its simulated pick is drawn
 * from ADP order across the skill positions (the best-available regime, 🔶 AS-5). This is a
 * distinct sentinel rather than a zero vector precisely so callers must branch on it.
 */
export const NO_NEED_SIGNAL = 'no-need-signal';

export type NoNeedSignal = typeof NO_NEED_SIGNAL;

/** Count-shaped view of what a roster still has open — FR-5's roster panel reads this raw. */
export interface UnfilledStartingSlots {
  /** Unfilled dedicated starting slots per position, K and DST included (AC-33). */
  dedicated: Record<Position, number>;
  /** Unfilled FLEX slots remaining after positional surplus has been absorbed. */
  flex: number;
}

/** Which positions may occupy a FLEX slot; configurable via `flexEligiblePositions`. */
export type FlexEligiblePositions = readonly SkillPosition[];

/**
 * How the league's FLEX demand realistically splits across the eligible positions — one weight
 * per FLEX-eligible position, summing to 1 (amended 2026-09-02). A position at 0 is legally
 * eligible but does not flex in practice, and so takes no FLEX need weight, absorbs no FLEX slot
 * with its surplus, and banks no starter points for a pick past its dedicated slots.
 *
 * Why it exists: the uniform 1/(eligible positions) split handed TE a third of every open FLEX
 * slot, which kept TE in the user's plan set after TE1 was rostered and pitched a second tight
 * end "for FLEX" (Tucker Kraft at picks 63–68 of the 2026-09-02 league draft) — while a 10-team
 * half-PPR room starts RB/WR at FLEX almost without exception (the 2026 FFC pool's excess
 * starters inside the top 70 picks: RB 36% / WR 64% / TE 0%). Derived per attach from the
 * league's own scoring curves (`roster/flexDemand.ts`), which put the same room at
 * RB 40% / WR 60% / TE 0%; overridable by 🔶 `flexShareOverride`.
 */
export type FlexShare = Readonly<Partial<Record<SkillPosition, number>>>;

/** Where an attached league's {@link FlexShare} came from — shown on the pre-draft check. */
export type FlexShareSource = 'league-scoring' | 'config-override' | 'uniform-default';

/**
 * The **roster panel** (FR-5): filled starting slots, unfilled starting slots by position
 * (the need vector in count form), and bench count (AC-31).
 */
export interface RosterPanelData {
  teamId: string;
  slots: SlotConfig;
  /** Filled starting slots per position, capped at the configured slot counts. */
  filledStartingSlots: Record<Position, number>;
  /**
   * FLEX slots filled by positional surplus. Kept explicit so the roster panel UI reads roster
   * math rather than re-deriving it from `slots.FLEX` and `unfilledStartingSlots.flex`.
   */
  filledFlexSlots: number;
  unfilledStartingSlots: UnfilledStartingSlots;
  /** The same need still-open picture as weights; sentinel when nothing is open (AC-31). */
  needVector: NeedVector | NoNeedSignal;
  benchCount: number;
  benchSlots: number;
}
