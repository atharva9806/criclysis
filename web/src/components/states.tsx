"use client";

import Link from "next/link";
import { useEffect } from "react";

type Props = {
  error: unknown;
  /** Next 16: re-fetches and re-renders the segment. */
  retry?: () => void;
  /** Clears the error state without re-fetching. */
  reset?: () => void;
  /** What could not be loaded, e.g. "this match". */
  what?: string;
};

/** Shared body for every route segment's error.tsx. */
export function RouteError({ error, retry, reset, what = "this page" }: Props) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const digest = error instanceof Error && "digest" in error ? String((error as Error & { digest?: string }).digest ?? "") : "";
  return (
    <div className="page">
      <div role="alert" className="card mx-auto max-w-xl p-6 text-center sm:p-8">
        <svg className="mx-auto text-negative" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.5v5.5M12 16.5h.01" />
        </svg>
        <h1 className="mt-3 text-heading">Something went wrong loading {what}.</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          The database may be busy or in the middle of the daily refresh. Nothing is shown rather than a partial or stale figure. Try again in a moment.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => (retry ?? reset)?.()} className="btn-primary">
            Try again
          </button>
          <Link href="/" className="btn-secondary">
            Home
          </Link>
        </div>
        {digest ? <p className="mt-4 text-xs text-muted">Reference: {digest}</p> : null}
      </div>
    </div>
  );
}

export default RouteError;
