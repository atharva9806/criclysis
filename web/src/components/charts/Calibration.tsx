"use client";

import { CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { CHART, axisTick, useReducedMotion } from "./Charts";

export type CalibrationPoint = { bin: string; states: number; predicted: number; observed: number };

type TipProps = { active?: boolean; payload?: { payload: CalibrationPoint & { series: string } }[] };

function Tip({ active, payload }: TipProps) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="rounded-control border border-line bg-surface px-3 py-2 text-xs shadow-pop">
      <p className="font-semibold">
        {p.series}, predicted {p.bin}
      </p>
      <p className="mt-0.5 tabular-nums text-muted">
        Predicted {Math.round(p.predicted * 100)}% · won {Math.round(p.observed * 100)}% · {p.states.toLocaleString("en-GB")} ball states
      </p>
    </div>
  );
}

/**
 * Predicted win probability (x) against how often that side actually won (y),
 * per 10% bin of the holdout ball states. Points on the diagonal are perfectly
 * calibrated. Bins with no states are left out rather than drawn at zero.
 */
export default function CalibrationChart({ chase, firstInnings }: { chase: CalibrationPoint[]; firstInnings: CalibrationPoint[] }) {
  const still = useReducedMotion();
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 8, right: 12, bottom: 4, left: 0 }} accessibilityLayer={false}>
        <CartesianGrid stroke={CHART.grid} />
        <XAxis
          type="number"
          dataKey="predicted"
          domain={[0, 1]}
          ticks={[0, 0.25, 0.5, 0.75, 1]}
          tickFormatter={pct}
          tick={axisTick}
          axisLine={{ stroke: CHART.grid }}
          tickLine={false}
          name="Predicted"
          label={{ value: "Predicted", position: "insideBottom", offset: -2, fontSize: 11, fill: CHART.axis }}
          height={36}
        />
        <YAxis
          type="number"
          dataKey="observed"
          domain={[0, 1]}
          ticks={[0, 0.25, 0.5, 0.75, 1]}
          tickFormatter={pct}
          tick={axisTick}
          axisLine={{ stroke: CHART.grid }}
          tickLine={false}
          width={44}
          name="Won"
          label={{ value: "Won", angle: -90, position: "insideLeft", offset: 10, fontSize: 11, fill: CHART.axis }}
        />
        <ZAxis range={[36, 36]} />
        <ReferenceLine
          segment={[
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ]}
          stroke={CHART.ref}
          strokeDasharray="4 4"
          ifOverflow="hidden"
        />
        <Tooltip content={<Tip />} cursor={{ stroke: CHART.ref, strokeDasharray: "3 3" }} isAnimationActive={false} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <Scatter
          name="Chase"
          data={chase.map((d) => ({ ...d, series: "Chase" }))}
          fill={CHART.series[0]}
          line={{ stroke: CHART.series[0], strokeWidth: 1.5 }}
          shape="circle"
          isAnimationActive={!still}
        />
        <Scatter
          name="First innings"
          data={firstInnings.map((d) => ({ ...d, series: "First innings" }))}
          fill={CHART.series[1]}
          line={{ stroke: CHART.series[1], strokeWidth: 1.5, strokeDasharray: "5 3" }}
          shape="diamond"
          isAnimationActive={!still}
        />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
