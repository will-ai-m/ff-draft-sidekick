/**
 * The SSE-fed application store.
 *
 * One `EventSource` on `/events`; every frame carries a whole `AppStateSnapshot` and is applied by
 * **wholesale replacement** — never a field-level merge, never a partial update. That is the same
 * principle the server applies to Sleeper (FR-2's stateless full-refetch), pushed one layer down:
 * with no client-side merge there is no client-side staleness class to debug, and AC-15's
 * multiple-tab consistency is true by construction rather than by careful reconciliation.
 *
 * The store is deliberately not a React thing. `useSyncExternalStore` subscribes to it, so a
 * component re-renders on an actual new frame and on nothing else, and no state library is needed
 * for what is ultimately one assignment.
 */
import { useSyncExternalStore } from 'react';
import type { AppStateSnapshot } from '@sidekick/shared';

/** Default endpoint; Vite proxies it to the Express process in dev, same origin in production. */
export const EVENTS_URL = '/events';

/**
 * The slice of `EventSource` this store uses. Narrow on purpose: jsdom ships no `EventSource`, so
 * the suite injects a fake, and a narrow surface keeps the fake honest.
 */
export interface EventSourceLike {
  onmessage: ((event: { data: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onopen: ((event: unknown) => void) | null;
  close(): void;
}

export type EventSourceFactory = (url: string) => EventSourceLike;

/**
 * Whether the push channel itself is alive — distinct from the board's own healthy/degraded state.
 *
 * A dead server and a quiet draft look identical from the snapshot alone (nothing new arrives in
 * either case), so the shell needs this to tell the user which one they are looking at.
 */
export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface AppState {
  /** Null until the first frame lands — the server sends one on connect, so this is brief. */
  snapshot: AppStateSnapshot | null;
  connection: ConnectionStatus;
}

export interface AppStateStoreOptions {
  url?: string;
  createEventSource?: EventSourceFactory;
}

const defaultFactory: EventSourceFactory = (url) => {
  const source: unknown = new EventSource(url);
  return source as EventSourceLike;
};

export class AppStateStore {
  private readonly url: string;
  private readonly createEventSource: EventSourceFactory;
  private readonly listeners = new Set<() => void>();

  private source: EventSourceLike | null = null;
  private state: AppState = { snapshot: null, connection: 'connecting' };

  constructor(options: AppStateStoreOptions = {}) {
    this.url = options.url ?? EVENTS_URL;
    this.createEventSource = options.createEventSource ?? defaultFactory;
  }

  /** Opens the stream. Idempotent — a second call while connected is a no-op, not a second tab. */
  connect(): void {
    if (this.source !== null) return;

    const source = this.createEventSource(this.url);
    this.source = source;

    source.onopen = () => {
      this.setState({ connection: 'open' });
    };
    source.onmessage = (event) => {
      this.apply(event.data);
    };
    source.onerror = () => {
      // The browser reconnects on its own; this only records that the channel is not currently
      // carrying frames, so the shell can say so instead of showing a board that stopped moving.
      if (this.state.connection !== 'closed') this.setState({ connection: 'reconnecting' });
    };
  }

  close(): void {
    this.source?.close();
    this.source = null;
    this.setState({ connection: 'closed' });
  }

  /** Stable reference for `useSyncExternalStore`; new object only when something really changed. */
  readonly getState = (): AppState => this.state;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private apply(raw: string): void {
    if (this.state.connection === 'closed') return;

    let snapshot: AppStateSnapshot;
    try {
      snapshot = JSON.parse(raw) as AppStateSnapshot;
    } catch {
      // A frame we cannot read is a frame we do not apply. Keeping the last good snapshot is the
      // browser-side reading of AC-18: a malformed payload is never a crash and never a partial
      // apply — and it is never mistaken for a state change, so nothing re-renders.
      return;
    }

    // A frame arriving is proof the stream is carrying again, whatever `onerror` last reported.
    this.setState({ snapshot, connection: 'open' });
  }

  private setState(patch: Partial<AppState>): void {
    const next: AppState = { ...this.state, ...patch };
    if (next.snapshot === this.state.snapshot && next.connection === this.state.connection) return;
    this.state = next;
    for (const listener of this.listeners) listener();
  }
}

/** Subscribes a component to the store. Re-renders only when a new frame replaces the state. */
export function useAppState(store: AppStateStore): AppState {
  return useSyncExternalStore(store.subscribe, store.getState);
}

/**
 * AC-21 in one predicate: an insight computed from an older board version is being recomputed and
 * is never current. The server already stamps each `Insight`, so this only asks whether *any*
 * insight on screen is behind — which is what the sync indicator reports.
 */
export function isRecomputing(snapshot: AppStateSnapshot): boolean {
  return (
    snapshot.userRoster.recomputing ||
    snapshot.opponentPanel.recomputing ||
    snapshot.candidateList.recomputing
  );
}
