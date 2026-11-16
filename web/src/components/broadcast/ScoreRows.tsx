/**
 * The two sides of a match as broadcast score rows: a colour bar, the flag
 * (or colour badge), the code and name, and each innings total in batting
 * order. Server component: it looks the sides up by name.
 */
import type { MatchRow } from "@/lib/contract/db";
import { teamMark } from "@/lib/teams/flags";
import { Flag } from "./Flag";

type Side = { team: string; innings: { runs: number; wickets: number; overs: string; declared: boolean }[] };

/** Sides in batting order, then any side that did not bat. */
export function sides(m: Pick<MatchRow, "team1" | "team2" | "innings">): Side[] {
  const order = [...new Set([...m.innings.map((i) => i.team), m.team1, m.team2])];
  return order.map((team) => ({ team, innings: m.innings.filter((i) => i.team === team) }));
}

const total = (i: Side["innings"][number]) => `${i.runs}${i.wickets >= 10 ? "" : `/${i.wickets}`}${i.declared ? "d" : ""}`;

export function ScoreRows({ m, size = "md" }: { m: Pick<MatchRow, "team1" | "team2" | "innings" | "format" | "result">; size?: "md" | "lg" }) {
  const limited = m.format !== "test";
  return (
    <span className="block space-y-1.5">
      {sides(m).map((s) => {
        const mark = teamMark(s.team);
        const won = m.result.winner === s.team;
        const lost = Boolean(m.result.winner) && !won;
        return (
          <span key={s.team} className={`relative flex items-center gap-2.5 overflow-hidden rounded-[0.375rem] bg-surface-2 py-1.5 pl-3 pr-2.5 ${won ? "ring-1 ring-inset ring-line-strong" : ""}`}>
            <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1" style={{ background: `light-dark(${mark.lineLight}, ${mark.lineDark})` }} />
            <Flag mark={mark} size="sm" />
            <span className={`min-w-0 flex-1 truncate ${size === "lg" ? "text-base" : "text-sm"} ${won ? "font-semibold text-fg" : lost ? "text-muted" : "font-medium"}`}>
              <span aria-hidden="true" className="mr-1.5 font-display font-bold uppercase tracking-[0.04em]">
                {mark.code}
              </span>
              <span className="text-xs sm:text-sm">{s.team}</span>
              {won ? <span className="sr-only"> (won)</span> : null}
            </span>
            <span className="shrink-0 text-right">
              {s.innings.length ? (
                s.innings.map((i, k) => (
                  <span key={k} className="whitespace-nowrap">
                    {k ? <span className="mx-1 text-muted">&amp;</span> : null}
                    <span className={`score ${size === "lg" ? "text-2xl" : "text-xl"} ${won ? "text-fg" : lost ? "text-muted" : ""}`}>{total(i)}</span>
                    {limited ? <span className="ml-1 text-xs text-muted">({i.overs})</span> : null}
                  </span>
                ))
              ) : (
                <span className="text-sm text-muted">Did not bat</span>
              )}
            </span>
          </span>
        );
      })}
    </span>
  );
}
