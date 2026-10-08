import type { NextRequest } from "next/server";
import { listTeams } from "@/lib/data";
import { genderParam } from "@/lib/params";

export async function GET(req: NextRequest) {
  return Response.json({ teams: await listTeams(genderParam(req.nextUrl.searchParams.get("gender") ?? undefined)) });
}
