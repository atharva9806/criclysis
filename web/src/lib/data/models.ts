import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { winModels } from "@/db/schema";
import type { FormatKey, Gender, ScoreSummary, WinModelJson } from "@/lib/contract/pipeline";
import { cached } from "./cache";
import { fmtOfKey, genderOfKey } from "./rows";

/** The win-probability model for a limited-overs formatKey, reassembled into the winprob.json shape (§1.8). */
async function loadWinModel(fk: FormatKey): Promise<WinModelJson | null> {
  const [r] = await db.select().from(winModels).where(eq(winModels.formatKey, fk)).limit(1);
  if (!r) return null;
  return {
    ...r.model,
    formatKey: r.formatKey,
    gender: genderOfKey(r.formatKey),
    matches: r.matches,
    halfLifeYears: r.halfLifeYears,
    validation: r.validation,
    venues: r.venues,
    golden: r.golden,
  };
}

export const getWinModel = cached("getWinModel", loadWinModel);

/** One stored model's validation and headline numbers, without the fitted arrays (for the method page). */
export type WinModelSummary = {
  formatKey: FormatKey;
  gender: Gender;
  format: "odi" | "t20i";
  /** Matches the published model is fitted on. */
  matches: number;
  halfLifeYears: number | null;
  /** First date of the holdout window the validation scores. */
  holdoutFrom: string | null;
  /** First-innings total that gives the side batting first an even chance. */
  par: number;
  maxBalls: number;
  trainMatches: number;
  testMatches: number;
  chase: ScoreSummary;
  firstInnings: ScoreSummary;
};

/** Every stored win model, in formatKey order. Reads par and maxBalls out of the model JSON, not the arrays. */
async function loadWinModelSummaries(): Promise<WinModelSummary[]> {
  const rows = await db
    .select({
      formatKey: winModels.formatKey,
      matches: winModels.matches,
      halfLifeYears: winModels.halfLifeYears,
      holdoutFrom: winModels.holdoutFrom,
      validation: winModels.validation,
      par: sql<number>`(${winModels.model}->>'par')::float8`,
      maxBalls: sql<number>`(${winModels.model}->>'maxBalls')::int`,
    })
    .from(winModels)
    .orderBy(asc(winModels.formatKey));
  return rows.map((r) => ({
    formatKey: r.formatKey,
    gender: genderOfKey(r.formatKey),
    format: fmtOfKey(r.formatKey) as "odi" | "t20i",
    matches: r.matches,
    halfLifeYears: r.halfLifeYears,
    holdoutFrom: r.holdoutFrom,
    par: Number(r.par),
    maxBalls: Number(r.maxBalls),
    trainMatches: r.validation.trainMatches,
    testMatches: r.validation.testMatches,
    chase: r.validation.chase,
    firstInnings: r.validation.firstInnings,
  }));
}

export const listWinModels = cached("listWinModels", loadWinModelSummaries);
