/**
 * Attach — FR-1.
 *
 * Takes a pasted Sleeper draft URL or raw id, performs the full initial ingest, resolves the
 * user's own seat, and hands back a live session. Three rules the acceptance criteria make
 * non-negotiable:
 *
 *  - **One draft per process (AC-6).** A second attach while attached is refused, not silently
 *    swapped; a second concurrent draft means a second `npm start` on a second port.
 *  - **Say which failure happened, keep what was typed (AC-7).** Every failure is classified and
 *    echoes the exact input back, so the attach screen can re-present it without clearing the
 *    field. Nothing here ever mutates or discards the user's input.
 *  - **Never guess the user's seat (AC-5).** If the stored user id is absent from `draft_order`,
 *    the session reports `needs-manual-slot` — a first-class state that blocks mine-vs-opponent,
 *    next-pick and survival output — rather than defaulting to a slot.
 */

import type { AttachState, ParameterValues } from '@sidekick/shared';

import type { Observability } from '../observability';
import { SleeperApiError } from './client';
import type { SleeperClient } from './client';
import type { PollIntervalController } from './instanceHeartbeat';
import { BoardSync, performFullIngest } from './sync';

/** Sleeper draft ids are long numeric snowflakes; nothing shorter is a plausible id. */
const DRAFT_ID_PATTERN = /^\d{6,}$/;

/**
 * Extracts the draft id from a pasted draft-room URL, or accepts a raw id. Returns null when the
 * input carries no draft id at all, which is a distinct failure from "that draft does not exist".
 */
export function parseDraftId(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;

  const withoutQuery = trimmed.split(/[?#]/)[0] ?? '';
  const segments = withoutQuery.split('/').filter((segment) => segment !== '');

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index]!;
    if (DRAFT_ID_PATTERN.test(segment)) return segment;
  }
  return null;
}

export type AttachFailureKind =
  | 'invalid-input'
  | 'draft-not-found'
  | 'api-unreachable'
  | 'malformed-response'
  | 'timeout'
  | 'already-attached'
  | 'budget-exhausted'
  | 'unknown';

export interface AttachFailure {
  kind: AttachFailureKind;
  message: string;
  /** Echoed back verbatim so the attach screen can retry without discarding it (AC-7). */
  input: string;
}

export interface DraftSession {
  draftId: string;
  isMock: boolean;
  sync: BoardSync;
  /** True while AC-5's manual slot choice is outstanding. */
  needsManualSlot: boolean;
}

export type AttachResult =
  | { ok: true; session: DraftSession; attach: AttachState }
  | { ok: false; failure: AttachFailure; attach: AttachState };

export interface AttachRequest {
  /** The pasted URL or raw draft id, exactly as the user entered it. */
  input: string;
  /** A stored Sleeper user id, used to find the user's seat in `draft_order` (AC-5). */
  sleeperUserId?: string | null;
  /** A stored username, resolved to a user id when no id was stored (AC-3's stored username). */
  sleeperUsername?: string | null;
}

/** One row of AC-3's convenience list of the stored username's discoverable season drafts. */
export interface UserDraftSummary {
  draftId: string;
  name: string | null;
  status: string;
  season: string;
  type: string;
  teamCount: number;
  isMock: boolean;
  startTime: number | null;
}

export type AttachConfig = Pick<
  ParameterValues,
  'pollIntervalMs' | 'pickReflectionLatencyMs' | 'resyncTimeoutMs' | 'initialIngestTimeoutMs'
>;

export interface AttachManagerOptions {
  client: SleeperClient;
  config: AttachConfig;
  observability?: Observability;
  intervalController?: PollIntervalController;
  now?: () => number;
}

const FAILURE_KIND_BY_API_ERROR: Readonly<Record<string, AttachFailureKind>> = {
  'not-found': 'draft-not-found',
  network: 'api-unreachable',
  'http-error': 'api-unreachable',
  'rate-limited': 'api-unreachable',
  timeout: 'timeout',
  malformed: 'malformed-response',
  'budget-exhausted': 'budget-exhausted',
};

const classify = (error: unknown, input: string): AttachFailure => {
  if (error instanceof SleeperApiError) {
    return {
      kind: FAILURE_KIND_BY_API_ERROR[error.kind] ?? 'unknown',
      message: error.message,
      input,
    };
  }
  return { kind: 'unknown', message: (error as Error).message, input };
};

/** Owns the single attached draft for this process. */
export class AttachManager {
  private readonly options: AttachManagerOptions;
  private current: DraftSession | null = null;
  private state: AttachState = { status: 'not-attached' };

  constructor(options: AttachManagerOptions) {
    this.options = options;
  }

  get session(): DraftSession | null {
    return this.current;
  }

  attachState(): AttachState {
    return this.state;
  }

  private fail(failure: AttachFailure, keepState = false): AttachResult {
    if (!keepState) this.state = { status: 'error', error: failure.message };
    return { ok: false, failure, attach: this.state };
  }

  async attach(request: AttachRequest): Promise<AttachResult> {
    const { input } = request;

    if (this.current !== null) {
      return this.fail(
        {
          kind: 'already-attached',
          message:
            `Already attached to draft ${this.current.draftId}. Sidekick follows one draft per ` +
            'running instance — start a second instance on another port to follow another draft.',
          input,
        },
        true,
      );
    }

    const draftId = parseDraftId(input);
    if (draftId === null) {
      return this.fail({
        kind: 'invalid-input',
        message: `"${input}" does not contain a Sleeper draft id. Paste a draft URL or the id itself.`,
        input,
      });
    }

    this.state = { status: 'attaching', draftId };

    const { client, config } = this.options;
    let userId = request.sleeperUserId ?? null;
    try {
      if (userId === null && (request.sleeperUsername ?? '') !== '') {
        userId = (await client.getUser(request.sleeperUsername!)).user_id;
      }
    } catch {
      // A stored username that no longer resolves must not block attaching: fall through with no
      // user id and let AC-5's manual slot choice handle it.
      userId = null;
    }

    let session: DraftSession;
    try {
      const ingest = await performFullIngest(client, draftId, {
        timeoutMs: config.initialIngestTimeoutMs,
      });
      const sync = new BoardSync({
        client,
        config,
        ingest,
        userId,
        observability: this.options.observability,
        intervalController: this.options.intervalController,
        now: this.options.now,
      });
      session = {
        draftId,
        isMock: sync.state.meta.isMock,
        sync,
        needsManualSlot: sync.state.userTeamId === null,
      };
    } catch (error) {
      return this.fail(classify(error, input));
    }

    this.current = session;
    this.state = this.stateFor(session);
    return { ok: true, session, attach: this.state };
  }

  /** Resolves AC-5's manual slot choice and unblocks the mine-vs-opponent outputs. */
  selectSlot(draftSlot: number): AttachResult {
    const session = this.current;
    if (session === null) {
      return this.fail(
        {
          kind: 'invalid-input',
          message: 'No draft is attached, so there is no slot to select.',
          input: String(draftSlot),
        },
        true,
      );
    }

    const { teamCount } = session.sync.state.meta;
    if (!Number.isInteger(draftSlot) || draftSlot < 1 || draftSlot > teamCount) {
      return this.fail(
        {
          kind: 'invalid-input',
          message: `Slot ${draftSlot} is outside this ${teamCount}-team draft.`,
          input: String(draftSlot),
        },
        true,
      );
    }

    session.sync.setUserSlot(draftSlot);
    session.needsManualSlot = false;
    this.state = this.stateFor(session);
    return { ok: true, session, attach: this.state };
  }

  /**
   * Tears the session down. Everything scoped to one attach — the board, the poll loop and (per
   * AC-41) whatever downstream state hangs off this session — dies with it.
   */
  detach(): void {
    this.current?.sync.stop();
    this.current = null;
    this.state = { status: 'not-attached' };
  }

  /**
   * AC-3's convenience list. Paste stays the primary path; this is only offered when a username is
   * already stored. The season comes from Sleeper's own state rather than the calendar year, which
   * diverge for months either side of the league rollover.
   */
  async listUserDrafts(username: string, season?: string): Promise<UserDraftSummary[]> {
    const { client } = this.options;
    const user = await client.getUser(username);
    const resolvedSeason = season ?? (await this.currentSeason());
    const drafts = await client.getUserDrafts(user.user_id, resolvedSeason);

    return drafts.map((draft) => ({
      draftId: draft.draft_id,
      name: draft.metadata?.name ?? null,
      status: draft.status,
      season: draft.season,
      type: draft.type,
      teamCount: draft.settings.teams,
      isMock: (draft.league_id ?? null) === null,
      startTime: draft.start_time ?? null,
    }));
  }

  private async currentSeason(): Promise<string> {
    const state = await this.options.client.getNflState();
    return state.league_season ?? state.season;
  }

  private stateFor(session: DraftSession): AttachState {
    const userTeamId = session.sync.state.userTeamId;
    if (userTeamId === null) {
      return { status: 'needs-manual-slot', draftId: session.draftId, isMock: session.isMock };
    }
    return {
      status: 'attached',
      draftId: session.draftId,
      isMock: session.isMock,
      userTeamId,
    };
  }
}
