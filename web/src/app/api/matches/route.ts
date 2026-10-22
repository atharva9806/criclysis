import type { NextRequest } from "next/server";
import { listMatches } from "@/lib/data";
import { fmtParam, genderParam, intParam } from "@/lib/params";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const get = (k: string) => sp.get(k) ?? undefined;
  return Response.json(
    await listMatches({
      gender: genderParam(get("gender")),
      format: fmtParam(get("format")),
      teamId: get("team"),
      year: intParam(get("year"), 1800, 3000),
      page: intParam(get("page")),
      pageSize: intParam(get("pageSize"), 1, 100),
    }),
  );
}
