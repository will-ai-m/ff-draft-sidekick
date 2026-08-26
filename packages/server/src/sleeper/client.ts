/**
 * Typed, budgeted, schema-validated access to Sleeper's public read-only API.
 *
 * Every shape below was verified live against `api.sleeper.app` and `docs.sleeper.com` on
 * 2026-08-22 (see `.work/001-draft-sidekick-v1/dev-notes-T2.md` for what was checked and how).
 * Two findings drive the leniency here and must not be "tidied up":
 *
 *  1. **Per-position slot keys are optional.** A live 12-team draft carried no `slots_k` at all.
 *     A missing key means zero slots, not a default league shape.
 *  2. **`roster_id` is not a stable type.** The docs show it as a string on picks, a live draft
 *     returns a number, and a mock returns `null`. Sidekick never reads it for attribution
 *     (✅ AS-1 / AC-4 key on `draft_slot` + `draft_order`), so the schema simply tolerates all three.
 *
 * Every response is parsed through Zod before it reaches the rest of the app, so a malformed
 * payload surfaces as a typed error rather than a crash or a partial state apply (AC-18).
 */

import { z } from 'zod';

export const SLEEPER_BASE_URL = 'https://api.sleeper.app';

// ---------------------------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------------------------

/**
 * The draft object's own `settings` — the single source for roster slot structure on both mocks
 * and real leagues (a mock has no league whose `roster_positions` we could read instead).
 */
export const sleeperDraftSettingsSchema = z
  .object({
    teams: z.number(),
    rounds: z.number(),
    slots_qb: z.number().optional(),
    slots_rb: z.number().optional(),
    slots_wr: z.number().optional(),
    slots_te: z.number().optional(),
    slots_flex: z.number().optional(),
    slots_k: z.number().optional(),
    slots_def: z.number().optional(),
    slots_bn: z.number().optional(),
    pick_timer: z.number().optional(),
  })
  .passthrough();

export const sleeperDraftSchema = z
  .object({
    draft_id: z.string(),
    /** `null` on a mock draft — the clean mock detector (✅ AS-1). */
    league_id: z.string().nullish(),
    status: z.string(),
    type: z.string(),
    season: z.string(),
    season_type: z.string().nullish(),
    sport: z.string().nullish(),
    start_time: z.number().nullish(),
    settings: sleeperDraftSettingsSchema,
    /**
     * A mock carries only the coarse `scoring_type` label and no granular per-stat dict; the
     * granular one lives on `/v1/league/<id>` and so exists for real leagues only.
     */
    metadata: z
      .object({
        scoring_type: z.string().nullish(),
        name: z.string().nullish(),
        description: z.string().nullish(),
      })
      .passthrough()
      .nullish(),
    /** user_id -> draft slot. A mock knows only the human seat; can be absent entirely. */
    draft_order: z.record(z.string(), z.number()).nullish(),
    /** draft slot -> roster_id. Never the identity map; `null` when there is no league. */
    slot_to_roster_id: z.record(z.string(), z.number()).nullish(),
  })
  .passthrough();

export const sleeperPickSchema = z
  .object({
    player_id: z.string(),
    pick_no: z.number(),
    round: z.number(),
    draft_slot: z.number(),
    /** `""` for a bot seat on a mock. Never used for attribution. */
    picked_by: z.string().nullish(),
    /** number on a live real league, string in the docs, `null` on a mock. Never read. */
    roster_id: z.union([z.number(), z.string()]).nullish(),
    is_keeper: z.boolean().nullish(),
    draft_id: z.string().nullish(),
    /** Full player metadata rides along, so the pick feed needs no player-dump join to render. */
    metadata: z
      .object({
        first_name: z.string().nullish(),
        last_name: z.string().nullish(),
        position: z.string().nullish(),
        team: z.string().nullish(),
        status: z.string().nullish(),
        injury_status: z.string().nullish(),
        years_exp: z.string().nullish(),
        number: z.string().nullish(),
        player_id: z.string().nullish(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough();

export const sleeperPickListSchema = z.array(sleeperPickSchema);

/** Traded picks are expressed in roster ids, so resolving one needs `slot_to_roster_id`. */
export const sleeperTradedPickSchema = z
  .object({
    season: z.string(),
    round: z.number(),
    /** roster_id of the ORIGINAL owner. */
    roster_id: z.number(),
    previous_owner_id: z.number().nullish(),
    /** roster_id of the CURRENT owner. */
    owner_id: z.number(),
  })
  .passthrough();

export const sleeperTradedPickListSchema = z.array(sleeperTradedPickSchema);

/**
 * The league object. It is the **only** place a granular per-stat `scoring_settings` dict exists
 * (live-verified 2026-08-22 on league `289646328504385536`: 81 numeric keys), which is why FR-5
 * fetches it for a real league. A mock has `league_id: null` and therefore no league at all.
 * `scoring_settings` is nullish here because a caller must degrade rather than crash when Sleeper
 * answers without one.
 */
export const sleeperLeagueSchema = z
  .object({
    league_id: z.string(),
    name: z.string().nullish(),
    season: z.string().nullish(),
    status: z.string().nullish(),
    total_rosters: z.number().nullish(),
    /** Per-stat point values, e.g. `{pass_td: 6, rec: 0.5}`. Keys are absent, never zero-filled. */
    scoring_settings: z.record(z.string(), z.number()).nullish(),
    /** Starting-lineup shape as a flat array; Sidekick reads slots from the draft object instead. */
    roster_positions: z.array(z.string()).nullish(),
  })
  .passthrough();

export const sleeperLeagueUserSchema = z
  .object({
    user_id: z.string(),
    display_name: z.string().nullish(),
    is_bot: z.boolean().nullish(),
    metadata: z.object({ team_name: z.string().nullish() }).passthrough().nullish(),
  })
  .passthrough();

export const sleeperLeagueUserListSchema = z.array(sleeperLeagueUserSchema);

export const sleeperUserSchema = z
  .object({
    user_id: z.string(),
    username: z.string().nullish(),
    display_name: z.string().nullish(),
  })
  .passthrough();

export const sleeperNflStateSchema = z
  .object({ season: z.string(), league_season: z.string().nullish() })
  .passthrough();

export const sleeperPlayerSchema = z
  .object({
    player_id: z.string(),
    /** Sleeper spells a team defense `DEF`; the Terms vocabulary spells it `DST`. */
    position: z.string().nullish(),
    first_name: z.string().nullish(),
    last_name: z.string().nullish(),
    full_name: z.string().nullish(),
    team: z.string().nullish(),
    search_full_name: z.string().nullish(),
    fantasy_positions: z.array(z.string()).nullish(),
    active: z.boolean().nullish(),
  })
  .passthrough();

export const sleeperPlayerDumpSchema = z.record(z.string(), sleeperPlayerSchema);

export type SleeperDraftSettings = z.infer<typeof sleeperDraftSettingsSchema>;
export type SleeperDraft = z.infer<typeof sleeperDraftSchema>;
export type SleeperPick = z.infer<typeof sleeperPickSchema>;
export type SleeperTradedPick = z.infer<typeof sleeperTradedPickSchema>;
export type SleeperLeague = z.infer<typeof sleeperLeagueSchema>;
export type SleeperLeagueUser = z.infer<typeof sleeperLeagueUserSchema>;
export type SleeperUser = z.infer<typeof sleeperUserSchema>;
export type SleeperNflState = z.infer<typeof sleeperNflStateSchema>;
export type SleeperPlayer = z.infer<typeof sleeperPlayerSchema>;
export type SleeperPlayerDump = Record<string, SleeperPlayer>;

// ---------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------

/**
 * Which failure occurred — AC-7 requires the attach screen to *state* this, not just say
 * "something went wrong", and FR-3 treats them all alike (degraded + retry) but logs them apart.
 */
export type SleeperErrorKind =
  | 'network'
  | 'timeout'
  | 'not-found'
  | 'rate-limited'
  | 'http-error'
  | 'malformed'
  | 'budget-exhausted';

export class SleeperApiError extends Error {
  override readonly name = 'SleeperApiError';
  readonly kind: SleeperErrorKind;
  readonly endpoint: string;
  readonly status: number | undefined;

  constructor(kind: SleeperErrorKind, endpoint: string, message: string, status?: number) {
    super(message);
    this.kind = kind;
    this.endpoint = endpoint;
    this.status = status;
  }
}

// ---------------------------------------------------------------------------------------------
// Request budget (AC-10)
// ---------------------------------------------------------------------------------------------

/**
 * A rolling-minute ceiling on outbound Sleeper requests. The poll cadence already keeps the
 * steady state well under budget; this is the backstop that makes AC-10 true by construction
 * even when attach, Re-sync and the poll loop overlap.
 */
export class RequestBudget {
  private readonly timestamps: number[] = [];

  constructor(
    private readonly perMinute: number,
    private readonly now: () => number = Date.now,
  ) {}

  private prune(at: number): void {
    const cutoff = at - 60_000;
    while (this.timestamps.length > 0 && this.timestamps[0]! <= cutoff) this.timestamps.shift();
  }

  tryConsume(): boolean {
    const at = this.now();
    this.prune(at);
    if (this.timestamps.length >= this.perMinute) return false;
    this.timestamps.push(at);
    return true;
  }

  usedInWindow(): number {
    this.prune(this.now());
    return this.timestamps.length;
  }
}

// ---------------------------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------------------------

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** One outbound Sleeper request's outcome, as reported to {@link SleeperClientOptions.onRequest}. */
export interface SleeperRequestInfo {
  path: string;
  durationMs: number;
  ok: boolean;
  /** HTTP status when a response arrived; null when the failure happened before one did. */
  status: number | null;
  errorKind: SleeperErrorKind | null;
}

export interface SleeperClientOptions {
  baseUrl?: string;
  /** 🔶 AS-5 `apiBudgetPerMin`. */
  apiBudgetPerMin: number;
  /** Default per-request timeout; callers override per call (attach and Re-sync have their own). */
  requestTimeoutMs?: number;
  fetchImpl?: FetchLike;
  now?: () => number;
  /** Fired on any HTTP 429, so the poll-interval controller can back off reactively (AC-8). */
  onRateLimited?: () => void;
  /** Fired once per request with its outcome and latency — the trace file's network-level record. */
  onRequest?: (info: SleeperRequestInfo) => void;
}

export interface RequestOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

export class SleeperClient {
  readonly budget: RequestBudget;

  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly requestTimeoutMs: number;
  private readonly onRateLimited: (() => void) | undefined;
  private readonly onRequest: ((info: SleeperRequestInfo) => void) | undefined;
  private readonly now: () => number;

  private playerDump: SleeperPlayerDump | null = null;
  private playerDumpInFlight: Promise<SleeperPlayerDump> | null = null;

  constructor(options: SleeperClientOptions) {
    this.baseUrl = (options.baseUrl ?? SLEEPER_BASE_URL).replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.onRateLimited = options.onRateLimited;
    this.onRequest = options.onRequest;
    this.now = options.now ?? Date.now;
    this.budget = new RequestBudget(options.apiBudgetPerMin, this.now);
  }

  /** Fetches `path`, classifies every failure, and validates the body against `schema`. */
  private async request<T>(
    path: string,
    schema: z.ZodType<T>,
    options: RequestOptions,
    { nullMeansNotFound = true }: { nullMeansNotFound?: boolean } = {},
  ): Promise<T> {
    const startedAt = this.now();
    // Reported exactly once per call, on whichever outcome path ends it — including the budget
    // refusal below, which never reaches the network but is still a fact about this instance's
    // behaviour that a trace has to carry.
    const report = (ok: boolean, status: number | null, errorKind: SleeperErrorKind | null): void =>
      this.onRequest?.({ path, durationMs: this.now() - startedAt, ok, status, errorKind });

    if (!this.budget.tryConsume()) {
      report(false, null, 'budget-exhausted');
      throw new SleeperApiError(
        'budget-exhausted',
        path,
        `Refused to call ${path}: it would exceed the configured Sleeper request budget.`,
      );
    }

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, options.timeoutMs ?? this.requestTimeoutMs);
    const forwardAbort = (): void => controller.abort();
    options.signal?.addEventListener('abort', forwardAbort);

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, { signal: controller.signal });
    } catch (error) {
      if (timedOut) {
        report(false, null, 'timeout');
        throw new SleeperApiError('timeout', path, `${path} did not respond in time.`);
      }
      report(false, null, 'network');
      throw new SleeperApiError(
        'network',
        path,
        `Could not reach the Sleeper API (${path}): ${(error as Error).message}`,
      );
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', forwardAbort);
    }

    if (response.status === 429) {
      this.onRateLimited?.();
      report(false, 429, 'rate-limited');
      throw new SleeperApiError('rate-limited', path, `Sleeper rate-limited ${path}.`, 429);
    }
    if (response.status === 404) {
      report(false, 404, 'not-found');
      throw new SleeperApiError('not-found', path, `Sleeper has no ${path}.`, 404);
    }
    if (!response.ok) {
      report(false, response.status, 'http-error');
      throw new SleeperApiError(
        'http-error',
        path,
        `Sleeper returned HTTP ${response.status} for ${path}.`,
        response.status,
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      report(false, response.status, 'malformed');
      throw new SleeperApiError(
        'malformed',
        path,
        `Sleeper returned a body that is not JSON for ${path}: ${(error as Error).message}`,
      );
    }

    // Sleeper answers 200 with a `null` body for an id it does not know — including a mock draft
    // that has since been purged. That is a not-found, not a malformed payload.
    if (body === null && nullMeansNotFound) {
      report(false, response.status, 'not-found');
      throw new SleeperApiError('not-found', path, `Sleeper has no ${path}.`);
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      report(false, response.status, 'malformed');
      throw new SleeperApiError(
        'malformed',
        path,
        `Sleeper returned an unexpected payload for ${path}: ${parsed.error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join('.') || '(root)'} ${issue.message}`)
          .join('; ')}`,
      );
    }
    report(true, response.status, null);
    return parsed.data;
  }

  getDraft(draftId: string, options: RequestOptions = {}): Promise<SleeperDraft> {
    return this.request(`/v1/draft/${draftId}`, sleeperDraftSchema, options);
  }

  getDraftPicks(draftId: string, options: RequestOptions = {}): Promise<SleeperPick[]> {
    return this.request(`/v1/draft/${draftId}/picks`, sleeperPickListSchema, options);
  }

  getTradedPicks(draftId: string, options: RequestOptions = {}): Promise<SleeperTradedPick[]> {
    return this.request(`/v1/draft/${draftId}/traded_picks`, sleeperTradedPickListSchema, options);
  }

  /** The league object, for its granular `scoring_settings` dict (FR-5, AC-30). */
  getLeague(leagueId: string, options: RequestOptions = {}): Promise<SleeperLeague> {
    return this.request(`/v1/league/${leagueId}`, sleeperLeagueSchema, options);
  }

  getLeagueUsers(leagueId: string, options: RequestOptions = {}): Promise<SleeperLeagueUser[]> {
    return this.request(`/v1/league/${leagueId}/users`, sleeperLeagueUserListSchema, options);
  }

  getUser(username: string, options: RequestOptions = {}): Promise<SleeperUser> {
    return this.request(`/v1/user/${encodeURIComponent(username)}`, sleeperUserSchema, options);
  }

  getUserDrafts(
    userId: string,
    season: string,
    options: RequestOptions = {},
  ): Promise<SleeperDraft[]> {
    return this.request(
      `/v1/user/${userId}/drafts/nfl/${season}`,
      z.array(sleeperDraftSchema),
      options,
    );
  }

  getNflState(options: RequestOptions = {}): Promise<SleeperNflState> {
    return this.request('/v1/state/nfl', sleeperNflStateSchema, options);
  }

  /**
   * The full player dump (~14.6 MB live). Fetched at most once per process and held in memory —
   * never refetched per poll, per Sleeper's own "once per day at most" guidance.
   */
  async getPlayers(options: RequestOptions = {}): Promise<SleeperPlayerDump> {
    if (this.playerDump !== null) return this.playerDump;
    // Cleared on failure only, so a failed first fetch is retryable while concurrent callers on
    // the happy path all join the one in-flight request instead of each starting their own.
    this.playerDumpInFlight ??= this.request(
      '/v1/players/nfl',
      sleeperPlayerDumpSchema,
      options,
    ).catch((error: unknown) => {
      this.playerDumpInFlight = null;
      throw error;
    });
    this.playerDump = await this.playerDumpInFlight;
    return this.playerDump;
  }
}
