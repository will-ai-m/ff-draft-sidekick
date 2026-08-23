/**
 * Reusable `msw` handlers for the Sleeper endpoints, plus a small scenario object that lets a
 * test drive a draft forward pick by pick and inject the failure modes FR-3 has to survive.
 *
 * design.md's dependency note puts the shared fixture handlers in `test/msw/handlers.ts`. This
 * file is the Sleeper-only half, kept separate so the concurrently-developed snapshot task
 * (FantasyPros/FFC/crosswalk) can own its own handler module without either task editing the
 * other's file; an aggregate `handlers.ts` re-exporting both is a one-liner for whichever later
 * task first needs handlers from both sources at once.
 */

import { HttpResponse, http } from 'msw';
import type { HttpHandler } from 'msw';

export const TEST_BASE_URL = 'https://api.sleeper.app';

/** The shape of the `sleeper-*-draft.json` fixture bundles. */
export interface SleeperFixtureBundle {
  draft: Record<string, unknown>;
  picks: Record<string, unknown>[];
  tradedPicks: Record<string, unknown>[];
  leagueUsers: Record<string, unknown>[] | null;
}

/** How the next `/picks` response should fail, when a test wants it to. */
export type FailureMode =
  | { kind: 'http'; status: number }
  | { kind: 'network' }
  | { kind: 'malformed' }
  | { kind: 'null-body' };

export interface SleeperScenarioOptions {
  bundle: SleeperFixtureBundle;
  /** How many of the bundle's picks the `/picks` endpoint returns to start with. */
  visiblePicks?: number;
  users?: Record<string, Record<string, unknown>>;
  userDrafts?: Record<string, Record<string, unknown>[]>;
  players?: Record<string, Record<string, unknown>>;
  nflState?: Record<string, unknown>;
}

/**
 * A mutable Sleeper server for one test: advance the pick list, swap in a hand-built pick list,
 * or make the next N `/picks` responses fail in a specific way.
 */
export class SleeperScenario {
  readonly bundle: SleeperFixtureBundle;
  readonly requests: string[] = [];

  visiblePicks: number;
  picksOverride: Record<string, unknown>[] | null = null;
  draftOverride: Record<string, unknown> | null = null;

  private failure: FailureMode | null = null;
  private failuresRemaining = 0;

  private readonly users: Record<string, Record<string, unknown>>;
  private readonly userDrafts: Record<string, Record<string, unknown>[]>;
  private readonly players: Record<string, Record<string, unknown>>;
  private readonly nflState: Record<string, unknown>;

  constructor(options: SleeperScenarioOptions) {
    this.bundle = options.bundle;
    this.visiblePicks = options.visiblePicks ?? options.bundle.picks.length;
    this.users = options.users ?? {};
    this.userDrafts = options.userDrafts ?? {};
    this.players = options.players ?? {};
    this.nflState = options.nflState ?? { season: '2026', league_season: '2026', week: 2 };
  }

  /** Make the next `times` `/picks` responses fail in the given way. */
  failNextPicks(mode: FailureMode, times = 1): void {
    this.failure = mode;
    this.failuresRemaining = times;
  }

  clearFailures(): void {
    this.failure = null;
    this.failuresRemaining = 0;
  }

  /** Reveal `count` more of the bundle's picks, as if the draft moved on. */
  advance(count = 1): void {
    this.visiblePicks = Math.min(this.bundle.picks.length, this.visiblePicks + count);
  }

  currentPicks(): Record<string, unknown>[] {
    return this.picksOverride ?? this.bundle.picks.slice(0, this.visiblePicks);
  }

  currentDraft(): Record<string, unknown> {
    return this.draftOverride ?? this.bundle.draft;
  }

  private takeFailure(): FailureMode | null {
    if (this.failure === null || this.failuresRemaining <= 0) return null;
    this.failuresRemaining -= 1;
    const mode = this.failure;
    if (this.failuresRemaining === 0) this.failure = null;
    return mode;
  }

  handlers(baseUrl: string = TEST_BASE_URL): HttpHandler[] {
    const log = (name: string): void => {
      this.requests.push(name);
    };

    return [
      http.get(`${baseUrl}/v1/draft/:draftId/picks`, ({ params }) => {
        log(`picks:${String(params['draftId'])}`);
        const mode = this.takeFailure();
        if (mode?.kind === 'network') return HttpResponse.error();
        if (mode?.kind === 'http') return new HttpResponse(null, { status: mode.status });
        if (mode?.kind === 'malformed') {
          return HttpResponse.json({ picks: 'not-an-array' });
        }
        if (mode?.kind === 'null-body') return HttpResponse.json(null);
        return HttpResponse.json(this.currentPicks());
      }),

      http.get(`${baseUrl}/v1/draft/:draftId/traded_picks`, ({ params }) => {
        log(`traded_picks:${String(params['draftId'])}`);
        return HttpResponse.json(this.bundle.tradedPicks);
      }),

      http.get(`${baseUrl}/v1/draft/:draftId`, ({ params }) => {
        log(`draft:${String(params['draftId'])}`);
        const draft = this.currentDraft();
        if (String(params['draftId']) !== String(draft['draft_id'])) return HttpResponse.json(null);
        return HttpResponse.json(draft);
      }),

      http.get(`${baseUrl}/v1/league/:leagueId/users`, ({ params }) => {
        log(`league_users:${String(params['leagueId'])}`);
        return HttpResponse.json(this.bundle.leagueUsers ?? []);
      }),

      http.get(`${baseUrl}/v1/user/:userId/drafts/nfl/:season`, ({ params }) => {
        log(`user_drafts:${String(params['userId'])}`);
        return HttpResponse.json(this.userDrafts[String(params['userId'])] ?? []);
      }),

      http.get(`${baseUrl}/v1/user/:username`, ({ params }) => {
        log(`user:${String(params['username'])}`);
        return HttpResponse.json(this.users[String(params['username'])] ?? null);
      }),

      http.get(`${baseUrl}/v1/state/nfl`, () => {
        log('state');
        return HttpResponse.json(this.nflState);
      }),

      http.get(`${baseUrl}/v1/players/nfl`, () => {
        log('players');
        return HttpResponse.json(this.players);
      }),
    ];
  }
}
