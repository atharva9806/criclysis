"use client";

import { Area, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import type { ChartPoint, ProbabilityView } from "@/lib/replay/engine";
import { pct, TEAM_COLORS } from "./format";

type Row = ChartPoint & { ahead1: number; ahead2: number };

function Meter({ teams, p }: { teams: [string, string]; p: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="flex items-center gap-2">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: TEAM_COLORS[0] }} />
          {teams[0]} <span className="text-2xl font-semibold">{pct(p)}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="text-2xl font-semibold">{pct(1 - p)}</span> {teams[1]}
          <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: TEAM_COLORS[1] }} />
        </span>
      </div>
      <div aria-hidden className="mt-2 flex h-2 gap-0.5 overflow-hidden rounded-full">
        <div className="motion-safe:transition-[width] motion-safe:duration-300" style={{ width: `${p * 100}%`, background: TEAM_COLORS[0] }} />
        <div className="flex-1" style={{ background: TEAM_COLORS[1] }} />
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, teams }: { active?: boolean; payload?: { payload: Row }[]; teams: [string, string] }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const leader = row.p >= 0.5 ? 0 : 1;
  return (
    <div className="rounded-xl bg-white px-3 py-2 text-xs shadow-[0_10px_30px_rgba(0,0,0,0.12)]">
      <p className="flex items-center gap-2">
        <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: TEAM_COLORS[leader] }} />
        <span className="text-sm font-semibold">{pct(leader === 0 ? row.p : 1 - row.p)}</span>
        <span className="text-[#6e6e73]">{teams[leader]}</span>
      </p>
      <p className="mt-1 text-[#6e6e73] tabular-nums">
        {row.seq < 0 ? "Before the first ball" : `Innings ${row.innings}, over ${row.label} · ${row.score}`}
      </p>
    </div>
  );
}

export default function WinProbability({
  teams,
  view,
  series,
  maxOvers,
}: {
  /** [side batting first, side batting second] */
  teams: [string, string];
  view: ProbabilityView;
  series: ChartPoint[];
  maxOvers: number;
}) {
  const rows: Row[] = series.map((s) => ({ ...s, ahead1: Math.max(s.p, 0.5), ahead2: Math.min(s.p, 0.5) }));
  const step = maxOvers >= 50 ? 10 : 5;
  const ticks = Array.from({ length: (2 * maxOvers) / step + 1 }, (_, i) => i * step);
  const tableRows = series.filter((s) => s.overEnd || s === series[series.length - 1]);

  return (
    <section aria-labelledby="winprob-title" className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="winprob-title" className="text-[11px] font-semibold uppercase tracking-wider text-[#6e6e73]">
          Win probability
        </h2>
        {view.kind === "model" && <p className="text-[11px] text-[#6e6e73]">Model of the match state only (score, balls, wickets)</p>}
      </div>

      <div className="mt-3">
        {view.kind === "model" && <Meter teams={teams} p={view.battingFirst} />}
        {view.kind === "result" && (
          <p className="text-sm">
            <span className="text-lg font-semibold">{view.outcome.text}</span>
            <span className="mt-1 block text-[#6e6e73]">
              {view.outcome.kind === "win" ? "The official result." : "The official result. The model's last probability is not shown, because it cannot describe a tie."}
            </span>
          </p>
        )}
        {view.kind === "hidden" && <p className="text-sm text-[#6e6e73]">{view.reason}</p>}
      </div>

      {view.kind !== "hidden" && series.length > 0 && (
        <>
          <p className="mt-4 text-[11px] text-[#6e6e73]">▲ {teams[0]} ahead · the axis is {teams[0]}&apos;s chance of winning</p>
          <div className="h-56 sm:h-64" role="img" aria-label={`Win probability chart: ${teams[0]} ahead above the middle line, ${teams[1]} below. Use the table below for the values.`}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="rgba(0,0,0,0.06)" vertical={false} />
                <XAxis
                  type="number"
                  dataKey="x"
                  domain={[0, 2 * maxOvers]}
                  ticks={ticks}
                  tickFormatter={(x: number) => String(x > maxOvers ? x - maxOvers : x)}
                  tick={{ fontSize: 11, fill: "#6e6e73" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 1]}
                  ticks={[0, 0.25, 0.5, 0.75, 1]}
                  tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                  tick={{ fontSize: 11, fill: "#6e6e73" }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <ReferenceLine y={0.5} stroke="rgba(0,0,0,0.25)" />
                <ReferenceLine x={maxOvers} stroke="rgba(0,0,0,0.12)" label={{ value: "Innings 2", position: "insideTopLeft", fontSize: 11, fill: "#6e6e73" }} />
                <Area dataKey="ahead1" baseValue={0.5} stroke="none" fill={TEAM_COLORS[0]} fillOpacity={0.12} isAnimationActive={false} activeDot={false} />
                <Area dataKey="ahead2" baseValue={0.5} stroke="none" fill={TEAM_COLORS[1]} fillOpacity={0.12} isAnimationActive={false} activeDot={false} />
                <Line
                  dataKey="p"
                  stroke="#1d1d1f"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  dot={false}
                  activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2, fill: "#1d1d1f" }}
                  isAnimationActive={false}
                />
                <Tooltip content={<ChartTooltip teams={teams} />} cursor={{ stroke: "rgba(0,0,0,0.2)", strokeWidth: 1 }} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-between text-[11px] text-[#6e6e73]">
            <span>▼ {teams[1]} ahead</span>
            <span>Overs</span>
          </div>

          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-[#0071e3]">Show as a table</summary>
            <div className="mt-2 max-h-64 overflow-auto">
              <table className="w-full text-left text-xs tabular-nums">
                <caption className="sr-only">Win probability at the end of each over</caption>
                <thead className="text-[#6e6e73]">
                  <tr>
                    <th scope="col" className="py-1 pr-3 font-medium">Innings</th>
                    <th scope="col" className="py-1 pr-3 font-medium">Over</th>
                    <th scope="col" className="py-1 pr-3 font-medium">Score</th>
                    <th scope="col" className="py-1 pr-3 font-medium">{teams[0]}</th>
                    <th scope="col" className="py-1 font-medium">{teams[1]}</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((r) => (
                    <tr key={r.seq} className="border-t border-black/5">
                      <td className="py-1 pr-3">{r.innings}</td>
                      <td className="py-1 pr-3">{r.label}</td>
                      <td className="py-1 pr-3">{r.score}</td>
                      <td className="py-1 pr-3">{pct(r.p)}</td>
                      <td className="py-1">{pct(1 - r.p)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
