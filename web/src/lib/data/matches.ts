import { and, asc, count, desc, eq, exists, gte, inArray, isNotNull, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { matchReplays, matches } from "@/db/schema";
import type { MatchRow } from "@/lib/contract/db";
import type { Fmt, Gender } from "@/lib/contract/pipeline";
import { cached } from "./cache";
import { formatKeysFor, toMatchRow } from "./rows";

function scope(gender?: Gender, format?: Fmt): SQL | undefined {
  const fks = formatKeysFor(gender, format);
  return fks ? inArray(matches.formatKey, fks) : undefined;
}

const hasReplayRow = () => exists(db.select({ one: sql`1` }).from(matchReplays).where(eq(matchReplays.matchId, matches.id)));

async function loadMatch(id: string): Promise<MatchRow | null> {
  const [r] = await db.select().from(matches).where(eq(matches.id, id)).limit(1);
  return r ? toMatchRow(r) : null;
}

/** Newest results first (index on end_date DESC, id). */
async function loadLatestResults(q: { gender?: Gender; format?: Fmt; limit?: number } = {}): Promise<MatchRow[]> {
  const rows = await db
    .select()
    .from(matches)
    .where(scope(q.gender, q.format))
    .orderBy(desc(matches.endDate), asc(matches.id))
    .limit(Math.min(Math.max(q.limit ?? 12, 1), 100));
  return rows.map(toMatchRow);
}

/**
 * Matches whose replay is stored. `featured` lists the curated finals in
 * featured_rank order; otherwise the newest come first.
 */
async function loadReplayable(q: { featured?: boolean; gender?: Gender; format?: Fmt; limit?: number } = {}): Promise<MatchRow[]> {
  const rows = await db
    .select()
    .from(matches)
    .where(and(hasReplayRow(), scope(q.gender, q.format), q.featured ? isNotNull(matches.featuredRank) : undefined))
    .orderBy(...(q.featured ? [asc(matches.featuredRank), desc(matches.endDate)] : [desc(matches.endDate), asc(matches.id)]))
    .limit(Math.min(Math.max(q.limit ?? 12, 1), 100));
  return rows.map(toMatchRow);
}

/** The match index, filtered and paged (index on format_key, end_date). */
async function loadMatches(
  q: { gender?: Gender; format?: Fmt; teamId?: string; year?: number; page?: number; pageSize?: number } = {},
): Promise<{ rows: MatchRow[]; total: number }> {
  const pageSize = Math.min(Math.max(q.pageSize ?? 50, 1), 100);
  const page = Math.max(q.page ?? 1, 1);
  const where = and(
    scope(q.gender, q.format),
    q.teamId ? or(eq(matches.team1Id, q.teamId), eq(matches.team2Id, q.teamId)) : undefined,
    q.year ? and(gte(matches.endDate, `${q.year}-01-01`), lt(matches.endDate, `${q.year + 1}-01-01`)) : undefined,
  );
  const [rows, [{ n }]] = await Promise.all([
    db
      .select()
      .from(matches)
      .where(where)
      .orderBy(desc(matches.endDate), asc(matches.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ n: count() }).from(matches).where(where),
  ]);
  return { rows: rows.map(toMatchRow), total: n };
}

/** The years that have matches, newest first, for the match index filter. */
async function loadMatchYears(): Promise<number[]> {
  const rows = await db
    .select({ y: sql<number>`extract(year from ${matches.endDate})::int` })
    .from(matches)
    .groupBy(sql`1`)
    .orderBy(sql`1 desc`);
  return rows.map((r) => r.y);
}

export const getMatch = cached("getMatch", loadMatch);
export const getLatestResults = cached("getLatestResults", loadLatestResults);
export const listReplayable = cached("listReplayable", loadReplayable);
export const listMatches = cached("listMatches", loadMatches);
export const listMatchYears = cached("listMatchYears", loadMatchYears);
