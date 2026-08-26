/**
 * Latency instrumentation for the SC-1 / SC-2 mock-rehearsal judgment (AC-66, AC-67), plus the
 * app-event channel every other module reports through.
 *
 * The PRD's own validation protocol (§14) treats the p95 verdict as something a human forms while
 * watching a live mock draft, not something CI asserts. So the latency half stays narrow:
 * timestamp the moment each poll response arrives and the moment each dependent view is rebuilt
 * from it, and keep enough recent samples that a rehearsal can be judged.
 *
 * The app-event half ({@link Observability.recordEvent}) is the general tap: attaches, polls,
 * recompute outputs, degraded transitions — anything a post-draft "what exactly happened"
 * investigation needs. Events flagged `noise` (an unchanged 1 Hz poll, a healthy Sleeper request)
 * skip the ring buffer so they cannot evict the latency samples the buffer exists for; every
 * sample, noisy or not, reaches the sink, where `index.ts` persists it to the trace file.
 * Every sample carries the attached draft's id ({@link Observability.setDraftId}), so one trace
 * file covering several drafts still slices cleanly.
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

/**
 * One burst's insight-refresh latency (AC-67): the clock runs from the poll response carrying the
 * burst's **final** pick to the moment the recompute cascade's output is published, which is
 * exactly the interval AC-46/AC-53 budget at 🔶 `insightRefreshLatencyMs`.
 */
export interface BurstRefreshedSample {
  type: 'burst-refreshed';
  /** How many new picks the burst coalesced — 1 for an ordinary pick, N for a run of them. */
  pickCount: number;
  /** The last pick number in the burst; null if the burst carried no identifiable pick. */
  finalPickNo: number | null;
  burstFinalPollResponseAt: number;
  refreshedAt: number;
  latencyMs: number;
}

/**
 * A recompute cascade that threw and was contained.
 *
 * The cascade is deliberately fail-fast in places — `simulateSurvival` refuses to paper over a
 * picks/window length mismatch, for one — so a wiring bug surfaces as a throw rather than a
 * plausible-looking wrong board. Containing it degrades the panels instead of ending the draft,
 * which means the *reason* has to leave the process some other way or it is simply swallowed.
 * This is that way: AC-66's sink prints it, `/api/debug/metrics` retains it.
 */
export interface CascadeFailedSample {
  type: 'cascade-failed';
  /** The board version the failed cascade was computing from. */
  boardVersion: number;
  message: string;
  /** The throw's stack, when it carried one — the "which line" a post-mortem starts from. */
  stack: string | null;
  at: number;
}

/**
 * A general app event: something happened that a post-draft investigation may need. The event
 * name is free-form by design — the set grows with the app, and the trace file is schemaless.
 */
export interface AppEventSample {
  type: 'app-event';
  event: string;
  at: number;
  /**
   * High-frequency routine traffic (an unchanged poll, a healthy HTTP request). Noise reaches the
   * sink — the on-disk trace wants full fidelity — but stays out of the ring buffer and out of
   * the live console.
   */
  noise: boolean;
  data: Record<string, unknown>;
}

export type ObservabilitySample =
  | PollResponseSample
  | PickReflectedSample
  | BurstRefreshedSample
  | CascadeFailedSample
  | AppEventSample;

/**
 * What actually reaches the buffer and the sink: the sample plus the attached draft's id. The
 * intersection distributes over the union so `sample.type === '…'` still narrows normally.
 */
export type RecordedSample = ObservabilitySample extends infer S
  ? S extends ObservabilitySample
    ? S & { draftId: string | null }
    : never
  : never;

export interface LagSummary {
  count: number;
  p95Ms: number;
  maxMs: number;
}

export interface ObservabilityOptions {
  /** Ring-buffer size. A 15-round draft produces a few hundred samples; this bounds a long night. */
  maxSamples?: number;
  now?: () => number;
  /** Optional side-channel (the trace file, a structured log line) invoked for every sample. */
  sink?: (sample: RecordedSample) => void;
}

const DEFAULT_MAX_SAMPLES = 2000;

export class Observability {
  private readonly buffer: RecordedSample[] = [];
  private readonly maxSamples: number;
  private readonly now: () => number;
  private readonly sink: ((sample: RecordedSample) => void) | undefined;
  private draftId: string | null = null;

  constructor(options: ObservabilityOptions = {}) {
    this.maxSamples = options.maxSamples ?? DEFAULT_MAX_SAMPLES;
    this.now = options.now ?? Date.now;
    this.sink = options.sink;
  }

  /** Stamped onto every subsequent sample. Set at attach, cleared (null) at detach. */
  setDraftId(draftId: string | null): void {
    this.draftId = draftId;
  }

  private push(sample: ObservabilitySample): void {
    const recorded: RecordedSample = { ...sample, draftId: this.draftId };
    this.buffer.push(recorded);
    while (this.buffer.length > this.maxSamples) this.buffer.shift();
    this.sink?.(recorded);
  }

  /**
   * Records one general app event. `noise: true` marks routine high-frequency traffic: it still
   * reaches the sink (the trace file wants everything) but bypasses the ring buffer, so summaries
   * and `/api/debug/metrics` keep their latency-sample depth.
   */
  recordEvent(
    event: string,
    data: Record<string, unknown> = {},
    options: { noise?: boolean } = {},
  ): AppEventSample {
    const sample: AppEventSample = {
      type: 'app-event',
      event,
      at: this.now(),
      noise: options.noise ?? false,
      data,
    };
    if (sample.noise) {
      this.sink?.({ ...sample, draftId: this.draftId });
    } else {
      this.push(sample);
    }
    return sample;
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

  /**
   * Stamps the moment one burst's recompute cascade finished publishing (AC-67).
   *
   * Recorded by the orchestrator, once per burst rather than once per pick — recording per pick
   * would report the same interval N times and make a burst look like N slow refreshes.
   */
  recordBurstRefreshed(args: {
    pickCount: number;
    finalPickNo?: number | null;
    burstFinalPollResponseAt: number;
    refreshedAt?: number;
  }): BurstRefreshedSample {
    const refreshedAt = args.refreshedAt ?? this.now();
    const sample: BurstRefreshedSample = {
      type: 'burst-refreshed',
      pickCount: args.pickCount,
      finalPickNo: args.finalPickNo ?? null,
      burstFinalPollResponseAt: args.burstFinalPollResponseAt,
      refreshedAt,
      latencyMs: refreshedAt - args.burstFinalPollResponseAt,
    };
    this.push(sample);
    return sample;
  }

  /** Stamps a recompute cascade that threw, so containing it does not also silence it. */
  recordCascadeFailed(args: {
    boardVersion: number;
    message: string;
    stack?: string | null;
  }): CascadeFailedSample {
    const sample: CascadeFailedSample = {
      type: 'cascade-failed',
      boardVersion: args.boardVersion,
      message: args.message,
      stack: args.stack ?? null,
      at: this.now(),
    };
    this.push(sample);
    return sample;
  }

  samples(): readonly RecordedSample[] {
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
    return summarize(this.buffer.flatMap((s) => (s.type === 'pick-reflected' ? [s.lagMs] : [])));
  }

  /** The same nearest-rank p95 over burst refreshes — SC-2's ≤5 s bar (AC-67). */
  burstLatencySummary(): LagSummary | null {
    return summarize(this.buffer.flatMap((s) => (s.type === 'burst-refreshed' ? [s.latencyMs] : [])));
  }
}

const summarize = (values: number[]): LagSummary | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1);
  return { count: sorted.length, p95Ms: sorted[index]!, maxMs: sorted[sorted.length - 1]! };
};
