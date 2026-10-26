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

/** Team colours by innings order: slot 1 (the app accent) bats first, slot 2 chases. Validated for CVD separation. */
export const TEAM_COLORS = ["#0071e3", "#eb6834"] as const;
