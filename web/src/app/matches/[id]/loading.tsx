export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6" aria-busy="true">
      <p className="sr-only">Loading the match…</p>
      <div className="h-10 w-2/3 rounded-xl bg-black/5 motion-safe:animate-pulse" />
      <div className="mt-6 h-48 rounded-3xl bg-black/5 motion-safe:animate-pulse" />
      <div className="mt-5 h-96 rounded-3xl bg-black/5 motion-safe:animate-pulse" />
    </div>
  );
}
