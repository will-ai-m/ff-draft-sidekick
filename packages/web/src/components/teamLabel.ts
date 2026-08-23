/**
 * How a drafting **team** (PRD §9 Terms — the seat, not an NFL club) is named on screen.
 *
 * Every surface that attributes something to a team — the pick feed's mine-vs-opponent rows, the
 * opponent panel's window strip — resolves the name through this one function against
 * `board.teams`, so the same seat can never be spelled two ways in two panels. The fallback order
 * mirrors AC-2's own convention for the attach screen: team name, then owner display name, then
 * the slot number, which every seat has even when the API names it not at all.
 */
import type { Team } from '@sidekick/shared';

export function teamLabel(team: Team): string {
  return team.displayName ?? team.ownerDisplayName ?? `Slot ${team.draftSlot}`;
}

/**
 * A lookup closure over the seats, built once per render rather than scanning the array for each
 * of a 150-row pick feed's entries. An unknown `teamId` falls back to the id itself — the board
 * and the panels always come from the same snapshot, so this cannot happen without a server bug,
 * and showing the raw id is more useful than a blank when it does.
 */
export function makeTeamLabeller(teams: readonly Team[]): (teamId: string) => string {
  const byId = new Map(teams.map((team) => [team.teamId, teamLabel(team)]));
  return (teamId) => byId.get(teamId) ?? teamId;
}
