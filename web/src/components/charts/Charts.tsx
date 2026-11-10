"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ordinal } from "../numbers";

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
export function ChartFrame({
  label,
  tableId,
  table,
  children,
  className = "h-64",
}: {
  label: string;
  /** The id of a table elsewhere on the page with the same values. */
  tableId?: string;
  /** Or the table itself, behind a "View as table" disclosure. */
  table?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
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
      {table ? (
        <details className="group mt-3">
          <summary className="inline-flex min-h-9 items-center gap-1 text-sm font-medium text-accent">
            <span className="group-open:hidden">View as table</span>
            <span className="hidden group-open:inline">Hide table</span>
          </summary>
          <div className="mt-2">{table}</div>
        </details>
      ) : null}
    </figure>
  );
}

/** Percentiles against the cohort (0-100), one spoke per measure; one polygon per series. */
export function PercentileRadar({
  data,
  series = [{ key: "percentile", name: "Percentile" }],
  colors = CHART.series,
}: {
  data: Record<string, string | number>[];
  series?: { key: string; name: string }[];
  /** One colour per series; defaults to the Okabe-Ito chart tokens. */
  colors?: readonly string[];
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
            stroke={colors[i % colors.length]}
            fill={colors[i % colors.length]}
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

export type InningsBar = { key: string; value: number; notOut: boolean; label: string };

/**
 * One bar per recent innings, oldest on the left: runs (or wickets). Not-out
 * innings are drawn hollow, so the difference never rests on colour alone;
 * the tooltip and the table below the chart carry every figure.
 */
/** `average` draws a dashed reference line; the caller names it in a key, since a label on the line can collide with a bar. */
export function InningsBars({ data, unit, color = CHART.series[0], average }: { data: InningsBar[]; unit: string; color?: string; average?: number | null }) {
  const still = useReducedMotion();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ left: -12, right: 8, top: 12, bottom: 0 }} accessibilityLayer={false}>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis dataKey="key" tick={false} axisLine={{ stroke: CHART.grid }} tickLine={false} height={8} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} width={44} />
        {average != null ? (
          <ReferenceLine y={average} stroke={CHART.fg} strokeOpacity={0.55} strokeDasharray="5 4" />
        ) : null}
        <Tooltip
          cursor={{ fill: "var(--surface-2)" }}
          labelFormatter={() => ""}
          formatter={(v, _n, item) => {
            const p = item?.payload as InningsBar | undefined;
            return [`${v}${p?.notOut ? "*" : ""} ${unit} · ${p?.label ?? ""}`, ""];
          }}
          separator=""
        />
        <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={28} isAnimationActive={!still}>
          {data.map((d) => (
            <Cell key={d.key} fill={color} fillOpacity={d.notOut ? 0.18 : 1} stroke={color} strokeWidth={d.notOut ? 1.5 : 0} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export type ResultYear = { year: number; won: number; lost: number; other: number; matches: number };

/** Results per calendar year as stacked bars (won, lost, other); counts, not rates, so a thin year never looks precise. */
export function ResultsByYear({ data, colors }: { data: ResultYear[]; colors?: { won: string; lost: string; other: string } }) {
  const still = useReducedMotion();
  const c = colors ?? { won: "var(--chart-3)", lost: "var(--chart-2)", other: "var(--chart-6)" };
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ left: -16, right: 8, top: 8, bottom: 0 }} accessibilityLayer={false}>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis dataKey="year" tick={axisTick} axisLine={false} tickLine={false} minTickGap={6} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} width={40} />
        <Tooltip cursor={{ fill: "var(--surface-2)" }} />
        <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="won" name="Won" stackId="r" fill={c.won} isAnimationActive={!still} maxBarSize={40} />
        <Bar dataKey="lost" name="Lost" stackId="r" fill={c.lost} isAnimationActive={!still} maxBarSize={40} />
        <Bar dataKey="other" name="Tied, drawn or no result" stackId="r" fill={c.other} radius={[3, 3, 0, 0]} isAnimationActive={!still} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}
