import { FORMAT_KEYS, type FormatKey } from "@/lib/contract/pipeline";
import { getWinModel } from "@/lib/data";

/** GET /api/models/:formatKey: the win-probability model for odi-m, t20i-m, odi-w or t20i-w (§1.8). */
export async function GET(_req: Request, { params }: { params: Promise<{ formatKey: string }> }) {
  const { formatKey } = await params;
  const fk = FORMAT_KEYS.find((k) => k === formatKey);
  if (!fk || fk.startsWith("test-")) {
    return Response.json({ error: "models exist only for odi-m, t20i-m, odi-w and t20i-w" }, { status: 404 });
  }
  const model = await getWinModel(fk as FormatKey);
  if (!model) return Response.json({ error: `no model for ${fk}` }, { status: 404 });
  return Response.json(model, { headers: { "cache-control": "public, s-maxage=86400, stale-while-revalidate=604800" } });
}
