/**
 * Types for the pipeline's output files under data/out/ (schemaVersion 2).
 *
 * This is a contract shared by the pipeline (A), the importer and data layer
 * (B) and the replay engine (C). Change it only in a contract PR; see
 * docs/ARCHITECTURE.md §1 and §5.0.
 */

export type Gender = "male" | "female";
export type G = "m" | "w";
export type Fmt = "test" | "odi" | "t20i";
export type FormatKey = `${Fmt}-${G}`;
/** Cricsheet registry id (8 hex characters); equals players.source_id. */
export type PersonId = string;
/** `${slug(teamName)}-${G}`, e.g. "india-w". */
export type TeamId = string;
/** Cricsheet file stem, e.g. "1384439". */
export type MatchId = string;
/** Ground name before the first comma, with "|<city>" for ambiguous names. */
export type VenueKey = string;

export const FORMAT_KEYS: FormatKey[] = ["test-m", "odi-m", "t20i-m", "test-w", "odi-w", "t20i-w"];

export function formatKey(format: Fmt, gender: Gender): FormatKey {
  return `${format}-${gender === "female" ? "w" : "m"}`;
}

type Rec<T> = Record<string, T>;

// ---------------------------------------------------------------- manifest

export type Manifest = {
  schemaVersion: 2;
  buildId: string;
  generated: string;
  fingerprint: string;
  playerCount: number;
  matchCount: number;
  formats: Partial<
    Record<
      FormatKey,
      {
        formatKey: FormatKey;
        format: Fmt;
        gender: Gender;
        label: string;
        archive: string;
        innings_limit: number;
        balls_per_innings: number | null;
        white_ball: boolean;
        matches: number;
        deliveries: number;
        players: number;
        venues: number;
        bowlersMissingStyle: number;
        firstDate: string;
        lastDate: string;
      }
    >
  >;
  phases: Record<Fmt, { key: string; from: number; to: number; label: string }[]>;
  bowlingTypes: Record<
    string,
    { label: string; family: "pace" | "spin"; arm: string; swing?: string; turn?: string }
  >;
  thresholds: Thresholds;
  sources: Record<string, { name: string; base: string; licence: string; role: string; bulk: boolean }>;
  provenance: {
    sources: { id: string; used: boolean; note: string }[];
    enrichment: Record<string, number | boolean>;
    dataset: "live" | "demo";
    identity: { ambiguousNames: number; stylesSkippedAmbiguous: number };
  };
};

export type Thresholds = {
  minBallsSplit: number;
  minBallsClaim: number;
  minBallsCohort: number;
  minBallsBowledSplit: number;
  minBallsBowledClaim: number;
  minBallsBowledCohort: number;
  strengthPercentile: number;
  weaknessPercentile: number;
  teamMinMatches: number;
  venueMinInnings: number;
};

export type Fingerprint = {
  archives: Record<string, { files: number; sha256: string }>;
  combined: string;
};

// ----------------------------------------------------------------- players

export type BatSplit = {
  balls: number;
  runs: number;
  outs: number;
  fours: number;
  sixes: number;
  dots: number;
  innings: number;
  avg: number | null;
  sr: number;
  bpd: number | null;
  dotPct: number;
  bdryPct: number;
  bdryRunsPct: number;
};

export type BowlSplit = {
  balls: number;
  runs: number;
  wickets: number;
  dots: number;
  fours: number;
  sixes: number;
  innings: number;
  overs: number;
  econ: number;
  avg: number | null;
  sr: number | null;
  dotPct: number;
  bdryPct: number;
};

export type Claim = {
  id: string;
  kind: "strength" | "weakness";
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
  sampleNote: string;
  confidence: "high" | "medium" | "low";
  text: string;
  higherIsBetter: boolean;
};

export type ProfileAxis = {
  label: string;
  value: number;
  percentile: number;
  discipline: "batting" | "bowling";
  balls: number;
};

export type BattingInnings = {
  m: MatchId;
  d: string;
  vs: string;
  g: string;
  c: string;
  r: number;
  b: number;
  f4: number;
  f6: number;
  out: boolean;
  pos: number;
  inn: number;
  chase: boolean;
  how: string;
  by: string;
  byId?: PersonId | "";
};

export type BowlingInnings = {
  m: MatchId;
  d: string;
  vs: string;
  g: string;
  c: string;
  b: number;
  r: number;
  w: number;
  md: number;
};

export type FormatPayload = {
  format: Fmt;
  formatLabel: string;
  formatKey?: FormatKey; // v2
  gender?: Gender; // v2
  matches?: number; // v2
  strengths: Claim[];
  weaknesses: Claim[];
  profile: Record<string, ProfileAxis>;
  batting?: {
    overall: BatSplit;
    milestones: {
      fifties: number;
      hundreds: number;
      oneFifties: number;
      doubleHundreds: number;
      notOuts: number;
      highest: number;
      highestNotOut: boolean;
    };
    byType: Rec<BatSplit>;
    byFamily: Rec<BatSplit>;
    byPhase: Rec<BatSplit>;
    byEntry: Rec<BatSplit>;
    byTypePhase: Rec<BatSplit>;
    byOpposition: Rec<BatSplit>;
    byCountry: Rec<BatSplit>;
    byVenue: Rec<BatSplit>;
    byHome: Rec<BatSplit>;
    byInningsNo: Rec<BatSplit>;
    byChase: Rec<BatSplit>;
    byPosition: Rec<BatSplit>;
    byYear: Rec<BatSplit>;
    dismissals: Rec<number>;
    dismissedByType: Rec<number>;
    vsBowler: Record<string, BatSplit & { name?: string }>;
    innings: BattingInnings[];
  };
  bowling?: {
    overall: BowlSplit;
    milestones: {
      best: { wickets: number; runs: number } | null;
      fiveWickets: number;
      fourWickets: number;
    };
    byHand: Rec<BowlSplit>;
    byPhase: Rec<BowlSplit>;
    byOpposition: Rec<BowlSplit>;
    byCountry: Rec<BowlSplit>;
    byHome: Rec<BowlSplit>;
    byInningsNo: Rec<BowlSplit>;
    byYear: Rec<BowlSplit>;
    wicketKinds: Rec<number>;
    vsBatter: Record<string, BowlSplit & { name?: string }>;
    innings: BowlingInnings[];
  };
};

export type PlayerFile = {
  id: PersonId;
  slug: string;
  name: string;
  gender?: Gender; // v2; v1 files are men's only
  meta: {
    bowlingType: string;
    battingHand: string;
    role: string;
    country: string;
    cricinfoId: string;
    fullName: string;
    born: string;
    teams: string[];
    teamIds?: TeamId[];
    debut: string;
    lastPlayed: string;
    gender?: Gender;
  };
  formats: Partial<Record<Fmt, FormatPayload>>;
};

export type PlayersIndexRow = {
  id: PersonId;
  slug: string;
  name: string;
  fullName: string;
  gender?: Gender;
  teams: string[];
  teamIds?: TeamId[];
  country: string;
  role: string;
  battingHand: string;
  bowlingType: string;
  bowlingLabel: string;
  born: string;
  debut: string;
  lastPlayed: string;
  cricinfoId: string;
  sampleBalls?: number;
  formats: Partial<
    Record<
      Fmt,
      {
        matches?: number;
        bat?: {
          inns: number;
          runs: number;
          balls: number;
          avg: number | null;
          sr: number;
          hs: number;
          "100s": number;
          "50s": number;
        };
        bowl?: {
          inns: number;
          wkts: number;
          balls: number;
          runs: number;
          avg: number | null;
          econ: number;
          sr: number | null;
          "5w": number;
        };
        strengths: number;
        weaknesses: number;
      }
    >
  >;
};

export type PlayersIndex = { players: PlayersIndexRow[] };

// ------------------------------------------------------- cohorts and venues

export type CohortMetric =
  | "batting.average"
  | "batting.strike_rate"
  | "batting.dot_pct"
  | "batting.boundary_pct"
  | "batting.balls_per_dismissal"
  | "bowling.average"
  | "bowling.economy"
  | "bowling.strike_rate"
  | "bowling.dot_pct";

export type Cohorts = Partial<
  Record<FormatKey, Partial<Record<CohortMetric, { n: number; p10: number; p25: number; p50: number; p75: number; p90: number }>>>
>;

export type Venues = {
  venues: Record<
    VenueKey,
    {
      key: VenueKey;
      name: string;
      city: string;
      country: string;
      formats: Partial<
        Record<
          FormatKey,
          {
            matches: number;
            runsPerOver: number;
            ballsPerWicket: number | null;
            firstInnings: { n: number; avg: number | null };
          }
        >
      >;
    }
  >;
};

// ----------------------------------------------------------------- matches

export type MatchResult = {
  type: "win" | "tie" | "draw" | "noResult";
  winner: string | null;
  winnerId: TeamId | null;
  by: { runs?: number; wickets?: number; innings?: number };
  method: string | null;
  eliminator: string | null;
  text: string;
};

export type MatchInnings = {
  team: string;
  teamId: TeamId;
  runs: number;
  wickets: number;
  balls: number;
  overs: string;
  declared: boolean;
  target: { runs: number; overs: number | null } | null;
  penaltyRuns: number;
};

export type Match = {
  id: MatchId;
  gender: Gender;
  format: Fmt;
  formatKey: FormatKey;
  matchTypeNumber: number | null;
  startDate: string;
  endDate: string;
  season: string;
  event: { name: string | null; stage: string | null; matchNumber: number | null; group: string | null };
  venue: string;
  venueKey: VenueKey;
  city: string | null;
  country: string | null;
  teams: [{ id: TeamId; name: string }, { id: TeamId; name: string }];
  toss: { winner: string | null; decision: "bat" | "field" | null };
  result: MatchResult;
  playerOfMatch: { id: PersonId | null; name: string }[];
  scheduledOvers: number | null;
  innings: MatchInnings[];
  missing: string[];
  hasReplay: boolean;
  featuredRank: number | null;
};

export type MatchesFile = { schemaVersion: 2; matches: Match[] };

// ------------------------------------------------------------------- teams

export type Record5 = {
  matches: number;
  won: number;
  lost: number;
  tied: number;
  drawn: number;
  noResult: number;
  winPct: number | null;
};

export type PhaseRow = {
  phase: string;
  label: string;
  innings: number;
  balls: number;
  runs: number;
  wickets: number;
  dots: number;
  fours: number;
  sixes: number;
};

export type TeamFormat = {
  formatKey: FormatKey;
  span: { first: string; last: string };
  record: Record5;
  byYear: Array<{ year: string } & Record5>;
  headToHead: Array<{ opponentId: TeamId; opponent: string; lastMatchId: MatchId; lastDate: string } & Record5>;
  venueType: { home: Record5; away: Record5; neutral: Record5; unknown: Record5 };
  batFirstChase: { battingFirst: Record5; chasing: Record5 };
  toss: {
    won: number;
    lost: number;
    winPctWonToss: number | null;
    winPctLostToss: number | null;
    decisions: { bat: Record5; field: Record5 };
  };
  venues: Array<{
    venueKey: VenueKey;
    name: string;
    city: string;
    country: string;
    firstInnings: { n: number; avg: number | null };
    teamFirstInnings: { n: number; avg: number | null };
    record: Record5;
  }>;
  phases: { batting: PhaseRow[]; bowling: PhaseRow[] };
  topBatters: Array<{
    playerId: PersonId;
    name: string;
    slug: string | null;
    innings: number;
    runs: number;
    balls: number;
    outs: number;
    hundreds: number;
    fifties: number;
    highest: number;
  }>;
  topBowlers: Array<{
    playerId: PersonId;
    name: string;
    slug: string | null;
    innings: number;
    balls: number;
    runsConceded: number;
    wickets: number;
    fiveWickets: number;
  }>;
  recentMatchIds: MatchId[];
};

/** team_summaries.detail: a TeamFormat without record and span. */
export type TeamFormatDetail = Omit<TeamFormat, "record" | "span">;

export type TeamsIndex = {
  schemaVersion: 2;
  teams: Array<{
    id: TeamId;
    name: string;
    gender: Gender;
    label: string;
    formats: Partial<Record<Fmt, Record5 & { first: string; last: string }>>;
  }>;
};

export type TeamFile = {
  schemaVersion: 2;
  id: TeamId;
  name: string;
  gender: Gender;
  label: string;
  formats: Partial<Record<Fmt, TeamFormat>>;
};

// ---------------------------------------------------------- win probability

export type ScoreSummary = {
  states: number;
  brier: number;
  baselineBrier: number;
  skill: number;
  logLoss: number;
  calibration: { bin: string; states: number; predicted: number | null; observed: number | null }[];
};

export type GoldenState = {
  ballsLeft: number;
  wickets: number;
  runs: number;
  need: number;
  chase: number;
  battingFirst: number;
  projected: [number, number, number];
};

export type WinModelJson = {
  /** v2; v1 files carry only `format` and are men's. */
  formatKey?: FormatKey;
  gender?: Gender;
  format: "odi" | "t20i";
  maxBalls: number;
  theta: number[];
  features: string[];
  resources: number[][];
  dispersion: number[];
  resourceParams: { z: number; b: number }[];
  firstInningsWin: number[];
  par: number;
  matches: number;
  halfLifeYears: number | null;
  validation: {
    trainMatches: number;
    testMatches: number;
    halfLifeSelection?: object[];
    firstInnings: ScoreSummary;
    chase: ScoreSummary;
  };
  venues: Record<VenueKey, { matches: number; averageFirstInnings: number; par: number }>;
  golden: GoldenState[];
};

/** v2 is keyed by FormatKey; v1 (fixtures/data-out-v1) is keyed by "odi" | "t20i". */
export type WinProbFile = {
  schemaVersion?: 2;
  generatedFrom: string;
  holdoutFrom: string;
  formats: Partial<Record<string, WinModelJson>>;
};

// ----------------------------------------------------------------- replays

export type ExtraType = "wides" | "noballs" | "byes" | "legbyes" | "penalty" | null;

/** [over, batter, bowler, nonStriker, runsBat, extras, extraType, wicketKind, playerOut] */
export type Ball = [
  over: number,
  batter: number,
  bowler: number,
  nonStriker: number,
  runsBat: number,
  extras: number,
  extraType: ExtraType,
  wicketKind: string | null,
  playerOut: number | null,
];

export type Replay = {
  schemaVersion?: 2;
  id: MatchId;
  format: Fmt;
  formatKey?: FormatKey;
  gender?: Gender;
  title: string;
  event: string;
  stage: string;
  date: string;
  venue: string;
  venueKey?: VenueKey;
  city: string;
  teams: string[];
  toss: { winner?: string; decision?: string };
  result: string;
  winner: string | null;
  scheduledOvers?: number | null;
  method?: string | null;
  people: Array<{ id: PersonId; name: string; team: string; bt?: string; bh?: "right" | "left" }>;
  innings: Array<{
    team: string;
    target: number | null;
    targetOvers?: number | null;
    penaltyRuns?: { pre: number; post: number };
    balls: Ball[];
  }>;
  credit: string;
};

export type ReplayIndexRow = {
  id: MatchId;
  format: Fmt;
  formatKey?: FormatKey;
  gender?: Gender;
  title: string;
  event: string;
  stage: string;
  date: string;
  venue: string;
  result: string;
};
