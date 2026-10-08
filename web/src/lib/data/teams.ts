import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { matches, teamSummaries, teams } from "@/db/schema";
import type { H2HRow, MatchRow, TeamListRow, TeamPage } from "@/lib/contract/db";
import { formatKey as toFormatKey, type Fmt, type FormatKey, type Gender, type Record5 } from "@/lib/contract/pipeline";
import { cached } from "./cache";
import { fmtOfKey, toMatchRow } from "./rows";

type SummaryDbRow = typeof teamSummaries.$inferSelect;

function record5(s: SummaryDbRow): Record5 {
  return { matches: s.matches, won: s.won, lost: s.lost, tied: s.tied, drawn: s.drawn, noResult: s.noResult, winPct: s.winPct };
}

const FMT_ORDER: Record<Fmt, number> = { test: 0, odi: 1, t20i: 2 };

/** Teams with their record per format (teams JOIN team_summaries). */
async function loadTeams(gender?: Gender): Promise<TeamListRow[]> {
  const rows = await db
    .select({ t: teams, s: teamSummaries })
    .from(teams)
    .leftJoin(teamSummaries, eq(teamSummaries.teamId, teams.id))
    .where(gender ? eq(teams.gender, gender) : undefined)
    .orderBy(asc(teams.name), asc(teams.id));
  const out = new Map<string, TeamListRow>();
  for (const { t, s } of rows) {
    const row =
      out.get(t.id) ??
      out
        .set(t.id, { id: t.id, name: t.name, gender: t.gender, label: t.label, firstMatch: t.firstMatch, lastMatch: t.lastMatch, matches: t.matches, formats: {} })
        .get(t.id)!;
    if (s) row.formats[fmtOfKey(s.formatKey)] = { ...record5(s), first: s.firstDate, last: s.lastDate };
  }
  return [...out.values()];
}

async function teamAndSummaries(teamId: string) {
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!team) return null;
  const summaries = await db.select().from(teamSummaries).where(eq(teamSummaries.teamId, teamId));
  summaries.sort((a, b) => FMT_ORDER[fmtOfKey(a.formatKey)] - FMT_ORDER[fmtOfKey(b.formatKey)]);
  return { team, summaries };
}

function pickSummary(gender: Gender, summaries: SummaryDbRow[], fmt?: Fmt): SummaryDbRow | null {
  if (fmt) {
    const s = summaries.find((x) => x.formatKey === toFormatKey(fmt, gender));
    if (s) return s;
  }
  return [...summaries].sort((a, b) => b.matches - a.matches)[0] ?? null;
}

const involving = (teamId: string) => or(eq(matches.team1Id, teamId), eq(matches.team2Id, teamId));

/** Every section of a team's analysis for one format, plus its last 10 results. */
async function loadTeam(teamId: string, fmt?: Fmt): Promise<TeamPage | null> {
  const base = await teamAndSummaries(teamId);
  if (!base) return null;
  const { team, summaries } = base;
  const s = pickSummary(team.gender, summaries, fmt);
  if (!s) return null;
  const recent = await db
    .select()
    .from(matches)
    .where(and(involving(teamId), eq(matches.formatKey, s.formatKey)))
    .orderBy(desc(matches.endDate), asc(matches.id))
    .limit(10);
  return {
    team: { id: team.id, name: team.name, gender: team.gender, label: team.label },
    formats: summaries.map((x) => fmtOfKey(x.formatKey)),
    formatKey: s.formatKey,
    span: { first: s.firstDate, last: s.lastDate },
    record: record5(s),
    detail: s.detail,
    recent: recent.map(toMatchRow),
  };
}

/** Head-to-head record (from the team's summary) and every match between the two in one format. */
async function loadHeadToHead(
  teamId: string,
  oppId: string,
  fmt: Fmt,
): Promise<{ summary: H2HRow | null; matches: MatchRow[]; team: TeamListRow | null; opponent: TeamListRow | null; formatKey: FormatKey | null }> {
  const [team, opp] = await Promise.all([teamAndSummaries(teamId), teamAndSummaries(oppId)]);
  if (!team || !opp) return { summary: null, matches: [], team: null, opponent: null, formatKey: null };
  const fk = toFormatKey(fmt, team.team.gender);
  const s = team.summaries.find((x) => x.formatKey === fk);
  const rows = await db
    .select()
    .from(matches)
    .where(
      and(
        eq(matches.formatKey, fk),
        or(and(eq(matches.team1Id, teamId), eq(matches.team2Id, oppId)), and(eq(matches.team1Id, oppId), eq(matches.team2Id, teamId))),
      ),
    )
    .orderBy(desc(matches.endDate), asc(matches.id));
  const lite = (t: NonNullable<typeof team>): TeamListRow => ({
    id: t.team.id,
    name: t.team.name,
    gender: t.team.gender,
    label: t.team.label,
    firstMatch: t.team.firstMatch,
    lastMatch: t.team.lastMatch,
    matches: t.team.matches,
    formats: Object.fromEntries(t.summaries.map((x) => [fmtOfKey(x.formatKey), { ...record5(x), first: x.firstDate, last: x.lastDate }])),
  });
  return {
    summary: s?.detail.headToHead.find((h) => h.opponentId === oppId) ?? null,
    matches: rows.map(toMatchRow),
    team: lite(team),
    opponent: lite(opp),
    formatKey: fk,
  };
}

/** Team labels by id, for pages that only need names. */
async function loadTeamLabels(ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const rows = await db.select({ id: teams.id, label: teams.label }).from(teams).where(inArray(teams.id, ids));
  return Object.fromEntries(rows.map((r) => [r.id, r.label]));
}

export const listTeams = cached("listTeams", loadTeams);
export const getTeam = cached("getTeam", loadTeam);
export const getHeadToHead = cached("getHeadToHead", loadHeadToHead);
export const getTeamLabels = cached("getTeamLabels", loadTeamLabels);
