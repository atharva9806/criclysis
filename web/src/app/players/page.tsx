import { SectionTitle, EmptyState } from "@/components/ui";

// Temporary while this page is rebuilt on the Cricsheet-backed database.
export default function Page() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 md:px-6">
      <SectionTitle eyebrow="Players" title="Being rebuilt on real data." />
      <EmptyState title="This page is being rebuilt on Cricsheet ball-by-ball data." />
    </div>
  );
}
