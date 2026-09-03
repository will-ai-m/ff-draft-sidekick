/**
 * Named standard scoring tables, keyed by Sleeper's coarse `metadata.scoring_type` label.
 *
 * **Why this file exists.** AC-30 says scoring settings are read from the league/draft API, and
 * AC-64 says game-log fantasy points come from "the attached league's own scoring settings, not a
 * generic format". For a real league both hold literally: `/v1/league/<id>` carries a granular
 * per-stat `scoring_settings` dict (live-verified 2026-08-22: 81 keys, all numbers). A **mock**
 * draft has `league_id: null` — there is no league object anywhere to read a dict from, and no
 * draft object of either kind carries one (verified in T2). Its only scoring signal is the coarse
 * label, e.g. `"half_ppr"`. These tables are that documented fallback, defined once, never inlined.
 *
 * **The granular dict always wins where one exists.** The live check that motivates this rule: a
 * real league labelled `"ppr"` pays **6** points for a passing TD and **-2** for an interception,
 * where the conventional table pays 4 and -1. A label is a category, not a scoring system.
 *
 * Keys are Sleeper's own per-stat names, so a fallback table is shape-identical to a real league's
 * dict and the game-log scorer (FR-11) needs exactly one code path. A key absent from a dict means
 * zero — real dicts routinely omit keys (that same live league carries no `bonus_rec_te`).
 *
 * Values are the conventional standard/half-PPR/PPR values, which are also Sleeper's own defaults
 * for a newly created league. They are a stand-in for a mock's unknown-but-conventional settings,
 * not a claim about any particular league.
 */

/** A per-stat scoring dict, keyed by Sleeper's stat names (`pass_td`, `rec`, `fum_lost`, …). */
export type ScoringSettings = Readonly<Record<string, number>>;

/** The named formats this fallback table covers. */
export const SCORING_FORMATS = ['standard', 'half_ppr', 'ppr'] as const;

export type ScoringFormat = (typeof SCORING_FORMATS)[number];

/** Everything the three named formats agree on; they differ only in `rec`. */
const SHARED_SCORING: Readonly<Record<string, number>> = Object.freeze({
  pass_yd: 0.04,
  pass_td: 4,
  pass_int: -1,
  pass_2pt: 2,
  rush_yd: 0.1,
  rush_td: 6,
  rush_2pt: 2,
  rec_yd: 0.1,
  rec_td: 6,
  rec_2pt: 2,
  fum: 0,
  fum_lost: -2,
});

export const SCORING_DEFAULTS: Readonly<Record<ScoringFormat, ScoringSettings>> = Object.freeze({
  standard: Object.freeze({ ...SHARED_SCORING, rec: 0 }),
  half_ppr: Object.freeze({ ...SHARED_SCORING, rec: 0.5 }),
  ppr: Object.freeze({ ...SHARED_SCORING, rec: 1 }),
});

/**
 * Maps Sleeper's coarse label onto a named format, or null when it maps to none.
 *
 * Sleeper qualifies the label for non-redraft formats (`dynasty_half_ppr`, `rookie_ppr`,
 * `2qb_ppr`), so matching is by content rather than by an exact-string allowlist. `half` is
 * tested before `ppr` because every half-PPR spelling also contains "ppr".
 */
export function scoringFormatFromLabel(label: string | null | undefined): ScoringFormat | null {
  if (label === null || label === undefined) return null;

  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (normalized === '') return null;

  if (normalized.includes('half')) return 'half_ppr';
  if (normalized.includes('ppr')) return 'ppr';
  if (normalized.includes('std') || normalized.includes('standard')) return 'standard';
  return null;
}

export interface DefaultScoringResolution {
  format: ScoringFormat;
  /** False when the label mapped to nothing and the caller's `fallback` format was used. */
  recognised: boolean;
  settings: ScoringSettings;
}

/**
 * Resolves a coarse label to a named table, falling back explicitly rather than silently.
 *
 * `fallback` is the format used when the label maps to none of the tables — the rankings format
 * the draft is attached with (2026-09-02; before that v1 shipped half-PPR only and pinned it
 * here). FR-4's AC-27 already warns whenever the attached draft's scoring is not that format, so
 * the honest behaviour is "score it as the format the user chose to draft on, and say so", never
 * "silently claim the label was understood".
 */
export function defaultScoringSettings(
  label: string | null | undefined,
  fallback: ScoringFormat,
): DefaultScoringResolution {
  const format = scoringFormatFromLabel(label);
  const resolved = format ?? fallback;
  return { format: resolved, recognised: format !== null, settings: SCORING_DEFAULTS[resolved] };
}
