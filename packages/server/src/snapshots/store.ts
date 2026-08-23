/**
 * FR-4 — snapshot immutability for the life of an attached draft (AC-29).
 *
 * Both snapshots are fetched exactly once, at the pre-draft check step, before the poll loop
 * starts, and then held frozen. Nothing may re-fetch them mid-draft: a ranking that shifts
 * under a live board would silently invalidate every survival percentage and plan score
 * already on screen. `reset()` is the only way back to a fetching state, and only a new
 * attach calls it.
 */
import { PARAMETER_DEFAULTS, type ParameterValues } from '@sidekick/shared';

import { loadCrosswalk } from './crosswalk';
import { fetchEcrSnapshot } from './fantasypros';
import { fetchAdpSnapshot } from './ffc';
import { matchSnapshots } from './match';
import type { AdpSnapshot, EcrSnapshot, SleeperPlayerRecord, SnapshotBundle } from './types';

export interface SnapshotLoadInput {
  /** The attached league's real team count, from the draft object's settings. */
  leagueTeamCount: number;
  season: number;
  /** Sleeper's player dump, fetched and cached by T2's client. */
  sleeperPlayers: Record<string, SleeperPlayerRecord>;
  config?: Pick<ParameterValues, 'adpPoolTeamSizes' | 'snapshotStalenessWarningHours'>;
  cacheDir?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

const settle = async <T>(work: Promise<T>): Promise<[T, null] | [null, string]> => {
  try {
    return [await work, null];
  } catch (error) {
    return [null, (error as Error).message];
  }
};

export class SnapshotStore {
  #bundle: SnapshotBundle | null = null;
  #inFlight: Promise<SnapshotBundle> | null = null;

  /** The loaded bundle, or null before the first successful load / after `reset()`. */
  get(): SnapshotBundle | null {
    return this.#bundle;
  }

  get loaded(): boolean {
    return this.#bundle !== null;
  }

  /**
   * Loads both snapshots plus the crosswalk and matches them. Idempotent by design: a second
   * call returns the identical frozen bundle without touching the network, and concurrent
   * calls share one in-flight load.
   */
  async load(input: SnapshotLoadInput): Promise<SnapshotBundle> {
    if (this.#bundle) return this.#bundle;
    if (this.#inFlight) return this.#inFlight;

    this.#inFlight = this.#doLoad(input)
      .then((bundle) => {
        this.#bundle = bundle;
        return bundle;
      })
      .finally(() => {
        this.#inFlight = null;
      });

    return this.#inFlight;
  }

  /** Drops the snapshots. Only a new attach does this (AC-29). */
  reset(): void {
    this.#bundle = null;
    this.#inFlight = null;
  }

  async #doLoad(input: SnapshotLoadInput): Promise<SnapshotBundle> {
    const config = input.config ?? PARAMETER_DEFAULTS;

    // The crosswalk is the one hard dependency: without it there is no ID path at all, and a
    // name-only board would quietly mis-join players. Its own loader already falls back to a
    // stale local copy before giving up, so reaching this throw means there is no copy at all.
    const crosswalk = await loadCrosswalk({
      cacheDir: input.cacheDir,
      maxAgeHours: config.snapshotStalenessWarningHours,
      fetchImpl: input.fetchImpl,
      signal: input.signal,
    });

    // Either snapshot may fail without taking the app down: AC-28 keeps board sync, rosters
    // and the pick feed running, and a missing ADP just means ECR-order sampling (AC-26).
    const [[ecr, ecrError], [adp, adpError]] = await Promise.all([
      settle<EcrSnapshot>(
        fetchEcrSnapshot({ fetchImpl: input.fetchImpl, signal: input.signal }),
      ),
      settle<AdpSnapshot>(
        fetchAdpSnapshot({
          leagueTeamCount: input.leagueTeamCount,
          season: input.season,
          pools: config.adpPoolTeamSizes,
          fetchImpl: input.fetchImpl,
          signal: input.signal,
        }),
      ),
    ]);

    return Object.freeze({
      ecr,
      ecrError,
      adp,
      adpError,
      crosswalk,
      matching: matchSnapshots({
        ecr,
        adp,
        crosswalk,
        sleeperPlayers: input.sleeperPlayers,
      }),
      loadedAt: new Date().toISOString(),
    });
  }
}
