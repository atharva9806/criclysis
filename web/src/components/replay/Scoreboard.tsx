"use client";

import type { CSSProperties, ReactNode } from "react";
import type { Replay } from "@/lib/contract/pipeline";
import { currentPartnership, outcomeOf, type InningsCard, type MatchState, type Timeline } from "@/lib/replay/engine";
import { Flag } from "../broadcast/Flag";
import { fixed, plural } from "./format";
import { useMark } from "./marks";

function Batter({ name, row, striker }: { name: string; row?: { runs: number; balls: number }; striker: boolean }) {
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span className="truncate">
        {name}
        {striker && (
          <>
            <span aria-hidden="true" className="ml-1 text-accent">
              *
            </span>
            <span className="sr-only"> (on strike)</span>
          </>
        )}
      </span>
      <span className="shrink-0 tabular-nums">
        <span className="score text-xl">{row?.runs ?? 0}</span>
        <span className="text-muted"> ({row?.balls ?? 0})</span>
      </span>
    </li>
  );
}

/** One figure of the bug's lower strip. */
function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 px-4 py-2.5 sm:px-5">
      <dt className="label">{label}</dt>
      <dd className="score mt-1 text-[1.75rem]">{children}</dd>
    </div>
  );
}

function PrevFlag({ team }: { team: string }) {
  return <Flag mark={useMark(team)} size="xs" />;
}

/**
 * The score bug, drawn like a TV graphic: the batting side's colours, flag
 * and code, runs and wickets in the scoreboard face, overs, and the chase
 * figures. It stays dark in both themes (theme-dark). The score pops when it
 * changes, unless reduced motion is asked for.
 */
export default function Scoreboard({ replay, timeline, state, card }: { replay: Replay; timeline: Timeline; state: MatchState; card?: InningsCard }) {
  const people = replay.people;
  const name = (i: number | null) => (i == null ? "" : people[i]?.name ?? "");
  const row = (i: number | null) => card?.batting.find((b) => b.person === i);
  const bowler = card?.bowling.find((b) => b.person === state.bowler);
  const partnership = currentPartnership(card);
  const nextInnings = timeline.innings[state.innings + 1];
  const allOut = state.wickets >= 10;
  const outcome = state.matchComplete ? outcomeOf(replay) : null;
  const limited = state.ballsLeft != null || state.target != null;
  const bat = useMark(state.battingTeam);
  const bowl = useMark(state.bowlingTeam);
  const block: CSSProperties = { background: `linear-gradient(110deg, ${bat.primary} 0%, ${bat.deep} 100%)`, color: bat.on };

  return (
    <section aria-labelledby="scoreboard-title" className="theme-dark overflow-hidden rounded-panel border border-line bg-surface shadow-pop">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line bg-surface-2 px-4 py-2 sm:px-5">
        <span className="label">
          Innings {state.innings + 1}
          {state.phase && limited ? ` · ${state.phase.label}` : ""}
        </span>
        {state.previous.length ? (
          <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            {state.previous.map((p, i) => (
              <span key={`${p.team}-${i}`} className="inline-flex items-center gap-1.5 tabular-nums">
                <PrevFlag team={p.team} />
                <span className="text-fg">{p.team}</span> {p.runs}
                {p.wickets < 10 ? `/${p.wickets}` : ""} ({p.overs} ov)
              </span>
            ))}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-stretch">
        <div className="flex items-center gap-3 px-4 py-3 sm:min-w-44 sm:px-5" style={block}>
          <Flag mark={bat} size="lg" />
          <h2 id="scoreboard-title" className="min-w-0 leading-none">
            <span aria-hidden="true" className="block font-display text-[2rem] font-extrabold uppercase">
              {bat.code}
            </span>
            <span className="mt-0.5 block truncate font-sans text-xs font-semibold normal-case">{state.battingTeam}</span>
          </h2>
        </div>
        <p className="flex flex-1 flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3 sm:px-5">
          <span key={`${state.innings}-${state.runs}-${state.wickets}`} className="score pop inline-block text-score text-fg">
            {state.runs}
            {!allOut && <span className="text-muted">/{state.wickets}</span>}
          </span>
          <span className="score text-[1.75rem] text-muted">
            {allOut ? "all out · " : ""}
            {state.overs} <span className="text-base">ov</span>
          </span>
        </p>
        <p className="flex items-center gap-2 border-t border-line px-4 py-2.5 text-sm text-muted sm:border-l sm:border-t-0 sm:px-5">
          <span>v</span>
          <Flag mark={bowl} size="sm" />
          <span className="font-display text-lg font-bold uppercase tracking-[0.04em] text-fg" aria-hidden="true">
            {bowl.code}
          </span>
          <span className="sr-only">{state.bowlingTeam}, bowling</span>
        </p>
      </div>

      <dl className={`grid grid-cols-2 border-t border-line ${state.target != null ? "sm:grid-cols-4" : "sm:grid-cols-2"} [&>div]:border-line max-sm:[&>div:nth-child(even)]:border-l max-sm:[&>div:nth-child(n+3)]:border-t sm:[&>div+div]:border-l`}>
        <Cell label="Run rate">{fixed(state.runRate)}</Cell>
        {state.target != null ? (
          <>
            <Cell label="Target">{state.target}</Cell>
            <Cell label="Required rate">{fixed(state.requiredRate)}</Cell>
            <Cell label="To win">
              {state.need && !state.inningsComplete ? (
                <>
                  {state.need}
                  {state.ballsLeft != null ? <span className="ml-1 font-sans text-sm font-normal text-muted">off {state.ballsLeft}</span> : null}
                </>
              ) : (
                "–"
              )}
            </Cell>
          </>
        ) : state.ballsLeft != null ? (
          <Cell label="Balls left">{state.ballsLeft}</Cell>
        ) : null}
      </dl>

      {outcome ? (
        <p className="border-t border-line bg-accent-soft px-4 py-3 font-display text-xl font-bold uppercase tracking-[0.03em] text-accent-strong sm:px-5" role="status">
          {outcome.text}
        </p>
      ) : state.inningsComplete ? (
        <p className="border-t border-line bg-surface-2 px-4 py-3 text-sm sm:px-5">
          <span className="font-display text-base font-bold uppercase tracking-[0.04em]">Innings break.</span>{" "}
          {nextInnings?.target != null
            ? `${nextInnings.team} need ${nextInnings.target} to win${nextInnings.ballLimit ? ` from ${plural(nextInnings.ballLimit, "ball")}` : ""}.`
            : nextInnings
              ? `${nextInnings.team} bat next.`
              : ""}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 border-t border-line px-4 py-4 text-sm sm:grid-cols-2 sm:px-5">
          <div>
            <p className="label">Batting</p>
            <ul className="mt-1.5 space-y-1">
              {state.striker != null && <Batter name={name(state.striker)} row={row(state.striker)} striker />}
              {state.nonStriker != null && <Batter name={name(state.nonStriker)} row={row(state.nonStriker)} striker={false} />}
            </ul>
            {partnership && (
              <p className="mt-2 text-xs text-muted tabular-nums">
                Partnership {partnership.runs} ({partnership.balls})
              </p>
            )}
          </div>
          <div>
            <p className="label">Bowling</p>
            <p className="mt-1.5 flex items-baseline justify-between gap-3">
              <span className="truncate">{name(state.bowler)}</span>
              <span className="shrink-0">
                <span aria-hidden="true" className="score text-xl">
                  {bowler ? `${bowler.overs}-${bowler.maidens}-${bowler.runs}-${bowler.wickets}` : "0-0-0-0"}
                </span>
                <span className="sr-only">
                  {bowler ? `${bowler.overs} overs, ${bowler.maidens} maidens, ${bowler.runs} runs, ${bowler.wickets} wickets` : "No balls bowled yet"}
                </span>
              </span>
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
