import { afterEach, describe, expect, it, vi } from 'vitest';

import { FakeEventSource, fakeEventSourceFactory } from '../test/fakeEventSource';
import { makeSnapshot, makeUnattachedSnapshot } from '../test/fixtures';
import { AppStateStore } from './store';

afterEach(() => {
  FakeEventSource.reset();
});

const store = (): AppStateStore => new AppStateStore({ createEventSource: fakeEventSourceFactory });

describe('AppStateStore', () => {
  it('opens exactly one connection to the SSE endpoint and starts with no snapshot', () => {
    const s = store();
    s.connect();
    s.connect();

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.latest.url).toBe('/events');
    expect(s.getState().snapshot).toBeNull();
    expect(s.getState().connection).toBe('connecting');
  });

  it('replaces the whole snapshot on every frame rather than merging field by field', () => {
    const s = store();
    s.connect();

    FakeEventSource.latest.emitSnapshot(makeSnapshot());
    expect(s.getState().snapshot?.attach.draftId).toBe('1234567890');
    expect(s.getState().snapshot?.pickFeed).toHaveLength(2);

    // A detach frame carries no `draftId` and an empty feed. Anything that survived here would be
    // the client merging state the server no longer publishes — the staleness class the
    // full-state-replace principle exists to eliminate.
    FakeEventSource.latest.emitSnapshot(makeUnattachedSnapshot());
    expect(s.getState().snapshot?.attach.draftId).toBeUndefined();
    expect(s.getState().snapshot?.pickFeed).toHaveLength(0);
    expect(s.getState().snapshot?.board.teams).toHaveLength(0);
  });

  it('hands out a stable state reference between frames and a new one per frame', () => {
    const s = store();
    s.connect();

    const before = s.getState();
    expect(s.getState()).toBe(before);

    FakeEventSource.latest.emitSnapshot(makeSnapshot());
    const afterFirst = s.getState();
    expect(afterFirst).not.toBe(before);
    expect(s.getState()).toBe(afterFirst);

    FakeEventSource.latest.emitSnapshot(makeSnapshot());
    expect(s.getState()).not.toBe(afterFirst);
  });

  it('notifies every subscriber once per frame and stops after unsubscribe', () => {
    const s = store();
    s.connect();
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribe = s.subscribe(first);
    s.subscribe(second);

    FakeEventSource.latest.emitSnapshot(makeSnapshot());
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    unsubscribe();
    FakeEventSource.latest.emitSnapshot(makeSnapshot());
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it('keeps the last good snapshot when a frame is malformed, and never throws', () => {
    const s = store();
    s.connect();
    FakeEventSource.latest.emitSnapshot(makeSnapshot());
    const good = s.getState();

    expect(() => {
      FakeEventSource.latest.emit('{not json');
    }).not.toThrow();
    expect(s.getState()).toBe(good);
    expect(s.getState().snapshot?.attach.draftId).toBe('1234567890');
  });

  it('tracks the connection through open and error so a dead server is not a frozen board', () => {
    const s = store();
    s.connect();
    expect(s.getState().connection).toBe('connecting');

    FakeEventSource.latest.open();
    expect(s.getState().connection).toBe('open');

    FakeEventSource.latest.fail();
    expect(s.getState().connection).toBe('reconnecting');

    // A frame arriving after the browser reconnects is proof enough that the stream is live again.
    FakeEventSource.latest.emitSnapshot(makeSnapshot());
    expect(s.getState().connection).toBe('open');
  });

  it('closes the connection and ignores any later frame', () => {
    const s = store();
    s.connect();
    FakeEventSource.latest.emitSnapshot(makeSnapshot());
    const last = s.getState();

    s.close();
    expect(FakeEventSource.latest.closed).toBe(true);
    expect(s.getState().connection).toBe('closed');

    FakeEventSource.latest.emitSnapshot(makeUnattachedSnapshot());
    expect(s.getState().snapshot).toBe(last.snapshot);
  });
});
