/**
 * A hand-rolled `EventSource` stand-in for the web suite.
 *
 * jsdom ships no `EventSource`, and msw's SSE support would still leave the tests waiting on a
 * real network turnaround for something the store treats as a plain string. The store takes its
 * factory by injection precisely so a test can drive frames synchronously — which is what makes
 * "this frame produced exactly that render" assertable at all.
 */
import type { AppStateSnapshot } from '@sidekick/shared';

import type { EventSourceLike } from '../state/store';

export class FakeEventSource implements EventSourceLike {
  /** Every instance built during a test, newest last — asserts "exactly one connection". */
  static instances: FakeEventSource[] = [];

  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onopen: ((event: unknown) => void) | null = null;

  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  static reset(): void {
    FakeEventSource.instances = [];
  }

  static get latest(): FakeEventSource {
    const latest = FakeEventSource.instances.at(-1);
    if (latest === undefined) throw new Error('No FakeEventSource was opened.');
    return latest;
  }

  close(): void {
    this.closed = true;
  }

  /** Delivers a raw frame body — used for the malformed-payload case. */
  emit(data: string): void {
    this.onmessage?.({ data });
  }

  /** Delivers one whole `AppStateSnapshot`, exactly as the server's SSE hub serializes it. */
  emitSnapshot(snapshot: AppStateSnapshot): void {
    this.emit(JSON.stringify(snapshot));
  }

  open(): void {
    this.onopen?.({});
  }

  fail(): void {
    this.onerror?.({});
  }
}

/** The factory shape `AppStateStore` expects, wired to {@link FakeEventSource}. */
export const fakeEventSourceFactory = (url: string): EventSourceLike => new FakeEventSource(url);
