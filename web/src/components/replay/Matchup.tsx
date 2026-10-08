import type { SplitRow } from "@/lib/contract/db";
import type { Matchup as MatchupData } from "@/lib/replay/matchup";
import Link from "next/link";
import { fixed, formatDate } from "./format";

function Figures({ label, row, min }: { label: string; row: SplitRow | null; min: number }) {
  return (
    <div className="border-t border-black/5 py-2.5 first:border-t-0">
      <dt className="text-xs text-[#6e6e73]">{label}</dt>
      <dd className="mt-0.5 text-sm tabular-nums">
        {row ? (
          <>
            <span className="font-semibold">SR {fixed(row.strikeRate, 1)}</span>
            <span className="text-[#6e6e73]">
              {" "}
              · avg {row.average == null ? "– (never out)" : fixed(row.average, 1)} · dots {fixed(row.dotPct, 1)}% · {row.balls} balls
            </span>
          </>
        ) : (
          <span className="text-[#6e6e73]">Not enough balls (fewer than {min})</span>
        )}
      </dd>
    </div>
  );
}

export default function Matchup({
  matchup,
  hasContext,
  datasetAsOf,
  matchDate,
  formatLabel,
  finished = false,
}: {
  finished?: boolean;
  matchup: MatchupData | null;
  hasContext: boolean;
  datasetAsOf: string | null;
  matchDate: string;
  formatLabel: string;
}) {
  return (
    <section aria-labelledby="matchup-title" className="card p-5 sm:p-6">
      <h2 id="matchup-title" className="text-[11px] font-semibold uppercase tracking-wider text-[#6e6e73]">
        Matchup
      </h2>
      {finished ? (
        <p className="mt-3 text-sm text-[#6e6e73]">The match is over. Step back to see any ball&apos;s matchup.</p>
      ) : !hasContext ? (
        <p className="mt-3 text-sm text-[#6e6e73]">Player records are not available for this replay, so there is no matchup card.</p>
      ) : !matchup ? (
        <p className="mt-3 text-sm text-[#6e6e73]">The matchup appears once a batter and bowler are at the crease.</p>
      ) : (
        <>
          <p className="mt-3 text-base font-semibold">
            {matchup.batter.slug ? (
              <Link href={`/players/${matchup.batter.slug}`} className="hover:underline">
                {matchup.batter.name}
              </Link>
            ) : (
              matchup.batter.name
            )}{" "}
            <span className="font-normal text-[#6e6e73]">facing</span> {matchup.bowler.name}
          </p>
          <p className="text-xs text-[#6e6e73]">
            {matchup.bowler.typeLabel ?? "Bowling type not recorded"}
            {matchup.phase ? ` · ${matchup.phase.label}` : ""}
          </p>
          {!matchup.batter.inDataset ? (
            <p className="mt-3 text-sm text-[#6e6e73]">{matchup.batter.name} has no {formatLabel} career record in this dataset.</p>
          ) : (
            <dl className="mt-2">
              {matchup.bowler.type ? (
                <>
                  <Figures label={`Career ${formatLabel} vs ${matchup.bowler.typeLabel?.toLowerCase()}`} row={matchup.vsType} min={matchup.minBalls} />
                  {matchup.phase && (
                    <Figures label={`… in the ${matchup.phase.label.replace(/ \(.*\)$/, "").toLowerCase()} overs`} row={matchup.vsTypePhase} min={matchup.minBalls} />
                  )}
                </>
              ) : (
                <p className="py-2.5 text-sm text-[#6e6e73]">{matchup.bowler.name}&apos;s bowling type is not recorded, so there is no type matchup.</p>
              )}
              <Figures label={`Career ${formatLabel} vs ${matchup.bowler.name}`} row={matchup.vsBowler} min={matchup.minBalls} />
            </dl>
          )}
          <p className="mt-2 text-[11px] text-[#6e6e73]">
            Career figures as of {formatDate(datasetAsOf)}
            {datasetAsOf && matchDate < datasetAsOf ? `, so they include matches after this one (${formatDate(matchDate)}).` : "."}
          </p>
        </>
      )}
    </section>
  );
}
