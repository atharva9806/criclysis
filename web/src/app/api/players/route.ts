import type { NextRequest } from "next/server";
import { listPlayers } from "@/lib/data";
import { fmtParam, genderParam, intParam, roleParam, sortParam } from "@/lib/params";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const get = (k: string) => sp.get(k) ?? undefined;
  return Response.json(
    await listPlayers({
      search: get("q"),
      gender: genderParam(get("gender")),
      format: fmtParam(get("format")),
      teamId: get("team"),
      role: roleParam(get("role")),
      sort: sortParam(get("sort")),
      page: intParam(get("page")),
      pageSize: intParam(get("pageSize"), 1, 100),
    }),
  );
}
