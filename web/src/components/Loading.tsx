import Link from "next/link";

/** Shared body for every route segment's loading.tsx. */
export function PageLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 md:px-6" aria-busy="true" aria-live="polite">
      <p className="sr-only">{label}…</p>
      <div className="h-4 w-32 animate-pulse rounded-full bg-black/10" />
      <div className="mt-4 h-10 w-2/3 animate-pulse rounded-2xl bg-black/10" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="card h-32 animate-pulse bg-black/5" />
        ))}
      </div>
    </div>
  );
}

export function NotFoundBody({ what, back, backLabel }: { what: string; back: string; backLabel: string }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 md:px-6">
      <div className="card p-8 text-center">
        <p className="text-lg font-semibold">{what} not found.</p>
        <p className="mt-2 text-sm text-[#6e6e73]">It may not be in the current Cricsheet build, or the address may be mistyped.</p>
        <Link href={back} className="btn-ghost mt-4">{backLabel}</Link>
      </div>
    </div>
  );
}
