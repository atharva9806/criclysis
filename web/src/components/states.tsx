"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Shared body for every route segment's error.tsx. */
export function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 md:px-6">
      <div className="card p-8 text-center" role="alert">
        <p className="text-lg font-semibold">Something went wrong loading this page.</p>
        <p className="mt-2 text-sm text-[#6e6e73]">The data may be updating. Try again in a moment.</p>
        <div className="mt-5 flex justify-center gap-3">
          <button type="button" onClick={reset} className="btn-primary">Try again</button>
          <Link href="/" className="btn-ghost">Home</Link>
        </div>
      </div>
    </div>
  );
}
