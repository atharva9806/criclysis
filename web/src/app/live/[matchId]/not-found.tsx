import Link from "next/link";

export default function ReplayNotFound() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <h1 className="headline text-3xl">No replay for this match.</h1>
      <p className="mt-3 max-w-2xl text-sm text-[#6e6e73]">
        Either the match is not in the dataset, or Cricsheet has no ball-by-ball record for it. Replays exist only for matches with ball-by-ball data.
      </p>
      <Link href="/live" className="btn-primary mt-6">
        Browse results and replays
      </Link>
    </div>
  );
}
