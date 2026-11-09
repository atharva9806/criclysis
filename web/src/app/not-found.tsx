import type { Metadata } from "next";
import Link from "next/link";
import { NotFoundBody } from "@/components/Loading";

export const metadata: Metadata = { title: "Page not found · Criclysis" };

const PLACES: [string, string][] = [
  ["/teams", "Teams"],
  ["/players", "Players"],
  ["/matches", "Matches"],
  ["/live", "Live and replays"],
  ["/method", "Method"],
];

export default function NotFound() {
  return (
    <NotFoundBody what="Page" back="/" backLabel="Go to the home page">
      <p>This address does not match any page. It may be mistyped, or the page may have moved.</p>
      <nav aria-label="Popular pages" className="mt-5">
        <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          {PLACES.map(([href, label]) => (
            <li key={href}>
              <Link href={href} className="link inline-flex min-h-10 items-center">
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </NotFoundBody>
  );
}
