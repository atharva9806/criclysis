import { getDatasetMeta } from "@/lib/data";
import { date } from "@/lib/format";

/**
 * "Data: Cricsheet (CC BY 4.0), matches up to <date>" (docs/ARCHITECTURE.md §4.4).
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
    <p className={`text-xs text-muted ${className}`}>
      Data:{" "}
      <a href="https://cricsheet.org" className="link">
        Cricsheet
      </a>{" "}
      (
      <a href="https://creativecommons.org/licenses/by/4.0/" className="link">
        CC BY 4.0
      </a>
      )
      {asOf ? (
        <>
          , matches up to <time dateTime={asOf}>{date(asOf)}</time>
        </>
      ) : null}
      .
    </p>
  );
}
