/**
 * Which player's card is open, and what it holds (FR-11).
 *
 * AC-61 is "one click from any candidate row, pick-feed entry, or roster entry opens that
 * player's card **without leaving the draft screen**", so the card is an overlay driven by local
 * UI state, never a route. That state cannot live inside any one panel — three different panels
 * open the same card — so it lives here, as one tiny external store the draft screen's
 * `PlayerCardHost` subscribes to and every row calls into:
 *
 * ```tsx
 * import { openPlayerCard } from '../state/playerCard';
 * <button onClick={() => { openPlayerCard(row.playerId); }}>{row.playerName}</button>
 * ```
 *
 * The same `useSyncExternalStore` shape as `state/store.ts`, and for the same reason: a component
 * re-renders on an actual change and on nothing else, with no state library for what is one
 * assignment. It is deliberately **separate** from the SSE store — the open card is browser-local
 * UI state that no server frame may disturb, and a wholesale snapshot replacement mid-read must
 * not close a card the user is still looking at.
 *
 * This is the only surface in the app that fetches display data over REST rather than receiving
 * it on the stream. That is the right shape here and not a hole in the full-state-replace
 * principle: a game log is immutable history, it is not part of the board, and shipping every
 * player's log in every snapshot to serve the handful a user clicks would be absurd.
 */
import { useSyncExternalStore } from 'react';
import type { PlayerCard } from '@sidekick/shared';

/** `closed` is the only status with a null `playerId`; the three others always carry one. */
export type PlayerCardStatus = 'closed' | 'loading' | 'ready' | 'error';

export interface PlayerCardState {
  /** The open player, or null when no card is open. */
  playerId: string | null;
  status: PlayerCardStatus;
  /** T9's payload, verbatim — the card renders it and reshapes nothing. */
  card: PlayerCard | null;
  error: string | null;
}

const CLOSED: PlayerCardState = { playerId: null, status: 'closed', card: null, error: null };

export const gamelogUrl = (playerId: string): string =>
  `/api/player/${encodeURIComponent(playerId)}/gamelog`;

const readJson = async (response: { json(): Promise<unknown> }): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

export class PlayerCardController {
  private state: PlayerCardState = CLOSED;
  private readonly listeners = new Set<() => void>();

  /**
   * Bumped by every `open` and every `close`. A response whose sequence is no longer current is
   * dropped — which is what keeps a slow first click from overwriting a fast second one, and
   * keeps a response that lands after the card was closed from re-opening it.
   */
  private sequence = 0;

  /**
   * Opens the card for one player, fetching the log if it is not already the one on screen.
   *
   * Re-opening the player already shown is a no-op, so a double click does not re-fetch and
   * blank the table; re-opening one that *failed* does retry, which is what the card's own
   * "Try again" calls.
   */
  readonly open = (playerId: string): void => {
    if (playerId === '') return;
    if (this.state.playerId === playerId && this.state.status !== 'error') return;

    const sequence = ++this.sequence;
    this.setState({ playerId, status: 'loading', card: null, error: null });
    void this.load(playerId, sequence);
  };

  /** An arrow, like `getState`/`subscribe`, so the card can hand it straight to a click handler. */
  readonly close = (): void => {
    this.sequence += 1;
    this.setState(CLOSED);
  };

  readonly getState = (): PlayerCardState => this.state;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private async load(playerId: string, sequence: number): Promise<void> {
    try {
      const response = await fetch(gamelogUrl(playerId));
      const payload = await readJson(response);
      if (sequence !== this.sequence) return;

      if (!response.ok) {
        const message = (payload as { error?: string } | null)?.error;
        this.setState({
          playerId,
          status: 'error',
          card: null,
          error: message ?? `Could not load this game log (HTTP ${response.status}).`,
        });
        return;
      }

      this.setState({ playerId, status: 'ready', card: payload as PlayerCard, error: null });
    } catch (error) {
      if (sequence !== this.sequence) return;
      this.setState({
        playerId,
        status: 'error',
        card: null,
        error: `Could not reach the Sidekick server: ${(error as Error).message}`,
      });
    }
  }

  private setState(next: PlayerCardState): void {
    this.state = next;
    for (const listener of this.listeners) listener();
  }
}

/** The one card the draft screen mounts. Every panel's row opens this one. */
export const playerCards = new PlayerCardController();

/**
 * **The open hook every panel calls.** One click on a candidate row, a pick-feed entry or a
 * roster entry opens that player's card over the draft screen (AC-61).
 */
export const openPlayerCard = (playerId: string): void => {
  playerCards.open(playerId);
};

export const closePlayerCard = (): void => {
  playerCards.close();
};

/** Subscribes a component to the open card. Re-renders only when that card actually changes. */
export function usePlayerCard(controller: PlayerCardController = playerCards): PlayerCardState {
  return useSyncExternalStore(controller.subscribe, controller.getState);
}
