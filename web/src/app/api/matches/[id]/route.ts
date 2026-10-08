import { getMatch } from "@/lib/data";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const match = await getMatch(id);
  return match ? Response.json(match) : Response.json({ error: "Match not found" }, { status: 404 });
}
