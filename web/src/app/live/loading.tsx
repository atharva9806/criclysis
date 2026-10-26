export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 md:px-6" aria-busy="true">
      <p className="sr-only">Loading results and replays…</p>
      <div className="h-10 w-1/2 rounded-xl bg-black/5 motion-safe:animate-pulse" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-44 rounded-3xl bg-black/5 motion-safe:animate-pulse" />
        ))}
      </div>
    </div>
  );
}
