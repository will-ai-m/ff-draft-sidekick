/**
 * The browser's only write surface: attach, slot choice, re-sync, detach, plus AC-3's draft list.
 *
 * Everything the app *displays* arrives over SSE — these calls exist to move the server, not to
 * fetch state. Each one's effect comes back on the stream like any other change, so nothing here
 * ever writes into the store. That is what keeps a single answer to "what is on the board".
 */
import type { AppStateSnapshot } from '@sidekick/shared';

/** Where the browser keeps the Sleeper username AC-3's convenience list is gated on. */
export const STORED_USERNAME_KEY = 'sidekick.sleeperUsername';

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

/** One row of AC-3's convenience list; mirrors the server's own `UserDraftSummary`. */
export interface DraftSummary {
  draftId: string;
  name: string | null;
  status: string;
  season: string;
  type: string;
  teamCount: number;
  isMock: boolean;
  startTime: number | null;
}

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
}): Promise<AttachResult> {
  const body: Record<string, string> = { input: request.input };
  if ((request.sleeperUsername ?? '') !== '') body['sleeperUsername'] = request.sleeperUsername!;

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

export async function fetchUserDrafts(username: string): Promise<DraftSummary[]> {
  const response = await fetch(`/api/drafts?username=${encodeURIComponent(username)}`);
  const payload = (await readJson(response)) as { drafts?: DraftSummary[]; error?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.error ?? `Could not list drafts (HTTP ${response.status}).`);
  }
  return payload?.drafts ?? [];
}

export const readStoredUsername = (): string => {
  try {
    return window.localStorage.getItem(STORED_USERNAME_KEY) ?? '';
  } catch {
    return '';
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
