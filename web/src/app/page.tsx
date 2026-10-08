import { getDatasetMeta } from "@/lib/data";
import { SectionTitle, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Home() {
  const meta = await getDatasetMeta();
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 md:px-6">
      <SectionTitle eyebrow="Criclysis" title="International cricket, from ball-by-ball data." />
      {meta ? (
        <ul className="grid gap-3 sm:grid-cols-3">
          {Object.values(meta.formats).map((f) => (
            <li key={f.formatKey} className="card p-5">
              <p className="font-semibold">{f.label} ({f.gender === "female" ? "women" : "men"})</p>
              <p className="text-sm text-[#6e6e73]">
                {f.matches.toLocaleString()} matches, {f.firstDate} to {f.lastDate}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No data imported yet." />
      )}
    </div>
  );
}
