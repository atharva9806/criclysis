import type { TeamListRow } from "@/lib/contract/db";
import type { Fmt } from "@/lib/contract/pipeline";
import { listTeams } from "@/lib/data";

export const FMTS: Fmt[] = ["test", "odi", "t20i"];

/**
 * The team row from the cached team list. It is the cheap existence check a
 * team page runs before anything streams, so an unknown id is a real 404.
 */
export async function findTeam(teamId: string): Promise<TeamListRow | null> {
  return (await listTeams()).find((t) => t.id === teamId) ?? null;
}

/** The requested format if the team has played it, otherwise its most-played one (the same rule getTeam uses). */
export function pickFormat(team: TeamListRow, wanted?: Fmt): Fmt | null {
  const fmts = FMTS.filter((f) => team.formats[f]);
  if (wanted && fmts.includes(wanted)) return wanted;
  return [...fmts].sort((a, b) => (team.formats[b]?.matches ?? 0) - (team.formats[a]?.matches ?? 0))[0] ?? null;
}
