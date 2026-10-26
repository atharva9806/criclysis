"use client";

export default function ReplayError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-semibold">This replay could not be loaded.</h1>
      <p className="mt-2 text-sm text-[#6e6e73]">Something went wrong while reading the match. Try again, or pick another match.</p>
      <button type="button" onClick={() => unstable_retry()} className="btn-primary mt-6">
        Try again
      </button>
    </div>
  );
}
