/**
 * DEV PREVIEW of the replay player, rendered from fixtures/data-out-v1 on
 * disk. Temporary: /live/[matchId] replaces it once the data layer lands.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ReplayPlayer from "@/components/replay/ReplayPlayer";
import { slimModel } from "@/lib/winprob/model";
import { loadPreview } from "./fixtures";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Replay preview (dev)",
  robots: { index: false, follow: false },
};

export default async function ReplayPreviewPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const data = await loadPreview(matchId);
  if (!data) notFound();
  const { replay, model, context, datasetAsOf } = data;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <p role="note" className="mb-6 rounded-2xl border border-[#ff9500]/40 bg-[#ff9500]/10 px-4 py-3 text-sm text-[#7a3d00]">
        <span className="font-semibold">Dev preview.</span> Rendered from the v1 test fixtures, not the database. Player context covers only the six
        players in the fixture. This page goes away when the data layer lands.
      </p>
      <ReplayPlayer replay={replay} model={model ? slimModel(model, { key: replay.venueKey, name: replay.venue }) : null} context={context} datasetAsOf={datasetAsOf} />
    </div>
  );
}
