"use client";

/**
 * Each side's colours and flag for the replay components, keyed by team
 * name. The server page builds the map (lib/teams/flags.ts, with teamPair so
 * the two sides never look alike) and the player provides it; a component
 * outside a provider falls back to the side's colours with a code badge.
 */
import { createContext, useContext, type CSSProperties } from "react";
import { teamIdentity, teamVars } from "@/lib/teams/colors";
import type { TeamMark } from "@/lib/teams/flags";

export type Marks = Record<string, TeamMark>;

const MarksContext = createContext<Marks>({});

export const MarksProvider = MarksContext.Provider;

export function markOf(marks: Marks, team: string): TeamMark {
  return marks[team] ?? { ...teamIdentity(team), flagSrc: null };
}

export function useMark(team: string): TeamMark {
  return markOf(useContext(MarksContext), team);
}

/** --team-a-* and --team-b-* for the sides batting first and second (TEAM_COLORS in format.ts reads them). */
export function sideVars(marks: Marks, teams: [string, string]): CSSProperties {
  return { ...teamVars(markOf(marks, teams[0]), "team-a"), ...teamVars(markOf(marks, teams[1]), "team-b") } as CSSProperties;
}
