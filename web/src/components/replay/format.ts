/** Display helpers for the replay view. Locale-free, so server and client render the same text. */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2023-11-19" (or an ISO timestamp) -> "19 Nov 2023". */
export function formatDate(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return iso ?? "";
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** Probability as a whole percentage, never claiming certainty the model does not have. */
export function pct(p: number): string {
  const v = p * 100;
  if (v > 0 && v < 1) return "<1%";
  if (v < 100 && v > 99) return ">99%";
  return `${Math.round(v)}%`;
}

export const fixed = (v: number | null | undefined, digits = 2) => (v == null || !Number.isFinite(v) ? "–" : v.toFixed(digits));

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Team colours by innings order: slot 1 bats first, slot 2 chases. They are
 * each side's chart colour (--team-a-line, --team-b-line, set by the replay
 * from lib/teams/colors.ts: at least 3:1 on the surface, and never two
 * look-alike colours), falling back to the --chart-1 and --chart-2 tokens
 * (Okabe-Ito blue and orange) outside a replay.
 */
export const TEAM_COLORS = ["var(--team-a-line, var(--chart-1))", "var(--team-b-line, var(--chart-2))"] as const;
