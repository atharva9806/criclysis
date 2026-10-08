import { getDatasetMeta } from "@/lib/data";

/**
 * "Data: Cricsheet (CC BY 4.0), as of <date>" (docs/ARCHITECTURE.md §4.4).
 * Renders without the date when the database is unreachable, so a static
 * shell (e.g. the 404 page at build time) never fails on it.
 */
export async function DataCredit({ className = "" }: { className?: string }) {
  let asOf: string | null = null;
  try {
    asOf = (await getDatasetMeta())?.dataAsOf ?? null;
  } catch {
    asOf = null;
  }
  return (
    <p className={`text-xs text-[#6e6e73] ${className}`}>
      Data: <a href="https://cricsheet.org" className="underline">Cricsheet</a> (CC BY 4.0)
      {asOf ? <>, matches up to {asOf}</> : null}.
    </p>
  );
}
