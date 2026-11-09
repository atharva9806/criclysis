import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { CareerRow, DismissalRow, SplitRow, TraitRow } from "@/lib/contract/db";
import { formatKey, type Fmt, type FormatKey, type Gender } from "@/lib/contract/pipeline";
import { getDatasetMeta, getPlayerHeader, getPlayerProfile } from "@/lib/data";
import { fmtOfKey } from "@/lib/data/rows";
import { DASH, FORMAT_LABEL, capitalise, date, formatKeyLabel, genderWord, int, num, plural, splitLabel, type LabelContext } from "@/lib/format";
import { fmtParam, qs, type SearchParams } from "@/lib/params";
import { FormatTabs, Muted, PageHeader, Section, SplitTable, TableWrap, genderHref } from "@/components/data";
import { ChartFrame, PercentileRadar, YearBars } from "@/components/charts/Charts";
import { ordinal } from "@/components/numbers";
import { SectionSkeleton, TableSkeleton } from "@/components/Loading";
import { Badge, Stat, StatGrid } from "@/components/ui";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> };

/** The requested format if the player has it, otherwise the one with the most balls faced and bowled (as getPlayerProfile picks). */
function pickFormatKey(gender: Gender, careers: CareerRow[], fmt?: Fmt): FormatKey | null {
  if (fmt) {
    const fk = formatKey(fmt, gender);
    if (careers.some((c) => c.formatKey === fk)) return fk;
  }
  const best = [...careers].sort((a, b) => (b.balls ?? 0) + (b.bowlBalls ?? 0) - ((a.balls ?? 0) + (a.bowlBalls ?? 0)))[0];
  return best?.formatKey ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const h = await getPlayerHeader((await params).slug);
  return { title: h ? `${h.player.name} · Players · Criclysis` : "Player not found · Criclysis" };
}

function CareerTable({ careers, active }: { careers: CareerRow[]; active: FormatKey | null }) {
  const bowled = careers.some((c) => (c.bowlBalls ?? 0) > 0);
  return (
    <TableWrap caption="Career by format">
      <thead>
        <tr>
          <th scope="col">Format</th>
          <th scope="col" className="num">Mat</th>
          <th scope="col" className="num">Inns</th>
          <th scope="col" className="num">NO</th>
          <th scope="col" className="num">Runs</th>
          <th scope="col" className="num">HS</th>
          <th scope="col" className="num">Avg</th>
          <th scope="col" className="num">SR</th>
          <th scope="col" className="num">100/50</th>
          {bowled ? (
            <>
              <th scope="col" className="num">Balls</th>
              <th scope="col" className="num">Wkts</th>
              <th scope="col" className="num">BBI</th>
              <th scope="col" className="num">Avg</th>
              <th scope="col" className="num">Econ</th>
              <th scope="col" className="num">5w</th>
            </>
          ) : null}
        </tr>
      </thead>
      <tbody>
        {careers.map((c) => (
          <tr key={c.formatKey} className={c.formatKey === active ? "[&>*]:bg-accent-soft/50" : ""}>
            <th scope="row">
              {FORMAT_LABEL[c.format]}
              {c.formatKey === active ? <span className="sr-only"> (shown below)</span> : null}
            </th>
            <td className="num">{int(c.matches)}</td>
            <td className="num">{int(c.batInnings)}</td>
            <td className="num">{int(c.notOuts)}</td>
            <td className="num font-semibold">{int(c.runs)}</td>
            <td className="num">{c.highest === null ? DASH : `${c.highest}${c.highestNotOut ? "*" : ""}`}</td>
            <td className="num">{num(c.batAvg)}</td>
            <td className="num">{num(c.batSr)}</td>
            <td className="num">{c.hundreds === null ? DASH : `${c.hundreds}/${c.fifties}`}</td>
            {bowled ? (
              <>
                <td className="num">{int(c.bowlBalls)}</td>
                <td className="num font-semibold">{int(c.wickets)}</td>
                <td className="num">{c.best ? `${c.best.wickets}/${c.best.runs}` : DASH}</td>
                <td className="num">{num(c.bowlAvg)}</td>
                <td className="num">{num(c.bowlEcon)}</td>
                <td className="num">{int(c.fiveWkts)}</td>
              </>
            ) : null}
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}

/** Where the percentile sits on 0-100, with the cohort median marked. Labelled in text, so the bar is decoration. */
function PercentileBar({ value, good }: { value: number; good: boolean }) {
  return (
    <div className="relative mt-1 h-2 rounded-full bg-surface-3" aria-hidden="true">
      <div className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
      <div className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface ${good ? "bg-positive" : "bg-negative"}`} style={{ left: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

function Claims({ title, claims, kind, empty }: { title: string; claims: TraitRow[]; kind: "strength" | "weakness"; empty: string }) {
  const good = kind === "strength";
  return (
    <div>
      <h3 className="mb-3 flex items-center gap-2 font-semibold">
        <span aria-hidden="true" className={good ? "text-positive" : "text-negative"}>
          {good ? "▲" : "▼"}
        </span>
        {title}
        <span className="text-sm font-normal text-muted">({claims.length})</span>
      </h3>
      {claims.length ? (
        <ul className="space-y-3">
          {claims.map((t) => (
            <li key={`${t.kind}-${t.rank}`} className="card p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{t.subject}</p>
                  <p className="text-sm text-muted">
                    {t.dimension} · {t.metricLabel}
                  </p>
                </div>
                <Badge tone={good ? "positive" : "negative"} className="shrink-0">
                  {t.percentile < 0.5 ? "below 1st" : ordinal(t.percentile)} pct.
                </Badge>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div>
                  <dt className="text-xs text-muted">This split</dt>
                  <dd className="font-semibold tabular-nums">{num(t.value)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Own baseline</dt>
                  <dd className="tabular-nums">{num(t.baseline)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Cohort median</dt>
                  <dd className="tabular-nums">{num(t.cohortMedian)}</dd>
                </div>
              </dl>
              <div className="mt-3">
                <p className="sr-only">{ordinal(t.percentile)} percentile among comparable players</p>
                <PercentileBar value={t.percentile} good={good} />
                <p className="mt-1 flex justify-between text-[11px] text-muted" aria-hidden="true">
                  <span>0</span>
                  <span>median</span>
                  <span>100</span>
                </p>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{t.text}</p>
              <p className="mt-3 flex flex-wrap gap-1.5">
                <Badge>{plural(t.balls, "ball")}</Badge>
                <Badge>{capitalise(t.confidence)} confidence</Badge>
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <Muted>{empty}</Muted>
      )}
    </div>
  );
}

/** Counts as horizontal bars with their share of the total; the numbers are in the text. */
function CountBars({ rows, label, caption }: { rows: { key: string; label: string; count: number }[]; label: string; caption: string }) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="card p-5">
      <h3 className="font-semibold">{label}</h3>
      <p className="text-xs text-muted">{caption.replace("{n}", int(total))}</p>
      <ul className="mt-4 space-y-2.5">
        {rows.map((r) => (
          <li key={r.key} className="text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span>{r.label}</span>
              <span className="tabular-nums">
                <span className="font-semibold">{int(r.count)}</span>
                <span className="ml-1.5 text-xs text-muted">{total ? `${Math.round((100 * r.count) / total)}%` : ""}</span>
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-surface-3" aria-hidden="true">
              <div className="h-1.5 rounded-full" style={{ width: `${(100 * r.count) / max}%`, background: "var(--chart-1)" }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

async function Analysis({ slug, fmt, gender }: { slug: string; fmt: Fmt; gender: Gender }) {
  const [p, meta] = await Promise.all([getPlayerProfile(slug, fmt), getDatasetMeta()]);
  const fk = p?.formatKey;
  if (!p || !fk) return <Muted>No format has enough data for analysis.</Muted>;
  const ctx: LabelContext = { bowlingTypes: meta?.bowlingTypes ?? {}, phases: meta?.phases[fmt] ?? [] };
  const t = meta?.thresholds;
  const career = p.careers.find((c) => c.formatKey === fk) ?? null;
  const bat = (d: string) => p.splits.filter((s) => s.discipline === "batting" && s.dimension === d);
  const bowl = (d: string) => p.splits.filter((s) => s.discipline === "bowling" && s.dimension === d);
  const lab = (r: SplitRow) => splitLabel(r.dimension, r.subject, r.label, ctx);
  const batEmpty = `Not enough balls: batting splits are shown from ${t?.minBallsSplit ?? 60} balls faced.`;
  const bowlEmpty = `Not enough balls: bowling splits are shown from ${t?.minBallsBowledSplit ?? 90} balls bowled.`;
  const batted = (career?.balls ?? 0) > 0;
  const bowled = (career?.bowlBalls ?? 0) > 0;
  const rows = (ds: DismissalRow[], name: (s: string) => string) => ds.map((d) => ({ key: d.subject, label: name(d.subject), count: d.count }));
  const how = p.dismissals.filter((d) => d.kind === "how");
  const byType = p.dismissals.filter((d) => d.kind === "byType");
  const kinds = p.dismissals.filter((d) => d.kind === "wicketKind");
  const primary = batted ? "runs" : "wickets";
  const yearData = p.yearly.map((y) => ({ year: y.year, value: (batted ? y.runs : y.wickets) ?? 0, innings: batted ? y.batInnings : y.bowlInnings }));

  return (
    <>
      {career ? (
        <StatGrid className="mb-2">
          <Stat label="Matches" value={int(career.matches)} sample={`${formatKeyLabel(fk)}`} />
          {batted ? <Stat label="Runs" value={int(career.runs)} sample={`avg ${num(career.batAvg)} · SR ${num(career.batSr)} · ${plural(career.balls ?? 0, "ball")}`} /> : null}
          {batted ? <Stat label="100s / 50s" value={`${int(career.hundreds)} / ${int(career.fifties)}`} sample={`HS ${career.highest === null ? DASH : `${career.highest}${career.highestNotOut ? "*" : ""}`}`} /> : null}
          {bowled ? <Stat label="Wickets" value={int(career.wickets)} sample={`avg ${num(career.bowlAvg)} · econ ${num(career.bowlEcon)} · ${plural(career.bowlBalls ?? 0, "ball")}`} /> : null}
        </StatGrid>
      ) : null}

      <Section
        id="traits"
        title="Strengths and weaknesses"
        sub={`Measured against ${genderWord(gender).toLowerCase()}'s ${FORMAT_LABEL[fmt]} players with comparable samples. Strengths sit at or above the ${num(t?.strengthPercentile ?? 70, 0)}th percentile, weaknesses at or below the ${num(t?.weaknessPercentile ?? 30, 0)}th. `}
      >
        <p className="-mt-2 mb-4 text-sm">
          <Link href="/method#traits" className="link">
            How these are computed
          </Link>
        </p>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Claims title="Strengths" kind="strength" claims={p.strengths} empty="None in this format: no split clears the sample and percentile thresholds." />
          <Claims title="Weaknesses" kind="weakness" claims={p.weaknesses} empty="None in this format: no split clears the sample and percentile thresholds." />
        </div>
      </Section>

      <Section id="profile" title="Percentile profile" sub="Where each measure ranks among comparable players; 50 is the cohort median.">
        {p.profile.length ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.1fr]">
            <div className="card p-4">
              <ChartFrame
                label={`Radar chart of ${p.player.name}'s percentiles: ${p.profile.map((a) => `${a.label} ${ordinal(a.percentile)}`).join(", ")}.`}
                tableId="profile-table"
                className="h-72 sm:h-80"
              >
                <PercentileRadar data={p.profile.map((a) => ({ label: a.label, percentile: a.percentile }))} />
              </ChartFrame>
            </div>
            <div id="profile-table" tabIndex={-1}>
              <TableWrap caption="Percentile profile">
                <thead>
                  <tr>
                    <th scope="col">Measure</th>
                    <th scope="col" className="num">Value</th>
                    <th scope="col" className="num">Percentile</th>
                    <th scope="col" className="num">Balls</th>
                  </tr>
                </thead>
                <tbody>
                  {p.profile.map((a) => (
                    <tr key={a.axis}>
                      <th scope="row" className="!font-normal">
                        {a.label} <span className="text-xs text-muted">({a.discipline})</span>
                      </th>
                      <td className="num">{num(a.value)}</td>
                      <td className="num font-semibold">{num(a.percentile, 0)}</td>
                      <td className="num">{int(a.balls)}</td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            </div>
          </div>
        ) : (
          <Muted>Not enough balls in this format to place the player in a cohort.</Muted>
        )}
      </Section>

      {batted ? (
        <>
          <Section id="matchups" title="Batting matchups" sub="Against each bowling type and family, by phase of the innings, and by how long the batter has been in.">
            <div className="space-y-6">
              <SplitTable rows={bat("type")} label={lab} subjectHeader="Bowling type" empty={batEmpty} />
              <SplitTable rows={bat("family")} label={lab} subjectHeader="Pace or spin" empty={batEmpty} />
              <SplitTable rows={bat("phase")} label={lab} subjectHeader="Phase" empty={batEmpty} />
              <SplitTable rows={bat("typePhase")} label={lab} subjectHeader="Type and phase" empty={batEmpty} />
              <SplitTable rows={bat("entry")} label={lab} subjectHeader="Stage of innings" empty={batEmpty} />
            </div>
          </Section>
          <Section id="context" title="Batting by context">
            <div className="space-y-6">
              <SplitTable rows={bat("opposition")} label={lab} subjectHeader="Opposition" empty={batEmpty} />
              <SplitTable rows={[...bat("home"), ...bat("chase")]} label={lab} subjectHeader="Home and chase" empty={batEmpty} />
              <SplitTable rows={bat("position").sort((a, b) => Number(a.subject) - Number(b.subject))} label={lab} subjectHeader="Batting position" empty={batEmpty} />
              <SplitTable rows={bat("inningsNo")} label={lab} subjectHeader="Innings" empty={batEmpty} />
              <details className="group card p-4">
                <summary className="flex min-h-8 items-center justify-between font-semibold">
                  Venues and host countries
                  <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-180">
                    ⌄
                  </span>
                </summary>
                <div className="mt-4 space-y-6">
                  <SplitTable rows={bat("venue")} label={lab} subjectHeader="Venue" empty={batEmpty} />
                  <SplitTable rows={bat("country")} label={lab} subjectHeader="Host country" empty={batEmpty} />
                </div>
              </details>
            </div>
          </Section>
          <Section id="vs-bowlers" title="Head to head with bowlers" sub="The bowlers this batter has faced most.">
            <SplitTable rows={bat("vsBowler")} label={lab} subjectHeader="Bowler" empty={batEmpty} />
          </Section>
        </>
      ) : null}

      {bowled ? (
        <>
          <Section id="bowling" title="Bowling splits">
            <div className="space-y-6">
              <SplitTable rows={bowl("hand")} label={lab} subjectHeader="Batter" empty={bowlEmpty} />
              <SplitTable rows={bowl("phase")} label={lab} subjectHeader="Phase" empty={bowlEmpty} />
              <SplitTable rows={bowl("opposition")} label={lab} subjectHeader="Opposition" empty={bowlEmpty} />
              <SplitTable rows={[...bowl("home"), ...bowl("inningsNo")]} label={lab} subjectHeader="Context" empty={bowlEmpty} />
              <SplitTable rows={bowl("country")} label={lab} subjectHeader="Host country" empty={bowlEmpty} />
            </div>
          </Section>
          <Section id="vs-batters" title="Head to head with batters">
            <SplitTable rows={bowl("vsBatter")} label={lab} subjectHeader="Batter" empty={bowlEmpty} />
          </Section>
        </>
      ) : null}

      <Section id="years" title="Career by year" sub={`${capitalise(primary)} in each calendar year; the table below has every figure and the innings behind it.`}>
        {p.yearly.length ? (
          <div className="space-y-6">
            <div className="card p-4">
              <ChartFrame
                label={`Bar chart of ${primary} per year: ${yearData.map((y) => `${y.year} ${y.value}`).join(", ")}.`}
                tableId="year-table"
                className="h-60"
              >
                <YearBars data={yearData} unit={primary} color={batted ? "var(--chart-1)" : "var(--chart-2)"} />
              </ChartFrame>
            </div>
            <div id="year-table" tabIndex={-1}>
              <TableWrap caption="Career by year">
                <thead>
                  <tr>
                    <th scope="col">Year</th>
                    <th scope="col" className="num">Inns</th>
                    <th scope="col" className="num">Runs</th>
                    <th scope="col" className="num">Avg</th>
                    <th scope="col" className="num">SR</th>
                    <th scope="col" className="num">Bowl inns</th>
                    <th scope="col" className="num">Wkts</th>
                    <th scope="col" className="num">Bowl avg</th>
                    <th scope="col" className="num">Econ</th>
                  </tr>
                </thead>
                <tbody>
                  {p.yearly.map((y) => (
                    <tr key={y.year}>
                      <th scope="row">{y.year}</th>
                      <td className="num">{int(y.batInnings)}</td>
                      <td className="num">{int(y.runs)}</td>
                      <td className="num">{num(y.average)}</td>
                      <td className="num">{num(y.strikeRate)}</td>
                      <td className="num">{int(y.bowlInnings)}</td>
                      <td className="num">{int(y.wickets)}</td>
                      <td className="num">{num(y.bowlAverage)}</td>
                      <td className="num">{num(y.economy)}</td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            </div>
          </div>
        ) : (
          <Muted>No yearly records.</Muted>
        )}
      </Section>

      <Section id="form" title="Recent form" sub="The last innings in this format, next to the career figures.">
        {p.form.batting || p.form.bowling ? (
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {p.form.batting ? (
              <div className="card p-5">
                <Stat
                  label={`Last ${p.form.batting.innings} innings batting`}
                  value={int(p.form.batting.runs)}
                  unit={`runs, ${plural(p.form.batting.outs, "dismissal")}`}
                  sample={
                    <>
                      Average {num(p.form.batting.average)} (career {num(career?.batAvg)}) · strike rate {num(p.form.batting.strikeRate)} (career{" "}
                      {num(career?.batSr)}) · {date(p.form.batting.from)} to {date(p.form.batting.to)}
                    </>
                  }
                />
              </div>
            ) : null}
            {p.form.bowling ? (
              <div className="card p-5">
                <Stat
                  label={`Last ${p.form.bowling.innings} innings bowling`}
                  value={int(p.form.bowling.wickets)}
                  unit={`wickets for ${int(p.form.bowling.runsConceded)} runs`}
                  sample={`${plural(p.form.bowling.balls, "ball")} · ${date(p.form.bowling.from)} to ${date(p.form.bowling.to)}`}
                />
              </div>
            ) : null}
          </dl>
        ) : (
          <Muted>No recent innings in this format.</Muted>
        )}
        {p.recentBatting.length ? (
          <div className="mt-6">
            <h3 className="mb-3 font-semibold">Recent batting innings</h3>
            <TableWrap caption="Recent batting innings">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Opposition</th>
                  <th scope="col" className="num">Runs</th>
                  <th scope="col" className="num">Balls</th>
                  <th scope="col" className="num">4s</th>
                  <th scope="col" className="num">6s</th>
                  <th scope="col" className="num">Pos</th>
                  <th scope="col">Dismissal</th>
                </tr>
              </thead>
              <tbody>
                {p.recentBatting.map((i) => (
                  <tr key={`${i.matchId}-${i.inningsNo}`}>
                    <th scope="row" className="whitespace-nowrap !font-normal">
                      <Link href={`/matches/${i.matchId}`} className="link-quiet">
                        {date(i.playedOn)}
                      </Link>
                    </th>
                    <td>
                      {i.opponent}
                      {i.venue ? <span className="block text-xs text-muted">{i.venue}</span> : null}
                    </td>
                    <td className="num font-semibold">
                      {int(i.runs)}
                      {i.out ? "" : "*"}
                    </td>
                    <td className="num">{int(i.ballsFaced)}</td>
                    <td className="num">{int(i.fours)}</td>
                    <td className="num">{int(i.sixes)}</td>
                    <td className="num">{int(i.position)}</td>
                    <td className="whitespace-nowrap">{i.out ? (i.dismissal ?? DASH) : "not out"}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </div>
        ) : null}
        {p.recentBowling.length ? (
          <div className="mt-6">
            <h3 className="mb-3 font-semibold">Recent bowling innings</h3>
            <TableWrap caption="Recent bowling innings">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Opposition</th>
                  <th scope="col" className="num">Balls</th>
                  <th scope="col" className="num">Maidens</th>
                  <th scope="col" className="num">Runs</th>
                  <th scope="col" className="num">Wkts</th>
                </tr>
              </thead>
              <tbody>
                {p.recentBowling.map((i, k) => (
                  <tr key={`${i.matchId}-${k}`}>
                    <th scope="row" className="whitespace-nowrap !font-normal">
                      <Link href={`/matches/${i.matchId}`} className="link-quiet">
                        {date(i.playedOn)}
                      </Link>
                    </th>
                    <td>{i.opponent}</td>
                    <td className="num">{int(i.ballsBowled)}</td>
                    <td className="num">{int(i.maidens)}</td>
                    <td className="num">{int(i.runsConceded)}</td>
                    <td className="num font-semibold">{int(i.wickets)}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </div>
        ) : null}
      </Section>

      {how.length || kinds.length || byType.length ? (
        <Section id="dismissals" title="Dismissals">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {how.length ? <CountBars label="How they got out" caption="{n} dismissals" rows={rows(how, capitalise)} /> : null}
            {byType.length ? <CountBars label="Dismissed by bowling type" caption="{n} dismissals where the bowler's type is known" rows={rows(byType, (s) => ctx.bowlingTypes[s]?.label ?? s)} /> : null}
            {kinds.length ? <CountBars label="Wickets taken, by kind" caption="{n} wickets" rows={rows(kinds, capitalise)} /> : null}
          </div>
        </Section>
      ) : null}

      <nav aria-label="More on this player" className="mt-12 flex flex-wrap gap-2">
        <Link href={`/compare${qs({ a: slug, f: fmt })}`} className="btn-secondary">
          Compare with another player <span aria-hidden="true">→</span>
        </Link>
        <Link href={`/strategy${qs({ mode: "player", p: slug, f: fmt })}`} className="btn-secondary">
          Scouting dossier <span aria-hidden="true">→</span>
        </Link>
      </nav>
    </>
  );
}

export default async function PlayerPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  // Existence first, before any Suspense boundary streams, so an unknown slug is a real 404.
  const [h, meta] = await Promise.all([getPlayerHeader(slug), getDatasetMeta()]);
  if (!h) notFound();
  const { player, careers } = h;
  const fk = pickFormatKey(player.gender, careers, fmtParam(sp.f));
  const fmt = fk ? fmtOfKey(fk) : null;
  const coverage = fk ? meta?.formats[fk]?.firstDate : undefined;
  const facts = [
    player.teams.join(", ") || player.country,
    player.role,
    player.battingHand ? `${capitalise(player.battingHand)}-hand bat` : null,
    player.bowlingType ? (meta?.bowlingTypes[player.bowlingType]?.label ?? player.bowlingType) : null,
  ].filter(Boolean);

  return (
    <div className="page">
      <PageHeader
        back={{ href: genderHref("/players", player.gender), label: "All players" }}
        eyebrow={`${genderWord(player.gender)}'s cricket`}
        title={player.name}
        sub={
          <>
            {player.fullName && player.fullName !== player.name ? <span className="block text-fg">{player.fullName}</span> : null}
            {facts.length ? <span className="block">{facts.join(" · ")}</span> : null}
            <span className="mt-1 block text-sm">
              First match in the data {date(player.debut)} · last {date(player.lastPlayed)}
              {coverage && fk ? ` · ${formatKeyLabel(fk)} ball-by-ball coverage since ${date(coverage)}` : ""}
            </span>
          </>
        }
        actions={fmt ? <FormatTabs formats={careers.map((c) => c.format)} active={fmt} href={(f) => `/players/${slug}${qs({ f })}`} label="Format shown below" /> : null}
      />

      <Section id="career" title="Career by format" sub="Only matches with ball-by-ball records are counted.">
        {careers.length ? <CareerTable careers={careers} active={fk} /> : <Muted>No career records in this build.</Muted>}
      </Section>

      <div className="mt-12">
        {fmt ? (
          <>
            <h2 className="sr-only">{formatKeyLabel(fk!)} analysis</h2>
            <p className="eyebrow mb-4" aria-hidden="true">{formatKeyLabel(fk!)} analysis</p>
            <Suspense
              key={fmt}
              fallback={
                <div className="space-y-10">
                  <SectionSkeleton label={`Loading ${player.name}'s ${FORMAT_LABEL[fmt]} analysis`} height="h-24" />
                  <SectionSkeleton label="Loading strengths and weaknesses" height="h-72" />
                  <TableSkeleton label="Loading matchups" />
                </div>
              }
            >
              <Analysis slug={slug} fmt={fmt} gender={player.gender} />
            </Suspense>
          </>
        ) : (
          <Muted>No format has enough data for analysis.</Muted>
        )}
      </div>
    </div>
  );
}
