import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import MatchReport from "@/components/replay/MatchReport";
import { eventLine } from "@/components/replay/ResultCard";
import { formatDate } from "@/components/replay/format";
import type { MatchRow } from "@/lib/contract/db";
import { getMatch, getReplay, getWinModel } from "@/lib/data";
import { formatKeyLabel } from "@/lib/format";
import { withMatchFacts } from "@/lib/replay/engine";
import { slimModel } from "@/lib/winprob/model";
import { PageHeader, genderHref } from "@/components/data";
import { SectionSkeleton, TableSkeleton } from "@/components/Loading";
import { Badge, EmptyState } from "@/components/ui";

type Props = { params: Promise<{ id: string }> };

const validId = (id: string) => /^[A-Za-z0-9_-]{1,32}$/.test(id);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const match = validId(id) ? await getMatch(id) : null;
  if (!match) return { title: "Match not found · Criclysis" };
  return { title: `${match.team1} v ${match.team2}, ${match.endDate} · Criclysis`, description: match.result.text };
}

/** The scorecard, worm and win-probability curve, built from the stored replay (the slow part: gunzip and parse). */
async function Report({ match }: { match: MatchRow }) {
  const [stored, modelJson] = await Promise.all([
    match.hasReplay ? getReplay(match.id) : Promise.resolve(null),
    match.format === "test" ? Promise.resolve(null) : getWinModel(match.formatKey),
  ]);
  if (!stored) {
    return (
      <EmptyState title="No ball-by-ball record">
        Cricsheet has no ball-by-ball record for this match, so there is no scorecard, worm or win-probability curve.
      </EmptyState>
    );
  }
  const replay = withMatchFacts(stored, match);
  const model = modelJson ? slimModel(modelJson, { key: match.venueKey, name: match.venue }) : null;
  return <MatchReport replay={replay} model={model} />;
}

export default async function MatchPage({ params }: Props) {
  const { id } = await params;
  // Existence first, before any Suspense boundary streams, so an unknown id is a real 404.
  if (!validId(id)) notFound();
  const match = await getMatch(id);
  if (!match) notFound();
  const event = eventLine(match);
  const dates = match.startDate === match.endDate ? formatDate(match.endDate) : `${formatDate(match.startDate)} to ${formatDate(match.endDate)}`;
  const toss = match.tossWinner ? `${match.tossWinner} won the toss and chose to ${match.tossDecision === "bat" ? "bat" : "field"}.` : null;
  const pom = match.playerOfMatch.map((p) => p.name).filter(Boolean);

  return (
    <div className="page">
      <PageHeader
        back={{ href: genderHref("/matches", match.gender), label: "All matches" }}
        eyebrow={[formatKeyLabel(match.formatKey), event].filter(Boolean).join(" · ")}
        title={`${match.team1} v ${match.team2}`}
        sub={
          <>
            <time dateTime={match.endDate}>{dates}</time> · {match.venue}
            {match.city && !match.venue.includes(match.city) ? `, ${match.city}` : ""}
          </>
        }
      />

      <section aria-labelledby="result-title" className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="label">Result</p>
            <h2 id="result-title" className="mt-1 text-heading">
              {match.result.text || "Result not recorded"}
            </h2>
          </div>
          {match.result.method ? <Badge tone="warning">{match.result.method}</Badge> : null}
        </div>
        <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
          {toss ? (
            <div>
              <dt className="label">Toss</dt>
              <dd className="mt-0.5">{toss}</dd>
            </div>
          ) : null}
          {pom.length > 0 ? (
            <div>
              <dt className="label">Player of the match</dt>
              <dd className="mt-0.5">{pom.join(", ")}</dd>
            </div>
          ) : null}
          {match.scheduledOvers != null ? (
            <div>
              <dt className="label">Scheduled overs</dt>
              <dd className="mt-0.5">{match.scheduledOvers} a side</dd>
            </div>
          ) : null}
        </dl>
        {match.innings.length > 0 ? (
          <div className="table-scroll mt-5 rounded-control border border-line">
            <table className="data-table">
              <caption className="sr-only">Innings totals</caption>
              <thead>
                <tr>
                  <th scope="col">Innings</th>
                  <th scope="col" className="num">
                    Score
                  </th>
                  <th scope="col" className="num">
                    Overs
                  </th>
                </tr>
              </thead>
              <tbody>
                {match.innings.map((inn, i) => (
                  <tr key={i}>
                    <th scope="row">
                      {inn.team}
                      {match.format === "test" ? <span className="text-muted"> ({i + 1})</span> : null}
                      {inn.target ? (
                        <span className="block text-xs font-normal text-muted">
                          Target {inn.target.runs}
                          {inn.target.overs ? ` from ${inn.target.overs} overs` : ""}
                        </span>
                      ) : null}
                    </th>
                    <td className="num font-semibold">
                      {inn.runs}
                      {inn.wickets >= 10 ? "" : `/${inn.wickets}`}
                      {inn.declared ? "d" : ""}
                    </td>
                    <td className="num">{inn.overs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {match.hasReplay ? (
          <p className="mt-5">
            <Link href={`/live/${match.id}`} className="btn-primary">
              Replay ball by ball <span aria-hidden="true">→</span>
            </Link>
          </p>
        ) : null}
      </section>

      <div className="mt-6">
        <Suspense
          fallback={
            <div className="space-y-6">
              <TableSkeleton label="Loading the scorecard" rows={11} cols={6} />
              <SectionSkeleton label="Loading the charts" height="h-72" />
            </div>
          }
        >
          <Report match={match} />
        </Suspense>
      </div>
    </div>
  );
}
