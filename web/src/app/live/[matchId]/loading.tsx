export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6" aria-busy="true">
      <p className="sr-only">Loading the replay…</p>
      <div className="h-10 w-2/3 rounded-xl bg-black/5 motion-safe:animate-pulse" />
      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <div className="h-72 rounded-3xl bg-black/5 motion-safe:animate-pulse lg:col-span-2" />
        <div className="h-72 rounded-3xl bg-black/5 motion-safe:animate-pulse" />
      </div>
    </div>
  );
}
