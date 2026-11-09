import Link from "next/link";
import { DataCredit } from "./DataCredit";

const COLUMNS: { title: string; links: [string, string][] }[] = [
  {
    title: "Explore",
    links: [
      ["/teams", "Teams"],
      ["/players", "Players"],
      ["/matches", "Matches"],
      ["/live", "Live results and replays"],
    ],
  },
  {
    title: "Analysis",
    links: [
      ["/compare", "Compare players"],
      ["/strategy", "Strategy dossiers"],
      ["/method", "Method and data"],
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-16 border-t border-line bg-surface">
      <div className="mx-auto grid grid-cols-1 max-w-page gap-8 px-4 py-10 text-sm sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="max-w-md">
          <p className="font-bold tracking-tight">Criclysis</p>
          <p className="mt-2 leading-relaxed text-muted">
            International cricket analysis built only from Cricsheet&apos;s public ball-by-ball records. The data is refreshed from Cricsheet&apos;s daily
            files; there is no live-score feed.
          </p>
          <DataCredit className="mt-3" />
        </div>
        {COLUMNS.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <p className="label">{c.title}</p>
            <ul className="mt-2 space-y-0.5">
              {c.links.map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className="inline-flex min-h-9 items-center text-muted transition-colors hover:text-fg">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-page px-4 py-4 text-xs text-muted sm:px-6">
          Ball-by-ball coverage starts in the early 2000s for most teams, so earlier careers are only partly covered. Criclysis is not affiliated with
          Cricsheet, the ICC or any cricket board.
        </p>
      </div>
    </footer>
  );
}
