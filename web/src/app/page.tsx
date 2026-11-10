import Link from "next/link";
import { Suspense } from "react";
import { formatKey, type Fmt, type FormatKey, type Gender } from "@/lib/contract/pipeline";
import { getDatasetMeta, getLatestResults, getLeaderCards, listReplayable, type LeaderCard } from "@/lib/data";
import { FORMAT_LABEL, date, formatKeyLabel, int } from "@/lib/format";
import { fmtParam, genderParam, type SearchParams } from "@/lib/params";
import { teamMark } from "@/lib/teams/flags";
import { FormatTabs, GenderToggle, MatchGrid, NoGenderData, ReplayGrid, Section, genderHref } from "@/components/data";
import { CardGridSkeleton, SectionSkeleton } from "@/components/Loading";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { Flag } from "@/components/broadcast/Flag";
import { Ground } from "@/components/broadcast/Ground";
import { PlayerCard } from "@/components/broadcast/PlayerCard";
import { EmptyState } from "@/components/ui";

const FMT_ORDER: Fmt[] = ["test", "odi", "t20i"];

const team = (p: LeaderCard) => p.teams[0] ?? p.country ?? null;

/** The leading run scorers and wicket takers, alternating, each player once. */
async function PlayerStrip({ fk, fmt }: { fk: FormatKey; fmt: Fmt }) {
  const [runs, wickets] = await Promise.all([getLeaderCards(fk, "runs", 6), getLeaderCards(fk, "wickets", 6)]);
  const seen = new Set<string>();
  const cards: { p: LeaderCard; kind: "runs" | "wickets"; rank: number }[] = [];
  for (let i = 0; i < 6; i++) {
    for (const [list, kind] of [
      [runs, "runs"],
      [wickets, "wickets"],
    ] as const) {
      const p = list[i];
      if (p && !seen.has(p.slug)) {
        seen.add(p.slug);
        cards.push({ p, kind, rank: i + 1 });
      }
    }
  }
  if (!cards.length) return <EmptyState title="No players in this format yet" />;
  return (
    <ul className="snap-strip -mx-4 scroll-px-4 px-4 sm:-mx-6 sm:scroll-px-6 sm:px-6" aria-label={`Leading ${FORMAT_LABEL[fmt]} players`}>
      {cards.map(({ p, kind, rank }) => (
        <li key={p.slug} className="flex">
          <PlayerCard
            href={`/players/${p.slug}?f=${fmt}`}
            name={p.name}
            team={team(p)}
            photo={p.photo}
            value={int(p.value)}
            unit={kind === "runs" ? "runs" : "wickets"}
            sample={`in ${int(p.innings)} ${kind === "runs" ? "innings" : "innings bowled"}`}
            tag={`${kind === "runs" ? "Runs" : "Wickets"} #${rank}`}
          />
        </li>
      ))}
    </ul>
  );
}

function Leaders({ title, rows, unit, sampleUnit, fmt }: { title: string; rows: LeaderCard[]; unit: string; sampleUnit: string; fmt: Fmt }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="card overflow-hidden">
      <h3 className="border-b border-line bg-surface-2 px-5 py-3 font-display text-lg font-bold uppercase tracking-[0.04em]">{title}</h3>
      {rows.length ? (
        <ol className="divide-y divide-line">
          {rows.map((r, i) => {
            const mark = teamMark(team(r));
            return (
              <li key={r.slug} className="relative grid grid-cols-[1.5rem_2.5rem_minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-2.5 sm:px-5">
                <span className={`score text-center text-2xl ${i === 0 ? "text-accent" : "text-muted"}`}>{i + 1}</span>
                <PlayerPhoto photo={r.photo} name={r.name} team={team(r)} size="xs" credit="compact" avatar={{ background: mark.deep, color: mark.on }} />
                <div className="min-w-0">
                  <Link href={`/players/${r.slug}?f=${fmt}`} className="link-quiet block truncate font-semibold">
                    {r.name}
                  </Link>
                  <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted">
                    <Flag mark={mark} size="xs" />
                    <span className="truncate">{team(r) ?? "Team not recorded"}</span>
                  </span>
                  <span aria-hidden="true" className="mt-1.5 block h-1 rounded-full bg-surface-3">
                    <span className="wipe block h-1 rounded-full" style={{ width: `${(100 * r.value) / max}%`, background: `light-dark(${mark.lineLight}, ${mark.lineDark})` }} />
                  </span>
                </div>
                <span className="text-right">
                  <span className="score block text-[1.75rem]">{int(r.value)}</span>
                  <span className="block whitespace-nowrap text-[0.6875rem] text-muted">
                    {unit} · {int(r.innings)} {sampleUnit}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="p-5 text-sm text-muted">No players in this format yet.</p>
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

async function LeaderBoards({ fk, fmt }: { fk: FormatKey; fmt: Fmt }) {
  const [runs, wickets] = await Promise.all([getLeaderCards(fk, "runs", 8), getLeaderCards(fk, "wickets", 8)]);
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Leaders title="Most runs" rows={runs} unit="runs" sampleUnit="inns" fmt={fmt} />
      <Leaders title="Most wickets" rows={wickets} unit="wkts" sampleUnit="inns bowled" fmt={fmt} />
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
  const fmtHref = (f: Fmt) => genderHref("/", gender, { f });

  return (
    <>
      {/* A night match in both themes: theme-dark resolves every token inside to its dark value. */}
      <section aria-labelledby="hero-title" className="relative isolate overflow-hidden border-b border-line bg-bg text-fg theme-dark">
        <Ground variant="hero" id="hero-ground" shift={260} />
        {/* A scrim behind the text, so floodlight glow never lowers its contrast. */}
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-bg/95 via-bg/75 to-transparent max-lg:via-bg/85 lg:via-40% lg:to-65%" />
        <div className="relative mx-auto grid max-w-page grid-cols-1 gap-8 px-4 pb-12 pt-10 sm:px-6 md:pb-20 md:pt-16 lg:grid-cols-[1.55fr_1fr] lg:items-start lg:pb-28 lg:pt-20">
          <div className="min-w-0">
            <p className="rise flex flex-wrap items-center gap-2">
              {meta ? (
                <span className="chip">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full bg-accent shadow-[0_0_10px_var(--accent)]" />
                  Data up to <time dateTime={meta.dataAsOf}>{date(meta.dataAsOf)}</time>
                </span>
              ) : null}
              <span className="chip text-muted">Cricsheet ball by ball</span>
            </p>
            <h1 id="hero-title" className="rise rise-1 mt-5 max-w-[14ch] text-display text-balance">
              Every international, <span className="text-accent">measured</span> ball by ball.
            </h1>
            <p className="rise rise-2 mt-5 max-w-2xl text-lg leading-relaxed text-muted">
              Criclysis turns Cricsheet&apos;s open ball-by-ball records into team records, player strengths and weaknesses against comparable players,
              every result, and replays of real matches. Nothing is simulated or estimated by hand.
            </p>
            <div className="rise rise-3 mt-7 flex flex-wrap gap-2">
              <Link href={genderHref("/players", gender)} className="btn-primary">
                Explore players
              </Link>
              <Link href={genderHref("/live", gender)} className="btn-secondary">
                Watch a replay
              </Link>
            </div>
          </div>
          <div className="rise rise-2 rounded-panel border border-line-strong bg-surface/80 p-5 shadow-pop backdrop-blur-md lg:mt-14">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="label">In this build</p>
              <GenderToggle gender={gender} href={href} />
            </div>
            {meta && !mine.length ? (
              <p className="mt-4 text-sm leading-relaxed text-muted">
                No {word.toLowerCase()} internationals in this build. Data up to{" "}
                <time dateTime={meta.dataAsOf} className="font-semibold text-fg">
                  {date(meta.dataAsOf)}
                </time>
                , refreshed daily from Cricsheet.
              </p>
            ) : meta ? (
              <>
                <dl className="mt-4 grid grid-cols-2 divide-x divide-line">
                  <div className="pr-4">
                    <dt className="label">{word} matches</dt>
                    <dd className="score mt-1 text-[2.75rem] text-fg sm:text-[3.25rem]">{int(totals.matches)}</dd>
                  </div>
                  <div className="pl-4">
                    <dt className="label">Deliveries</dt>
                    <dd className="score mt-1 text-[2.75rem] text-fg sm:text-[3.25rem]">{int(totals.deliveries)}</dd>
                  </div>
                </dl>
                {mine.length ? (
                  <ul className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-4" aria-label="Matches by format">
                    {mine.map((f) => (
                      <li key={f.formatKey}>
                        <span className="score block text-2xl">{int(f.matches)}</span>
                        <span className="label">{FORMAT_LABEL[f.format]}s</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="mt-4 text-xs text-muted">
                  Refreshed daily from Cricsheet (
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
        {meta && !mine.length ? (
          <NoGenderData gender={gender} what="matches" menHref="/" />
        ) : (
          <>
            <Section
              id="players"
              title="Leading players"
              sub={fk ? `The top ${FORMAT_LABEL[fmt!]} run scorers and wicket takers in Cricsheet's coverage, with the innings behind each total.` : undefined}
              actions={fmt ? <FormatTabs formats={fmts} active={fmt} href={fmtHref} label="Format for the players" /> : null}
            >
              {fk && fmt ? (
                <Suspense key={fk} fallback={<CardGridSkeleton label="Loading players" count={3} height="h-80" />}>
                  <PlayerStrip fk={fk} fmt={fmt} />
                </Suspense>
              ) : (
                <NoGenderData gender={gender} what="players" menHref="/" />
              )}
            </Section>

            <Section id="featured" title="Featured replays" sub="Real finals, replayed ball by ball with win probability, projected and par scores where the model applies.">
              <Suspense key={gender} fallback={<CardGridSkeleton label="Loading replays" count={3} height="h-56" />}>
                <FeaturedReplays gender={gender} />
              </Suspense>
            </Section>

            <Section
              id="leaders"
              title="Leaders"
              sub={fk ? `${formatKeyLabel(fk)} career totals within Cricsheet's coverage, with the innings behind each.` : undefined}
              actions={fmt ? <FormatTabs formats={fmts} active={fmt} href={fmtHref} label="Format for the leaders" /> : null}
            >
              {fk && fmt ? (
                <Suspense key={fk} fallback={<SectionSkeleton label="Loading leaders" height="h-96" />}>
                  <LeaderBoards fk={fk} fmt={fmt} />
                </Suspense>
              ) : (
                <NoGenderData gender={gender} what="players" menHref="/" />
              )}
            </Section>

            <Section id="latest" title="Latest results" sub={meta ? `From the daily Cricsheet import; matches up to ${date(meta.dataAsOf)}.` : undefined}>
              <Suspense key={gender} fallback={<CardGridSkeleton label="Loading results" />}>
                <LatestResults gender={gender} />
              </Suspense>
            </Section>

            <Section id="coverage" title="Coverage" sub="Ball-by-ball records start in the early 2000s for most teams, so earlier careers are only partly covered.">
              {mine.length ? (
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {mine.map((f) => (
                    <li key={f.formatKey} className="tile">
                      <p className="label">{formatKeyLabel(f.formatKey)}</p>
                      <p className="mt-2">
                        <span className="score text-stat">{int(f.matches)}</span> <span className="text-sm text-muted">matches</span>
                      </p>
                      <p className="mt-2 text-sm text-muted">
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
          </>
        )}

        <nav aria-labelledby="explore-title" className="mt-12">
          <h2 id="explore-title" className="section-title mb-4">
            Explore
          </h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {ENTRIES.map((e) => (
              <li key={e.href}>
                <Link href={e.gendered ? genderHref(e.href, gender) : e.href} className="card-link group flex h-full flex-col p-5">
                  <span className="flex items-center justify-between font-display text-xl font-bold uppercase tracking-[0.03em]">
                    {e.title}
                    <span aria-hidden="true" className="text-accent transition-transform motion-safe:group-hover:translate-x-1">
                      →
                    </span>
                  </span>
                  <span className="mt-1.5 text-sm leading-relaxed text-muted">{e.body}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </>
  );
}
