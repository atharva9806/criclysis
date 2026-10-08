import { SectionTitle, EmptyState } from "@/components/ui";

// Temporary while player profiles are rebuilt on the Cricsheet-backed database.
export default function PlayerPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 md:px-6">
      <SectionTitle eyebrow="Player" title="Being rebuilt on real data." />
      <EmptyState title="Player profiles are being rebuilt on Cricsheet ball-by-ball data." />
    </div>
  );
}
