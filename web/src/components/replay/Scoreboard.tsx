import type { Replay } from "@/lib/contract/pipeline";
import { currentPartnership, outcomeOf, type InningsCard, type MatchState, type Timeline } from "@/lib/replay/engine";
import { fixed, plural, TEAM_COLORS } from "./format";

function Batter({ name, row, striker }: { name: string; row?: { runs: number; balls: number }; striker: boolean }) {
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span className="truncate">
        {name}
        {striker && (
          <span className="ml-1 text-[#f5f5f7]/60" aria-label="on strike">
            *
          </span>
        )}
      </span>
      <span className="shrink-0 tabular-nums">
        <span className="font-semibold">{row?.runs ?? 0}</span>
        <span className="text-[#f5f5f7]/60"> ({row?.balls ?? 0})</span>
      </span>
    </li>
  );
}

export default function Scoreboard({ replay, timeline, state, card }: { replay: Replay; timeline: Timeline; state: MatchState; card?: InningsCard }) {
  const people = replay.people;
  const name = (i: number | null) => (i == null ? "" : people[i]?.name ?? "");
  const row = (i: number | null) => card?.batting.find((b) => b.person === i);
  const bowler = card?.bowling.find((b) => b.person === state.bowler);
  const partnership = currentPartnership(card);
  const nextInnings = timeline.innings[state.innings + 1];
  const allOut = state.wickets >= 10;
  const outcome = state.matchComplete ? outcomeOf(replay) : null;
  const color = TEAM_COLORS[state.innings % 2];
  const limited = state.ballsLeft != null || state.target != null;

  return (
    <section aria-labelledby="scoreboard-title" className="dark-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#f5f5f7]/70">
        <span>
          Innings {state.innings + 1}
          {state.phase && limited ? ` · ${state.phase.label}` : ""}
        </span>
        {state.previous.map((p) => (
          <span key={p.team} className="tabular-nums">
            {p.team} {p.runs}
            {p.wickets < 10 ? `/${p.wickets}` : ""} ({p.overs} ov)
          </span>
        ))}
      </div>

      <h2 id="scoreboard-title" className="mt-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-[#f5f5f7]/80">
        <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        {state.battingTeam}
      </h2>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-3">
        <span className="text-5xl font-semibold tracking-tight sm:text-6xl">
          {state.runs}
          {!allOut && <span className="text-[#f5f5f7]/70">/{state.wickets}</span>}
        </span>
        <span className="text-lg text-[#f5f5f7]/70 tabular-nums">
          {allOut ? "all out · " : ""}
          {state.overs} ov
        </span>
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-[11px] uppercase tracking-wider text-[#f5f5f7]/60">Run rate</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">{fixed(state.runRate)}</dd>
        </div>
        {state.target != null ? (
          <>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-[#f5f5f7]/60">Target</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">{state.target}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-[#f5f5f7]/60">Required rate</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">{fixed(state.requiredRate)}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-[#f5f5f7]/60">To win</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">
                {state.need ? `${state.need}${state.ballsLeft != null ? ` off ${state.ballsLeft}` : ""}` : "–"}
              </dd>
            </div>
          </>
        ) : state.ballsLeft != null ? (
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-[#f5f5f7]/60">Balls left</dt>
            <dd className="mt-0.5 font-semibold tabular-nums">{state.ballsLeft}</dd>
          </div>
        ) : null}
      </dl>

      {outcome ? (
        <p className="mt-5 rounded-2xl bg-white/10 px-4 py-3 text-base font-semibold" role="status">
          {outcome.text}
        </p>
      ) : state.inningsComplete ? (
        <p className="mt-5 rounded-2xl bg-white/10 px-4 py-3 text-sm">
          <span className="font-semibold">Innings break.</span>{" "}
          {nextInnings?.target != null
            ? `${nextInnings.team} need ${nextInnings.target} to win${nextInnings.ballLimit ? ` from ${plural(nextInnings.ballLimit, "ball")}` : ""}.`
            : nextInnings
              ? `${nextInnings.team} bat next.`
              : ""}
        </p>
      ) : (
        <div className="mt-5 grid gap-4 border-t border-white/10 pt-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-[#f5f5f7]/60">Batting</p>
            <ul className="mt-1.5 space-y-1">
              {state.striker != null && <Batter name={name(state.striker)} row={row(state.striker)} striker />}
              {state.nonStriker != null && <Batter name={name(state.nonStriker)} row={row(state.nonStriker)} striker={false} />}
            </ul>
            {partnership && (
              <p className="mt-2 text-xs text-[#f5f5f7]/60 tabular-nums">
                Partnership {partnership.runs} ({partnership.balls})
              </p>
            )}
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-[#f5f5f7]/60">Bowling</p>
            <p className="mt-1.5 flex items-baseline justify-between gap-3">
              <span className="truncate">{name(state.bowler)}</span>
              <span className="shrink-0 tabular-nums" aria-label={bowler ? `${bowler.overs} overs, ${bowler.maidens} maidens, ${bowler.runs} runs, ${bowler.wickets} wickets` : undefined}>
                {bowler ? `${bowler.overs}-${bowler.maidens}-${bowler.runs}-${bowler.wickets}` : "0-0-0-0"}
              </span>
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
