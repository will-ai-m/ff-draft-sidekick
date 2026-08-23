import { afterEach, describe, expect, it, vi } from 'vitest';

import { quarterbackCard, runningBackCard } from '../test/playerCards';

import { PlayerCardController, closePlayerCard, openPlayerCard, playerCards } from './playerCard';

/**
 * A minimal stand-in for the two things this module reads off a `Response`. jsdom ships no
 * `fetch`, so the suite supplies both sides of the call rather than the environment.
 */
const jsonResponse = (body: unknown, status = 200): unknown => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const stubFetch = (impl: (url: string) => unknown): ReturnType<typeof vi.fn> => {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

/** A promise plus its resolver, for pinning down what happens while a request is in flight. */
const deferred = <T>(): { promise: Promise<T>; resolve: (value: T) => void } => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

const settle = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

afterEach(() => {
  closePlayerCard();
  vi.unstubAllGlobals();
});

describe('PlayerCardController', () => {
  it('starts closed and renders nothing until a player is opened', () => {
    const controller = new PlayerCardController();

    expect(controller.getState()).toEqual({
      playerId: null,
      status: 'closed',
      card: null,
      error: null,
    });
  });

  it('fetches the player’s game log on open and lands the card the server sent', async () => {
    const fetchMock = stubFetch(() => jsonResponse(runningBackCard()));
    const controller = new PlayerCardController();

    controller.open('9221');
    expect(controller.getState()).toEqual({
      playerId: '9221',
      status: 'loading',
      card: null,
      error: null,
    });

    await settle();

    expect(fetchMock).toHaveBeenCalledWith('/api/player/9221/gamelog');
    expect(controller.getState().status).toBe('ready');
    expect(controller.getState().card).toEqual(runningBackCard());
  });

  it('notifies subscribers on every transition and stops once unsubscribed', async () => {
    stubFetch(() => jsonResponse(runningBackCard()));
    const controller = new PlayerCardController();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    controller.open('9221');
    await settle();
    expect(listener).toHaveBeenCalledTimes(2); // loading, then ready

    unsubscribe();
    controller.close();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('returns a stable state reference between changes, for useSyncExternalStore', async () => {
    stubFetch(() => jsonResponse(runningBackCard()));
    const controller = new PlayerCardController();

    controller.open('9221');
    await settle();

    expect(controller.getState()).toBe(controller.getState());
  });

  it('re-opening the player already on screen does not refetch', async () => {
    const fetchMock = stubFetch(() => jsonResponse(runningBackCard()));
    const controller = new PlayerCardController();

    controller.open('9221');
    await settle();
    controller.open('9221');
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(controller.getState().status).toBe('ready');
  });

  it('opening a different player replaces the card rather than merging into it', async () => {
    const fetchMock = stubFetch((url) =>
      jsonResponse(url.includes('9221') ? runningBackCard() : quarterbackCard()),
    );
    const controller = new PlayerCardController();

    controller.open('9221');
    await settle();
    controller.open('4984');
    expect(controller.getState().card).toBeNull(); // the previous player's log is gone at once

    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(controller.getState().card?.playerName).toBe('Josh Allen');
  });

  it('surfaces the server’s own message when the route refuses (409, no draft attached)', async () => {
    stubFetch(() => jsonResponse({ error: 'No draft is attached.' }, 409));
    const controller = new PlayerCardController();

    controller.open('9221');
    await settle();

    expect(controller.getState().status).toBe('error');
    expect(controller.getState().error).toBe('No draft is attached.');
  });

  it('falls back to naming the status code when the failure carries no message', async () => {
    stubFetch(() => jsonResponse(null, 500));
    const controller = new PlayerCardController();

    controller.open('9221');
    await settle();

    expect(controller.getState().error).toMatch(/HTTP 500/);
  });

  it('reports an unreachable server rather than throwing into the render tree', async () => {
    stubFetch(() => {
      throw new Error('connection refused');
    });
    const controller = new PlayerCardController();

    controller.open('9221');
    await settle();

    expect(controller.getState().status).toBe('error');
    expect(controller.getState().error).toMatch(/connection refused/);
  });

  it('retries the same player after a failure', async () => {
    let attempt = 0;
    const fetchMock = stubFetch(() => {
      attempt += 1;
      return attempt === 1 ? jsonResponse(null, 500) : jsonResponse(runningBackCard());
    });
    const controller = new PlayerCardController();

    controller.open('9221');
    await settle();
    expect(controller.getState().status).toBe('error');

    controller.open('9221');
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(controller.getState().status).toBe('ready');
  });

  it('drops a response that arrives after the card was closed', async () => {
    const pending = deferred<unknown>();
    stubFetch(() => pending.promise);
    const controller = new PlayerCardController();

    controller.open('9221');
    controller.close();
    pending.resolve(jsonResponse(runningBackCard()));
    await settle();

    expect(controller.getState()).toEqual({
      playerId: null,
      status: 'closed',
      card: null,
      error: null,
    });
  });

  it('drops a slow first response so it cannot overwrite the player opened after it', async () => {
    const slow = deferred<unknown>();
    stubFetch((url) =>
      url.includes('9221') ? slow.promise : Promise.resolve(jsonResponse(quarterbackCard())),
    );
    const controller = new PlayerCardController();

    controller.open('9221'); // slow
    controller.open('4984'); // resolves first
    await settle();
    expect(controller.getState().card?.playerName).toBe('Josh Allen');

    slow.resolve(jsonResponse(runningBackCard()));
    await settle();

    expect(controller.getState().card?.playerName).toBe('Josh Allen');
  });

  it('encodes the player id into the path', async () => {
    const fetchMock = stubFetch(() => jsonResponse(runningBackCard()));
    const controller = new PlayerCardController();

    controller.open('a b/c');
    await settle();

    expect(fetchMock).toHaveBeenCalledWith('/api/player/a%20b%2Fc/gamelog');
  });
});

describe('the shared controller every panel opens the card through', () => {
  it('openPlayerCard / closePlayerCard drive the one card the draft screen mounts', async () => {
    stubFetch(() => jsonResponse(runningBackCard()));

    openPlayerCard('9221');
    await settle();
    expect(playerCards.getState().card?.playerName).toBe('Jahmyr Gibbs');

    closePlayerCard();
    expect(playerCards.getState().playerId).toBeNull();
  });
});
