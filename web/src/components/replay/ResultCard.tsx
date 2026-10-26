import Link from "next/link";
import type { MatchRow } from "@/lib/contract/db";
import type { Fmt, Gender } from "@/lib/contract/pipeline";
import { formatDate } from "./format";

export const FORMAT_LABEL: Record<Fmt, string> = { test: "Test", odi: "ODI", t20i: "T20I" };

export const formatKeyLabel = (format: Fmt, gender: Gender) => `${gender === "female" ? "Women's" : "Men's"} ${FORMAT_LABEL[format]}`;

/** "240 & 180/5" per team, in batting order; limited-overs innings show their overs. */
export function teamScores(m: Pick<MatchRow, "team1" | "team2" | "innings" | "format">): { team: string; score: string }[] {
  const order = [...new Set([...m.innings.map((i) => i.team), m.team1, m.team2])];
  return order.map((team) => ({
    team,
    score: m.innings
      .filter((i) => i.team === team)
      .map((i) => `${i.runs}${i.wickets >= 10 ? "" : `/${i.wickets}`}${i.declared ? "d" : ""}${m.format === "test" ? "" : ` (${i.overs})`}`)
      .join(" & "),
  }));
}

export function eventLine(m: Pick<MatchRow, "eventName" | "eventStage" | "eventMatchNumber">): string {
  const stage = m.eventStage ?? (m.eventMatchNumber ? `Match ${m.eventMatchNumber}` : null);
  return [m.eventName, stage].filter(Boolean).join(" · ");
}

export default function ResultCard({ m }: { m: MatchRow }) {
  const event = eventLine(m);
  return (
    <article className="card flex h-full flex-col p-5">
      <p className="text-xs text-[#6e6e73]">
        {formatDate(m.endDate)} · {formatKeyLabel(m.format, m.gender)}
      </p>
      {event && <p className="mt-0.5 truncate text-xs text-[#6e6e73]">{event}</p>}
      <h3 className="mt-3 space-y-1">
        {teamScores(m).map((t) => (
          <span key={t.team} className="flex items-baseline justify-between gap-3 text-[15px]">
            <span className={`truncate ${m.result.winner === t.team ? "font-semibold" : ""}`}>{t.team}</span>
            <span className="shrink-0 text-sm tabular-nums text-[#1d1d1f]">{t.score || "–"}</span>
          </span>
        ))}
      </h3>
      <p className="mt-3 text-sm text-[#6e6e73]">{m.result.text || "Result not recorded"}</p>
      <p className="mt-auto flex gap-4 pt-4 text-sm font-medium">
        <Link href={`/matches/${m.id}`} className="text-[#0071e3] hover:underline">
          Scorecard<span className="sr-only">: {m.team1} v {m.team2}, {formatDate(m.endDate)}</span>
        </Link>
        {m.hasReplay && (
          <Link href={`/live/${m.id}`} className="text-[#0071e3] hover:underline">
            Replay<span className="sr-only">: {m.team1} v {m.team2}, {formatDate(m.endDate)}</span>
          </Link>
        )}
      </p>
    </article>
  );
}
