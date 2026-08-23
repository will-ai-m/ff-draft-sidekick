/**
 * FR-4 — the pre-draft check surface (AC-22 through AC-28).
 *
 * Everything the user confirms before insights render: how old each snapshot is, which ADP
 * pool actually answered, what failed to match, and which format the rankings assume. It is
 * assembled from an already-loaded `SnapshotBundle` and is a pure function of it, so the same
 * bundle always describes itself the same way.
 */
import type { ParameterValues, PreDraftCheckData, PreDraftWarning, SnapshotInfo } from '@sidekick/shared';

import { snapshotHasKickersAndDefenses } from './fantasypros';
import type { SnapshotBundle } from './types';

/**
 * Sleeper's coarse `metadata.scoring_type` label for half-PPR. This is the only scoring
 * signal a mock draft exposes (a mock has `league_id: null`, so there is no league endpoint
 * to read a granular `scoring_settings` dict from).
 */
export const HALF_PPR_SCORING_TYPES = new Set(['half_ppr', 'half-ppr', 'halfppr']);

export const isHalfPprScoring = (scoringType: string | null | undefined): boolean =>
  !!scoringType && HALF_PPR_SCORING_TYPES.has(scoringType.trim().toLowerCase());

/** Whole-tenths of an hour — enough precision for a staleness readout, no false exactness. */
const ageHoursBetween = (capturedAt: string | null, now: Date): number | null => {
  if (!capturedAt) return null;
  const captured = Date.parse(capturedAt);
  if (Number.isNaN(captured)) return null;
  return Math.round(((now.getTime() - captured) / 3_600_000) * 10) / 10;
};

export interface LeagueSummary {
  teamCount: number;
  /** Sleeper's `metadata.scoring_type` label, read by T2 from the draft object. */
  scoringType: string;
  rounds: number;
}

export interface PreDraftCheckInput {
  bundle: SnapshotBundle;
  league: LeagueSummary | null;
  config: Pick<ParameterValues, 'snapshotStalenessWarningHours'>;
  now?: Date;
}

/**
 * AC-28 — the explicit disabled state. Returns null when rankings loaded fine. The candidate
 * list, survival percentages and recommendations read this; board sync, the roster panel and
 * the pick feed deliberately do not, because they depend on Sleeper alone.
 */
export function rankingsDisabledReason(bundle: SnapshotBundle): string | null {
  if (bundle.ecr) return null;
  const detail = bundle.ecrError ? ` (${bundle.ecrError})` : '';
  return (
    `No rankings loaded${detail}. Board sync, the roster panel and the pick feed keep running; ` +
    'the candidate list, survival projections and recommendations are unavailable.'
  );
}

export function buildPreDraftCheck(input: PreDraftCheckInput): PreDraftCheckData {
  const { bundle, league } = input;
  const now = input.now ?? new Date();
  const thresholdHours = input.config.snapshotStalenessWarningHours;
  const warnings: PreDraftWarning[] = [];

  const ecrSnapshot: SnapshotInfo | null = bundle.ecr
    ? {
        source: bundle.ecr.source,
        capturedAt: bundle.ecr.capturedAt,
        ageHours: ageHoursBetween(bundle.ecr.capturedAt, now),
      }
    : null;

  const adpSnapshot: SnapshotInfo | null = bundle.adp
    ? {
        source: bundle.adp.source,
        capturedAt: bundle.adp.capturedAt,
        ageHours: ageHoursBetween(bundle.adp.capturedAt, now),
        poolDescription: bundle.adp.poolDescription,
      }
    : null;

  // AC-22 — one warning per stale snapshot, threshold from config.
  for (const [label, info] of [
    ['FantasyPros ECR', ecrSnapshot],
    ['FFC ADP', adpSnapshot],
  ] as const) {
    if (info?.ageHours !== null && info?.ageHours !== undefined && info.ageHours > thresholdHours) {
      warnings.push({
        code: 'snapshot-stale',
        message: `${label} snapshot is ${info.ageHours} h old, past the ${thresholdHours} h staleness threshold.`,
      });
    }
  }

  // AC-23 — a fetched snapshot that carries no K or DST rows.
  if (bundle.ecr && !snapshotHasKickersAndDefenses(bundle.ecr)) {
    warnings.push({
      code: 'kdst-missing',
      message:
        'The FantasyPros snapshot has no K or DST rows, so the K/DST candidate filter will fall back to ADP order.',
    });
  }

  // AC-24 — name the pool that actually answered when it is not the league's own size.
  if (bundle.adp && !bundle.adp.exactPool) {
    warnings.push({
      code: 'adp-pool-substituted',
      message:
        `No ${bundle.adp.teamCountRequested}-team half-PPR ADP pool is published, ` +
        `so the ${bundle.adp.teamCountUsed}-team pool was used instead.`,
    });
  }

  // AC-27 — the rankings are half-PPR; say so when the draft is not.
  if (league && !isHalfPprScoring(league.scoringType)) {
    warnings.push({
      code: 'scoring-format-mismatch',
      message:
        `This draft's scoring is "${league.scoringType}", but the ingested rankings and ADP ` +
        'are half-PPR. Ranks and ADP may not reflect this format.',
    });
  }

  // AC-28 — the explicit "no rankings loaded" state, surfaced as a warning too.
  const disabledReason = rankingsDisabledReason(bundle);
  if (disabledReason) warnings.push({ code: 'no-ecr-loaded', message: disabledReason });

  return {
    ecrSnapshot,
    adpSnapshot,
    unmatchedEntries: bundle.matching.unmatched.map((entry) => ({
      name: entry.name,
      position: entry.position,
      source: entry.source,
    })),
    playersMissingAdp: bundle.matching.playersMissingAdp,
    warnings,
    leagueSummary: league,
  };
}
