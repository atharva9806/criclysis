/** Small presentational number helpers, safe on the server and the client. */

/** "1st", "22nd", "63rd", "70th". */
export function ordinal(n: number): string {
  const v = Math.round(n);
  const s = v % 100 >= 11 && v % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[v % 10] ?? "th";
  return `${v}${s}`;
}

/** A probability (0-1) as a whole percentage. */
export function pct0(p: number | null | undefined): string {
  return p == null || !Number.isFinite(p) ? "–" : `${Math.round(p * 100)}%`;
}
