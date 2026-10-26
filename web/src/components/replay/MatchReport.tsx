"use client";

import { useMemo } from "react";
import type { Replay } from "@/lib/contract/pipeline";
import { buildTimeline, chartSeries, probabilityAt, scorecardAt, winCurve, winProbEligibility } from "@/lib/replay/engine";
import { WinModel, type WinModelCore } from "@/lib/winprob/model";
import Scorecard from "./Scorecard";
import WinProbability from "./WinProbability";
import Worm from "./Worm";

/** The finished match from its replay: full scorecard, worm and win-probability curve (when the display rules allow it). */
export default function MatchReport({ replay, model: modelJson }: { replay: Replay; model: WinModelCore | null }) {
  const tl = useMemo(() => buildTimeline(replay), [replay]);
  const model = useMemo(() => (modelJson ? new WinModel(modelJson) : null), [modelJson]);
  const eligibility = useMemo(() => winProbEligibility(replay, model), [replay, model]);
  const curve = useMemo(() => (eligibility.ok && model ? winCurve(replay, model) : null), [eligibility, model, replay]);
  const end = tl.deliveries.length;
  const cards = useMemo(() => scorecardAt(tl, end), [tl, end]);
  const series = useMemo(() => (curve && model ? chartSeries(tl, curve, model, end) : []), [tl, curve, model, end]);
  const first = tl.innings[0]?.team ?? replay.teams[0] ?? "";
  const teams: [string, string] = [first, tl.innings[1]?.team ?? replay.teams.find((t) => t !== first) ?? ""];
  const view = eligibility.ok ? probabilityAt(tl, curve, model, eligibility, end) : ({ kind: "hidden", reason: eligibility.reason } as const);

  return (
    <div className="space-y-5">
      <Scorecard replay={replay} cards={cards} />
      <div className={`grid grid-cols-1 gap-5 ${tl.maxBalls != null ? "lg:grid-cols-2" : ""}`}>
        {tl.maxBalls != null && <Worm timeline={tl} cursor={end} maxOvers={tl.maxBalls / 6} />}
        <WinProbability teams={teams} view={view} series={series} maxOvers={(model?.maxBalls ?? tl.maxBalls ?? 300) / 6} />
      </div>
    </div>
  );
}
