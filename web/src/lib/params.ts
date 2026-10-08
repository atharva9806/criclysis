/** Parsing of URL search params shared by the pages and API routes. Unknown values become undefined. */
import type { PlayerSort, RoleFilter } from "./contract/db";
import type { Fmt, Gender } from "./contract/pipeline";

export type SearchParams = Record<string, string | string[] | undefined>;

export function str(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s === undefined || s === "" ? undefined : s;
}

export function fmtParam(v: string | string[] | undefined): Fmt | undefined {
  const s = str(v)?.toLowerCase();
  return s === "test" || s === "odi" || s === "t20i" ? s : undefined;
}

/** Accepts "men"/"women" (the URL form) as well as "male"/"female". */
export function genderParam(v: string | string[] | undefined): Gender | undefined {
  const s = str(v)?.toLowerCase();
  if (s === "men" || s === "male" || s === "m") return "male";
  if (s === "women" || s === "female" || s === "w") return "female";
  return undefined;
}

export function genderSlug(g: Gender): "men" | "women" {
  return g === "female" ? "women" : "men";
}

export function intParam(v: string | string[] | undefined, min = 1, max = 100000): number | undefined {
  const n = Number(str(v));
  return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
}

const SORTS: PlayerSort[] = ["runs", "wickets", "batAvg", "batSr", "bowlAvg", "econ", "name"];
export function sortParam(v: string | string[] | undefined): PlayerSort | undefined {
  const s = str(v);
  return SORTS.includes(s as PlayerSort) ? (s as PlayerSort) : undefined;
}

const ROLES: RoleFilter[] = ["batter", "bowler", "allrounder", "wicketkeeper"];
export function roleParam(v: string | string[] | undefined): RoleFilter | undefined {
  const s = str(v)?.toLowerCase();
  return ROLES.includes(s as RoleFilter) ? (s as RoleFilter) : undefined;
}

/** A query string from the given values, dropping empty ones. */
export function qs(values: Record<string, string | number | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(values)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}
