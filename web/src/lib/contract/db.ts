/**
 * Row shapes returned by the server data layer (web/src/lib/data/*.ts).
 *
 * Contract between B (data layer) and C/E (pages and components); see
 * docs/ARCHITECTURE.md §4.3. B may add fields; renaming or removing one is
 * a contract change.
 */
import type {
  Cohorts,
  Fmt,
  FormatKey,
  Gender,
  Manifest,
  MatchInnings,
  MatchResult,
  PersonId,
  Record5,
  TeamFormat,
  TeamFormatDetail,
  TeamId,
  Thresholds,
  VenueKey,
  WinModelJson,
} from "./pipeline";

export type MatchRow = {
  id: string;
  gender: Gender;
  format: Fmt;
  formatKey: FormatKey;
  startDate: string;
  endDate: string;
  season: string;
  eventName: string | null;
  eventStage: string | null;
  eventMatchNumber: number | null;
  /** Added by B: event.group, info.match_type_number and info.missing (§1.6). */
  eventGroup: string | null;
  matchTypeNumber: number | null;
  missing: string[];
  venue: string;
  venueKey: VenueKey;
  city: string | null;
  country: string | null;
  team1Id: TeamId;
  team1: string;
  team2Id: TeamId;
  team2: string;
  tossWinner: string | null;
  tossDecision: "bat" | "field" | null;
  result: MatchResult;
  playerOfMatch: { id: PersonId | null; name: string }[];
  innings: MatchInnings[];
  scheduledOvers: number | null;
  hasReplay: boolean;
  featuredRank: number | null;
};

export type TraitRow = {
  kind: "strength" | "weakness";
  rank: number;
  discipline: "batting" | "bowling";
  dimension: string;
  dimensionKey: string;
  subject: string;
  subjectKey: string;
  metric: string;
  metricLabel: string;
  value: number;
  baseline: number | null;
  cohortMedian: number;
  percentile: number;
  balls: number;
  confidence: "high" | "medium" | "low";
  higherIsBetter: boolean;
  text: string;
};

/** A split with derived rates computed by lib/metrics.ts (not stored). */
export type SplitRow = {
  discipline: "batting" | "bowling";
  dimension: string;
  subject: string;
  label: string | null;
  balls: number;
  runs: number;
  outs: number | null;
  wickets: number | null;
  dots: number;
  fours: number;
  sixes: number;
  innings: number | null;
  average: number | null;
  strikeRate: number | null;
  economy: number | null;
  dotPct: number | null;
  boundaryPct: number | null;
};

export type DatasetMeta = {
  buildId: string;
  generatedAt: string;
  importedAt: string | null;
  schemaVersion: number;
  formats: Record<
    string,
    {
      matches: number;
      players: number;
      firstDate: string;
      lastDate: string;
      label: string;
      /** Added by B. */
      formatKey: FormatKey;
      format: Fmt;
      gender: Gender;
      deliveries: number;
    }
  >;
  thresholds: Thresholds;
  /** Added by B: the latest match date in the dataset ("data as of"). */
  dataAsOf: string;
  /** Added by B: Cricsheet source fingerprint of the build, when the pipeline wrote one. */
  fingerprint: string | null;
  phases: Manifest["phases"];
  bowlingTypes: Manifest["bowlingTypes"];
  sources: Manifest["sources"];
  provenance: Manifest["provenance"];
  cohorts: Cohorts | null;
};

export type ReplayContext = {
  formatKey: FormatKey;
  model: WinModelJson | null;
  datasetAsOf: string;
  thresholds: { minBallsSplit: number; minBallsBowledSplit: number };
  people: Array<{
    id: PersonId;
    name: string;
    team: string;
    player: { slug: string; bowlingType: string | null; battingHand: string | null } | null;
    traits: { strengths: TraitRow[]; weaknesses: TraitRow[] };
    batting: { vsType: SplitRow[]; vsTypePhase: SplitRow[]; vsBowler: SplitRow[] };
  }>;
};

// --------------------------------------------------------------- players (B2)

export type PlayerSort = "runs" | "wickets" | "batAvg" | "batSr" | "bowlAvg" | "econ" | "name";
export type RoleFilter = "batter" | "bowler" | "allrounder" | "wicketkeeper";

/** One row of /players: career_stats for one formatKey, or summed over the filtered formatKeys. */
export type PlayerListRow = {
  slug: string;
  name: string;
  gender: Gender;
  country: string | null;
  teams: string[];
  role: string | null;
  lastPlayed: string | null;
  formatKeys: FormatKey[];
  /** null when any summed format lacks the XI count (v1 data). */
  matches: number | null;
  batInnings: number | null;
  runs: number | null;
  balls: number | null;
  highest: number | null;
  hundreds: number | null;
  fifties: number | null;
  batAvg: number | null;
  batSr: number | null;
  wickets: number | null;
  bowlBalls: number | null;
  bowlAvg: number | null;
  econ: number | null;
};

export type LeaderRow = {
  slug: string;
  name: string;
  country: string | null;
  value: number;
  innings: number | null;
  balls: number | null;
};

export type PlayerHeader = {
  slug: string;
  sourceId: PersonId;
  name: string;
  fullName: string | null;
  gender: Gender;
  country: string | null;
  teams: string[];
  teamIds: TeamId[];
  role: string | null;
  battingHand: string | null;
  bowlingType: string | null;
  born: string | null;
  debut: string | null;
  lastPlayed: string | null;
  sampleBalls: number;
};

/** career_stats for one formatKey; rates come from the pipeline's overall split. */
export type CareerRow = {
  formatKey: FormatKey;
  format: Fmt;
  matches: number | null;
  batInnings: number | null;
  notOuts: number | null;
  runs: number | null;
  balls: number | null;
  outs: number | null;
  highest: number | null;
  highestNotOut: boolean | null;
  hundreds: number | null;
  fifties: number | null;
  fours: number | null;
  sixes: number | null;
  batAvg: number | null;
  batSr: number | null;
  bowlInnings: number | null;
  bowlBalls: number | null;
  runsConceded: number | null;
  wickets: number | null;
  maidens: number | null;
  bowlAvg: number | null;
  bowlEcon: number | null;
  bowlSr: number | null;
  best: { wickets: number; runs: number } | null;
  fourWkts: number | null;
  fiveWkts: number | null;
  strengths: number | null;
  weaknesses: number | null;
};

export type ProfileAxisRow = {
  axis: string;
  label: string;
  discipline: "batting" | "bowling";
  value: number;
  percentile: number;
  balls: number;
};

export type YearRow = {
  year: number;
  batInnings: number | null;
  runs: number | null;
  balls: number | null;
  outs: number | null;
  average: number | null;
  strikeRate: number | null;
  bowlInnings: number | null;
  bowlBalls: number | null;
  runsConceded: number | null;
  wickets: number | null;
  bowlAverage: number | null;
  economy: number | null;
};

export type InningsRow = {
  discipline: "batting" | "bowling";
  matchId: string;
  playedOn: string;
  opponent: string;
  /** From the matches table; null when the match is not in the database. */
  venue: string | null;
  inningsNo: number | null;
  runs: number | null;
  ballsFaced: number | null;
  fours: number | null;
  sixes: number | null;
  position: number | null;
  out: boolean | null;
  dismissal: string | null;
  ballsBowled: number | null;
  runsConceded: number | null;
  wickets: number | null;
  maidens: number | null;
};

export type DismissalRow = { discipline: "batting" | "bowling"; kind: string; subject: string; count: number };

/** Runs and dismissals over the most recent innings, next to the career figures. */
export type FormSummary = {
  innings: number;
  runs: number;
  outs: number;
  balls: number;
  average: number | null;
  strikeRate: number | null;
  from: string;
  to: string;
};

export type PlayerProfile = {
  player: PlayerHeader;
  careers: CareerRow[];
  formatKey: FormatKey | null;
  strengths: TraitRow[];
  weaknesses: TraitRow[];
  profile: ProfileAxisRow[];
  splits: SplitRow[];
  yearly: YearRow[];
  recentBatting: InningsRow[];
  recentBowling: InningsRow[];
  form: { batting: FormSummary | null; bowling: { innings: number; wickets: number; runsConceded: number; balls: number; from: string; to: string } | null };
  dismissals: DismissalRow[];
};

export type PlayerSummary = {
  player: PlayerHeader;
  careers: CareerRow[];
  formatKey: FormatKey | null;
  profile: ProfileAxisRow[];
  strengths: TraitRow[];
  weaknesses: TraitRow[];
};

// ----------------------------------------------------------------- teams (B2)

export type TeamListRow = {
  id: TeamId;
  name: string;
  gender: Gender;
  label: string;
  firstMatch: string | null;
  lastMatch: string | null;
  matches: number;
  formats: Partial<Record<Fmt, Record5 & { first: string | null; last: string | null }>>;
};

export type TeamPage = {
  team: { id: TeamId; name: string; gender: Gender; label: string };
  formats: Fmt[];
  formatKey: FormatKey;
  span: { first: string | null; last: string | null };
  record: Record5;
  detail: TeamFormatDetail;
  recent: MatchRow[];
};

export type H2HRow = TeamFormat["headToHead"][number];

// -------------------------------------------------------------- strategy (B2)

/** One evidence line: a statement and the sample it rests on. */
export type DossierLine = { text: string; sample: string };

export type PlayerDossier = {
  player: PlayerHeader;
  formatKey: FormatKey;
  career: CareerRow | null;
  batting: { attack: TraitRow[]; avoid: TraitRow[]; vsType: SplitRow[]; byPhase: SplitRow[] } | null;
  bowling: { strengths: TraitRow[]; weaknesses: TraitRow[]; byHand: SplitRow[]; byPhase: SplitRow[] } | null;
};

export type MatchupPlan = {
  formatKey: FormatKey;
  team: { id: TeamId; label: string };
  opponent: { id: TeamId; label: string };
  headToHead: H2HRow | null;
  lines: { heading: string; items: DossierLine[] }[];
  opponentBatters: (TeamFormat["topBatters"][number] & { traits: TraitRow[] })[];
  opponentBowlers: (TeamFormat["topBowlers"][number] & { traits: TraitRow[] })[];
  recent: MatchRow[];
};
