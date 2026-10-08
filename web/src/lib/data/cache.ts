import { unstable_cache } from "next/cache";

/** Every data function is tagged with this; POST /api/revalidate invalidates it after an import. */
export const DATASET_TAG = "dataset";
const ONE_DAY = 86400;

/**
 * Wrap a data function in Next's data cache (docs/ARCHITECTURE.md §3.5).
 * Results must be JSON-serialisable: the cache stores them as JSON. Outside
 * the Next runtime (vitest, scripts) the function runs uncached, because
 * unstable_cache needs Next's incremental cache.
 */
export function cached<A extends unknown[], R>(key: string, fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  const inCache = unstable_cache(fn, [key], { tags: [DATASET_TAG], revalidate: ONE_DAY });
  return (...args: A) => (process.env.NEXT_RUNTIME ? inCache(...args) : fn(...args));
}
