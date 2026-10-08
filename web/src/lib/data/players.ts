import { and, asc, desc, eq, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { careerStats, dismissalCounts, innings, matches, players, profileDimensions, splits, traits, yearlyStats } from "@/db/schema";
import type {
  CareerRow,
  InningsRow,
  LeaderRow,
  PlayerHeader,
  PlayerListRow,
  PlayerProfile,
  PlayerSort,
  PlayerSummary,
  ProfileAxisRow,
  RoleFilter,
  TraitRow,
  YearRow,
} from "@/lib/contract/db";
import { FORMAT_KEYS, formatKey as toFormatKey, type Fmt, type FormatKey, type Gender } from "@/lib/contract/pipeline";
import { batRates, bowlRates, toSplitRow } from "@/lib/metrics";
import { cached } from "./cache";
import { getDatasetMeta } from "./meta";
import { fmtOfKey, formatKeysFor, toTraitRow } from "./rows";

type PlayerDbRow = typeof players.$inferSelect;
type CareerDbRow = typeof careerStats.$inferSelect;

export function toPlayerHeader(p: PlayerDbRow): PlayerHeader {
  return {
    slug: p.slug,
    sourceId: p.sourceId,
    name: p.name,
    fullName: p.fullName,
    gender: p.gender,
    country: p.country,
    teams: p.teams,
    teamIds: p.teamIds,
    role: p.role,
    battingHand: p.battingHand,
    bowlingType: p.bowlingType,
    born: p.born,
    debut: p.debut,
    lastPlayed: p.lastPlayed,
    sampleBalls: p.sampleBalls,
  };
}

export function toCareerRow(c: CareerDbRow): CareerRow {
  return {
    formatKey: c.formatKey,
    format: fmtOfKey(c.formatKey),
    matches: c.matches,
    batInnings: c.batInnings,
    notOuts: c.notOuts,
    runs: c.runs,
    balls: c.balls,
    outs: c.outs,
    highest: c.highest,
    highestNotOut: c.highestNotOut,
    hundreds: c.hundreds,
    fifties: c.fifties,
    fours: c.fours,
    sixes: c.sixes,
    batAvg: c.batAvg,
    batSr: c.batSr,
    bowlInnings: c.bowlInnings,
    bowlBalls: c.bowlBalls,
    runsConceded: c.runsConceded,
    wickets: c.wickets,
    maidens: c.maidens,
    bowlAvg: c.bowlAvg,
    bowlEcon: c.bowlEcon,
    bowlSr: c.bowlSr,
    best: c.bestWickets !== null && c.bestRuns !== null ? { wickets: c.bestWickets, runs: c.bestRuns } : null,
    fourWkts: c.fourWkts,
    fiveWkts: c.fiveWkts,
    strengths: c.strengths,
    weaknesses: c.weaknesses,
  };
}

const FMT_ORDER: Record<Fmt, number> = { test: 0, odi: 1, t20i: 2 };

/** The player's row and every career_stats row, in Test, ODI, T20I order. */
async function playerWithCareers(slug: string): Promise<{ player: PlayerDbRow; careers: CareerRow[] } | null> {
  const [player] = await db.select().from(players).where(eq(players.slug, slug)).limit(1);
  if (!player) return null;
  const rows = await db.select().from(careerStats).where(eq(careerStats.playerId, player.id));
  const careers = rows.map(toCareerRow).sort((a, b) => FMT_ORDER[a.format] - FMT_ORDER[b.format]);
  return { player, careers };
}

/** The requested format if the player has it, otherwise the one with the most balls faced and bowled. */
function pickFormatKey(gender: Gender, careers: CareerRow[], fmt?: Fmt): FormatKey | null {
  if (fmt) {
    const fk = toFormatKey(fmt, gender);
    if (careers.some((c) => c.formatKey === fk)) return fk;
  }
  const best = [...careers].sort((a, b) => (b.balls ?? 0) + (b.bowlBalls ?? 0) - ((a.balls ?? 0) + (a.bowlBalls ?? 0)))[0];
  return best?.formatKey ?? null;
}

function toProfileAxis(r: typeof profileDimensions.$inferSelect): ProfileAxisRow {
  return { axis: r.axis, label: r.label, discipline: r.discipline, value: r.value, percentile: r.percentile, balls: r.balls };
}

function toYearRow(y: typeof yearlyStats.$inferSelect): YearRow {
  const bat = y.balls !== null ? batRates({ balls: y.balls, runs: y.runs ?? 0, outs: y.outs ?? 0, dots: 0, fours: y.fours ?? 0, sixes: y.sixes ?? 0 }) : null;
  const bowl = y.bowlBalls !== null ? bowlRates({ balls: y.bowlBalls, runs: y.runsConceded ?? 0, wickets: y.wickets ?? 0, dots: 0, fours: 0, sixes: 0 }) : null;
  return {
    year: y.year,
    batInnings: y.batInnings,
    runs: y.runs,
    balls: y.balls,
    outs: y.outs,
    average: bat?.average ?? null,
    strikeRate: bat?.strikeRate ?? null,
    bowlInnings: y.bowlInnings,
    bowlBalls: y.bowlBalls,
    runsConceded: y.runsConceded,
    wickets: y.wickets,
    bowlAverage: bowl?.average ?? null,
    economy: bowl?.economy ?? null,
  };
}

async function recentInnings(playerId: number, fk: FormatKey, discipline: "batting" | "bowling", limit: number): Promise<InningsRow[]> {
  const rows = await db
    .select({ i: innings, venue: matches.venue })
    .from(innings)
    .leftJoin(matches, eq(matches.id, innings.matchId))
    .where(and(eq(innings.playerId, playerId), eq(innings.formatKey, fk), eq(innings.discipline, discipline)))
    .orderBy(desc(innings.playedOn), desc(innings.matchId), desc(innings.inningsNo))
    .limit(limit);
  return rows.map(({ i, venue }) => ({
    discipline: i.discipline,
    matchId: i.matchId,
    playedOn: i.playedOn,
    opponent: i.opponent,
    venue,
    inningsNo: i.inningsNo,
    runs: i.runs,
    ballsFaced: i.ballsFaced,
    fours: i.fours,
    sixes: i.sixes,
    position: i.position,
    out: i.out,
    dismissal: i.dismissal,
    ballsBowled: i.ballsBowled,
    runsConceded: i.runsConceded,
    wickets: i.wickets,
    maidens: i.maidens,
  }));
}

const FORM_INNINGS = 10;

function splitTraits(rows: (typeof traits.$inferSelect)[]): { strengths: TraitRow[]; weaknesses: TraitRow[] } {
  const all = rows.map(toTraitRow).sort((a, b) => a.rank - b.rank);
  return { strengths: all.filter((t) => t.kind === "strength"), weaknesses: all.filter((t) => t.kind === "weakness") };
}

async function loadPlayerProfile(slug: string, fmt?: Fmt): Promise<PlayerProfile | null> {
  const base = await playerWithCareers(slug);
  if (!base) return null;
  const { player, careers } = base;
  const fk = pickFormatKey(player.gender, careers, fmt);
  const header = toPlayerHeader(player);
  if (!fk) {
    return {
      player: header, careers, formatKey: null, strengths: [], weaknesses: [], profile: [], splits: [], yearly: [],
      recentBatting: [], recentBowling: [], form: { batting: null, bowling: null }, dismissals: [],
    };
  }
  const pf = (t: { playerId: AnyPgColumn; formatKey: AnyPgColumn }) => and(eq(t.playerId, player.id), eq(t.formatKey, fk));
  const [traitRows, axes, splitRows, years, batInns, bowlInns, dismissals] = await Promise.all([
    db.select().from(traits).where(pf(traits)),
    db.select().from(profileDimensions).where(pf(profileDimensions)),
    db.select().from(splits).where(pf(splits)),
    db.select().from(yearlyStats).where(pf(yearlyStats)).orderBy(asc(yearlyStats.year)),
    recentInnings(player.id, fk, "batting", 25),
    recentInnings(player.id, fk, "bowling", 25),
    db.select().from(dismissalCounts).where(pf(dismissalCounts)).orderBy(desc(dismissalCounts.count)),
  ]);

  const lastBat = batInns.slice(0, FORM_INNINGS);
  const lastBowl = bowlInns.slice(0, FORM_INNINGS);
  const sum = (xs: InningsRow[], f: (i: InningsRow) => number | null) => xs.reduce((s, i) => s + (f(i) ?? 0), 0);
  const batForm = lastBat.length
    ? (() => {
        const runs = sum(lastBat, (i) => i.runs);
        const outs = lastBat.filter((i) => i.out).length;
        const balls = sum(lastBat, (i) => i.ballsFaced);
        const r = batRates({ runs, outs, balls, dots: 0, fours: 0, sixes: 0 });
        return { innings: lastBat.length, runs, outs, balls, average: r.average, strikeRate: r.strikeRate, from: lastBat[lastBat.length - 1].playedOn, to: lastBat[0].playedOn };
      })()
    : null;
  const bowlForm = lastBowl.length
    ? {
        innings: lastBowl.length,
        wickets: sum(lastBowl, (i) => i.wickets),
        runsConceded: sum(lastBowl, (i) => i.runsConceded),
        balls: sum(lastBowl, (i) => i.ballsBowled),
        from: lastBowl[lastBowl.length - 1].playedOn,
        to: lastBowl[0].playedOn,
      }
    : null;

  return {
    player: header,
    careers,
    formatKey: fk,
    ...splitTraits(traitRows),
    profile: axes.map(toProfileAxis),
    splits: splitRows.map(toSplitRow).sort((a, b) => b.balls - a.balls),
    yearly: years.map(toYearRow),
    recentBatting: batInns,
    recentBowling: bowlInns,
    form: { batting: batForm, bowling: bowlForm },
    dismissals: dismissals.map((d) => ({ discipline: d.discipline, kind: d.kind, subject: d.subject, count: d.count })),
  };
}

async function loadPlayerSummary(slug: string, fmt?: Fmt): Promise<PlayerSummary | null> {
  const base = await playerWithCareers(slug);
  if (!base) return null;
  const { player, careers } = base;
  const fk = pickFormatKey(player.gender, careers, fmt);
  const [axes, traitRows] = fk
    ? await Promise.all([
        db.select().from(profileDimensions).where(and(eq(profileDimensions.playerId, player.id), eq(profileDimensions.formatKey, fk))),
        db.select().from(traits).where(and(eq(traits.playerId, player.id), eq(traits.formatKey, fk))),
      ])
    : [[], []];
  return { player: toPlayerHeader(player), careers, formatKey: fk, profile: axes.map(toProfileAxis), ...splitTraits(traitRows) };
}

// ---------------------------------------------------------------- listing

const ROLE_SQL: Record<RoleFilter, SQL> = {
  batter: sql`(p.role ILIKE '%batter' AND p.role NOT ILIKE 'wicketkeeper%')`,
  wicketkeeper: sql`p.role ILIKE 'wicketkeeper%'`,
  allrounder: sql`p.role ILIKE '%all%rounder%'`,
  bowler: sql`p.role = 'Bowler'`,
};

type ListQuery = {
  search?: string;
  gender?: Gender;
  format?: Fmt;
  teamId?: string;
  role?: RoleFilter;
  sort?: PlayerSort;
  page?: number;
  pageSize?: number;
};

type ListResult = {
  rows: PlayerListRow[];
  total: number;
  page: number;
  pageSize: number;
  /** For rate sorts: the minimum balls (faced or bowled) a player needs to be listed. */
  minBalls: number | null;
};

/**
 * /players: career_stats for the filtered formatKeys, summed per player
 * (§4.1: "All formats" uses SUM ... GROUP BY). Rates are recomputed from the
 * sums. Rate sorts only list players with a cohort-sized sample.
 */
async function loadPlayers(q: ListQuery = {}): Promise<ListResult> {
  const pageSize = Math.min(Math.max(q.pageSize ?? 50, 1), 100);
  const page = Math.max(q.page ?? 1, 1);
  const sort = q.sort ?? "runs";
  const fks = formatKeysFor(q.gender, q.format) ?? FORMAT_KEYS;
  const t = (await getDatasetMeta())?.thresholds;
  const batMin = t?.minBallsCohort ?? 600;
  const bowlMin = t?.minBallsBowledCohort ?? 900;

  const where: SQL[] = [];
  if (q.gender) where.push(sql`p.gender = ${q.gender}`);
  if (q.search?.trim()) {
    const pat = `%${q.search.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where.push(sql`(p.name ILIKE ${pat} OR p.full_name ILIKE ${pat})`);
  }
  if (q.teamId) where.push(sql`${q.teamId} = ANY(p.team_ids)`);
  if (q.role) where.push(ROLE_SQL[q.role]);
  let minBalls: number | null = null;
  if (sort === "batAvg" || sort === "batSr") {
    where.push(sql`r.balls >= ${batMin}`);
    minBalls = batMin;
  }
  if (sort === "bowlAvg" || sort === "econ") {
    where.push(sql`r.bowl_balls >= ${bowlMin}`);
    minBalls = bowlMin;
  }
  const order: Record<PlayerSort, SQL> = {
    runs: sql`r.runs DESC NULLS LAST`,
    wickets: sql`r.wickets DESC NULLS LAST`,
    batAvg: sql`r.bat_avg DESC NULLS LAST`,
    batSr: sql`r.bat_sr DESC NULLS LAST`,
    bowlAvg: sql`r.bowl_avg ASC NULLS LAST`,
    econ: sql`r.econ ASC NULLS LAST`,
    name: sql`p.name ASC`,
  };

  const res = await db.execute<Record<string, unknown>>(sql`
    WITH cs AS (
      SELECT player_id,
        array_agg(format_key::text ORDER BY format_key) AS fks,
        CASE WHEN bool_and(matches IS NOT NULL) THEN sum(matches)::int END AS matches,
        sum(bat_innings)::int AS bat_innings, sum(runs)::int AS runs, sum(balls)::int AS balls, sum(outs)::int AS outs,
        max(highest) AS highest, sum(hundreds)::int AS hundreds, sum(fifties)::int AS fifties,
        sum(wickets)::int AS wickets, sum(bowl_balls)::int AS bowl_balls, sum(runs_conceded)::int AS runs_conceded
      FROM career_stats WHERE format_key IN ${fks} GROUP BY player_id
    ), r AS (
      SELECT cs.*,
        CASE WHEN outs > 0 THEN runs::float8 / outs END AS bat_avg,
        CASE WHEN balls > 0 THEN runs * 100::float8 / balls END AS bat_sr,
        CASE WHEN wickets > 0 THEN runs_conceded::float8 / wickets END AS bowl_avg,
        CASE WHEN bowl_balls > 0 THEN runs_conceded * 6::float8 / bowl_balls END AS econ
      FROM cs
    )
    SELECT p.slug, p.name, p.gender, p.country, p.teams, p.role, p.last_played, r.*, count(*) OVER()::int AS total
    FROM r JOIN players p ON p.id = r.player_id
    ${where.length ? sql`WHERE ${sql.join(where, sql` AND `)}` : sql``}
    ORDER BY ${order[sort]}, p.name ASC, p.id ASC
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`);

  const rows = res.rows.map((r) => ({
    slug: r.slug as string,
    name: r.name as string,
    gender: r.gender as Gender,
    country: (r.country as string | null) ?? null,
    teams: (r.teams as string[]) ?? [],
    role: (r.role as string | null) ?? null,
    lastPlayed: (r.last_played as string | null) ?? null,
    formatKeys: r.fks as FormatKey[],
    matches: r.matches as number | null,
    batInnings: r.bat_innings as number | null,
    runs: r.runs as number | null,
    balls: r.balls as number | null,
    highest: r.highest as number | null,
    hundreds: r.hundreds as number | null,
    fifties: r.fifties as number | null,
    batAvg: r.bat_avg as number | null,
    batSr: r.bat_sr as number | null,
    wickets: r.wickets as number | null,
    bowlBalls: r.bowl_balls as number | null,
    bowlAvg: r.bowl_avg as number | null,
    econ: r.econ as number | null,
  }));
  return { rows, total: (res.rows[0]?.total as number | undefined) ?? 0, page, pageSize, minBalls };
}

/** Run or wicket leaders for one formatKey (index on format_key, runs/wickets DESC). */
async function loadLeaders(fk: FormatKey, metric: "runs" | "wickets", limit: number): Promise<LeaderRow[]> {
  const col = metric === "runs" ? careerStats.runs : careerStats.wickets;
  const rows = await db
    .select({
      slug: players.slug,
      name: players.name,
      country: players.country,
      value: col,
      innings: metric === "runs" ? careerStats.batInnings : careerStats.bowlInnings,
      balls: metric === "runs" ? careerStats.balls : careerStats.bowlBalls,
    })
    .from(careerStats)
    .innerJoin(players, eq(players.id, careerStats.playerId))
    .where(and(eq(careerStats.formatKey, fk), isNotNull(col)))
    .orderBy(sql`${col} DESC NULLS LAST`, asc(players.name))
    .limit(Math.min(Math.max(limit, 1), 50));
  return rows.map((r) => ({ ...r, value: r.value ?? 0 }));
}

/** Players by slug, for pages that only need names and links. */
async function loadPlayerNames(slugs: string[]): Promise<{ slug: string; name: string }[]> {
  if (!slugs.length) return [];
  return db.select({ slug: players.slug, name: players.name }).from(players).where(inArray(players.slug, slugs));
}

export const getPlayerProfile = cached("getPlayerProfile", loadPlayerProfile);
export const getPlayerSummary = cached("getPlayerSummary", loadPlayerSummary);
export const listPlayers = cached("listPlayers", loadPlayers);
export const getLeaders = cached("getLeaders", loadLeaders);
export const getPlayerNames = cached("getPlayerNames", loadPlayerNames);
