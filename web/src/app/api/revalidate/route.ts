import { timingSafeEqual } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { DATASET_TAG } from "@/lib/data";

/** Called by the refresh workflow after an import (docs/ARCHITECTURE.md §3.1 step 8 and §3.5). */
export async function POST(req: Request) {
  const expected = process.env.REVALIDATE_SECRET;
  const given = Buffer.from(req.headers.get("x-revalidate-secret") ?? "");
  const want = Buffer.from(expected ?? "");
  const ok = want.length > 0 && given.length === want.length && timingSafeEqual(given, want);
  if (!ok) return Response.json({ revalidated: false, error: "Bad or missing x-revalidate-secret" }, { status: 401 });
  revalidateTag(DATASET_TAG, "max");
  revalidatePath("/", "layout");
  return Response.json({ revalidated: true, at: new Date().toISOString() });
}
