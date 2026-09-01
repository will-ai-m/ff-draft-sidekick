/**
 * FantasyPros tier pull — `npm run ecr:tiers`.
 *
 * Fetches the overall half-PPR cheat sheet plus the six positional cheat sheets and writes their
 * tier structure to `research/fantasypros-tiers-<date>.md`, with a digest on stdout. The
 * positional pages carry **positional** tiers (verified 2026-09-01: e.g. TE Tier 1 =
 * Bowers/McBride/Loveland/Warren, where the overall board splits them 2/3/3/4), which is the
 * grouping a human reads for "when does the run at this position pause".
 *
 * Read-only research tooling: it shares FR-4's parser but never touches the app. An attached
 * draft's snapshot stays whatever it was at attach time (AC-29) — re-attach to pick up a newer
 * board.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchEcrSnapshot } from '../src/snapshots/fantasypros';
import type { EcrSnapshot } from '../src/snapshots/types';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const RESEARCH_DIR = join(REPO_ROOT, 'research');

const BASE = 'https://www.fantasypros.com/nfl/rankings';
const PAGES = [
  { key: 'QB', label: 'QB', url: `${BASE}/qb-cheatsheets.php` },
  { key: 'RB', label: 'RB (half-PPR)', url: `${BASE}/half-point-ppr-rb-cheatsheets.php` },
  { key: 'WR', label: 'WR (half-PPR)', url: `${BASE}/half-point-ppr-wr-cheatsheets.php` },
  { key: 'TE', label: 'TE (half-PPR)', url: `${BASE}/half-point-ppr-te-cheatsheets.php` },
  { key: 'DST', label: 'DST', url: `${BASE}/dst-cheatsheets.php` },
  { key: 'K', label: 'K', url: `${BASE}/k-cheatsheets.php` },
] as const;

/** Ranks past this are waiver-wire depth; sections stop at the tier containing it. */
const POSITIONAL_RANK_DEPTH = 60;

interface TierRow {
  tier: number | null;
  players: { name: string; team: string | null; rank: number }[];
}

/** Consecutive same-tier runs in rank order — the same contiguity rule the value model uses. */
function tierRows(snapshot: EcrSnapshot, rankDepth: number): TierRow[] {
  const entries = [...snapshot.entries].sort((a, b) => a.ecrRank - b.ecrRank);
  const rows: TierRow[] = [];
  for (const entry of entries) {
    const last = rows.at(-1);
    if (last === undefined || last.tier !== entry.tier) {
      rows.push({ tier: entry.tier, players: [] });
    }
    rows.at(-1)!.players.push({ name: entry.playerName, team: entry.team, rank: entry.ecrRank });
  }
  // Keep every tier that starts at or before the depth cutoff, whole.
  return rows.filter((row) => (row.players[0]?.rank ?? Infinity) <= rankDepth);
}

const ageHours = (iso: string | null): string =>
  iso === null ? 'capture time unknown' : `${((Date.now() - Date.parse(iso)) / 3_600_000).toFixed(1)} h old`;

const playerCell = (player: TierRow['players'][number], withRank: boolean): string =>
  withRank ? `${player.name}${player.team ? ` ${player.team}` : ''} (${player.rank})` : player.name;

function section(label: string, url: string, snapshot: EcrSnapshot, rankDepth: number): string {
  const rows = tierRows(snapshot, rankDepth);
  const lines = [
    `## ${label}`,
    '',
    `- Source: ${url}`,
    `- Captured: ${snapshot.capturedAt ?? 'unknown'} (${ageHours(snapshot.capturedAt)}) · ${snapshot.entries.length} players · scoring ${snapshot.scoring}`,
    '',
    '| Tier | Players (rank) |',
    '|---:|---|',
  ];
  for (const row of rows) {
    const label_ = row.tier === null ? '—' : String(row.tier);
    lines.push(`| ${label_} | ${row.players.map((p) => playerCell(p, true)).join(', ')} |`);
  }
  const last = rows.at(-1)?.players.at(-1);
  if (last !== undefined && snapshot.entries.length > rows.reduce((n, r) => n + r.players.length, 0)) {
    lines.push('', `_Truncated after the tier containing rank ${rankDepth} (last shown: ${last.name}, rank ${last.rank})._`);
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const snapshots = await Promise.all(
    PAGES.map(async (page) => ({ page, snapshot: await fetchEcrSnapshot({ url: page.url }) })),
  );

  const newest = snapshots
    .map(({ snapshot }) => snapshot.capturedAt)
    .filter((iso): iso is string => iso !== null)
    .sort()
    .at(-1);
  const date = (newest ?? new Date().toISOString()).slice(0, 10);
  const outPath = join(RESEARCH_DIR, `fantasypros-positional-tiers-${date}.md`);

  const body = [
    `# FantasyPros positional tiers — ${date}`,
    `Pulled ${new Date().toISOString()} by \`npm run tiers:positional\`. Each position page's ` +
      "own **positional** tiers — the grouping that says where the run at that position pauses. " +
      'The QB/RB/WR/TE pages are the same ones the app ingests at attach for tier urgency; an ' +
      'attached draft keeps its attach-time snapshot (AC-29), so detach → re-attach to draft on ' +
      'a newer board.',
    ...snapshots.map(({ page, snapshot }) =>
      section(page.label, page.url, snapshot, POSITIONAL_RANK_DEPTH),
    ),
  ].join('\n\n');

  mkdirSync(RESEARCH_DIR, { recursive: true });
  writeFileSync(outPath, `${body}\n`);

  // The stdout digest: capture freshness plus each position's top two tiers.
  console.log(`Wrote ${outPath}`);
  for (const { page, snapshot } of snapshots) {
    console.log(`\n${page.label} — ${ageHours(snapshot.capturedAt)}`);
    for (const row of tierRows(snapshot, POSITIONAL_RANK_DEPTH).slice(0, 2)) {
      console.log(
        `  T${row.tier ?? '—'}: ${row.players.map((p) => playerCell(p, false)).join(', ')}`,
      );
    }
  }
}

main().catch((error: unknown) => {
  console.error(`ecr:tiers failed: ${(error as Error).message}`);
  process.exit(1);
});
