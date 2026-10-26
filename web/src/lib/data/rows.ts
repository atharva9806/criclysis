/** Conversions from database rows to the contract row types (lib/contract/db.ts). */
import type { matches, traits } from "@/db/schema";
import type { MatchRow, TraitRow } from "@/lib/contract/db";
import { FORMAT_KEYS, type Fmt, type FormatKey, type Gender } from "@/lib/contract/pipeline";

export type MatchDbRow = typeof matches.$inferSelect;
export type TraitDbRow = typeof traits.$inferSelect;

export function genderOfKey(fk: FormatKey): Gender {
  return fk.endsWith("-w") ? "female" : "male";
}

export function fmtOfKey(fk: FormatKey): Fmt {
  return fk.slice(0, fk.indexOf("-")) as Fmt;
}

/** The formatKeys matching an optional gender and format; null when neither is given (no filter). */
export function formatKeysFor(gender?: Gender, format?: Fmt): FormatKey[] | null {
  if (!gender && !format) return null;
  return FORMAT_KEYS.filter((fk) => (!format || fmtOfKey(fk) === format) && (!gender || genderOfKey(fk) === gender));
}

export function toMatchRow(r: MatchDbRow): MatchRow {
  const by: MatchRow["result"]["by"] = {};
  if (r.marginRuns !== null) by.runs = r.marginRuns;
  if (r.marginWickets !== null) by.wickets = r.marginWickets;
  // Cricsheet's outcome.by.innings is always 1 when present (an innings win).
  if (r.marginInnings) by.innings = 1;
  return {
    id: r.id,
    gender: r.gender,
    format: r.format,
    formatKey: r.formatKey,
    startDate: r.startDate,
    endDate: r.endDate,
    season: r.season,
    eventName: r.eventName,
    eventStage: r.eventStage,
    eventMatchNumber: r.eventMatchNumber,
    eventGroup: r.eventGroup,
    matchTypeNumber: r.matchTypeNumber,
    missing: r.missing,
    venue: r.venue,
    venueKey: r.venueKey,
    city: r.city,
    country: r.country,
    team1Id: r.team1Id,
    team1: r.team1,
    team2Id: r.team2Id,
    team2: r.team2,
    tossWinner: r.tossWinner,
    tossDecision: r.tossDecision === "bat" || r.tossDecision === "field" ? r.tossDecision : null,
    result: {
      type: r.resultType as MatchRow["result"]["type"],
      winner: r.winner,
      winnerId: r.winnerId,
      by,
      method: r.method,
      eliminator: r.eliminator,
      text: r.resultText,
    },
    playerOfMatch: r.playerOfMatch,
    innings: r.innings,
    scheduledOvers: r.scheduledOvers,
    hasReplay: r.hasReplay,
    featuredRank: r.featuredRank,
  };
}

export function toTraitRow(t: TraitDbRow): TraitRow {
  return {
    kind: t.kind as TraitRow["kind"],
    rank: t.rank,
    discipline: t.discipline,
    dimension: t.dimension,
    dimensionKey: t.dimensionKey,
    subject: t.subject,
    subjectKey: t.subjectKey,
    metric: t.metric,
    metricLabel: t.metricLabel,
    value: t.value,
    baseline: t.baseline,
    cohortMedian: t.cohortMedian,
    percentile: t.percentile,
    balls: t.balls,
    confidence: t.confidence as TraitRow["confidence"],
    higherIsBetter: t.higherIsBetter,
    text: t.text,
  };
}
