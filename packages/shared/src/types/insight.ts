/**
 * The wrapper every FR-3-sensitive output carries.
 *
 * PRD §9 Terms draws the distinction this type encodes:
 * - **recomputing** — the board is trusted, but this insight derived from it is still being
 *   recalculated (its `boardVersion` is behind the current one, AC-21). Stale `data` stays
 *   visible, flagged; it is never blanked and never presented as current.
 * - **degraded** — the board itself cannot currently be trusted (AC-17, AC-48).
 *
 * A consumer must surface both flags; silently dropping either is the staleness bug the
 * constitution calls the cardinal sin.
 */
export interface Insight<T> {
  data: T;
  /** The board version this `data` was computed from. */
  boardVersion: number;
  recomputing: boolean;
  degraded: boolean;
}

/** Convenience constructor for a fresh, trusted insight at the current board version. */
export const freshInsight = <T>(data: T, boardVersion: number): Insight<T> => ({
  data,
  boardVersion,
  recomputing: false,
  degraded: false,
});
