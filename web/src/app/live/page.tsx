import type { Metadata } from "next";
import Link from "next/link";
import ResultCard, { FORMAT_LABEL, formatKeyLabel } from "@/components/replay/ResultCard";
import { formatDate } from "@/components/replay/format";
import { EmptyState } from "@/components/ui";
import type { MatchRow } from "@/lib/contract/db";
import type { Fmt, Gender } from "@/lib/contract/pipeline";
import { getDatasetMeta, getLatestResults, listReplayable } from "@/lib/data";

export const metadata: Metadata = {
  title: "Latest results and replays · Criclysis",
  description: "The latest international results from Cricsheet's daily files, and real matches replayed ball by ball with win probability.",
};

const GENDERS: { value?: Gender; label: string }[] = [{ label: "All" }, { value: "male", label: "Men" }, { value: "female", label: "Women" }];
const FORMATS: { value?: Fmt; label: string }[] = [{ label: "All formats" }, { value: "test", label: "Tests" }, { value: "odi", label: "ODIs" }, { value: "t20i", label: "T20Is" }];

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function href(gender?: Gender, format?: Fmt) {
  const q = new URLSearchParams();
  if (gender) q.set("gender", gender);
  if (format) q.set("format", format);
  const s = q.toString();
  return s ? `/live?${s}` : "/live";
}

function Chips<T extends string>({ label, options, current, link }: { label: string; options: { value?: T; label: string }[]; current?: T; link: (v?: T) => string }) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = o.value === current;
        return (
          <Link
            key={o.label}
            href={link(o.value)}
            aria-current={active ? "page" : undefined}
            scroll={false}
            className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${active ? "bg-[#1d1d1f] text-white" : "bg-black/5 text-[#1d1d1f] hover:bg-black/10"}`}
          >
            {o.label}
          </Link>
        );
      })}
    </nav>
  );
}

function ReplayLink({ m }: { m: MatchRow }) {
  return (
    <li>
      <Link href={`/live/${m.id}`} className="card card-hover block h-full p-5">
        <p className="text-xs text-[#6e6e73]">
          {formatDate(m.endDate)} · {formatKeyLabel(m.format, m.gender)}
        </p>
        <p className="mt-2 font-semibold">
          {m.team1} v {m.team2}
        </p>
        <p className="mt-0.5 truncate text-xs text-[#6e6e73]">{[m.eventName, m.eventStage].filter(Boolean).join(" · ") || m.venue}</p>
        <p className="mt-3 text-sm text-[#0071e3]">Replay ball by ball →</p>
      </Link>
    </li>
  );
}

export default async function LivePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const g = one(sp.gender);
  const f = one(sp.format);
  const gender = g === "male" || g === "female" ? g : undefined;
  const format = f === "test" || f === "odi" || f === "t20i" ? f : undefined;

  const [meta, results, featured, recentOdi, recentT20i] = await Promise.all([
    getDatasetMeta(),
    getLatestResults({ gender, format, limit: 12 }),
    listReplayable({ featured: true, limit: 12 }),
    listReplayable({ format: "odi", limit: 6 }),
    listReplayable({ format: "t20i", limit: 6 }),
  ]);
  const featuredIds = new Set(featured.map((m) => m.id));
  const recent = [...recentOdi, ...recentT20i]
    .filter((m) => !featuredIds.has(m.id))
    .sort((a, b) => (a.endDate < b.endDate ? 1 : a.endDate > b.endDate ? -1 : a.id.localeCompare(b.id)))
    .slice(0, 8);
  const scope = [gender ? (gender === "male" ? "men's" : "women's") : null, format ? FORMAT_LABEL[format] : null].filter(Boolean).join(" ");

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 md:px-6">
      <header className="mb-8">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#0071e3]">Live</p>
        <h1 className="headline text-3xl md:text-4xl">Latest results, and real matches replayed.</h1>
        <p className="mt-3 max-w-2xl text-[17px] text-[#6e6e73]">
          There is no live-score feed here. New internationals arrive from Cricsheet&apos;s public files, refreshed once a day, and any match with
          ball-by-ball data can be replayed.
        </p>
      </header>

      <section aria-labelledby="results-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="results-title" className="text-xl font-semibold tracking-tight">
              Latest {scope ? `${scope} ` : ""}results
            </h2>
            <p className="mt-1 text-sm text-[#6e6e73]">{meta ? `The data runs to ${formatDate(meta.dataAsOf)}.` : "No dataset has been imported yet."}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Chips label="Filter by gender" options={GENDERS} current={gender} link={(v) => href(v, format)} />
            <Chips label="Filter by format" options={FORMATS} current={format} link={(v) => href(gender, v)} />
          </div>
        </div>
        {results.length ? (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((m) => (
              <li key={m.id}>
                <ResultCard m={m} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-6">
            <EmptyState title={scope ? `No ${scope} results yet.` : "No results imported yet."}>
              {scope ? (
                <Link href="/live" className="text-[#0071e3] hover:underline">
                  Show every result
                </Link>
              ) : (
                "Results appear after the daily Cricsheet import runs."
              )}
            </EmptyState>
          </div>
        )}
      </section>

      <section aria-labelledby="replays-title" className="mt-16">
        <h2 id="replays-title" className="text-xl font-semibold tracking-tight">
          Replay a match
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-[#6e6e73]">
          Every replay is a real match, played back ball by ball from its Cricsheet record, with the scoreboard, win probability, projected and
          par scores, and each batter&apos;s record against the bowling.
        </p>
        {featured.length + recent.length === 0 ? (
          <div className="mt-6">
            <EmptyState title="No replays imported yet.">Replays appear once a dataset with ball-by-ball files has been imported.</EmptyState>
          </div>
        ) : (
          <>
            {featured.length > 0 && (
              <>
                <h3 className="mt-6 text-sm font-semibold text-[#6e6e73]">Finals</h3>
                <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {featured.map((m) => (
                    <ReplayLink key={m.id} m={m} />
                  ))}
                </ul>
              </>
            )}
            {recent.length > 0 && (
              <>
                <h3 className="mt-8 text-sm font-semibold text-[#6e6e73]">Recent ODIs and T20Is</h3>
                <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {recent.map((m) => (
                    <ReplayLink key={m.id} m={m} />
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="how-title" className="mt-16 max-w-3xl text-sm leading-relaxed text-[#6e6e73]">
        <h2 id="how-title" className="text-base font-semibold text-[#1d1d1f]">
          What &ldquo;live&rdquo; means here
        </h2>
        <p className="mt-2">
          Criclysis uses no live-score service and scrapes no websites. A scheduled job downloads Cricsheet&apos;s public match files every day and
          refreshes the database, so a finished international usually appears within about a day. Replays step through a real match one delivery at a
          time. Win probability, projected score and par come from a model fitted to Cricsheet history, and are shown only for full-length ODIs and
          T20Is not decided by a rain rule.
        </p>
        <p className="mt-2">
          Ball-by-ball data from{" "}
          <a href="https://cricsheet.org" className="text-[#0071e3] hover:underline">
            Cricsheet
          </a>{" "}
          (
          <a href="https://creativecommons.org/licenses/by/4.0/" className="text-[#0071e3] hover:underline">
            CC BY 4.0
          </a>
          ){meta ? `, matches up to ${formatDate(meta.dataAsOf)}` : ""}.
        </p>
      </section>
    </div>
  );
}
