/**
 * Derived split rates, computed from stored counts (docs/ARCHITECTURE.md §2:
 * "derived values are computed in lib/metrics.ts, not stored").
 *
 * The definitions mirror pipeline/metrics/base.py exactly, except that an
 * undefined rate (no balls, no dismissals) is `null` here rather than the
 * pipeline's 0 or -1 sentinel. Values are unrounded; lib/format.ts rounds for
 * display.
 */
import type { SplitRow } from "./contract/db";

export type BatCounts = { balls: number; runs: number; outs: number; dots: number; fours: number; sixes: number };
export type BowlCounts = { balls: number; runs: number; wickets: number; dots: number; fours: number; sixes: number };

const ratio = (num: number, den: number, scale = 1): number | null => (den > 0 ? (scale * num) / den : null);

/** Batting: average = runs/outs, strike rate = runs per 100 balls, balls per dismissal, dot and boundary shares. */
export function batRates(s: BatCounts) {
  return {
    average: ratio(s.runs, s.outs),
    strikeRate: ratio(s.runs, s.balls, 100),
    ballsPerDismissal: ratio(s.balls, s.outs),
    dotPct: ratio(s.dots, s.balls, 100),
    boundaryPct: ratio(s.fours + s.sixes, s.balls, 100),
    boundaryRunsPct: ratio(4 * s.fours + 6 * s.sixes, s.runs, 100),
  };
}

/** Bowling: economy = runs per over, average = runs/wickets, strike rate = balls per wicket. */
export function bowlRates(s: BowlCounts) {
  return {
    overs: s.balls / 6,
    economy: ratio(s.runs, s.balls, 6),
    average: ratio(s.runs, s.wickets),
    strikeRate: ratio(s.balls, s.wickets),
    dotPct: ratio(s.dots, s.balls, 100),
    boundaryPct: ratio(s.fours + s.sixes, s.balls, 100),
  };
}

/** Cricket overs notation for a ball count: 662 balls -> "110.2". */
export function oversNotation(balls: number): string {
  return `${Math.floor(balls / 6)}${balls % 6 ? `.${balls % 6}` : ""}`;
}

/** A stored splits row (counts only). */
export type StoredSplit = {
  discipline: "batting" | "bowling";
  dimension: string;
  subject: string;
  label: string | null;
  balls: number;
  runs: number;
  outs: number | null;
  wickets: number | null;
  dots: number | null;
  fours: number | null;
  sixes: number | null;
  innings: number | null;
};

/** A stored split with its derived rates. */
export function toSplitRow(s: StoredSplit): SplitRow {
  const dots = s.dots ?? 0;
  const fours = s.fours ?? 0;
  const sixes = s.sixes ?? 0;
  const base = {
    discipline: s.discipline,
    dimension: s.dimension,
    subject: s.subject,
    label: s.label,
    balls: s.balls,
    runs: s.runs,
    outs: s.outs,
    wickets: s.wickets,
    dots,
    fours,
    sixes,
    innings: s.innings,
  };
  if (s.discipline === "batting") {
    const r = batRates({ balls: s.balls, runs: s.runs, outs: s.outs ?? 0, dots, fours, sixes });
    return { ...base, average: r.average, strikeRate: r.strikeRate, economy: null, dotPct: r.dotPct, boundaryPct: r.boundaryPct };
  }
  const r = bowlRates({ balls: s.balls, runs: s.runs, wickets: s.wickets ?? 0, dots, fours, sixes });
  return { ...base, average: r.average, strikeRate: r.strikeRate, economy: r.economy, dotPct: r.dotPct, boundaryPct: r.boundaryPct };
}
