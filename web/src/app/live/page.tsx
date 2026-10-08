import { SectionTitle, EmptyState } from "@/components/ui";

// Placeholder until the replay engine (stream C) replaces this route.
export default function LivePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 md:px-6">
      <SectionTitle
        eyebrow="Live"
        title="Replays are coming."
        sub="Real international matches, replayed ball by ball from Cricsheet data, with win probability and player context."
      />
      <EmptyState title="Match replays are being built.">
        There is no live-score feed: results arrive from Cricsheet&apos;s daily files, and replays play back real matches.
      </EmptyState>
    </div>
  );
}
