/**
 * The rankings format — which FantasyPros board, which positional tier pages and which FFC ADP
 * pool Sidekick drafts on (2026-09-02: full PPR added beside half-PPR).
 *
 * A format is a *data-source choice*, and every downstream number changes with it: the ECR order
 * the candidate list follows (🔶 AS-8), the positional tiers that time FR-10's urgency, the ADP
 * that samples FR-8's opponent draws, the scoring table a mock's value curves are priced on, and
 * the table the pre-draft check compares the league's own settings against (AC-27). It is chosen
 * per attach — the toggle on the attach screen, before the draft starts — so one instance can
 * draft a half-PPR league tonight and a full-PPR one tomorrow without a config edit.
 *
 * It is deliberately a subset of {@link ScoringFormat}: `standard` exists as a scoring table for
 * game-log math, but Sidekick ingests no standard-scoring rankings, so it cannot be a format the
 * user drafts on.
 */
import { scoringFormatFromLabel } from './scoringDefaults';

export const RANKINGS_FORMATS = ['half_ppr', 'ppr'] as const;

export type RankingsFormat = (typeof RANKINGS_FORMATS)[number];

/** The user-facing names, everywhere a format is shown or mentioned in a warning. */
export const RANKINGS_FORMAT_LABELS: Readonly<Record<RankingsFormat, string>> = Object.freeze({
  half_ppr: 'Half PPR',
  ppr: 'Full PPR',
});

export const isRankingsFormat = (value: unknown): value is RankingsFormat =>
  typeof value === 'string' && (RANKINGS_FORMATS as readonly string[]).includes(value);

/** The one format that is not this one — what a mismatch warning points the user toward. */
export const otherRankingsFormat = (format: RankingsFormat): RankingsFormat =>
  format === 'half_ppr' ? 'ppr' : 'half_ppr';

/**
 * Maps Sleeper's coarse `scoring_type` label onto a rankings format, or null when the label
 * names no format Sidekick has rankings for (standard, or unrecognised). Used only to *suggest*
 * — the pre-draft check names the league's format so the user can flip the toggle; the label
 * never silently chooses the sources, because a label is a category, not a scoring system
 * (`scoringDefaults.ts`).
 */
export function rankingsFormatFromLabel(label: string | null | undefined): RankingsFormat | null {
  const format = scoringFormatFromLabel(label);
  return format !== null && isRankingsFormat(format) ? format : null;
}
