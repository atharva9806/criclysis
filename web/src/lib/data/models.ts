import { eq } from "drizzle-orm";
import { db } from "@/db";
import { winModels } from "@/db/schema";
import type { FormatKey, WinModelJson } from "@/lib/contract/pipeline";
import { cached } from "./cache";
import { genderOfKey } from "./rows";

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
