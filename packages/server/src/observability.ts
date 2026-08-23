/**
 * Latency instrumentation for the SC-1 / SC-2 mock-rehearsal judgment (AC-66, AC-67).
 *
 * The PRD's own validation protocol (§14) treats the p95 verdict as something a human forms while
 * watching a live mock draft, not something CI asserts. So this module's job is narrow: timestamp
 * the moment each poll response arrives and the moment each dependent view is rebuilt from it, and
 * keep enough recent samples that a rehearsal can be judged. The sync layer records; the server
 * orchestration layer decides how to surface (log line, debug endpoint).
 */

/** The views a pick must reach before SC-1's "reflected everywhere" clock stops (AC-11). */
export type DependentView = 'board' | 'pickFeed' | 'roster';

export interface PollResponseSample {
  type: 'poll-response';
  endpoint: string;
  at: number;
}

export interface PickReflectedSample {
  type: 'pick-reflected';
  pickNo: number;
  view: DependentView;
  pollResponseAt: number;
  reflectedAt: number;
  lagMs: number;
}

export type ObservabilitySample = PollResponseSample | PickReflectedSample;

export interface LagSummary {
  count: number;
  p95Ms: number;
  maxMs: number;
}

export interface ObservabilityOptions {
  /** Ring-buffer size. A 15-round draft produces a few hundred samples; this bounds a long night. */
  maxSamples?: number;
  now?: () => number;
  /** Optional side-channel (a structured log line, say) invoked for every recorded sample. */
  sink?: (sample: ObservabilitySample) => void;
}

const DEFAULT_MAX_SAMPLES = 2000;

export class Observability {
  private readonly buffer: ObservabilitySample[] = [];
  private readonly maxSamples: number;
  private readonly now: () => number;
  private readonly sink: ((sample: ObservabilitySample) => void) | undefined;

  constructor(options: ObservabilityOptions = {}) {
    this.maxSamples = options.maxSamples ?? DEFAULT_MAX_SAMPLES;
    this.now = options.now ?? Date.now;
    this.sink = options.sink;
  }

  private push(sample: ObservabilitySample): void {
    this.buffer.push(sample);
    while (this.buffer.length > this.maxSamples) this.buffer.shift();
    this.sink?.(sample);
  }

  /** Stamps a poll response's arrival and hands the timestamp back to correlate reflections with. */
  recordPollResponse(endpoint: string): number {
    const at = this.now();
    this.push({ type: 'poll-response', endpoint, at });
    return at;
  }

  /** Stamps the moment one dependent view reflected a pick from a given poll response. */
  recordPickReflected(args: {
    pickNo: number;
    view: DependentView;
    pollResponseAt: number;
    reflectedAt?: number;
  }): PickReflectedSample {
    const reflectedAt = args.reflectedAt ?? this.now();
    const sample: PickReflectedSample = {
      type: 'pick-reflected',
      pickNo: args.pickNo,
      view: args.view,
      pollResponseAt: args.pollResponseAt,
      reflectedAt,
      lagMs: reflectedAt - args.pollResponseAt,
    };
    this.push(sample);
    return sample;
  }

  samples(): readonly ObservabilitySample[] {
    return this.buffer;
  }

  /**
   * The most recent poll response's arrival time, or null if none has been recorded.
   *
   * A view rebuilt from the poll that has just been applied measures its own reflection lag
   * against this (FR-5's roster panel does exactly that, AC-31): the sync layer stamps the
   * response's arrival, and the view stamps the moment it reflected it.
   */
  lastPollResponseAt(): number | null {
    for (let index = this.buffer.length - 1; index >= 0; index -= 1) {
      const sample = this.buffer[index]!;
      if (sample.type === 'poll-response') return sample.at;
    }
    return null;
  }

  /** Nearest-rank p95 over the retained pick-reflection lags — enough to judge SC-1's ≤3 s bar. */
  pickLagSummary(): LagSummary | null {
    const lags = this.buffer
      .filter((s): s is PickReflectedSample => s.type === 'pick-reflected')
      .map((s) => s.lagMs)
      .sort((a, b) => a - b);
    if (lags.length === 0) return null;

    const index = Math.min(lags.length - 1, Math.ceil(0.95 * lags.length) - 1);
    return { count: lags.length, p95Ms: lags[index]!, maxMs: lags[lags.length - 1]! };
  }
}
