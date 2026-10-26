import type { Eligibility, MatchState } from "@/lib/replay/engine";
import type { VenuePar, WinModel } from "@/lib/winprob/model";
import { plural } from "./format";

export type ParInfo = { par: number; venue: (VenuePar & { name: string }) | null; formatLabel: string };

export function parInfo(model: WinModel, venueKey: string | null | undefined, venueName: string): ParInfo {
  const v = model.venuePar(venueKey, venueName);
  return { par: v ? v.par : model.par(), venue: v ? { ...v, name: venueName.split(",")[0].trim() } : null, formatLabel: model.format === "odi" ? "ODI" : "T20I" };
}

function ParLine({ info }: { info: ParInfo }) {
  return (
    <p className="text-xs text-[#6e6e73]">
      {info.venue
        ? `Venue par at ${info.venue.name}, from ${plural(info.venue.matches, "completed first innings", "completed first innings")}.`
        : `${info.formatLabel} par: there is no venue par for this ground.`}{" "}
      Par is the first-innings total that gives the side batting first an even chance.
    </p>
  );
}

const versus = (total: number, par: number) => (total === par ? "level with par" : `${Math.abs(total - par)} ${total > par ? "above" : "below"} par`);

export default function Projection({ state, model, eligibility, par }: { state: MatchState; model: WinModel | null; eligibility: Eligibility; par: ParInfo | null }) {
  const title = (
    <h2 id="projection-title" className="text-[11px] font-semibold uppercase tracking-wider text-[#6e6e73]">
      Projected score and par
    </h2>
  );
  if (!eligibility.ok || !model || !par) {
    return (
      <section aria-labelledby="projection-title" className="card p-5 sm:p-6">
        {title}
        <p className="mt-3 text-sm text-[#6e6e73]">{eligibility.ok ? "No model is available for this match." : eligibility.reason}</p>
      </section>
    );
  }

  const ballsLeft = Math.max(0, model.maxBalls - state.legalBalls);
  const [mean, low, high] = model.projected(ballsLeft, state.wickets, state.runs);
  const firstInnings = state.innings === 0;

  return (
    <section aria-labelledby="projection-title" className="card p-5 sm:p-6">
      {title}
      {firstInnings && !state.inningsComplete ? (
        <>
          <p className="mt-3 flex flex-wrap items-baseline gap-x-2">
            <span className="text-4xl font-semibold tracking-tight">{Math.round(mean)}</span>
            <span className="text-sm text-[#6e6e73]">
              projected · 80% range {Math.round(low)}–{Math.round(high)}
            </span>
          </p>
          <div className="mt-3 rounded-2xl bg-[#f5f5f7] px-4 py-3">
            <p className="text-sm">
              <span className="font-semibold">Par {par.par}</span>
              <span className="text-[#6e6e73]"> · projection {versus(Math.round(mean), par.par)}</span>
            </p>
            <ParLine info={par} />
          </div>
        </>
      ) : firstInnings ? (
        <>
          <p className="mt-3 text-sm">
            <span className="text-4xl font-semibold tracking-tight">{state.runs}</span>
            <span className="ml-2 text-[#6e6e73]">final total, {versus(state.runs, par.par)}</span>
          </p>
          <div className="mt-3 rounded-2xl bg-[#f5f5f7] px-4 py-3">
            <p className="text-sm font-semibold">Par {par.par}</p>
            <ParLine info={par} />
          </div>
        </>
      ) : (
        <>
          {state.need != null && state.need > 0 && !state.inningsComplete ? (
            <p className="mt-3 text-sm">
              <span className="text-4xl font-semibold tracking-tight">{Math.round(mean - state.runs)}</span>
              <span className="ml-2 text-[#6e6e73]">
                more runs expected from {plural(ballsLeft, "ball")} with {plural(state.wickets, "wicket")} down · 80% range {Math.round(low - state.runs)}–
                {Math.round(high - state.runs)}. {state.battingTeam} need {state.need}.
              </span>
            </p>
          ) : (
            <p className="mt-3 text-sm text-[#6e6e73]">The chase is over.</p>
          )}
          <p className="mt-3 text-xs text-[#6e6e73]">
            First-innings par here was {par.par}
            {par.venue ? ` (venue par, from ${plural(par.venue.matches, "completed first innings", "completed first innings")})` : ` (${par.formatLabel} par)`}.
          </p>
        </>
      )}
    </section>
  );
}
