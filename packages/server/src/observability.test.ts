import { describe, expect, it } from 'vitest';

import { Observability } from './observability';

describe('Observability (AC-66)', () => {
  it('timestamps a poll response and hands that timestamp back for correlation', () => {
    let clock = 1000;
    const obs = new Observability({ now: () => clock });

    const at = obs.recordPollResponse('picks');
    expect(at).toBe(1000);

    clock = 1200;
    expect(obs.recordPollResponse('picks')).toBe(1200);
    expect(obs.samples().filter((s) => s.type === 'poll-response')).toHaveLength(2);
  });

  it('records when each dependent view reflected a pick, with the lag from poll arrival', () => {
    let clock = 5000;
    const obs = new Observability({ now: () => clock });
    const pollAt = obs.recordPollResponse('picks');

    clock = 5120;
    obs.recordPickReflected({ pickNo: 14, view: 'board', pollResponseAt: pollAt });
    clock = 5180;
    obs.recordPickReflected({ pickNo: 14, view: 'pickFeed', pollResponseAt: pollAt });

    const reflected = obs
      .samples()
      .filter((s): s is Extract<typeof s, { type: 'pick-reflected' }> => s.type === 'pick-reflected');

    expect(reflected.map((s) => [s.view, s.lagMs])).toEqual([
      ['board', 120],
      ['pickFeed', 180],
    ]);
  });

  it('summarises pick lag so the SC-1 p95 target can be judged during a rehearsal', () => {
    const lags = [10, 20, 30, 40, 50, 60, 70, 80, 90, 3000];
    let clock = 0;
    const obs = new Observability({ now: () => clock });

    for (const lag of lags) {
      clock = 0;
      const pollAt = obs.recordPollResponse('picks');
      clock = lag;
      obs.recordPickReflected({ pickNo: 1, view: 'board', pollResponseAt: pollAt });
    }

    const summary = obs.pickLagSummary();
    expect(summary).not.toBeNull();
    expect(summary?.count).toBe(lags.length);
    expect(summary?.maxMs).toBe(3000);
    expect(summary?.p95Ms).toBe(3000);
  });

  it('returns no summary before any pick has been reflected', () => {
    expect(new Observability().pickLagSummary()).toBeNull();
  });

  it('keeps only the most recent samples so a long draft cannot grow memory without bound', () => {
    const obs = new Observability({ maxSamples: 3 });
    for (let i = 0; i < 10; i += 1) obs.recordPollResponse(`picks-${i}`);
    expect(obs.samples()).toHaveLength(3);
  });
});
