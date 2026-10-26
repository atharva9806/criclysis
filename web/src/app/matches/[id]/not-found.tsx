import Link from "next/link";

export default function MatchNotFound() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <h1 className="headline text-3xl">Match not found.</h1>
      <p className="mt-3 max-w-2xl text-sm text-[#6e6e73]">There is no international with this id in the dataset.</p>
      <Link href="/matches" className="btn-primary mt-6">
        Browse every match
      </Link>
    </div>
  );
}
