/**
 * Row shapes returned by the server data layer (web/src/lib/data/*.ts).
 *
 * Contract between B (data layer) and C/E (pages and components); see
 * docs/ARCHITECTURE.md §4.3. B may add fields; renaming or removing one is
 * a contract change.
 */
import type {
  Fmt,
  FormatKey,
  Gender,
  MatchInnings,
  MatchResult,
  PersonId,
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
  formats: Record<string, { matches: number; players: number; firstDate: string; lastDate: string; label: string }>;
  thresholds: Thresholds;
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
