/**
 * T15's end-to-end fixture: one full 10-team, 15-round half-PPR draft, in every shape the
 * external world actually serves it in.
 *
 * `e2e-draft-board.json` holds the static data — 206 players (names, positions, teams, ECR
 * ordering and ADP taken from the real 2026 half-PPR consensus in
 * `research/half-ppr-2026-board.csv`, with K/DST rows and all ids synthetic but internally
 * consistent) plus a 150-entry `pickScript`. The script was generated offline by an independent
 * need-and-ADP heuristic: it is fixture data describing what a draft room *did*, and shares no
 * code with the simulation the server runs. That separation is what makes the replay's
 * convergence assertion meaningful rather than circular.
 *
 * This module turns that board into:
 *
 *  - a FantasyPros `ecrData` payload (the exact embedded-JSON field names T3 parses),
 *  - an FFC ADP payload (`PK`/`DEF` position spellings and all),
 *  - a `db_playerids.csv` crosswalk slice — deliberately missing eight rows, so FR-4's
 *    normalized-name fallback carries them, and missing every DST, which is how the real
 *    players-only file behaves,
 *  - a Sleeper `/v1/players/nfl` dump slice, team defenses included as pseudo-players,
 *  - and two draft bundles over the *same* 150 picks: a **mock** (`league_id: null`,
 *    `picked_by: ""`, `roster_id: null`) and a **real league** carrying two traded picks.
 *
 * **Why two bundles.** design.md §T15 asks for a mock-draft fixture that also contains a traded
 * pick. Sleeper cannot produce that: traded picks are expressed in `roster_id`s and resolved
 * through `slot_to_roster_id`, and a mock has no league, so it has neither. Inventing a mock that
 * carries them would be testing against a schema Sleeper never serves. So the one pick script is
 * emitted twice — the mock bundle carries AC-4's seat-only attribution, the league bundle carries
 * AC-12's traded picks — and the replay drives both.
 */
import board from './e2e-draft-board.json';

// ---------------------------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------------------------

export interface E2ePlayer {
  /** Sleeper `player_id` — the canonical key everywhere downstream. Team code for a DST. */
  id: string;
  /** FantasyPros `player_id`, as it appears in the `ecrData` embed. */
  fp: number;
  name: string;
  pos: 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST';
  team: string;
  ecr: number;
  posRank: string;
  /** Null for the 17 players the ADP feed carries no row for — AC-26's fallback path. */
  adp: number | null;
  /** False for the eight players with no crosswalk row, and for every DST. */
  crosswalk: boolean;
}

export interface E2eBoard {
  season: string;
  teams: number;
  rounds: number;
  /** The one drafted player no snapshot carries at all — AC-20's raw-name path. */
  unmatchedPlayer: { id: string; name: string; pos: string; team: string };
  unmatchedAtPickNo: number;
  players: E2ePlayer[];
  pickScript: string[];
}

export const e2eBoard = board as unknown as E2eBoard;

const byId = new Map<string, E2ePlayer>(e2eBoard.players.map((player) => [player.id, player]));

/** The snapshot player for a Sleeper id, or undefined for the deliberately unmatched one. */
export const e2ePlayer = (playerId: string): E2ePlayer | undefined => byId.get(playerId);

export const MOCK_DRAFT_ID = '1300000000000000015';
export const LEAGUE_DRAFT_ID = '1300000000000000016';
export const LEAGUE_ID = '1200000000000000016';

/** The user drafts from seat 4 in both bundles, as every other fixture in this repo does. */
export const USER_SLOT = 4;
export const USER_ID = '700000000000000004';

/** Same shuffled seat→roster mapping the T2/T5 fixtures use, so trades read the same way. */
const SLOT_TO_ROSTER: Record<string, number> = {
  '1': 3,
  '2': 7,
  '3': 1,
  '4': 9,
  '5': 2,
  '6': 10,
  '7': 5,
  '8': 4,
  '9': 8,
  '10': 6,
};

const ROSTER_TO_SLOT = new Map<number, number>(
  Object.entries(SLOT_TO_ROSTER).map(([slot, roster]) => [roster, Number(slot)]),
);

/**
 * Two traded picks (AC-12).
 *
 * Round 5 is the load-bearing one: seat 7's fifth-round pick is overall pick 47, which falls
 * inside the window between the user's own picks 44 and 57 — so the traded pick is not merely
 * attributed correctly in the feed, it changes whose need vector the opponent panel and the
 * simulation are reading for that slot.
 */
export const E2E_TRADED_PICKS = [
  {
    season: '2026',
    round: 5,
    roster_id: SLOT_TO_ROSTER['7']!,
    previous_owner_id: SLOT_TO_ROSTER['7']!,
    owner_id: SLOT_TO_ROSTER['2']!,
  },
  {
    season: '2026',
    round: 9,
    roster_id: SLOT_TO_ROSTER['3']!,
    previous_owner_id: SLOT_TO_ROSTER['3']!,
    owner_id: SLOT_TO_ROSTER['8']!,
  },
] as const;

/** Snake order: odd rounds run seat 1→10, even rounds 10→1. */
export const slotForPick = (pickNo: number): number => {
  const round = Math.floor((pickNo - 1) / e2eBoard.teams) + 1;
  const index = (pickNo - 1) % e2eBoard.teams;
  return round % 2 === 1 ? index + 1 : e2eBoard.teams - index;
};

export const roundForPick = (pickNo: number): number =>
  Math.floor((pickNo - 1) / e2eBoard.teams) + 1;

/** Who a pick belongs to once the traded picks are applied — the fixture's own answer to AC-12. */
export const expectedOwnerSlot = (pickNo: number): number => {
  const round = roundForPick(pickNo);
  const slot = slotForPick(pickNo);
  const trade = E2E_TRADED_PICKS.find(
    (traded) => traded.round === round && traded.roster_id === SLOT_TO_ROSTER[String(slot)],
  );
  return trade === undefined ? slot : (ROSTER_TO_SLOT.get(trade.owner_id) ?? slot);
};

/** Every pick number the user's own seat makes, traded picks accounted for. */
export const userPickNumbers = (): number[] => {
  const picks: number[] = [];
  for (let pickNo = 1; pickNo <= e2eBoard.pickScript.length; pickNo += 1) {
    if (expectedOwnerSlot(pickNo) === USER_SLOT) picks.push(pickNo);
  }
  return picks;
};

// ---------------------------------------------------------------------------------------------
// FantasyPros — the `ecrData` embed (FR-4)
// ---------------------------------------------------------------------------------------------

const FFC_POSITION: Record<E2ePlayer['pos'], string> = {
  QB: 'QB',
  RB: 'RB',
  WR: 'WR',
  TE: 'TE',
  K: 'PK',
  DST: 'DEF',
};

const splitName = (name: string): [string, string] => {
  const parts = name.split(' ');
  return [parts[0] ?? name, parts.slice(1).join(' ') || name];
};

/** Mirrors the crosswalk's own `merge_name` convention: lowercase, punctuation dropped. */
const mergeName = (name: string): string =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[.'’`,]/g, '');

/**
 * The ECR snapshot, captured an hour ago so AC-22's 24-hour staleness warning stays quiet — a
 * fixture that always warns would make the warning's absence unassertable.
 */
export const e2eEcrData = (
  capturedAtMs: number = Date.now() - 3_600_000,
): Record<string, unknown> => ({
  sport: 'NFL',
  type: 'Draft Half PPR',
  ranking_type_name: 'draft',
  year: e2eBoard.season,
  week: '0',
  position_id: 'ALL',
  scoring: 'HALF',
  count: e2eBoard.players.length,
  total_experts: 107,
  last_updated: '8/23',
  last_updated_ts: Math.floor(capturedAtMs / 1000),
  accessed: new Date(capturedAtMs).toISOString(),
  players: e2eBoard.players.map((player) => ({
    player_id: player.fp,
    player_name: player.name,
    player_team_id: player.team,
    player_position_id: player.pos,
    player_positions: player.pos,
    player_short_name: `${player.name.charAt(0)}. ${splitName(player.name)[1]}`,
    player_page_url: `https://www.fantasypros.com/nfl/players/${mergeName(player.name).replace(/\s+/g, '-')}.php`,
    player_filename: `${mergeName(player.name).replace(/\s+/g, '-')}.php`,
    player_bye_week: String((player.ecr % 12) + 5),
    player_owned_avg: Math.max(0.5, 100 - player.ecr / 3),
    player_ecr_delta: null,
    rank_ecr: player.ecr,
    rank_min: String(Math.max(1, player.ecr - 6)),
    rank_max: String(player.ecr + 9),
    rank_ave: String(player.ecr),
    rank_std: '3.10',
    pos_rank: player.posRank,
    tier: Math.floor(player.ecr / 24) + 1,
  })),
});

/** The `var ecrData = {...};` embed the live cheat-sheet page ships it inside. */
export const e2eEcrHtml = (data: unknown = e2eEcrData()): string =>
  [
    '<!doctype html><html><head><title>Half PPR Cheat Sheet</title></head><body>',
    '<script>',
    '  var ecrTiers = {"tier1": []};',
    `  var ecrData = ${JSON.stringify(data)};`,
    '</script>',
    '</body></html>',
  ].join('\n');

// ---------------------------------------------------------------------------------------------
// Fantasy Football Calculator — the ADP feed (FR-4)
// ---------------------------------------------------------------------------------------------

const isoDay = (atMs: number): string => new Date(atMs).toISOString().slice(0, 10);

/**
 * FFC's own internal ids have no crosswalk, so every row here travels the name/team path.
 *
 * The pool window ends today: FFC dates its snapshot by `end_date` alone, so a fixed date would
 * make the ADP snapshot cross AC-22's 24-hour line the day after it was written and turn a
 * staleness warning into permanent background noise.
 */
export const e2eFfcAdp = (
  teams: number = e2eBoard.teams,
  capturedAtMs: number = Date.now(),
): Record<string, unknown> => ({
  status: 'Success',
  meta: {
    type: 'Half-PPR',
    teams,
    rounds: e2eBoard.rounds,
    total_drafts: 2828,
    start_date: isoDay(capturedAtMs - 5 * 86_400_000),
    end_date: isoDay(capturedAtMs),
  },
  players: e2eBoard.players
    .filter((player) => player.adp !== null)
    .map((player, index) => ({
      player_id: 4000 + index,
      name:
        player.pos === 'DST'
          ? `${player.name.split(' ').slice(0, -1).join(' ')} Defense`
          : player.name,
      position: FFC_POSITION[player.pos],
      team: player.team,
      adp: player.adp,
      adp_formatted: `${Math.floor((player.adp ?? 0) / teams) + 1}.${String(Math.round((player.adp ?? 0) % teams)).padStart(2, '0')}`,
      times_drafted: 200,
      high: Math.max(1, Math.round((player.adp ?? 1) - 8)),
      low: Math.round((player.adp ?? 1) + 8),
      stdev: 4.2,
      bye: (player.ecr % 12) + 5,
    })),
});

// ---------------------------------------------------------------------------------------------
// DynastyProcess — the player-id crosswalk (FR-4)
// ---------------------------------------------------------------------------------------------

const CROSSWALK_HEADER = [
  'mfl_id',
  'sportradar_id',
  'fantasypros_id',
  'gsis_id',
  'pff_id',
  'sleeper_id',
  'nfl_id',
  'espn_id',
  'yahoo_id',
  'fleaflicker_id',
  'cbs_id',
  'pfr_id',
  'cfbref_id',
  'rotowire_id',
  'rotoworld_id',
  'ktc_id',
  'stats_id',
  'stats_global_id',
  'fantasy_data_id',
  'swish_id',
  'name',
  'merge_name',
  'position',
  'team',
  'birthdate',
  'age',
  'draft_year',
  'draft_round',
  'draft_pick',
  'draft_ovr',
  'twitter_username',
  'height',
  'weight',
  'college',
  'db_season',
];

/**
 * The crosswalk slice. Team defenses are absent by construction (the real file is players-only),
 * and eight named players are absent on purpose so the normalized-name fallback is exercised by
 * the replay rather than only by T3's unit tests.
 */
export const e2eCrosswalkCsv = (): string => {
  const lines = [CROSSWALK_HEADER.join(',')];
  for (const player of e2eBoard.players) {
    if (!player.crosswalk) continue;
    const cells = Object.fromEntries(CROSSWALK_HEADER.map((column) => [column, 'NA']));
    cells['fantasypros_id'] = String(player.fp);
    cells['sleeper_id'] = player.id;
    cells['gsis_id'] = `00-00${String(30000 + player.ecr)}`;
    cells['name'] = player.name;
    cells['merge_name'] = mergeName(player.name);
    cells['position'] = player.pos === 'K' ? 'PK' : player.pos;
    cells['team'] = player.team;
    cells['db_season'] = e2eBoard.season;
    lines.push(CROSSWALK_HEADER.map((column) => cells[column]!).join(','));
  }
  return `${lines.join('\n')}\n`;
};

// ---------------------------------------------------------------------------------------------
// Sleeper — the player dump
// ---------------------------------------------------------------------------------------------

export const e2eSleeperPlayers = (): Record<string, Record<string, unknown>> => {
  const dump: Record<string, Record<string, unknown>> = {};

  for (const player of e2eBoard.players) {
    const [first, last] = splitName(player.name);
    dump[player.id] =
      player.pos === 'DST'
        ? {
            player_id: player.id,
            position: 'DEF',
            fantasy_positions: ['DEF'],
            first_name: first,
            last_name: last,
            team: player.team,
            active: true,
            sport: 'nfl',
          }
        : {
            player_id: player.id,
            position: player.pos,
            fantasy_positions: [player.pos],
            first_name: first,
            last_name: last,
            full_name: player.name,
            search_full_name: mergeName(player.name).replace(/[^a-z0-9]/g, ''),
            team: player.team,
            active: true,
            status: 'Active',
            years_exp: 3,
            sport: 'nfl',
          };
  }

  // The unmatched player is a real Sleeper player — he is simply absent from both snapshots,
  // which is exactly the AC-20 case: Sidekick knows who was picked, and knows nothing else.
  const unmatched = e2eBoard.unmatchedPlayer;
  const [first, last] = splitName(unmatched.name);
  dump[unmatched.id] = {
    player_id: unmatched.id,
    position: unmatched.pos,
    fantasy_positions: [unmatched.pos],
    first_name: first,
    last_name: last,
    full_name: unmatched.name,
    search_full_name: mergeName(unmatched.name).replace(/[^a-z0-9]/g, ''),
    team: unmatched.team,
    active: true,
    status: 'Active',
    years_exp: 0,
    sport: 'nfl',
  };

  return dump;
};

// ---------------------------------------------------------------------------------------------
// The draft bundles
// ---------------------------------------------------------------------------------------------

const DRAFT_SETTINGS = {
  teams: e2eBoard.teams,
  rounds: e2eBoard.rounds,
  slots_qb: 1,
  slots_rb: 2,
  slots_wr: 2,
  slots_te: 1,
  slots_flex: 1,
  slots_k: 1,
  slots_def: 1,
  slots_bn: 6,
  pick_timer: 120,
  cpu_autopick: 1,
  player_type: 0,
  reversal_round: 0,
  nomination_timer: 0,
  enforce_position_limits: 1,
  alpha_sort: 0,
};

const START_TIME = 1787100000000;

const userIdForSlot = (slot: number): string => `70000000000000000${slot}`.slice(-18);

const pickMetadata = (playerId: string): Record<string, unknown> => {
  const player = e2ePlayer(playerId);
  if (player === undefined) {
    const unmatched = e2eBoard.unmatchedPlayer;
    const [first, last] = splitName(unmatched.name);
    return {
      first_name: first,
      injury_status: '',
      last_name: last,
      news_updated: '1787000000000',
      number: '1',
      player_id: unmatched.id,
      position: unmatched.pos,
      sport: 'nfl',
      status: 'Active',
      team: unmatched.team,
      years_exp: '0',
    };
  }
  const [first, last] = splitName(player.name);
  return {
    first_name: first,
    injury_status: '',
    last_name: last,
    news_updated: '1787000000000',
    number: '1',
    player_id: player.id,
    position: player.pos === 'DST' ? 'DEF' : player.pos,
    sport: 'nfl',
    status: 'Active',
    team: player.team,
    years_exp: '3',
  };
};

const buildPicks = (draftId: string, realLeague: boolean): Record<string, unknown>[] =>
  e2eBoard.pickScript.map((playerId, index) => {
    const pickNo = index + 1;
    const ownerSlot = expectedOwnerSlot(pickNo);
    return {
      draft_id: draftId,
      draft_slot: slotForPick(pickNo),
      is_keeper: null,
      metadata: pickMetadata(playerId),
      pick_no: pickNo,
      // A mock carries neither of these (✅ AS-1); a real league carries the *acquiring* owner
      // on a traded pick, which is precisely why Sidekick attributes by seat and trade instead.
      picked_by: realLeague ? userIdForSlot(ownerSlot) : '',
      player_id: playerId,
      reactions: null,
      roster_id: realLeague ? (SLOT_TO_ROSTER[String(ownerSlot)] ?? null) : null,
      round: roundForPick(pickNo),
    };
  });

const leagueUsers = (): Record<string, unknown>[] =>
  Array.from({ length: e2eBoard.teams }, (_, index) => {
    const slot = index + 1;
    return {
      avatar: null,
      display_name: `manager${slot}`,
      is_bot: null,
      is_owner: slot === 1,
      league_id: LEAGUE_ID,
      metadata: { team_name: `Seat ${slot} FC`, allow_pn: 'on' },
      settings: null,
      user_id: userIdForSlot(slot),
    };
  });

export interface E2eBundle {
  draft: Record<string, unknown>;
  picks: Record<string, unknown>[];
  tradedPicks: Record<string, unknown>[];
  leagueUsers: Record<string, unknown>[] | null;
  league?: Record<string, unknown> | null;
}

/** The mock bundle: `league_id: null`, no rosters, no trades — AC-4's seat-only attribution. */
export const e2eMockBundle = (): E2eBundle => ({
  draft: {
    created: START_TIME,
    creators: null,
    draft_id: MOCK_DRAFT_ID,
    draft_order: { [USER_ID]: USER_SLOT },
    last_message_id: null,
    last_message_time: null,
    last_picked: START_TIME + 600000,
    league_id: null,
    metadata: { description: '', name: '', scoring_type: 'half_ppr' },
    season: e2eBoard.season,
    season_type: 'regular',
    settings: DRAFT_SETTINGS,
    slot_to_roster_id: null,
    sport: 'nfl',
    start_time: START_TIME,
    status: 'drafting',
    type: 'snake',
  },
  picks: buildPicks(MOCK_DRAFT_ID, false),
  tradedPicks: [],
  leagueUsers: null,
});

/** The real-league bundle over the same 150 picks, carrying AC-12's two traded picks. */
export const e2eLeagueBundle = (): E2eBundle => ({
  draft: {
    created: START_TIME,
    creators: null,
    draft_id: LEAGUE_DRAFT_ID,
    draft_order: Object.fromEntries(
      Array.from({ length: e2eBoard.teams }, (_, index) => [userIdForSlot(index + 1), index + 1]),
    ),
    last_message_id: null,
    last_message_time: null,
    last_picked: START_TIME + 600000,
    league_id: LEAGUE_ID,
    metadata: { description: '', name: '', scoring_type: 'half_ppr' },
    season: e2eBoard.season,
    season_type: 'regular',
    settings: DRAFT_SETTINGS,
    slot_to_roster_id: SLOT_TO_ROSTER,
    sport: 'nfl',
    start_time: START_TIME,
    status: 'drafting',
    type: 'snake',
  },
  picks: buildPicks(LEAGUE_DRAFT_ID, true),
  tradedPicks: E2E_TRADED_PICKS.map((traded) => ({ ...traded })),
  leagueUsers: leagueUsers(),
  league: {
    league_id: LEAGUE_ID,
    name: 'Sidekick Replay League',
    season: e2eBoard.season,
    status: 'drafting',
    total_rosters: e2eBoard.teams,
    scoring_settings: {
      pass_yd: 0.04,
      pass_td: 4,
      pass_int: -1,
      pass_2pt: 2,
      rush_yd: 0.1,
      rush_td: 6,
      rush_2pt: 2,
      rec: 0.5,
      rec_yd: 0.1,
      rec_td: 6,
      rec_2pt: 2,
      fum_lost: -2,
    },
    roster_positions: [
      'QB',
      'RB',
      'RB',
      'WR',
      'WR',
      'TE',
      'FLEX',
      'K',
      'DEF',
      ...Array(6).fill('BN'),
    ],
  },
});

/** The same draft object with `status: 'complete'`, for the end of the replay (AC-14). */
export const completedDraft = (draft: Record<string, unknown>): Record<string, unknown> => ({
  ...draft,
  status: 'complete',
});
