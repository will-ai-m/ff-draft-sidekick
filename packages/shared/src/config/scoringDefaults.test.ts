import { describe, expect, it } from 'vitest';

import {
  FALLBACK_SCORING_FORMAT,
  SCORING_DEFAULTS,
  SCORING_FORMATS,
  defaultScoringSettings,
  scoringFormatFromLabel,
} from './scoringDefaults';

describe('named scoring tables (AC-30 fallback, AC-64)', () => {
  const withoutRec = (settings: Readonly<Record<string, number>>): Record<string, number> => {
    const copy: Record<string, number> = { ...settings };
    delete copy['rec'];
    return copy;
  };

  it('differs between the named formats only in the per-reception value', () => {
    expect(SCORING_DEFAULTS.standard['rec']).toBe(0);
    expect(SCORING_DEFAULTS.half_ppr['rec']).toBe(0.5);
    expect(SCORING_DEFAULTS.ppr['rec']).toBe(1);

    for (const format of SCORING_FORMATS) {
      expect(withoutRec(SCORING_DEFAULTS[format])).toEqual(withoutRec(SCORING_DEFAULTS.standard));
    }
  });

  it('uses Sleeper’s own per-stat key names, so a fallback table is shape-identical to a league dict', () => {
    // These are the keys a real `/v1/league/<id>` `scoring_settings` dict uses (live-verified).
    for (const key of [
      'pass_yd',
      'pass_td',
      'pass_int',
      'rush_yd',
      'rush_td',
      'rec',
      'rec_yd',
      'rec_td',
      'fum_lost',
    ]) {
      expect(SCORING_DEFAULTS.half_ppr[key]).toBeTypeOf('number');
    }
  });

  it('is frozen, so no consumer can mutate a shared default table', () => {
    expect(Object.isFrozen(SCORING_DEFAULTS)).toBe(true);
    expect(Object.isFrozen(SCORING_DEFAULTS.half_ppr)).toBe(true);
  });
});

describe('scoringFormatFromLabel', () => {
  it('maps Sleeper’s coarse labels onto the named formats', () => {
    expect(scoringFormatFromLabel('half_ppr')).toBe('half_ppr');
    expect(scoringFormatFromLabel('ppr')).toBe('ppr');
    expect(scoringFormatFromLabel('std')).toBe('standard');
  });

  it('normalises case, whitespace and separator spelling', () => {
    expect(scoringFormatFromLabel(' Half-PPR ')).toBe('half_ppr');
    expect(scoringFormatFromLabel('PPR')).toBe('ppr');
    expect(scoringFormatFromLabel('Standard')).toBe('standard');
  });

  it('sees through the qualifier prefixes Sleeper puts on non-redraft formats', () => {
    expect(scoringFormatFromLabel('dynasty_half_ppr')).toBe('half_ppr');
    expect(scoringFormatFromLabel('rookie_ppr')).toBe('ppr');
    expect(scoringFormatFromLabel('dynasty_std')).toBe('standard');
    expect(scoringFormatFromLabel('2qb_ppr')).toBe('ppr');
  });

  it('returns null for an unrecognised or absent label rather than guessing', () => {
    expect(scoringFormatFromLabel('vampire_points')).toBeNull();
    expect(scoringFormatFromLabel('')).toBeNull();
    expect(scoringFormatFromLabel(null)).toBeNull();
    expect(scoringFormatFromLabel(undefined)).toBeNull();
  });
});

describe('defaultScoringSettings', () => {
  it('resolves a recognised label to its named table', () => {
    expect(defaultScoringSettings('half_ppr')).toEqual({
      format: 'half_ppr',
      recognised: true,
      settings: SCORING_DEFAULTS.half_ppr,
    });
  });

  it('falls back to the format v1 actually ships, flagged as unrecognised', () => {
    expect(defaultScoringSettings('vampire_points')).toEqual({
      format: FALLBACK_SCORING_FORMAT,
      recognised: false,
      settings: SCORING_DEFAULTS[FALLBACK_SCORING_FORMAT],
    });
    expect(FALLBACK_SCORING_FORMAT).toBe('half_ppr');
  });
});
