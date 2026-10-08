import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { datasetMeta } from "@/db/schema";

export const dynamic = "force-dynamic";

const STALE_HOURS = 72;

/** Liveness plus the age of the active dataset (uncached: this is what monitors read). */
export async function GET() {
  try {
    const [row] = await db
      .select({ buildId: datasetMeta.buildId, generatedAt: datasetMeta.generatedAt, importedAt: datasetMeta.finishedAt })
      .from(datasetMeta)
      .where(eq(datasetMeta.status, "complete"))
      .orderBy(desc(datasetMeta.finishedAt), desc(datasetMeta.id))
      .limit(1);
    if (!row) return Response.json({ ok: true, dataset: null }, { headers: { "cache-control": "no-store" } });
    const ageHours = Math.round(((Date.now() - Date.parse(row.importedAt ?? row.generatedAt)) / 3600000) * 10) / 10;
    return Response.json(
      { ok: true, dataset: { ...row, ageHours, stale: ageHours > STALE_HOURS } },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json({ ok: false }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
