/**
 * League settings, read from the API — FR-5 / AC-30.
 *
 * "When attaching, the system shall read team count, roster slot structure (starters by position,
 * flex, bench), and scoring settings from the draft/league via the API — never from hardcoded
 * format constants."
 *
 * Where each half comes from, and why:
 *
 *  - **Team count, rounds and slot structure** come from the *draft object's own* `settings`
 *    (`teams`, `rounds`, `slots_qb`…), which both mocks and real leagues carry — so one code path
 *    serves both, extending ✅ AS-1's "attribute by seat, not by roster" principle to settings
 *    generally. T2 already derives them (`deriveSlotConfig`); this module just carries them
 *    through, so nothing downstream has to know which endpoint they came from. A slot key that is
 *    absent means zero of that slot, never a default league shape (live-verified: a real 12-team
 *    draft carries no `slots_k`).
 *  - **Scoring settings** exist granularly only on `/v1/league/<id>` (live-verified 2026-08-22:
 *    81 numeric per-stat keys). A mock's `league_id` is `null`, so a mock genuinely has no
 *    granular source and falls back to the named table in `@sidekick/shared`'s `scoringDefaults`,
 *    keyed by the draft's own coarse `metadata.scoring_type` label — and, when that label names
 *    no table, to the rankings format the draft is attached on (2026-09-02), so a mock's value
 *    curves are priced on the same scoring its rankings, tiers and ADP assume.
 *
 * Every resolution says which of those two it was (`scoring.source`) and why (`scoring.note`), so
 * the pre-draft check and the game-log scorer (FR-11/AC-64) can show the user what their numbers
 * are actually being computed from rather than implying a precision that isn't there.
 *
 * Reading scoring never throws: a league fetch that fails degrades to the named table with the
 * failure recorded. Attaching to a draft must not fail because an optional dict was unreachable.
 */

import { defaultScoringSettings } from '@sidekick/shared';
import type { RankingsFormat, ScoringFormat, ScoringSettings, SlotConfig } from '@sidekick/shared';

import { SleeperApiError } from '../sleeper/client';
import type { SleeperClient } from '../sleeper/client';
import type { DraftMeta } from '../sleeper/sync';

/** Where a resolved scoring dict actually came from. */
export type ScoringSource =
  /** The attached league's own granular per-stat dict — the intended path for a real league. */
  | 'league-settings'
  /** A named standard table, keyed by the draft's coarse `scoring_type` label. */
  | 'scoring-type-default'
  /** A named standard table, because the label matched no known format. */
  | 'unrecognised-scoring-type';

export interface ResolvedScoring {
  source: ScoringSource;
  /** Sleeper's coarse label, verbatim — this is also what AC-27's mismatch warning reads. */
  scoringType: string | null;
  /** Which named table was used; null when the league's own granular dict was. */
  fallbackFormat: ScoringFormat | null;
  /** Per-stat point values. A key absent from this dict scores zero (FR-11's scorer relies on it). */
  settings: ScoringSettings;
  /** Plain-language provenance, safe to show in the pre-draft check. */
  note: string;
}

/** Everything FR-5 reads about the attached league, all of it from the API (AC-30, AC-32). */
export interface LeagueSettings {
  draftId: string;
  leagueId: string | null;
  isMock: boolean;
  teamCount: number;
  rounds: number;
  slots: SlotConfig;
  scoring: ResolvedScoring;
}

export interface ResolveLeagueSettingsOptions {
  /** Omit to resolve without a network call; scoring then falls back to the named table. */
  client?: SleeperClient;
  /** Budget for the league fetch. Callers pass their own ingest budget (AC-1's, AC-19's). */
  timeoutMs?: number;
}

const fallbackScoring = (
  scoringType: string | null,
  rankingsFormat: RankingsFormat,
  reason: string,
): ResolvedScoring => {
  const { format, recognised, settings } = defaultScoringSettings(scoringType, rankingsFormat);
  const label = scoringType ?? '(none)';
  return {
    source: recognised ? 'scoring-type-default' : 'unrecognised-scoring-type',
    scoringType,
    fallbackFormat: format,
    settings,
    note: recognised
      ? `${reason} Scoring falls back to the standard ${format} table for this draft's "${label}" label.`
      : `${reason} The scoring label "${label}" matches no format Sidekick knows, so the standard ` +
        `${format} table is used — the rankings format this draft is attached on. Expect points ` +
        "to differ from this league's.",
  };
};

/**
 * Turns the draft's coarse label plus (where one exists) the league's granular dict into one
 * resolved scoring table. Pure — `resolveLeagueSettings` does the fetching.
 *
 * `rankingsFormat` is the table of last resort: it is used only when there is no dict and the
 * label names no format, so that a mock with an exotic label is at least priced on the scoring
 * its rankings assume.
 */
export function resolveScoring(
  meta: Pick<DraftMeta, 'isMock' | 'scoringType'>,
  leagueScoringSettings: ScoringSettings | null,
  rankingsFormat: RankingsFormat,
  fetchFailureNote?: string,
): ResolvedScoring {
  if (leagueScoringSettings !== null && Object.keys(leagueScoringSettings).length > 0) {
    return {
      source: 'league-settings',
      scoringType: meta.scoringType,
      fallbackFormat: null,
      settings: leagueScoringSettings,
      note: "Read from the attached league's own scoring settings.",
    };
  }

  if (fetchFailureNote !== undefined) {
    return fallbackScoring(meta.scoringType, rankingsFormat, fetchFailureNote);
  }

  return fallbackScoring(
    meta.scoringType,
    rankingsFormat,
    meta.isMock
      ? 'This is a mock draft, which has no league and therefore no per-stat scoring settings to read.'
      : 'The league answered without a scoring_settings dict.',
  );
}

/**
 * Reads everything FR-5 needs about the attached league.
 *
 * Called once per attach, alongside T2's initial ingest; the result is stable for the attached
 * draft's lifetime (settings are re-read only by a Re-sync or a fresh attach, per Terms).
 */
export async function resolveLeagueSettings(
  meta: DraftMeta,
  rankingsFormat: RankingsFormat,
  options: ResolveLeagueSettingsOptions = {},
): Promise<LeagueSettings> {
  const base = {
    draftId: meta.draftId,
    leagueId: meta.leagueId,
    isMock: meta.isMock,
    teamCount: meta.teamCount,
    rounds: meta.rounds,
    slots: meta.slots,
  };

  const { client } = options;
  if (meta.leagueId === null || client === undefined) {
    const note =
      meta.leagueId !== null
        ? 'No Sleeper client was available to read the league object.'
        : undefined;
    return { ...base, scoring: resolveScoring(meta, null, rankingsFormat, note) };
  }

  try {
    const league = await client.getLeague(meta.leagueId, { timeoutMs: options.timeoutMs });
    return {
      ...base,
      scoring: resolveScoring(meta, league.scoring_settings ?? null, rankingsFormat),
    };
  } catch (error) {
    const detail =
      error instanceof SleeperApiError
        ? `${error.kind}: ${error.message}`
        : (error as Error).message;
    return {
      ...base,
      scoring: resolveScoring(
        meta,
        null,
        rankingsFormat,
        `Could not read league ${meta.leagueId} (${detail}).`,
      ),
    };
  }
}
