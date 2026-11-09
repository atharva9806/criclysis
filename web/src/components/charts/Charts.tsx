"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Legend, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/**
 * Chart colours are CSS variables from app/globals.css, so every chart
 * follows the light or dark theme without re-rendering.
 */
export const CHART = {
  series: ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"],
  grid: "var(--chart-grid)",
  axis: "var(--chart-axis)",
  ref: "var(--chart-ref)",
  surface: "var(--surface)",
  fg: "var(--fg)",
  accent: "var(--accent)",
} as const;

export const axisTick = { fontSize: 11, fill: CHART.axis };

const QUERY = "(prefers-reduced-motion: reduce)";
function subscribe(cb: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** True when the user asks for reduced motion; charts then skip their entry animation. Server render: no animation. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => true,
  );
}

/**
 * The accessible frame every chart sits in: an image with a name, and a
 * link to the table with the same values ("view as table").
 */
export function ChartFrame({ label, tableId, children, className = "h-64" }: { label: string; tableId?: string; children: ReactNode; className?: string }) {
  return (
    <figure className="m-0">
      <div role="img" aria-label={label} className={className}>
        {children}
      </div>
      {tableId ? (
        <figcaption className="mt-2 text-right text-xs">
          <a href={`#${tableId}`} className="link">
            View as table
          </a>
        </figcaption>
      ) : null}
    </figure>
  );
}

/** "1st", "22nd", "63rd", "70th". */
export function ordinal(n: number): string {
  const v = Math.round(n);
  const s = v % 100 >= 11 && v % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[v % 10] ?? "th";
  return `${v}${s}`;
}

/** Percentiles against the cohort (0-100), one spoke per measure; one polygon per series. */
export function PercentileRadar({
  data,
  series = [{ key: "percentile", name: "Percentile" }],
}: {
  data: Record<string, string | number>[];
  series?: { key: string; name: string }[];
}) {
  const still = useReducedMotion();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart data={data} outerRadius="68%" accessibilityLayer={false}>
        <PolarGrid stroke={CHART.grid} />
        <PolarAngleAxis dataKey="label" tick={{ ...axisTick, fill: CHART.fg }} />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        {series.map((s, i) => (
          <Radar
            key={s.key}
            name={s.name}
            dataKey={s.key}
            stroke={CHART.series[i % CHART.series.length]}
            fill={CHART.series[i % CHART.series.length]}
            fillOpacity={series.length > 1 ? 0.12 : 0.2}
            strokeWidth={2}
            isAnimationActive={!still}
          />
        ))}
        {series.length > 1 ? <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} /> : null}
        <Tooltip formatter={(v, name) => [`${ordinal(Number(v))} percentile`, series.length > 1 ? String(name) : ""]} separator={series.length > 1 ? ": " : ""} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

/** One bar per calendar year (runs or wickets), with the innings behind each in the tooltip. */
export function YearBars({ data, unit, color = CHART.series[0] }: { data: { year: number; value: number; innings: number | null }[]; unit: string; color?: string }) {
  const still = useReducedMotion();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ left: -12, right: 8, top: 8, bottom: 0 }} accessibilityLayer={false}>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis dataKey="year" tick={axisTick} axisLine={false} tickLine={false} minTickGap={8} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} width={44} />
        <Tooltip
          cursor={{ fill: "var(--surface-2)" }}
          formatter={(v, _n, item) => {
            const inns = (item?.payload as { innings?: number | null } | undefined)?.innings;
            return [`${Number(v).toLocaleString("en-GB")} ${unit}${inns != null ? ` in ${inns} innings` : ""}`, ""];
          }}
          separator=""
        />
        <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={!still} />
      </BarChart>
    </ResponsiveContainer>
  );
}
