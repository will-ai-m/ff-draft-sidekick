/**
 * FR-4 — the pre-draft check surface (AC-22 through AC-28).
 *
 * Everything the user confirms before insights render: how old each snapshot is, which ADP
 * pool actually answered, what failed to match, and which format the rankings assume. It is
 * assembled from an already-loaded `SnapshotBundle` and is a pure function of it, so the same
 * bundle always describes itself the same way.
 */
import { SCORING_DEFAULTS, scoringFormatFromLabel } from '@sidekick/shared';
import type {
  FlexShareSource,
  ParameterValues,
  PreDraftCheckData,
  PreDraftWarning,
  ScoringSettings,
  SkillPosition,
  SnapshotInfo,
} from '@sidekick/shared';

import type { ScoringSource } from '../roster/leagueSettings';
import { snapshotHasKickersAndDefenses } from './fantasypros';
import type { SnapshotBundle } from './types';

/**
 * The scoring keys FantasyPros' half-PPR board and FFC's half-PPR ADP actually assume: the
 * half-PPR table's own keys, plus the per-position reception bonuses that would silently make a
 * league labelled `half_ppr` a TE- or WR-premium league.
 *
 * Scoped on purpose. A real league's dict carries ~81 keys — kicking distances, IDP, team defense
 * — and none of them moves a skill player's rank, so comparing the whole dict would warn on every
 * league and mean nothing. A key absent from a dict scores zero, which is a difference like any
 * other and not a match (`scoringDefaults.ts`).
 */
const HALF_PPR_COMPARED_KEYS: readonly string[] = [
  ...Object.keys(SCORING_DEFAULTS.half_ppr),
  'bonus_rec_te',
  'bonus_rec_rb',
  'bonus_rec_wr',
];

/** One scoring key on which the attached league and half-PPR disagree (AC-27). */
export interface ScoringDivergence {
  key: string;
  league: number;
  halfPpr: number;
}

/**
 * Where the league's own per-stat settings depart from half-PPR — the comparison AC-27 asks for.
 *
 * A label is a category, not a scoring system: the live counterexample in `scoringDefaults.ts` is
 * a real league labelled `"ppr"` that pays 6 for a passing TD and −2 for an interception. Only the
 * granular dict can answer this, which is why AC-30 insists it be read from the API.
 */
export function halfPprDivergences(settings: ScoringSettings): ScoringDivergence[] {
  const halfPpr = SCORING_DEFAULTS.half_ppr;
  const divergences: ScoringDivergence[] = [];
  for (const key of HALF_PPR_COMPARED_KEYS) {
    const leagueValue = settings[key] ?? 0;
    const halfPprValue = halfPpr[key] ?? 0;
    // Values are tenths and hundredths (0.04/pass yard), so compare with a tolerance.
    if (Math.abs(leagueValue - halfPprValue) > 1e-9) {
      divergences.push({ key, league: leagueValue, halfPpr: halfPprValue });
    }
  }
  return divergences;
}

const describeDivergence = (divergence: ScoringDivergence): string =>
  `${divergence.key} ${divergence.league} vs ${divergence.halfPpr}`;

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
  /**
   * The league's resolved scoring, as FR-5 read it at attach (AC-30) — the granular dict AC-27
   * compares against half-PPR.
   *
   * Absent only where a caller has none to give. Where `source` is anything but
   * `'league-settings'` the dict is one of `scoringDefaults.ts`'s named tables rather than the
   * league's own — a mock has `league_id: null` and therefore no dict anywhere — and comparing a
   * fallback table against half-PPR would only ever compare it with itself. The coarse label is
   * the documented fallback for exactly that case.
   */
  scoring?: { source: ScoringSource; settings: ScoringSettings };
  /**
   * The league's FLEX share and its provenance (amended 2026-09-02), passed through to the
   * check's league summary so the user sees before the draft which positions the engine will
   * treat as FLEX candidates. Absent only where a caller has none to give.
   */
  flexShare?: { share: Partial<Record<SkillPosition, number>>; source: FlexShareSource };
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

  // AC-23 — a fetched snapshot that carries no K or DST rows. The promise the message makes is
  // AC-50's fallback, so it is made only when the ADP snapshot can actually keep it.
  if (bundle.ecr && !snapshotHasKickersAndDefenses(bundle.ecr)) {
    const fallbackCount = bundle.matching.adpOnlyPlayers.filter(
      (player) => player.position === 'K' || player.position === 'DST',
    ).length;
    warnings.push({
      code: 'kdst-missing',
      message:
        fallbackCount > 0
          ? 'The FantasyPros snapshot has no K or DST rows, so the K/DST candidate filter will ' +
            `fall back to ADP order (${fallbackCount} from the ADP snapshot).`
          : 'The FantasyPros snapshot has no K or DST rows, and the ADP snapshot carries none ' +
            'to fall back to, so the K/DST candidate filter will be empty.',
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

  // AC-27 — the rankings are half-PPR; say so when the league's *settings* are not.
  //
  // The comparison is against the league's own per-stat dict wherever one was read, never against
  // the coarse label alone: a league labelled `half_ppr` can still pay 6 for a passing TD or carry
  // a TE-premium bonus, and the label would call that a match. The label is the fallback for a
  // mock, which has no league object and so no dict to read.
  if (league) {
    const leagueSettings =
      league.scoring?.source === 'league-settings' ? league.scoring.settings : null;
    if (leagueSettings !== null) {
      const divergences = halfPprDivergences(leagueSettings);
      if (divergences.length > 0) {
        warnings.push({
          code: 'scoring-format-mismatch',
          message:
            `This draft is labelled "${league.scoringType}", but the league's own scoring ` +
            `settings differ from half-PPR (${divergences.map(describeDivergence).join(', ')}). ` +
            'The ingested rankings and ADP are half-PPR, so ranks and ADP may not reflect this format.',
        });
      }
    } else if (scoringFormatFromLabel(league.scoringType) !== 'half_ppr') {
      warnings.push({
        code: 'scoring-format-mismatch',
        message:
          `This draft's scoring is "${league.scoringType}", but the ingested rankings and ADP ` +
          'are half-PPR. Ranks and ADP may not reflect this format.',
      });
    }
  }

  // Positional tier pages (amended 2026-09-01) — a failed page degrades that position's tier
  // urgency to per-player steps rather than failing the attach, and the user should know before
  // the draft, not by noticing the reason lines went tier-less.
  const tierFailures = Object.entries(bundle.positionalTierErrors ?? {});
  if (tierFailures.length > 0) {
    warnings.push({
      code: 'positional-tiers-missing',
      message:
        `Positional tier page${tierFailures.length === 1 ? '' : 's'} unavailable — ` +
        `${tierFailures.map(([position, why]) => `${position}: ${why}`).join('; ')}. ` +
        'Tier urgency degrades to per-player steps for those positions.',
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
    // Projected, not passed through: the scoring dict is an input to the check above, not
    // something the browser needs on every broadcast.
    leagueSummary:
      league === null
        ? null
        : {
            teamCount: league.teamCount,
            scoringType: league.scoringType,
            rounds: league.rounds,
            flexShare: league.flexShare ?? null,
          },
  };
}
