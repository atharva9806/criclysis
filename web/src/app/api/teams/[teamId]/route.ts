import type { NextRequest } from "next/server";
import { getTeam } from "@/lib/data";
import { fmtParam } from "@/lib/params";

export async function GET(req: NextRequest, ctx: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await ctx.params;
  const team = await getTeam(teamId, fmtParam(req.nextUrl.searchParams.get("f") ?? undefined));
  return team ? Response.json(team) : Response.json({ error: "Team not found" }, { status: 404 });
}
