"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReplayContext } from "@/lib/contract/db";
import type { Replay } from "@/lib/contract/pipeline";
import {
  buildTimeline,
  chartSeries,
  clampCursor,
  outcomeOf,
  overBoundary,
  probabilityAt,
  scorecardAt,
  stateAt,
  winCurve,
  winProbEligibility,
  type MatchState,
  type ProbabilityView,
  type Timeline,
} from "@/lib/replay/engine";
import { matchupFor, squads } from "@/lib/replay/matchup";
import { WinModel, type WinModelCore } from "@/lib/winprob/model";
import BallTicker from "./BallTicker";
import Controls, { type Speed } from "./Controls";
import { formatDate, pct } from "./format";
import Matchup from "./Matchup";
import Projection, { parInfo } from "./Projection";
import Scoreboard from "./Scoreboard";
import Scorecard from "./Scorecard";
import Squads from "./Squads";
import WinProbability from "./WinProbability";
import Worm from "./Worm";

export type ReplayPlayerProps = {
  replay: Replay;
  /** The win model for the replay's formatKey (golden and validation may be left out), or null. */
  model: WinModelCore | null;
  /** Player context from getReplayContext; optional. */
  context?: ReplayContext | null;
  /** The date the dataset runs to, for the credit line. Defaults to the context's. */
  datasetAsOf?: string | null;
  initialCursor?: number;
};

/** Milliseconds per delivery at each speed. */
const DELAY: Record<Speed, number> = { 1: 1000, 5: 200, 20: 50 };

const score = (s: Pick<MatchState, "runs" | "wickets">) => (s.wickets >= 10 ? `${s.runs} all out` : `${s.runs} for ${s.wickets}`);

/** Spoken position for the scrubber. */
function positionText(tl: Timeline, s: MatchState): string {
  if (s.cursor === 0) return "Before the first ball";
  if (s.matchComplete) return `End of match: ${outcomeOf(tl.replay).text}`;
  return `Innings ${s.innings + 1}, over ${s.last?.label}: ${s.battingTeam} ${score(s)}`;
}

/** Cursor of the last completed over (or innings) at or before `cursor`. */
function lastOverEnd(tl: Timeline, cursor: number): number {
  for (let c = cursor; c > 0; c--) {
    const d = tl.deliveries[c - 1];
    if ((d.legal && d.legalBalls % 6 === 0) || c === tl.innings[d.innings].end) return c;
  }
  return 0;
}

/** What the live region says at the end of an over. */
function overSummary(tl: Timeline, s: MatchState, view: ProbabilityView, teams: [string, string]): string {
  if (s.cursor === 0) return "";
  if (s.matchComplete) return `Match over. ${outcomeOf(tl.replay).text}.`;
  const parts = [
    s.inningsComplete ? `End of innings: ${s.battingTeam} ${score(s)} in ${s.overs} overs.` : `End of over ${Math.floor(s.legalBalls / 6)}: ${s.battingTeam} ${score(s)}.`,
  ];
  if (s.need != null && !s.inningsComplete) parts.push(`Need ${s.need}${s.ballsLeft != null ? ` from ${s.ballsLeft} balls` : ""}.`);
  if (view.kind === "model") {
    const lead = view.battingFirst >= 0.5 ? 0 : 1;
    parts.push(`${teams[lead]} ${pct(lead === 0 ? view.battingFirst : 1 - view.battingFirst)} to win.`);
  }
  return parts.join(" ");
}

export default function ReplayPlayer({ replay, model: modelJson, context = null, datasetAsOf, initialCursor = 0 }: ReplayPlayerProps) {
  const tl = useMemo(() => buildTimeline(replay), [replay]);
  const model = useMemo(() => (modelJson ? new WinModel(modelJson) : null), [modelJson]);
  const eligibility = useMemo(() => winProbEligibility(replay, model), [replay, model]);
  const curve = useMemo(() => (eligibility.ok && model ? winCurve(replay, model) : null), [eligibility, model, replay]);
  const par = useMemo(() => (eligibility.ok && model ? parInfo(model, replay.venueKey, replay.venue) : null), [eligibility, model, replay]);
  const xi = useMemo(() => squads(replay, context), [replay, context]);
  const teams = useMemo<[string, string]>(() => {
    const first = tl.innings[0]?.team ?? replay.teams[0] ?? "";
    return [first, tl.innings[1]?.team ?? replay.teams.find((t) => t !== first) ?? ""];
  }, [tl, replay]);

  const total = tl.deliveries.length;
  const [cursor, setCursor] = useState(() => clampCursor(tl, initialCursor));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(5);

  // Playback: one delivery per tick; stops at the end of the match.
  useEffect(() => {
    if (!playing) return;
    const id = window.setTimeout(() => {
      const next = Math.min(total, cursor + 1);
      setCursor(next);
      if (next >= total) setPlaying(false);
    }, DELAY[speed]);
    return () => window.clearTimeout(id);
  }, [playing, cursor, speed, total]);

  const toggle = useCallback(() => {
    if (playing) return setPlaying(false);
    if (cursor >= total) setCursor(0);
    setPlaying(true);
  }, [playing, cursor, total]);
  const step = useCallback((dir: 1 | -1) => {
    setPlaying(false);
    setCursor((c) => clampCursor(tl, c + dir));
  }, [tl]);
  const over = useCallback((dir: 1 | -1) => {
    setPlaying(false);
    setCursor((c) => overBoundary(tl, c, dir));
  }, [tl]);
  const seek = useCallback((c: number) => {
    setPlaying(false);
    setCursor(clampCursor(tl, c));
  }, [tl]);

  // Keyboard: Space or K plays and pauses, arrows step a ball, Shift + arrows an over.
  // Form fields keep their own keys (the scrubber's arrows already step a ball).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (t?.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const activates = tag === "BUTTON" || tag === "A" || tag === "SUMMARY";
      if ((e.key === " " && !activates) || e.key === "k" || e.key === "K") {
        e.preventDefault();
        toggle();
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const dir = e.key === "ArrowRight" ? 1 : -1;
        if (e.shiftKey) over(dir);
        else step(dir);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toggle, step, over]);

  const state = stateAt(tl, cursor);
  const cards = useMemo(() => scorecardAt(tl, cursor), [tl, cursor]);
  const view = probabilityAt(tl, curve, model, eligibility, cursor);
  const series = useMemo(() => (curve && model ? chartSeries(tl, curve, model, cursor) : []), [tl, curve, model, cursor]);
  const matchup = matchupFor(context, replay, state.striker, state.bowler, state.phase);
  const formatLabel = replay.format === "odi" ? "ODI" : replay.format === "t20i" ? "T20I" : "Test";
  const asOf = datasetAsOf ?? context?.datasetAsOf ?? null;

  // The live region speaks once per over: its text only changes when an over (or innings) completes.
  const announceAt = lastOverEnd(tl, cursor);
  const announcement = useMemo(() => {
    const s = stateAt(tl, announceAt);
    return overSummary(tl, s, probabilityAt(tl, curve, model, eligibility, announceAt), teams);
  }, [tl, announceAt, curve, model, eligibility, teams]);

  const toss = replay.toss?.winner ? `${replay.toss.winner} won the toss and chose to ${replay.toss.decision === "bat" ? "bat" : "field"}.` : null;

  return (
    <div data-replay-root>
      <header className="mb-6">
        <p className="flex flex-wrap items-center gap-2 text-xs text-[#6e6e73]">
          <span className="rounded-full bg-[#1d1d1f] px-2.5 py-0.5 font-semibold uppercase tracking-wider text-white">Replay</span>
          <span>
            {[replay.event, replay.stage].filter(Boolean).join(" · ")}
            {replay.event || replay.stage ? " · " : ""}
            {formatLabel}
          </span>
        </p>
        <h1 className="headline mt-3 text-3xl sm:text-5xl">{replay.title}</h1>
        <p className="mt-2 text-sm text-[#6e6e73]">
          {formatDate(replay.date)} · {replay.venue}
          {toss ? ` · ${toss}` : ""}
        </p>
        <p className="mt-1 text-sm text-[#6e6e73]">A real match, replayed ball by ball from its Cricsheet record. Nothing here is simulated.</p>
      </header>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>

      {total === 0 ? (
        <section className="card p-6 text-sm">
          <p className="font-semibold">No ball-by-ball record for this match.</p>
          <p className="mt-1 text-[#6e6e73]">{outcomeOf(replay).text || "No result was recorded."}</p>
        </section>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="space-y-5 lg:col-span-2">
              <Scoreboard replay={replay} timeline={tl} state={state} card={cards[state.innings]} />
              <Controls
                playing={playing}
                speed={speed}
                cursor={cursor}
                total={total}
                position={positionText(tl, state)}
                onToggle={toggle}
                onStep={step}
                onOver={over}
                onSeek={seek}
                onSpeed={setSpeed}
              />
              <BallTicker replay={replay} timeline={tl} cursor={cursor} />
              <WinProbability teams={teams} view={view} series={series} maxOvers={(model?.maxBalls ?? 300) / 6} />
            </div>
            <div className="space-y-5">
              <Projection state={state} model={model} eligibility={eligibility} par={par} />
              <Matchup finished={state.matchComplete} matchup={matchup} hasContext={!!context} datasetAsOf={asOf} matchDate={replay.date} formatLabel={formatLabel} />
            </div>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-5">
            <div className="xl:col-span-3">
              <Scorecard replay={replay} cards={cards} />
            </div>
            {tl.maxBalls != null && (
              <div className="xl:col-span-2">
                <Worm timeline={tl} cursor={cursor} maxOvers={tl.maxBalls / 6} />
              </div>
            )}
          </div>
        </>
      )}

      <div className="mt-5">
        <Squads squads={xi} battingOrder={teams} hasContext={!!context} datasetAsOf={asOf} />
      </div>

      <footer className="mt-6 text-xs leading-relaxed text-[#6e6e73]">
        <p>
          Ball-by-ball data from{" "}
          <a href="https://cricsheet.org" className="text-[#0071e3] hover:underline">
            Cricsheet
          </a>
          , licensed under{" "}
          <a href="https://creativecommons.org/licenses/by/4.0/" className="text-[#0071e3] hover:underline">
            CC BY 4.0
          </a>
          {asOf ? `. Data as of ${formatDate(asOf)}.` : "."} Win probability, projected score and par come from a model fitted to Cricsheet history; see the method notes.
        </p>
      </footer>
    </div>
  );
}
