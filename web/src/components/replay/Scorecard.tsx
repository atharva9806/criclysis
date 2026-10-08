"use client";

import { useState } from "react";
import type { Replay } from "@/lib/contract/pipeline";
import type { InningsCard } from "@/lib/replay/engine";
import { fixed, TEAM_COLORS } from "./format";

const th = "px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6e6e73] first:pl-0 first:text-left";
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
        <h2 id="scorecard-title" className="text-[11px] font-semibold uppercase tracking-wider text-[#6e6e73]">
          {title}
        </h2>
        <p className="mt-3 text-sm text-[#6e6e73]">No balls have been bowled yet.</p>
      </section>
    );
  }
  const shown = cards[picked != null && picked < cards.length ? picked : cards.length - 1];
  const batted = new Set(shown.batting.map((b) => b.person));
  const yetToBat = replay.people.map((p, i) => ({ p, i })).filter(({ p, i }) => p.team === shown.team && !batted.has(i));

  return (
    <section aria-labelledby="scorecard-title" className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="scorecard-title" className="text-[11px] font-semibold uppercase tracking-wider text-[#6e6e73]">
          {title}
        </h2>
        {cards.length > 1 && (
          <div role="group" aria-label="Innings" className="segment">
            {cards.map((c) => (
              <button
                key={c.innings}
                type="button"
                aria-pressed={c === shown}
                data-active={c === shown}
                onClick={() => setPicked(c.innings)}
                className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0071e3]"
              >
                {c.team}
                {cards.filter((x) => x.team === c.team).length > 1 ? ` (${c.innings + 1})` : ""}
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="mt-3 flex items-center gap-2 text-sm">
        <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: TEAM_COLORS[shown.innings % 2] }} />
        <span className="font-semibold">{shown.team}</span>
        <span className="tabular-nums text-[#6e6e73]">
          {totalText(shown)}
          {shown.complete ? "" : " · in progress"}
        </span>
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm sm:min-w-[34rem]">
          <caption className="sr-only">
            {shown.team} batting, innings {shown.innings + 1}
          </caption>
          <thead>
            <tr className="border-b border-black/5">
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
              <tr key={b.person} className="border-b border-black/5">
                <th scope="row" className={`${td} font-medium`}>
                  {name(b.person)}
                  {!b.dismissal && <span className="text-[#6e6e73]">*</span>}
                  <span className="block text-xs font-normal text-[#6e6e73] sm:hidden">{b.dismissal ? b.dismissal.label : b.atCrease ? "batting" : "not out"}</span>
                </th>
                <td className={`${td} hidden !text-left text-[#6e6e73] sm:table-cell`}>{b.dismissal ? b.dismissal.label : b.atCrease ? "batting" : "not out"}</td>
                <td className={`${td} font-semibold`}>{b.runs}</td>
                <td className={td}>{b.balls}</td>
                <td className={td}>{b.fours}</td>
                <td className={td}>{b.sixes}</td>
                <td className={td}>{b.balls ? fixed((b.runs * 100) / b.balls, 1) : "–"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="text-[#6e6e73]">
            <tr>
              <th scope="row" className={`${td} font-normal`}>Extras</th>
              <td colSpan={6} className={`${td} !text-left`}>{extrasText(shown)}</td>
            </tr>
            <tr>
              <th scope="row" className={`${td} font-semibold text-[#1d1d1f]`}>Total</th>
              <td colSpan={6} className={`${td} !text-left font-semibold text-[#1d1d1f]`}>{totalText(shown)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {yetToBat.length > 0 && (
        <p className="mt-2 text-xs text-[#6e6e73]">
          {shown.complete ? "Did not bat" : "Yet to bat"}: {yetToBat.map(({ p }) => p.name).join(", ")}
        </p>
      )}
      {shown.fallOfWickets.length > 0 && (
        <p className="mt-2 text-xs leading-relaxed text-[#6e6e73]">
          <span className="font-semibold text-[#1d1d1f]">Fall of wickets: </span>
          {shown.fallOfWickets.map((f) => `${f.wicket}-${f.runs} (${name(f.person)}, ${f.label} ov)`).join(", ")}
        </p>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm sm:min-w-[30rem]">
          <caption className="sr-only">
            {shown.bowlingTeam} bowling, innings {shown.innings + 1}
          </caption>
          <thead>
            <tr className="border-b border-black/5">
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
              <tr key={b.person} className="border-b border-black/5 last:border-0">
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
      </div>
      <p className="mt-3 text-[11px] text-[#6e6e73]">Replays carry no fielders, so catches name only the bowler.</p>
    </section>
  );
}
