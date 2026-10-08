import { getDatasetMeta } from "@/lib/data";

/** The public part of the active dataset_meta row (no import counts or errors). */
export async function GET() {
  const meta = await getDatasetMeta();
  return meta ? Response.json(meta) : Response.json({ error: "No dataset has been imported" }, { status: 404 });
}
