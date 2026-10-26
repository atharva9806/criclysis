import { getReplay } from "@/lib/data";

/** Edge caches hold a replay for a day and may serve it stale for a week while revalidating (§4.2). */
const CACHE = "public, s-maxage=86400, stale-while-revalidate=604800";

/**
 * GET /api/replays/:id: the replay JSON, gunzipped on the server. Whether
 * Vercel passes a stored Content-Encoding through is unverified, so the
 * response is plain JSON and the platform compresses it.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) return Response.json({ error: "invalid match id" }, { status: 400 });
  const replay = await getReplay(id);
  if (!replay) return Response.json({ error: "no replay for this match" }, { status: 404 });
  return Response.json(replay, { headers: { "cache-control": CACHE } });
}
