import type { NextRequest } from "next/server";
import { getPlayerProfile } from "@/lib/data";
import { fmtParam } from "@/lib/params";

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const profile = await getPlayerProfile(slug, fmtParam(req.nextUrl.searchParams.get("f") ?? undefined));
  return profile ? Response.json(profile) : Response.json({ error: "Player not found" }, { status: 404 });
}
