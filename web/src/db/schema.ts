/**
 * Postgres schema (docs/ARCHITECTURE.md §2).
 *
 * camelCase in TypeScript, snake_case in SQL. Every row traces back to a
 * pipeline output file (§1); the importer (web/scripts/import) is the only
 * writer. Derived split rates (average, strike rate, ...) are not stored:
 * lib/metrics.ts computes them from the counts.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  serial,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type {
  Cohorts,
  GoldenState,
  Manifest,
  Match,
  MatchInnings,
  TeamFormatDetail,
  Venues,
  WinModelJson,
} from "../lib/contract/pipeline";

// drizzle-orm 0.45.2 has no bytea builder.
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

export const genderEnum = pgEnum("gender", ["male", "female"]);
export const formatEnum = pgEnum("format", ["test", "odi", "t20i"]);
export const disciplineEnum = pgEnum("discipline", ["batting", "bowling"]);
export const formatKeyEnum = pgEnum("format_key", ["test-m", "odi-m", "t20i-m", "test-w", "odi-w", "t20i-w"]);

// ------------------------------------------------------------------ players

export const players = pgTable(
  "players",
  {
    id: serial("id").primaryKey(),
    sourceId: text("source_id").notNull().unique(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    fullName: text("full_name"),
    gender: genderEnum("gender").notNull(),
    country: text("country"),
    teams: text("teams").array().notNull().default(sql`'{}'::text[]`),
    teamIds: text("team_ids").array().notNull().default(sql`'{}'::text[]`),
    role: text("role"),
    battingHand: text("batting_hand"),
    bowlingType: text("bowling_type"),
    cricinfoId: text("cricinfo_id"),
    born: text("born"),
    debut: date("debut", { mode: "string" }),
    lastPlayed: date("last_played", { mode: "string" }),
    sampleBalls: integer("sample_balls").notNull(),
    // Reserved and unpopulated; never rendered.
    overallRating: real("overall_rating"),
    formIndex: real("form_index"),
    contentHash: text("content_hash").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (t) => [index("players_gender_last_played_idx").on(t.gender, t.lastPlayed)],
);

/** One row per player x formatKey. */
export const careerStats = pgTable(
  "career_stats",
  {
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    formatKey: formatKeyEnum("format_key").notNull(),
    matches: integer("matches"),
    batInnings: integer("bat_innings"),
    notOuts: integer("not_outs"),
    runs: integer("runs"),
    balls: integer("balls"),
    outs: integer("outs"),
    highest: integer("highest"),
    highestNotOut: boolean("highest_not_out"),
    hundreds: integer("hundreds"),
    fifties: integer("fifties"),
    fours: integer("fours"),
    sixes: integer("sixes"),
    dots: integer("dots"),
    batAvg: real("bat_avg"),
    batSr: real("bat_sr"),
    bowlInnings: integer("bowl_innings"),
    bowlBalls: integer("bowl_balls"),
    runsConceded: integer("runs_conceded"),
    wickets: integer("wickets"),
    maidens: integer("maidens"),
    bowlDots: integer("bowl_dots"),
    fourWkts: integer("four_wkts"),
    fiveWkts: integer("five_wkts"),
    bestWickets: integer("best_wickets"),
    bestRuns: integer("best_runs"),
    bowlAvg: real("bowl_avg"),
    bowlEcon: real("bowl_econ"),
    bowlSr: real("bowl_sr"),
    strengths: smallint("strengths"),
    weaknesses: smallint("weaknesses"),
    statsHash: text("stats_hash").notNull(),
    analysisHash: text("analysis_hash").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.playerId, t.formatKey] }),
    index("career_stats_fk_runs_idx").on(t.formatKey, t.runs.desc().nullsLast()),
    index("career_stats_fk_wickets_idx").on(t.formatKey, t.wickets.desc().nullsLast()),
  ],
);

/** Batting and bowling innings; replaced per (player_id, format_key). */
export const innings = pgTable(
  "innings",
  {
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    formatKey: formatKeyEnum("format_key").notNull(),
    discipline: disciplineEnum("discipline").notNull(),
    matchId: text("match_id").notNull(),
    playedOn: date("played_on", { mode: "string" }).notNull(),
    opponent: text("opponent").notNull(),
    inningsNo: smallint("innings_no"),
    // batting
    runs: smallint("runs"),
    ballsFaced: smallint("balls_faced"),
    fours: smallint("fours"),
    sixes: smallint("sixes"),
    position: smallint("position"),
    out: boolean("out"),
    chase: boolean("chase"),
    dismissal: text("dismissal"),
    dismissedById: text("dismissed_by_id"),
    // bowling
    ballsBowled: smallint("balls_bowled"),
    runsConceded: smallint("runs_conceded"),
    wickets: smallint("wickets"),
    maidens: smallint("maidens"),
  },
  (t) => [index("innings_player_fk_idx").on(t.playerId, t.formatKey)],
);

export const yearlyStats = pgTable(
  "yearly_stats",
  {
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    formatKey: formatKeyEnum("format_key").notNull(),
    year: smallint("year").notNull(),
    batInnings: integer("bat_innings"),
    runs: integer("runs"),
    balls: integer("balls"),
    outs: integer("outs"),
    fours: integer("fours"),
    sixes: integer("sixes"),
    bowlInnings: integer("bowl_innings"),
    bowlBalls: integer("bowl_balls"),
    runsConceded: integer("runs_conceded"),
    wickets: integer("wickets"),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.formatKey, t.year] })],
);

/**
 * Gated splits (balls >= the display thresholds). Overall lives in
 * career_stats and byYear in yearly_stats. `label` carries the name for
 * vsBowler/vsBatter rows, whose subject is a person id (v2).
 */
export const splits = pgTable(
  "splits",
  {
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    formatKey: formatKeyEnum("format_key").notNull(),
    discipline: disciplineEnum("discipline").notNull(),
    dimension: text("dimension").notNull(),
    subject: text("subject").notNull(),
    label: text("label"),
    balls: integer("balls").notNull(),
    runs: integer("runs").notNull(),
    outs: integer("outs"),
    wickets: integer("wickets"),
    dots: integer("dots"),
    fours: integer("fours"),
    sixes: integer("sixes"),
    innings: smallint("innings"),
  },
  (t) => [index("splits_player_fk_idx").on(t.playerId, t.formatKey)],
);

export const traits = pgTable(
  "traits",
  {
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    formatKey: formatKeyEnum("format_key").notNull(),
    kind: text("kind").notNull(),
    rank: smallint("rank").notNull(),
    claimId: text("claim_id").notNull(),
    discipline: disciplineEnum("discipline").notNull(),
    dimensionKey: text("dimension_key").notNull(),
    dimension: text("dimension").notNull(),
    subjectKey: text("subject_key").notNull(),
    subject: text("subject").notNull(),
    metric: text("metric").notNull(),
    metricLabel: text("metric_label").notNull(),
    value: real("value").notNull(),
    baseline: real("baseline"),
    cohortMedian: real("cohort_median").notNull(),
    percentile: real("percentile").notNull(),
    balls: integer("balls").notNull(),
    confidence: text("confidence").notNull(),
    higherIsBetter: boolean("higher_is_better").notNull(),
    text: text("text").notNull(),
  },
  (t) => [index("traits_player_fk_idx").on(t.playerId, t.formatKey)],
);

export const profileDimensions = pgTable(
  "profile_dimensions",
  {
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    formatKey: formatKeyEnum("format_key").notNull(),
    axis: text("axis").notNull(),
    label: text("label").notNull(),
    discipline: disciplineEnum("discipline").notNull(),
    value: real("value").notNull(),
    percentile: real("percentile").notNull(),
    balls: integer("balls").notNull(),
  },
  (t) => [index("profile_dimensions_player_fk_idx").on(t.playerId, t.formatKey)],
);

/** kind: 'how' (batting dismissals), 'byType' (dismissed by bowling type), 'wicketKind' (bowling). */
export const dismissalCounts = pgTable(
  "dismissal_counts",
  {
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    formatKey: formatKeyEnum("format_key").notNull(),
    discipline: disciplineEnum("discipline").notNull(),
    kind: text("kind").notNull(),
    subject: text("subject").notNull(),
    count: integer("count").notNull(),
  },
  (t) => [index("dismissal_counts_player_fk_idx").on(t.playerId, t.formatKey)],
);

// -------------------------------------------------------------------- teams

export const teams = pgTable(
  "teams",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    gender: genderEnum("gender").notNull(),
    label: text("label").notNull(),
    firstMatch: date("first_match", { mode: "string" }),
    lastMatch: date("last_match", { mode: "string" }),
    matches: integer("matches").notNull(),
    contentHash: text("content_hash").notNull(),
  },
  (t) => [index("teams_gender_name_idx").on(t.gender, t.name)],
);

export const teamSummaries = pgTable(
  "team_summaries",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    formatKey: formatKeyEnum("format_key").notNull(),
    matches: integer("matches").notNull(),
    won: integer("won").notNull(),
    lost: integer("lost").notNull(),
    tied: integer("tied").notNull(),
    drawn: integer("drawn").notNull(),
    noResult: integer("no_result").notNull(),
    winPct: real("win_pct"),
    firstDate: date("first_date", { mode: "string" }),
    lastDate: date("last_date", { mode: "string" }),
    detail: jsonb("detail").$type<TeamFormatDetail>().notNull(),
    contentHash: text("content_hash").notNull(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.formatKey] })],
);

export const venues = pgTable("venues", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  city: text("city"),
  country: text("country"),
  formats: jsonb("formats").$type<Venues["venues"][string]["formats"]>().notNull(),
  contentHash: text("content_hash").notNull(),
});

// ------------------------------------------------------------------ matches

export const matches = pgTable(
  "matches",
  {
    id: text("id").primaryKey(),
    gender: genderEnum("gender").notNull(),
    format: formatEnum("format").notNull(),
    formatKey: formatKeyEnum("format_key").notNull(),
    matchTypeNumber: integer("match_type_number"),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    season: text("season").notNull(),
    eventName: text("event_name"),
    eventStage: text("event_stage"),
    eventGroup: text("event_group"),
    eventMatchNumber: smallint("event_match_number"),
    venue: text("venue").notNull(),
    venueKey: text("venue_key").notNull(),
    city: text("city"),
    country: text("country"),
    // No FK to teams: keeps the upsert order simple.
    team1Id: text("team1_id").notNull(),
    team1: text("team1").notNull(),
    team2Id: text("team2_id").notNull(),
    team2: text("team2").notNull(),
    tossWinner: text("toss_winner"),
    tossDecision: text("toss_decision"),
    resultType: text("result_type").notNull(),
    winnerId: text("winner_id"),
    winner: text("winner"),
    marginRuns: smallint("margin_runs"),
    marginWickets: smallint("margin_wickets"),
    marginInnings: boolean("margin_innings").notNull(),
    method: text("method"),
    eliminator: text("eliminator"),
    resultText: text("result_text").notNull(),
    playerOfMatch: jsonb("player_of_match").$type<Match["playerOfMatch"]>().notNull(),
    innings: jsonb("innings").$type<MatchInnings[]>().notNull(),
    scheduledOvers: smallint("scheduled_overs"),
    missing: text("missing").array().notNull().default(sql`'{}'::text[]`),
    hasReplay: boolean("has_replay").notNull(),
    featuredRank: smallint("featured_rank"),
    contentHash: text("content_hash").notNull(),
  },
  (t) => [
    index("matches_end_date_idx").on(t.endDate.desc(), t.id),
    index("matches_fk_end_date_idx").on(t.formatKey, t.endDate.desc()),
    index("matches_team1_end_date_idx").on(t.team1Id, t.endDate.desc()),
    index("matches_team2_end_date_idx").on(t.team2Id, t.endDate.desc()),
  ],
);

/** The pipeline's replays/<matchId>.json.gz, stored as is. */
export const matchReplays = pgTable("match_replays", {
  matchId: text("match_id")
    .primaryKey()
    .references(() => matches.id, { onDelete: "cascade" }),
  gz: bytea("gz").notNull(),
  bytes: integer("bytes").notNull(),
  balls: integer("balls").notNull(),
  contentHash: text("content_hash").notNull(),
});

// --------------------------------------------------------- models and meta

/** The fitted parts of WinModelJson; the rest has its own columns. */
export type WinModelCore = Pick<
  WinModelJson,
  "format" | "maxBalls" | "theta" | "features" | "resources" | "dispersion" | "resourceParams" | "firstInningsWin" | "par"
>;

export const winModels = pgTable("win_models", {
  formatKey: formatKeyEnum("format_key").primaryKey(),
  model: jsonb("model").$type<WinModelCore>().notNull(),
  venues: jsonb("venues").$type<WinModelJson["venues"]>().notNull(),
  validation: jsonb("validation").$type<WinModelJson["validation"]>().notNull(),
  golden: jsonb("golden").$type<GoldenState[]>().notNull(),
  matches: integer("matches").notNull(),
  halfLifeYears: real("half_life_years"),
  holdoutFrom: date("holdout_from", { mode: "string" }),
  contentHash: text("content_hash").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

/** Manifest fields kept per import run, normalised to the v2 shape. */
export type StoredManifest = Pick<Manifest, "formats" | "phases" | "bowlingTypes" | "thresholds" | "sources" | "provenance">;

export type TableChanges = Record<string, { inserted: number; updated: number; deleted: number }>;

/** One row per import run; the active dataset is the latest status = 'complete'. */
export const datasetMeta = pgTable(
  "dataset_meta",
  {
    id: serial("id").primaryKey(),
    buildId: text("build_id").notNull(),
    schemaVersion: smallint("schema_version").notNull(),
    sourceFingerprint: text("source_fingerprint"),
    status: text("status").notNull(), // running | complete | failed | aborted
    startedAt: timestamp("started_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "string" }),
    generatedAt: timestamp("generated_at", { withTimezone: true, mode: "string" }).notNull(),
    manifest: jsonb("manifest").$type<StoredManifest>().notNull(),
    cohorts: jsonb("cohorts").$type<Cohorts>(),
    counts: jsonb("counts").$type<Record<string, unknown>>(),
    changes: jsonb("changes").$type<TableChanges>(),
    error: text("error"),
  },
  (t) => [index("dataset_meta_status_finished_idx").on(t.status, t.finishedAt.desc())],
);
