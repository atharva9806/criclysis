import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ReplayPlayer from "@/components/replay/ReplayPlayer";
import { getDatasetMeta, getMatch, getReplay, getReplayContext, getWinModel } from "@/lib/data";
import { withMatchFacts } from "@/lib/replay/engine";
import { slimModel } from "@/lib/winprob/model";

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

export default async function ReplayPage({ params }: Props) {
  const { matchId } = await params;
  if (!validId(matchId)) notFound();
  const [match, stored, context, meta] = await Promise.all([getMatch(matchId), getReplay(matchId), getReplayContext(matchId), getDatasetMeta()]);
  if (!match || !stored) notFound();

  const replay = withMatchFacts(stored, match);
  const modelJson = context?.model ?? (match.format === "test" ? null : await getWinModel(match.formatKey));
  const model = modelJson ? slimModel(modelJson, { key: replay.venueKey, name: replay.venue }) : null;
  // The context already carries the model; the player gets the slim copy separately.
  const ctx = context ? { ...context, model: null } : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <ReplayPlayer replay={replay} model={model} context={ctx} datasetAsOf={context?.datasetAsOf || meta?.dataAsOf || null} />
    </div>
  );
}
