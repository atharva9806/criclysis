import { getReplayContext } from "@/lib/data";

/** GET /api/replays/:id/context: player context for the replay (getReplayContext, §4.3). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) return Response.json({ error: "invalid match id" }, { status: 400 });
  const context = await getReplayContext(id);
  if (!context) return Response.json({ error: "no replay for this match" }, { status: 404 });
  return Response.json(context, { headers: { "cache-control": "public, s-maxage=86400, stale-while-revalidate=604800" } });
}
