"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Timeline } from "@/lib/replay/engine";
import { TEAM_COLORS } from "./format";

type Row = { x: number } & Record<string, number | undefined>;

/** Runs after each over, per innings, up to the cursor; wickets mark the over they fell in. */
export function wormRows(tl: Timeline, cursor: number): Row[] {
  const byX = new Map<number, Row>();
  const at = (x: number) => {
    let r = byX.get(x);
    if (!r) {
      r = { x };
      byX.set(x, r);
    }
    return r;
  };
  tl.innings.slice(0, 2).forEach((inn, n) => {
    if (cursor <= inn.start) return;
    at(0)[`i${n}`] = inn.penaltyPre;
    const end = Math.min(cursor, inn.end);
    for (let i = inn.start; i < end; i++) {
      const d = tl.deliveries[i];
      if ((d.legal && d.legalBalls % 6 === 0) || i === end - 1) {
        const r = at(Math.round((d.legalBalls / 6) * 1000) / 1000);
        r[`i${n}`] = d.runs;
        r[`c${n}`] = d.wickets;
      }
    }
  });
  // Wickets in each over: the difference between consecutive over-end wicket counts.
  const rows = [...byX.values()].sort((a, b) => a.x - b.x);
  [0, 1].forEach((n) => {
    let last = 0;
    for (const r of rows) {
      const c = r[`c${n}`];
      if (c == null) continue;
      r[`w${n}`] = c - last;
      last = c;
    }
  });
  return rows;
}

type DotProps = { cx?: number; cy?: number; payload?: Row; index?: number };

export default function Worm({ timeline, cursor, maxOvers }: { timeline: Timeline; cursor: number; maxOvers: number }) {
  const rows = wormRows(timeline, cursor);
  const teams = timeline.innings.slice(0, 2).map((i) => i.team);
  const step = maxOvers >= 50 ? 10 : 5;
  const ticks = Array.from({ length: maxOvers / step + 1 }, (_, i) => i * step);
  const most = Math.max(0, ...rows.flatMap((r) => [r.i0 ?? 0, r.i1 ?? 0]));
  const runStep = most > 150 ? 50 : 25;
  const runTicks = Array.from({ length: Math.ceil(most / runStep) + 1 }, (_, i) => i * runStep);
  const dot = (n: number) =>
    function WicketDot({ cx, cy, payload, index }: DotProps) {
      const w = payload?.[`w${n}`] ?? 0;
      if (!w || cx == null || cy == null) return <g key={`d${n}-${index}`} />;
      return <circle key={`d${n}-${index}`} cx={cx} cy={cy} r={4} fill={TEAM_COLORS[n]} stroke="#fff" strokeWidth={2} />;
    };

  return (
    <section aria-labelledby="worm-title" className="card p-5 sm:p-6">
      <h2 id="worm-title" className="text-[11px] font-semibold uppercase tracking-wider text-[#6e6e73]">
        Worm
      </h2>
      <p className="mt-1 text-xs text-[#6e6e73]">Runs after each over. Dots mark overs in which wickets fell.</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-[#6e6e73]">No overs bowled yet.</p>
      ) : (
        <div className="mt-3 h-56 sm:h-64" role="img" aria-label={`Worm chart of runs by over for ${teams.join(" and ")}. The scorecard has the same totals.`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="rgba(0,0,0,0.06)" vertical={false} />
              <XAxis type="number" dataKey="x" domain={[0, maxOvers]} ticks={ticks} tick={{ fontSize: 11, fill: "#6e6e73" }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, runTicks[runTicks.length - 1]]} ticks={runTicks} tick={{ fontSize: 11, fill: "#6e6e73" }} axisLine={false} tickLine={false} width={44} />
              <Tooltip
                isAnimationActive={false}
                labelFormatter={(x) => `After ${x} overs`}
                formatter={(v, key) => [String(v), teams[Number(String(key).slice(1))] ?? String(key)]}
                contentStyle={{ borderRadius: 14, border: "none", boxShadow: "0 10px 30px rgba(0,0,0,0.12)", fontSize: 12 }}
              />
              <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} formatter={(key) => <span className="text-[#1d1d1f]">{teams[Number(String(key).slice(1))] ?? key}</span>} />
              {teams.map((t, n) => (
                <Line
                  key={t + n}
                  dataKey={`i${n}`}
                  name={`i${n}`}
                  stroke={TEAM_COLORS[n]}
                  strokeWidth={2}
                  connectNulls
                  isAnimationActive={false}
                  dot={dot(n)}
                  activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
