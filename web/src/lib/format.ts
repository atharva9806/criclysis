/** Display formatting. Never invents a value: anything missing renders as an en dash. */
import type { Fmt, FormatKey, Gender } from "./contract/pipeline";

export const DASH = "–";

export function num(v: number | null | undefined, digits = 2): string {
  return v === null || v === undefined || !Number.isFinite(v) ? DASH : v.toFixed(digits);
}

export function int(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? DASH : Math.round(v).toLocaleString("en-GB");
}

export function pct(v: number | null | undefined, digits = 1): string {
  return v === null || v === undefined || !Number.isFinite(v) ? DASH : `${v.toFixed(digits)}%`;
}

export const FORMAT_LABEL: Record<Fmt, string> = { test: "Test", odi: "ODI", t20i: "T20I" };

export function genderWord(g: Gender): string {
  return g === "female" ? "Women" : "Men";
}

/** "Women's ODI", "Men's Test". */
export function formatKeyLabel(fk: FormatKey): string {
  const [fmt, g] = fk.split("-") as [Fmt, "m" | "w"];
  return `${g === "w" ? "Women's" : "Men's"} ${FORMAT_LABEL[fmt]}`;
}

/** 2023-11-19 -> 19 Nov 2023. Dates are calendar dates, so format them in UTC. */
export function date(d: string | null | undefined): string {
  if (!d) return DASH;
  const t = Date.parse(`${d.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(t) ? d : new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function year(d: string | null | undefined): string {
  return d ? d.slice(0, 4) : DASH;
}

/** "12 balls", "1 ball". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;
}

export function capitalise(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

type Decided = { won: number; lost: number; tied: number; drawn: number };

/** Decided matches: the denominator of winPct (§1.10). No-results are not decided. */
export function decided(r: Decided): number {
  return r.won + r.lost + r.tied + r.drawn;
}

/** A team's win percentage, or a dash below `minMatches` decided matches (§4.4). */
export function winPct(r: Decided & { winPct: number | null }, minMatches: number): string {
  return decided(r) >= minMatches ? pct(r.winPct) : DASH;
}

/** "won 9 of 14 (64.3%)": the percentage only from `minMatches` decided matches. */
export function record(r: Decided & { matches: number; winPct: number | null }, minMatches: number): string {
  const base = `won ${r.won} of ${r.matches}`;
  return decided(r) >= minMatches && r.winPct !== null ? `${base} (${r.winPct.toFixed(1)}%)` : base;
}

/**
 * Win percentages after winning and after losing the toss (TeamFormat.toss),
 * each gated on its decided matches. Decided matches after winning the toss
 * come from the two decision records; after losing it, from the overall
 * record minus those, which is only valid when every match and every won
 * toss is accounted for. Otherwise that percentage is not shown.
 */
export function tossWinPcts(
  toss: { won: number; lost: number; winPctWonToss: number | null; winPctLostToss: number | null; decisions: { bat: Decided & { matches: number }; field: Decided & { matches: number } } },
  overall: Decided & { matches: number },
  minMatches: number,
): { won: string; lost: string } {
  const decidedWon = decided(toss.decisions.bat) + decided(toss.decisions.field);
  const complete = toss.won + toss.lost === overall.matches && toss.decisions.bat.matches + toss.decisions.field.matches === toss.won;
  const decidedLost = complete ? decided(overall) - decidedWon : null;
  return {
    won: decidedWon >= minMatches ? pct(toss.winPctWonToss) : DASH,
    lost: decidedLost !== null && decidedLost >= minMatches ? pct(toss.winPctLostToss) : DASH,
  };
}

/**
 * Why no fixture plan can be built for two teams in a format, or null when
 * one can. `formats` lists the formats each team has records in.
 */
export function planUnavailable(
  team: { label: string; gender: string; formats: Partial<Record<Fmt, unknown>> } | undefined,
  opp: { label: string; gender: string; formats: Partial<Record<Fmt, unknown>> } | undefined,
  fmt: Fmt,
): string | null {
  if (!team || !opp) return "One of these teams is not in the data.";
  if (team === opp) return "Choose two different teams.";
  if (team.gender !== opp.gender) return `${team.label} and ${opp.label} play in different competitions (men's and women's): choose two teams of the same gender.`;
  const without = [team, opp].filter((t) => !t.formats[fmt]).map((t) => t.label);
  if (without.length) {
    return `No ${FORMAT_LABEL[fmt]} data for this pairing: ${without.join(" and ")} ${without.length > 1 ? "have" : "has"} no ${FORMAT_LABEL[fmt]} matches in the data.`;
  }
  return null;
}

// Subject labels for split dimensions, as the pipeline words them (pipeline/analyze.py).
const ENTRY: Record<string, string> = { new: "New at the crease (first 15 balls)", settling: "Settling in (balls 16-40)", set: "Once set (40+ balls)" };
const HOME: Record<string, string> = { home: "At home", away: "Away from home", neutral: "Neutral venue" };
const CHASE: Record<string, string> = { chasing: "Chasing", setting: "Batting first" };
const HAND: Record<string, string> = { right: "Right-handed batters", left: "Left-handed batters" };

export type LabelContext = {
  bowlingTypes: Record<string, { label: string }>;
  phases: { key: string; label: string }[];
};

/** A readable label for a split subject (bowling type code, phase key, position, ...). */
export function splitLabel(dimension: string, subject: string, label: string | null, ctx: LabelContext): string {
  const type = (s: string) => ctx.bowlingTypes[s]?.label ?? s.toUpperCase();
  const phase = (s: string) => ctx.phases.find((p) => p.key === s)?.label ?? s;
  switch (dimension) {
    case "type":
      return type(subject);
    case "family":
      return capitalise(subject);
    case "phase":
      return phase(subject);
    case "typePhase": {
      const [t, p] = subject.split("|");
      return `${type(t)}, ${phase(p)}`;
    }
    case "entry":
      return ENTRY[subject] ?? subject;
    case "home":
      return HOME[subject] ?? subject;
    case "chase":
      return CHASE[subject] ?? subject;
    case "hand":
      return HAND[subject] ?? subject;
    case "inningsNo":
      return `Innings ${subject}`;
    case "position":
      return `No. ${subject}`;
    case "vsBowler":
    case "vsBatter":
      return label ?? subject;
    default:
      return subject;
  }
}
