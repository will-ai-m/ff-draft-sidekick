/**
 * The browser's write surface: draft-session controls plus the isolated, read-only adviser chat.
 *
 * Everything the app *displays* arrives over SSE — these calls exist to move the server, not to
 * fetch state. Draft controls come back on the stream like any other change, so nothing here ever
 * writes into the store. Chat has its own ephemeral credential/session calls and never mutates the
 * draft snapshot. That keeps a single answer to "what is on the board".
 */
import { isRankingsFormat } from '@sidekick/shared';
import type {
  AppStateSnapshot,
  DraftChatError,
  DraftChatMessage,
  DraftChatProvider,
  DraftChatResponse,
  DraftChatSessionStatus,
  RankingsFormat,
} from '@sidekick/shared';

/** Where the browser keeps the Sleeper username AC-3's convenience list is gated on. */
export const STORED_USERNAME_KEY = 'sidekick.sleeperUsername';

/**
 * Where the browser remembers the rankings format last chosen (2026-09-02), so the toggle opens
 * where the user left it. The server's config default is the fallback when nothing is stored.
 */
export const STORED_RANKINGS_FORMAT_KEY = 'sidekick.rankingsFormat';

/**
 * The classified failure the attach route answers with. `input` is echoed back by the server
 * precisely so a retry never has to reconstruct what the user typed (AC-7).
 */
export interface AttachFailure {
  kind: string;
  message: string;
  input: string;
}

export type AttachResult =
  { ok: true; snapshot: AppStateSnapshot } | { ok: false; failure: AttachFailure };

export interface ResyncResult {
  ok: boolean;
  durationMs: number | null;
  boardVersion: number | null;
  error: string | null;
}

const postJson = async (url: string, body: unknown): Promise<Response> =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

/**
 * Turns any non-2xx into the same `{kind, message, input}` shape the route uses, so the screen has
 * one failure surface rather than one per transport accident.
 */
const asFailure = (payload: unknown, fallback: string, input: string): AttachFailure => {
  const failure = (payload as { failure?: Partial<AttachFailure> } | null)?.failure;
  return {
    kind: failure?.kind ?? 'unknown',
    message: failure?.message ?? fallback,
    input: failure?.input ?? input,
  };
};

export async function postAttach(request: {
  input: string;
  sleeperUsername?: string;
  /** The board, tiers and ADP pool to draft on (2026-09-02); the server default when omitted. */
  rankingsFormat?: RankingsFormat;
}): Promise<AttachResult> {
  const body: Record<string, string> = { input: request.input };
  if ((request.sleeperUsername ?? '') !== '') body['sleeperUsername'] = request.sleeperUsername!;
  if (request.rankingsFormat !== undefined) body['rankingsFormat'] = request.rankingsFormat;

  try {
    const response = await postJson('/api/attach', body);
    const payload = await readJson(response);
    if (!response.ok) {
      return {
        ok: false,
        failure: asFailure(payload, `Attach failed (HTTP ${response.status}).`, request.input),
      };
    }
    return { ok: true, snapshot: payload as AppStateSnapshot };
  } catch (error) {
    return {
      ok: false,
      failure: {
        kind: 'api-unreachable',
        message: `Could not reach the Sidekick server: ${(error as Error).message}`,
        input: request.input,
      },
    };
  }
}

/** AC-5's follow-up on the draft already attached — same route, a body with no `input`. */
export async function postDraftSlot(draftSlot: number): Promise<AttachResult> {
  try {
    const response = await postJson('/api/attach', { draftSlot });
    const payload = await readJson(response);
    if (!response.ok) {
      return {
        ok: false,
        failure: asFailure(payload, `Could not select slot ${draftSlot}.`, ''),
      };
    }
    return { ok: true, snapshot: payload as AppStateSnapshot };
  } catch (error) {
    return {
      ok: false,
      failure: {
        kind: 'api-unreachable',
        message: `Could not reach the Sidekick server: ${(error as Error).message}`,
        input: '',
      },
    };
  }
}

/**
 * Switches the attached draft's rankings format (2026-09-02) — same route, a body with no
 * `input`. The server re-attaches the draft on the other format's sources and answers with the
 * new snapshot; the seat is kept. Only the attach screen calls this, before Start drafting.
 */
export async function postRankingsFormat(format: RankingsFormat): Promise<AttachResult> {
  try {
    const response = await postJson('/api/attach', { rankingsFormat: format });
    const payload = await readJson(response);
    if (!response.ok) {
      return {
        ok: false,
        failure: asFailure(payload, `Could not switch the rankings format to ${format}.`, ''),
      };
    }
    return { ok: true, snapshot: payload as AppStateSnapshot };
  } catch (error) {
    return {
      ok: false,
      failure: {
        kind: 'api-unreachable',
        message: `Could not reach the Sidekick server: ${(error as Error).message}`,
        input: '',
      },
    };
  }
}

export async function postResync(): Promise<ResyncResult> {
  try {
    const response = await postJson('/api/resync', {});
    const payload = (await readJson(response)) as {
      ok?: boolean;
      durationMs?: number;
      boardVersion?: number;
      failure?: { message?: string } | null;
      error?: string;
    } | null;

    if (!response.ok) {
      return {
        ok: false,
        durationMs: null,
        boardVersion: null,
        error: payload?.error ?? `Re-sync failed (HTTP ${response.status}).`,
      };
    }
    return {
      ok: payload?.ok ?? false,
      durationMs: payload?.durationMs ?? null,
      boardVersion: payload?.boardVersion ?? null,
      error: payload?.ok === true ? null : (payload?.failure?.message ?? 'Re-sync did not finish.'),
    };
  } catch (error) {
    return {
      ok: false,
      durationMs: null,
      boardVersion: null,
      error: `Could not reach the Sidekick server: ${(error as Error).message}`,
    };
  }
}

/** AC-41's explicit trigger — the draft-ended half is the server's own. */
export async function postDetach(): Promise<void> {
  await postJson('/api/detach', {});
}

export type DraftChatResult =
  | { ok: true; response: DraftChatResponse }
  | { ok: false; failure: DraftChatError };

/** Ask against the server's current authoritative draft state; no snapshot is trusted from here. */
export async function postDraftChat(
  message: string,
  history: DraftChatMessage[],
): Promise<DraftChatResult> {
  try {
    const response = await postJson('/api/chat', { message, history });
    const payload = (await readJson(response)) as Partial<DraftChatResponse & DraftChatError> | null;
    if (!response.ok) {
      return {
        ok: false,
        failure: {
          code: payload?.code ?? 'model-error',
          error: payload?.error ?? `Draft chat failed (HTTP ${response.status}).`,
        },
      };
    }
    return {
      ok: true,
      response: {
        answer: payload?.answer ?? 'Sidekick returned an empty answer.',
        provider: payload?.provider ?? 'openai',
        model: payload?.model ?? 'unknown',
        boardVersion: payload?.boardVersion ?? 0,
      },
    };
  } catch (error) {
    return {
      ok: false,
      failure: {
        code: 'model-error',
        error: `Could not reach the draft adviser: ${(error as Error).message}`,
      },
    };
  }
}

export type DraftChatSessionResult =
  | { ok: true; status: DraftChatSessionStatus }
  | { ok: false; error: string };

const asChatSessionStatus = (payload: unknown): DraftChatSessionStatus => {
  const value = payload as Partial<DraftChatSessionStatus> | null;
  return {
    configured: value?.configured === true,
    provider: value?.provider === 'openai' || value?.provider === 'anthropic' ? value.provider : null,
    model: typeof value?.model === 'string' ? value.model : null,
    expiresAfterMinutes:
      typeof value?.expiresAfterMinutes === 'number' ? value.expiresAfterMinutes : 30,
  };
};

export async function getDraftChatSession(): Promise<DraftChatSessionResult> {
  try {
    const response = await fetch('/api/chat/session');
    const payload = await readJson(response);
    return response.ok
      ? { ok: true, status: asChatSessionStatus(payload) }
      : { ok: false, error: 'Could not read the chat-key session.' };
  } catch (error) {
    return { ok: false, error: `Could not reach the chat-key session: ${(error as Error).message}` };
  }
}

export async function connectDraftChatKey(request: {
  provider: DraftChatProvider;
  apiKey: string;
  model?: string;
}): Promise<DraftChatSessionResult> {
  try {
    const response = await postJson('/api/chat/session', request);
    const payload = await readJson(response);
    if (!response.ok) {
      return {
        ok: false,
        error:
          (payload as { error?: string } | null)?.error ??
          `Could not connect the key (HTTP ${response.status}).`,
      };
    }
    return { ok: true, status: asChatSessionStatus(payload) };
  } catch (error) {
    return { ok: false, error: `Could not connect the key: ${(error as Error).message}` };
  }
}

export async function forgetDraftChatKey(): Promise<void> {
  await fetch('/api/chat/session', { method: 'DELETE' });
}

/** Best-effort cleanup for a tab/window exit; inactivity expiry remains the hard backstop. */
export const forgetDraftChatKeyOnExit = (): void => {
  if (typeof navigator.sendBeacon === 'function') {
    navigator.sendBeacon('/api/chat/session/forget', new Blob([], { type: 'application/json' }));
  }
};

export const readStoredUsername = (): string => {
  try {
    return window.localStorage.getItem(STORED_USERNAME_KEY) ?? '';
  } catch {
    return '';
  }
};

export const readStoredRankingsFormat = (): RankingsFormat | null => {
  try {
    const stored = window.localStorage.getItem(STORED_RANKINGS_FORMAT_KEY);
    return isRankingsFormat(stored) ? stored : null;
  } catch {
    return null;
  }
};

export const writeStoredRankingsFormat = (format: RankingsFormat): void => {
  try {
    window.localStorage.setItem(STORED_RANKINGS_FORMAT_KEY, format);
  } catch {
    // Storage disabled: the toggle simply opens on the server default next time.
  }
};

export const writeStoredUsername = (username: string): void => {
  try {
    if (username === '') window.localStorage.removeItem(STORED_USERNAME_KEY);
    else window.localStorage.setItem(STORED_USERNAME_KEY, username);
  } catch {
    // A browser with storage disabled simply never gets the convenience list; paste still works.
  }
};
