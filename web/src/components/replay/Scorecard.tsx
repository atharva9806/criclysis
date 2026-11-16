"use client";

import { useState } from "react";
import type { Replay } from "@/lib/contract/pipeline";
import type { InningsCard } from "@/lib/replay/engine";
import { Flag } from "../broadcast/Flag";
import { ScrollRegion } from "../ScrollRegion";
import { fixed, TEAM_COLORS } from "./format";
import { useMark } from "./marks";

function TeamLine({ team, color }: { team: string; color: string }) {
  const mark = useMark(team);
  return (
    <span className="inline-flex items-center gap-2 border-l-[3px] pl-2.5" style={{ borderColor: color }}>
      <Flag mark={mark} size="sm" />
      <span className="font-display text-lg font-bold uppercase tracking-[0.03em]">{team}</span>
    </span>
  );
}

const th = "px-2 py-2 text-right font-display text-label uppercase text-muted first:pl-0 first:text-left";
const td = "px-2 py-2 text-right tabular-nums first:pl-0 first:text-left";

function totalText(c: InningsCard) {
  const t = c.total;
  return `${t.runs}${t.wickets >= 10 ? " all out" : `/${t.wickets}`} (${t.overs} ov)`;
}

function extrasText(c: InningsCard) {
  const e = c.extras;
  const parts = [
    ["b", e.byes],
    ["lb", e.legbyes],
    ["w", e.wides],
    ["nb", e.noballs],
    ["pen", e.penalty],
  ].filter(([, v]) => v);
  return `${e.total}${parts.length ? ` (${parts.map(([k, v]) => `${k} ${v}`).join(", ")})` : ""}`;
}

export default function Scorecard({ replay, cards, title = "Scorecard" }: { replay: Replay; cards: InningsCard[]; title?: string }) {
  const [picked, setPicked] = useState<number | null>(null);
  const name = (i: number | null) => (i == null ? "" : replay.people[i]?.name ?? "");
  if (!cards.length) {
    return (
      <section aria-labelledby="scorecard-title" className="card p-5 sm:p-6">
        <h2 id="scorecard-title" className="card-title">
          {title}
        </h2>
        <p className="mt-3 text-sm text-muted">No balls have been bowled yet.</p>
      </section>
    );
  }
  const shown = cards[picked != null && picked < cards.length ? picked : cards.length - 1];
  const batted = new Set(shown.batting.map((b) => b.person));
  const yetToBat = replay.people.map((p, i) => ({ p, i })).filter(({ p, i }) => p.team === shown.team && !batted.has(i));

  return (
    <section aria-labelledby="scorecard-title" className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="scorecard-title" className="card-title">
          {title}
        </h2>
        {cards.length > 1 && (
          <div role="group" aria-label="Innings" className="segmented">
            {cards.map((c) => (
              <button
                key={c.innings}
                type="button"
                aria-pressed={c === shown}
                data-active={c === shown}
                onClick={() => setPicked(c.innings)}
                
              >
                {c.team}
                {cards.filter((x) => x.team === c.team).length > 1 ? ` (${c.innings + 1})` : ""}
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <TeamLine team={shown.team} color={TEAM_COLORS[shown.innings % 2]} />
        <span className="tabular-nums text-muted">
          {totalText(shown)}
          {shown.complete ? "" : " · in progress"}
        </span>
      </p>

      <ScrollRegion label={`${shown.team} batting, innings ${shown.innings + 1}`} className="mt-3">
        <table className="w-full text-sm sm:min-w-[34rem]">
          <caption className="sr-only">
            {shown.team} batting, innings {shown.innings + 1}
          </caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className={th}>Batter</th>
              <th scope="col" className={`${th} hidden !text-left sm:table-cell`}>How out</th>
              <th scope="col" className={th}>R</th>
              <th scope="col" className={th}>B</th>
              <th scope="col" className={th}>4s</th>
              <th scope="col" className={th}>6s</th>
              <th scope="col" className={th}>SR</th>
            </tr>
          </thead>
          <tbody>
            {shown.batting.map((b) => (
              <tr key={b.person} className="border-b border-line">
                <th scope="row" className={`${td} font-medium`}>
                  {name(b.person)}
                  {!b.dismissal && <span className="text-muted">*</span>}
                  <span className="block text-xs font-normal text-muted sm:hidden">{b.dismissal ? b.dismissal.label : b.atCrease ? "batting" : "not out"}</span>
                </th>
                <td className={`${td} hidden !text-left text-muted sm:table-cell`}>{b.dismissal ? b.dismissal.label : b.atCrease ? "batting" : "not out"}</td>
                <td className={`${td} font-semibold`}>{b.runs}</td>
                <td className={td}>{b.balls}</td>
                <td className={td}>{b.fours}</td>
                <td className={td}>{b.sixes}</td>
                <td className={td}>{b.balls ? fixed((b.runs * 100) / b.balls, 1) : "–"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="text-muted">
            <tr>
              <th scope="row" className={`${td} font-normal`}>Extras</th>
              <td colSpan={6} className={`${td} !text-left`}>{extrasText(shown)}</td>
            </tr>
            <tr>
              <th scope="row" className={`${td} font-semibold text-fg`}>Total</th>
              <td colSpan={6} className={`${td} !text-left font-semibold text-fg`}>{totalText(shown)}</td>
            </tr>
          </tfoot>
        </table>
      </ScrollRegion>
      {yetToBat.length > 0 && (
        <p className="mt-2 text-xs text-muted">
          {shown.complete ? "Did not bat" : "Yet to bat"}: {yetToBat.map(({ p }) => p.name).join(", ")}
        </p>
      )}
      {shown.fallOfWickets.length > 0 && (
        <p className="mt-2 text-xs leading-relaxed text-muted">
          <span className="font-semibold text-fg">Fall of wickets: </span>
          {shown.fallOfWickets.map((f) => `${f.wicket}-${f.runs} (${name(f.person)}, ${f.label} ov)`).join(", ")}
        </p>
      )}

      <ScrollRegion label={`${shown.bowlingTeam} bowling, innings ${shown.innings + 1}`} className="mt-4">
        <table className="w-full text-sm sm:min-w-[30rem]">
          <caption className="sr-only">
            {shown.bowlingTeam} bowling, innings {shown.innings + 1}
          </caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className={th}>Bowler</th>
              <th scope="col" className={th}>O</th>
              <th scope="col" className={th}>M</th>
              <th scope="col" className={th}>R</th>
              <th scope="col" className={th}>W</th>
              <th scope="col" className={th}>Econ</th>
              <th scope="col" className={`${th} hidden sm:table-cell`}>Wd</th>
              <th scope="col" className={`${th} hidden sm:table-cell`}>Nb</th>
            </tr>
          </thead>
          <tbody>
            {shown.bowling.map((b) => (
              <tr key={b.person} className="border-b border-line last:border-0">
                <th scope="row" className={`${td} font-medium`}>{name(b.person)}</th>
                <td className={td}>{b.overs}</td>
                <td className={td}>{b.maidens}</td>
                <td className={td}>{b.runs}</td>
                <td className={`${td} font-semibold`}>{b.wickets}</td>
                <td className={td}>{b.legalBalls ? fixed((b.runs * 6) / b.legalBalls) : "–"}</td>
                <td className={`${td} hidden sm:table-cell`}>{b.wides}</td>
                <td className={`${td} hidden sm:table-cell`}>{b.noballs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollRegion>
      <p className="mt-3 text-xs text-muted">Replays carry no fielders, so catches name only the bowler.</p>
    </section>
  );
}
