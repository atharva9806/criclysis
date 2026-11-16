import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import ReplayPlayer from "@/components/replay/ReplayPlayer";
import { formatDate } from "@/components/replay/format";
import type { Marks } from "@/components/replay/marks";
import type { MatchRow } from "@/lib/contract/db";
import type { Replay } from "@/lib/contract/pipeline";
import { getDatasetMeta, getMatch, getReplay, getReplayContext, getWinModel } from "@/lib/data";
import { withMatchFacts } from "@/lib/replay/engine";
import { pairMarks } from "@/lib/teams/flags";
import { slimModel } from "@/lib/winprob/model";
import { Flag } from "@/components/broadcast/Flag";
import { Ground } from "@/components/broadcast/Ground";
import { Skeleton } from "@/components/ui";

type Props = { params: Promise<{ matchId: string }> };

const validId = (id: string) => /^[A-Za-z0-9_-]{1,32}$/.test(id);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { matchId } = await params;
  const match = validId(matchId) ? await getMatch(matchId) : null;
  if (!match) return { title: "Replay not found · Criclysis" };
  return {
    title: `${match.team1} v ${match.team2}, ${match.endDate}: replay · Criclysis`,
    description: `${match.result.text}. Replayed ball by ball from Cricsheet data.`,
  };
}

function ReplaySkeleton() {
  return (
    <div aria-busy="true">
      <p className="sr-only" role="status">
        Loading the replay…
      </p>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3" aria-hidden="true">
        <div className="space-y-5 lg:col-span-2">
          <Skeleton className="h-64 rounded-panel" />
          <Skeleton className="h-28 rounded-card" />
          <Skeleton className="h-48 rounded-card" />
        </div>
        <div className="space-y-5">
          <Skeleton className="h-44 rounded-card" />
          <Skeleton className="h-48 rounded-card" />
        </div>
      </div>
    </div>
  );
}

/** Each side's colours and flag, in batting order. */
function marksFor(replay: Replay): Marks {
  const first = replay.innings[0]?.team ?? replay.teams[0] ?? "";
  const second = replay.innings.find((i) => i.team !== first)?.team ?? replay.teams.find((t) => t !== first) ?? "";
  return pairMarks(first, second);
}

/** Player context (strengths, weaknesses, matchups) is the slow part: several queries over everyone in the match. */
async function Player({ match, stored, marks }: { match: MatchRow; stored: Replay; marks: Marks }) {
  const [context, meta] = await Promise.all([getReplayContext(match.id), getDatasetMeta()]);
  const replay = withMatchFacts(stored, match);
  const modelJson = context?.model ?? (match.format === "test" ? null : await getWinModel(match.formatKey));
  const model = modelJson ? slimModel(modelJson, { key: replay.venueKey, name: replay.venue }) : null;
  // The context already carries the model; the player gets the slim copy separately.
  const ctx = context ? { ...context, model: null } : null;
  return <ReplayPlayer replay={replay} model={model} context={ctx} datasetAsOf={context?.datasetAsOf || meta?.dataAsOf || null} marks={marks} header={false} />;
}

export default async function ReplayPage({ params }: Props) {
  const { matchId } = await params;
  // The match and its replay must exist before anything streams, so a bogus id is a real 404.
  if (!validId(matchId)) notFound();
  const [match, stored] = await Promise.all([getMatch(matchId), getReplay(matchId)]);
  if (!match || !stored) notFound();
  const replay = withMatchFacts(stored, match);
  const marks = marksFor(replay);
  const order = Object.keys(marks);
  const formatLabel = replay.format === "odi" ? "ODI" : replay.format === "t20i" ? "T20I" : "Test";
  const toss = replay.toss?.winner ? `${replay.toss.winner} won the toss and chose to ${replay.toss.decision === "bat" ? "bat" : "field"}.` : null;

  return (
    <>
      {/* The floodlit header stays a night match in both themes. */}
      <section aria-labelledby="replay-title" className="theme-dark relative isolate overflow-hidden border-b border-line bg-bg">
        <Ground variant="band" id="replay-ground" shift={300} />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-bg/95 via-bg/80 to-bg/30 max-md:to-bg/80" />
        <div className="relative mx-auto max-w-page px-4 pb-8 pt-5 sm:px-6 md:pb-12">
          <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap gap-x-4">
            <Link
              href={match.gender === "female" ? "/live?gender=women" : "/live"}
              className="-ml-1 inline-flex min-h-10 items-center gap-1.5 rounded-control px-1 font-display text-sm font-semibold uppercase tracking-[0.06em] text-muted hover:text-fg"
            >
              <span aria-hidden="true">←</span> Live and replays
            </Link>
            <Link href={`/matches/${match.id}`} className="inline-flex min-h-10 items-center rounded-control px-1 font-display text-sm font-semibold uppercase tracking-[0.06em] text-muted hover:text-fg">
              Full scorecard
            </Link>
          </nav>
          <p className="rise flex flex-wrap items-center gap-2 text-xs font-medium text-muted">
            <span className="inline-flex items-center gap-1.5 rounded-[0.25rem] bg-accent px-2 py-0.5 font-display text-sm font-bold uppercase tracking-[0.08em] text-on-accent">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-on-accent" />
              Replay
            </span>
            <span className="font-display text-sm font-semibold uppercase tracking-[0.06em]">
              {[replay.event, replay.stage].filter(Boolean).join(" · ")}
              {replay.event || replay.stage ? " · " : ""}
              {formatLabel}
            </span>
          </p>
          <h1 id="replay-title" className="rise rise-1 mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-title">
            {order.map((team, i) => (
              <span key={team} className="inline-flex items-center gap-3">
                {i ? (
                  <span aria-hidden="true" className="font-sans text-lg font-semibold normal-case text-muted">
                    v
                  </span>
                ) : null}
                <Flag mark={marks[team]} size="lg" />
                <span>
                  {i ? <span className="sr-only">v </span> : null}
                  {team}
                </span>
              </span>
            ))}
          </h1>
          <p className="rise rise-2 mt-4 text-sm text-muted">
            <time dateTime={replay.date}>{formatDate(replay.date)}</time> · {replay.venue}
            {toss ? ` · ${toss}` : ""}
          </p>
          <p className="rise rise-2 mt-1 text-sm text-muted">A real match, replayed ball by ball from its Cricsheet record. Nothing here is simulated.</p>
        </div>
      </section>
      <div className="page">
        <Suspense fallback={<ReplaySkeleton />}>
          <Player match={match} stored={stored} marks={marks} />
        </Suspense>
      </div>
    </>
  );
}
