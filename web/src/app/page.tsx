import Link from "next/link";
import { Suspense } from "react";
import type { LeaderRow } from "@/lib/contract/db";
import { formatKey, type Fmt, type FormatKey, type Gender } from "@/lib/contract/pipeline";
import { getDatasetMeta, getLatestResults, getLeaders, listReplayable } from "@/lib/data";
import { date, formatKeyLabel, int } from "@/lib/format";
import { fmtParam, genderParam, type SearchParams } from "@/lib/params";
import { FormatTabs, GenderToggle, MatchGrid, NoGenderData, ReplayGrid, Section, genderHref } from "@/components/data";
import { CardGridSkeleton, SectionSkeleton } from "@/components/Loading";
import { EmptyState } from "@/components/ui";

const FMT_ORDER: Fmt[] = ["test", "odi", "t20i"];

function Leaders({ title, rows, unit, sampleUnit }: { title: string; rows: LeaderRow[]; unit: string; sampleUnit: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="card p-5">
      <h3 className="font-semibold">{title}</h3>
      {rows.length ? (
        <ol className="mt-4 space-y-3.5">
          {rows.map((r, i) => (
            <li key={r.slug}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <Link href={`/players/${r.slug}`} className="link-quiet min-w-0 truncate font-medium">
                  <span className="mr-2 inline-block w-4 text-right text-muted tabular-nums">{i + 1}</span>
                  {r.name}
                </Link>
                <span className="shrink-0 tabular-nums">
                  <span className="font-semibold">{int(r.value)}</span> {unit}
                  <span className="ml-1 text-xs text-muted">
                    ({int(r.innings)} {sampleUnit})
                  </span>
                </span>
              </div>
              <div className="ml-6 mt-1.5 h-1.5 rounded-full bg-surface-3" aria-hidden="true">
                <div className="h-1.5 rounded-full bg-accent" style={{ width: `${(100 * r.value) / max}%` }} />
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 text-sm text-muted">No players in this format yet.</p>
      )}
    </div>
  );
}

async function FeaturedReplays({ gender }: { gender: Gender }) {
  const featured = await listReplayable({ featured: true, gender, limit: 6 });
  if (featured.length) return <ReplayGrid matches={featured} />;
  const recent = await listReplayable({ gender, limit: 6 });
  if (recent.length) return <ReplayGrid matches={recent} />;
  return <NoGenderData gender={gender} what="replays" menHref="/" />;
}

async function LatestResults({ gender }: { gender: Gender }) {
  const latest = await getLatestResults({ gender, limit: 6 });
  return (
    <>
      <MatchGrid matches={latest} empty={<NoGenderData gender={gender} what="results" menHref="/" />} />
      {latest.length ? (
        <p className="mt-4">
          <Link href={genderHref("/matches", gender)} className="btn-secondary">
            Every match <span aria-hidden="true">→</span>
          </Link>
        </p>
      ) : null}
    </>
  );
}

async function LeaderBoards({ fk }: { fk: FormatKey }) {
  const [runs, wickets] = await Promise.all([getLeaders(fk, "runs", 8), getLeaders(fk, "wickets", 8)]);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Leaders title="Most runs" rows={runs} unit="runs" sampleUnit="inns" />
      <Leaders title="Most wickets" rows={wickets} unit="wkts" sampleUnit="inns bowled" />
    </div>
  );
}

const ENTRIES = [
  { href: "/teams", gendered: true, title: "Teams", body: "Records in every format, head to head, venues, the toss and scoring by phase." },
  { href: "/players", gendered: true, title: "Players", body: "Career records, and strengths and weaknesses measured against comparable players." },
  { href: "/live", gendered: true, title: "Live and replays", body: "Results from the daily Cricsheet refresh, and real matches replayed ball by ball." },
  { href: "/method", gendered: false, title: "Method", body: "Where the data comes from, the sample thresholds, and how the win model is validated." },
];

export default async function Home({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const gender = genderParam(sp.gender ?? sp.g) ?? "male";
  const meta = await getDatasetMeta();
  const all = Object.values(meta?.formats ?? {});
  const mine = all.filter((f) => f.gender === gender).sort((a, b) => FMT_ORDER.indexOf(a.format) - FMT_ORDER.indexOf(b.format));
  const fmts = mine.map((f) => f.format);
  const wanted = fmtParam(sp.f);
  const fmt = wanted && fmts.includes(wanted) ? wanted : fmts.includes("odi") ? "odi" : (fmts[0] ?? null);
  const fk = fmt ? formatKey(fmt, gender) : null;
  const word = gender === "female" ? "Women's" : "Men's";
  const totals = { matches: mine.reduce((s, f) => s + f.matches, 0), deliveries: mine.reduce((s, f) => s + f.deliveries, 0) };
  const href = (g: Gender) => genderHref("/", g, { f: fmt && g === gender ? fmt : undefined });

  return (
    <>
      <section aria-labelledby="hero-title" className="border-b border-line bg-surface">
        <div className="mx-auto grid max-w-page gap-8 px-4 py-10 sm:px-6 md:py-16 lg:grid-cols-[1.5fr_1fr] lg:items-end">
          <div className="min-w-0">
            <p className="eyebrow">International cricket analytics</p>
            <h1 id="hero-title" className="mt-3 text-display text-balance">
              Every international, measured ball by ball.
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted">
              Criclysis turns Cricsheet&apos;s open ball-by-ball records into team records, player strengths and weaknesses against comparable players,
              every result, and replays of real matches. Nothing is simulated or estimated by hand.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href={genderHref("/players", gender)} className="btn-primary">
                Explore players
              </Link>
              <Link href={genderHref("/live", gender)} className="btn-secondary">
                Watch a replay
              </Link>
            </div>
          </div>
          <div className="rounded-panel border border-line bg-surface-2 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="label">In this build</p>
              <GenderToggle gender={gender} href={href} />
            </div>
            {meta ? (
              <>
                <dl className="mt-4 grid grid-cols-2 gap-4">
                  <div>
                    <dt className="text-xs text-muted">{word} matches</dt>
                    <dd className="text-stat tabular-nums">{int(totals.matches)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Deliveries</dt>
                    <dd className="text-stat tabular-nums">{int(totals.deliveries)}</dd>
                  </div>
                </dl>
                <p className="mt-4 text-sm text-muted">
                  Data up to <time dateTime={meta.dataAsOf} className="font-semibold text-fg">{date(meta.dataAsOf)}</time>, refreshed daily from
                  Cricsheet (
                  <a href="https://creativecommons.org/licenses/by/4.0/" className="link">
                    CC BY 4.0
                  </a>
                  ).
                </p>
              </>
            ) : (
              <p className="mt-4 text-sm text-muted">No dataset has been imported yet.</p>
            )}
          </div>
        </div>
      </section>

      <div className="page">
        <nav aria-label="Sections">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {ENTRIES.map((e) => (
              <li key={e.href}>
                <Link href={e.gendered ? genderHref(e.href, gender) : e.href} className="card-link group flex h-full flex-col p-5">
                  <span className="flex items-center justify-between font-semibold">
                    {e.title}
                    <span aria-hidden="true" className="text-accent transition-transform motion-safe:group-hover:translate-x-0.5">
                      →
                    </span>
                  </span>
                  <span className="mt-1.5 text-sm leading-relaxed text-muted">{e.body}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <Section id="featured" title="Featured replays" sub="Real finals, replayed ball by ball with win probability, projected and par scores where the model applies.">
          <Suspense key={gender} fallback={<CardGridSkeleton label="Loading replays" count={3} height="h-44" />}>
            <FeaturedReplays gender={gender} />
          </Suspense>
        </Section>

        <Section
          id="coverage"
          title="Coverage"
          sub="Ball-by-ball records start in the early 2000s for most teams, so earlier careers are only partly covered."
        >
          {mine.length ? (
            <ul className="grid gap-3 sm:grid-cols-3">
              {mine.map((f) => (
                <li key={f.formatKey} className="card p-5">
                  <p className="font-semibold">{formatKeyLabel(f.formatKey)}</p>
                  <p className="mt-2 text-stat tabular-nums">
                    {int(f.matches)} <span className="text-sm font-normal text-muted">matches</span>
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {int(f.players)} players · {int(f.deliveries)} deliveries
                  </p>
                  <p className="text-sm text-muted">
                    <time dateTime={f.firstDate}>{date(f.firstDate)}</time> to <time dateTime={f.lastDate}>{date(f.lastDate)}</time>
                  </p>
                </li>
              ))}
            </ul>
          ) : meta ? (
            <NoGenderData gender={gender} what="matches" menHref="/" />
          ) : (
            <EmptyState title="No data has been imported yet">Coverage appears after the first Cricsheet import.</EmptyState>
          )}
        </Section>

        <Section id="latest" title="Latest results" sub={meta ? `From the daily Cricsheet import; matches up to ${date(meta.dataAsOf)}.` : undefined}>
          <Suspense key={gender} fallback={<CardGridSkeleton label="Loading results" />}>
            <LatestResults gender={gender} />
          </Suspense>
        </Section>

        <Section
          id="leaders"
          title="Leaders"
          sub={fk ? `${formatKeyLabel(fk)} career totals within Cricsheet's coverage, with the innings behind each.` : undefined}
          actions={fmt ? <FormatTabs formats={fmts} active={fmt} href={(f) => genderHref("/", gender, { f })} /> : null}
        >
          {fk ? (
            <Suspense key={fk} fallback={<SectionSkeleton label="Loading leaders" />}>
              <LeaderBoards fk={fk} />
            </Suspense>
          ) : (
            <NoGenderData gender={gender} what="players" menHref="/" />
          )}
        </Section>
      </div>
    </>
  );
}
