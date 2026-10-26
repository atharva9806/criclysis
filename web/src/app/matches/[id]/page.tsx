import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import MatchReport from "@/components/replay/MatchReport";
import { eventLine, formatKeyLabel } from "@/components/replay/ResultCard";
import { formatDate } from "@/components/replay/format";
import { getDatasetMeta, getMatch, getReplay, getWinModel } from "@/lib/data";
import { withMatchFacts } from "@/lib/replay/engine";
import { slimModel } from "@/lib/winprob/model";

type Props = { params: Promise<{ id: string }> };

const validId = (id: string) => /^[A-Za-z0-9_-]{1,32}$/.test(id);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const match = validId(id) ? await getMatch(id) : null;
  if (!match) return { title: "Match not found · Criclysis" };
  return { title: `${match.team1} v ${match.team2}, ${match.endDate} · Criclysis`, description: match.result.text };
}

export default async function MatchPage({ params }: Props) {
  const { id } = await params;
  if (!validId(id)) notFound();
  const match = await getMatch(id);
  if (!match) notFound();
  const [stored, meta, modelJson] = await Promise.all([
    match.hasReplay ? getReplay(id) : Promise.resolve(null),
    getDatasetMeta(),
    match.format === "test" ? Promise.resolve(null) : getWinModel(match.formatKey),
  ]);
  const replay = stored ? withMatchFacts(stored, match) : null;
  const model = modelJson ? slimModel(modelJson, { key: match.venueKey, name: match.venue }) : null;
  const event = eventLine(match);
  const dates = match.startDate === match.endDate ? formatDate(match.endDate) : `${formatDate(match.startDate)} to ${formatDate(match.endDate)}`;
  const toss = match.tossWinner ? `${match.tossWinner} won the toss and chose to ${match.tossDecision === "bat" ? "bat" : "field"}.` : null;
  const pom = match.playerOfMatch.map((p) => p.name).filter(Boolean);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header>
        <p className="text-xs text-[#6e6e73]">
          {formatKeyLabel(match.format, match.gender)}
          {event ? ` · ${event}` : ""}
        </p>
        <h1 className="headline mt-2 text-3xl sm:text-5xl">
          {match.team1} v {match.team2}
        </h1>
        <p className="mt-2 text-sm text-[#6e6e73]">
          {dates} · {match.venue}
          {match.city && !match.venue.includes(match.city) ? `, ${match.city}` : ""}
        </p>
      </header>

      <section aria-labelledby="result-title" className="card mt-6 p-5 sm:p-6">
        <h2 id="result-title" className="text-lg font-semibold">
          {match.result.text || "Result not recorded"}
        </h2>
        <dl className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          {toss && (
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-[#6e6e73]">Toss</dt>
              <dd>{toss}</dd>
            </div>
          )}
          {pom.length > 0 && (
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-[#6e6e73]">Player of the match</dt>
              <dd>{pom.join(", ")}</dd>
            </div>
          )}
          {match.scheduledOvers != null && (
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-[#6e6e73]">Scheduled overs</dt>
              <dd>{match.scheduledOvers} a side</dd>
            </div>
          )}
        </dl>
        {match.innings.length > 0 && (
          <table className="mt-4 w-full text-sm">
            <caption className="sr-only">Innings totals</caption>
            <thead>
              <tr className="border-b border-black/5 text-left text-[11px] uppercase tracking-wider text-[#6e6e73]">
                <th scope="col" className="py-2 font-semibold">Innings</th>
                <th scope="col" className="py-2 text-right font-semibold">Score</th>
                <th scope="col" className="py-2 text-right font-semibold">Overs</th>
              </tr>
            </thead>
            <tbody>
              {match.innings.map((inn, i) => (
                <tr key={i} className="border-b border-black/5 last:border-0">
                  <th scope="row" className="py-2 text-left font-medium">
                    {inn.team}
                    {match.format === "test" ? <span className="text-[#6e6e73]"> ({i + 1})</span> : null}
                    {inn.target ? <span className="block text-xs font-normal text-[#6e6e73]">Target {inn.target.runs}{inn.target.overs ? ` from ${inn.target.overs} overs` : ""}</span> : null}
                  </th>
                  <td className="py-2 text-right tabular-nums">
                    {inn.runs}
                    {inn.wickets >= 10 ? "" : `/${inn.wickets}`}
                    {inn.declared ? "d" : ""}
                  </td>
                  <td className="py-2 text-right tabular-nums">{inn.overs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {replay && (
          <p className="mt-4">
            <Link href={`/live/${match.id}`} className="btn-primary">
              Replay ball by ball
            </Link>
          </p>
        )}
      </section>

      <div className="mt-5">
        {replay ? (
          <MatchReport replay={replay} model={model} />
        ) : (
          <div className="card p-6 text-sm text-[#6e6e73]">Cricsheet has no ball-by-ball record for this match, so there is no scorecard, worm or win-probability curve.</div>
        )}
      </div>

      <p className="mt-6 text-xs text-[#6e6e73]">
        Data from{" "}
        <a href="https://cricsheet.org" className="text-[#0071e3] hover:underline">
          Cricsheet
        </a>{" "}
        (
        <a href="https://creativecommons.org/licenses/by/4.0/" className="text-[#0071e3] hover:underline">
          CC BY 4.0
        </a>
        ){meta ? `, matches up to ${formatDate(meta.dataAsOf)}` : ""}.
      </p>
    </div>
  );
}
