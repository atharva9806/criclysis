import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { datasetMeta } from "@/db/schema";
import type { DatasetMeta } from "@/lib/contract/db";
import type { FormatKey } from "@/lib/contract/pipeline";
import { cached } from "./cache";

/** The active dataset: the latest import run with status 'complete'. */
async function loadDatasetMeta(): Promise<DatasetMeta | null> {
  const [row] = await db
    .select()
    .from(datasetMeta)
    .where(eq(datasetMeta.status, "complete"))
    .orderBy(desc(datasetMeta.finishedAt), desc(datasetMeta.id))
    .limit(1);
  if (!row) return null;
  const m = row.manifest;
  const formats: DatasetMeta["formats"] = {};
  let dataAsOf = "";
  for (const [fk, f] of Object.entries(m.formats ?? {})) {
    if (!f) continue;
    formats[fk] = {
      matches: f.matches,
      players: f.players,
      firstDate: f.firstDate,
      lastDate: f.lastDate,
      label: f.label,
      formatKey: fk as FormatKey,
      format: f.format,
      gender: f.gender,
      deliveries: f.deliveries,
    };
    if (f.lastDate > dataAsOf) dataAsOf = f.lastDate;
  }
  return {
    buildId: row.buildId,
    generatedAt: row.generatedAt,
    importedAt: row.finishedAt,
    schemaVersion: row.schemaVersion,
    formats,
    thresholds: m.thresholds,
    dataAsOf: dataAsOf || row.generatedAt.slice(0, 10),
    fingerprint: row.sourceFingerprint,
    phases: m.phases,
    bowlingTypes: m.bowlingTypes,
    sources: m.sources,
    provenance: m.provenance,
    cohorts: row.cohorts ?? null,
  };
}

export const getDatasetMeta = cached("getDatasetMeta", loadDatasetMeta);
