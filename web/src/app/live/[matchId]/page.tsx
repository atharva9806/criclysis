import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import ReplayPlayer from "@/components/replay/ReplayPlayer";
import type { MatchRow } from "@/lib/contract/db";
import type { Replay } from "@/lib/contract/pipeline";
import { getDatasetMeta, getMatch, getReplay, getReplayContext, getWinModel } from "@/lib/data";
import { withMatchFacts } from "@/lib/replay/engine";
import { slimModel } from "@/lib/winprob/model";
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
      <div className="space-y-3" aria-hidden="true">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-10 w-3/4 max-w-xl" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <div className="mt-8 grid gap-5 lg:grid-cols-3" aria-hidden="true">
        <div className="space-y-5 lg:col-span-2">
          <Skeleton className="h-64 rounded-panel" />
          <Skeleton className="h-28 rounded-card" />
        </div>
        <div className="space-y-5">
          <Skeleton className="h-44 rounded-card" />
          <Skeleton className="h-48 rounded-card" />
        </div>
      </div>
    </div>
  );
}

/** Player context (strengths, weaknesses, matchups) is the slow part: several queries over everyone in the match. */
async function Player({ match, stored }: { match: MatchRow; stored: Replay }) {
  const [context, meta] = await Promise.all([getReplayContext(match.id), getDatasetMeta()]);
  const replay = withMatchFacts(stored, match);
  const modelJson = context?.model ?? (match.format === "test" ? null : await getWinModel(match.formatKey));
  const model = modelJson ? slimModel(modelJson, { key: replay.venueKey, name: replay.venue }) : null;
  // The context already carries the model; the player gets the slim copy separately.
  const ctx = context ? { ...context, model: null } : null;
  return <ReplayPlayer replay={replay} model={model} context={ctx} datasetAsOf={context?.datasetAsOf || meta?.dataAsOf || null} />;
}

export default async function ReplayPage({ params }: Props) {
  const { matchId } = await params;
  // The match and its replay must exist before anything streams, so a bogus id is a real 404.
  if (!validId(matchId)) notFound();
  const [match, stored] = await Promise.all([getMatch(matchId), getReplay(matchId)]);
  if (!match || !stored) notFound();

  return (
    <div className="page">
      <Suspense fallback={<ReplaySkeleton />}>
        <Player match={match} stored={stored} />
      </Suspense>
    </div>
  );
}
