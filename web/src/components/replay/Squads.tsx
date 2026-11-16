"use client";

import type { TraitRow } from "@/lib/contract/db";
import type { SquadMember } from "@/lib/replay/matchup";
import Link from "next/link";
import { Flag } from "../broadcast/Flag";
import { formatDate, TEAM_COLORS } from "./format";
import { useMark } from "./marks";

function SquadTitle({ team, color }: { team: string; color: string }) {
  const mark = useMark(team);
  return (
    <h3 className="flex items-center gap-2.5 border-b-[3px] pb-2 font-display text-lg font-bold uppercase tracking-[0.03em]" style={{ borderColor: color }}>
      <Flag mark={mark} size="sm" />
      {team}
    </h3>
  );
}

function ordinal(n: number): string {
  const v = Math.round(n);
  const s = v % 100 >= 11 && v % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[v % 10] ?? "th";
  return `${v}${s}`;
}

function Trait({ t }: { t: TraitRow }) {
  const strength = t.kind === "strength";
  return (
    <p className="flex gap-1.5 text-xs leading-snug" title={t.text}>
      <span aria-hidden className={strength ? "text-positive" : "text-negative"}>
        {strength ? "▲" : "▼"}
      </span>
      <span>
        <span className="sr-only">{strength ? "Strength: " : "Weakness: "}</span>
        {t.subject}: {t.metricLabel} {Number.isInteger(t.value) ? t.value : t.value.toFixed(1)}
        <span className="text-muted">
          {" "}
          · {t.percentile < 0.5 ? "below the 1st percentile" : `${ordinal(t.percentile)} percentile`} · {t.balls.toLocaleString("en-GB")} balls
        </span>
      </span>
    </p>
  );
}

export default function Squads({
  squads,
  battingOrder,
  hasContext,
  datasetAsOf,
}: {
  squads: { team: string; players: SquadMember[] }[];
  /** Teams in innings order, for colours. */
  battingOrder: string[];
  hasContext: boolean;
  datasetAsOf: string | null;
}) {
  const rank = (team: string) => (battingOrder.includes(team) ? battingOrder.indexOf(team) : battingOrder.length);
  return (
    <section aria-labelledby="squads-title" className="card p-5 sm:p-6">
      <h2 id="squads-title" className="card-title">
        Playing XIs
      </h2>
      <p className="mt-1 text-xs text-muted">
        {hasContext
          ? `Top strength (▲) and weakness (▼) from each player's career in this format, as of ${formatDate(datasetAsOf)}, against comparable players.`
          : "Strengths and weaknesses appear when player records are available."}
      </p>
      <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
        {[...squads].sort((a, b) => rank(a.team) - rank(b.team)).map((s) => (
          <div key={s.team}>
            <SquadTitle team={s.team} color={TEAM_COLORS[Math.max(0, battingOrder.indexOf(s.team)) % 2]} />
            <ol className="mt-2 divide-y divide-line">
              {s.players.map((p) => (
                <li key={p.person} className="py-2">
                  <p className="text-sm">
                    {p.slug ? (
                      <Link href={`/players/${p.slug}`} className="link-quiet font-medium">
                        {p.name}
                      </Link>
                    ) : (
                      <span className="font-medium">{p.name}</span>
                    )}
                  </p>
                  {hasContext && (p.strength || p.weakness) ? (
                    <div className="mt-1 space-y-0.5">
                      {p.strength && <Trait t={p.strength} />}
                      {p.weakness && <Trait t={p.weakness} />}
                    </div>
                  ) : hasContext ? (
                    <p className="mt-0.5 text-xs text-muted">{p.inDataset ? "No strength or weakness clears the sample threshold." : "No career record in this dataset."}</p>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}
