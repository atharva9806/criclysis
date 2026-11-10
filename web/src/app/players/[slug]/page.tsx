import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type CSSProperties, type ReactNode } from "react";
import type { CareerRow, DismissalRow, InningsRow, SplitRow, TraitRow } from "@/lib/contract/db";
import { formatKey, type Fmt, type FormatKey, type Gender } from "@/lib/contract/pipeline";
import { getDatasetMeta, getPlayerHeader, getPlayerProfile } from "@/lib/data";
import { fmtOfKey } from "@/lib/data/rows";
import { DASH, FORMAT_LABEL, capitalise, date, formatKeyLabel, genderWord, int, num, plural, splitLabel, type LabelContext } from "@/lib/format";
import { fmtParam, qs, type SearchParams } from "@/lib/params";
import { teamMark } from "@/lib/teams/flags";
import { teamVars } from "@/lib/teams/colors";
import { DataCredit } from "@/components/DataCredit";
import { FormatTabs, Muted, Section, SplitTable, TableWrap, genderHref } from "@/components/data";
import { ChartFrame, InningsBars, PercentileRadar, YearBars } from "@/components/charts/Charts";
import { ordinal } from "@/components/numbers";
import { SectionSkeleton, TableSkeleton } from "@/components/Loading";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { Flag } from "@/components/broadcast/Flag";
import { TeamBand } from "@/components/broadcast/TeamBand";
import { Badge, Stat, StatGrid } from "@/components/ui";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> };

/** The team colour on the page, set as --team-line by the page wrapper (teamVars). */
const TEAM_LINE = "var(--team-line)";

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

const hs = (c: CareerRow) => (c.highest === null ? DASH : `${c.highest}${c.highestNotOut ? "*" : ""}`);

/** The headline numbers for one format as scoreboard tiles, each with the sample behind it. */
function CareerTiles({ c, fk }: { c: CareerRow; fk: FormatKey }) {
  const batted = (c.balls ?? 0) > 0;
  const bowled = (c.bowlBalls ?? 0) > 0;
  const tiles: ReactNode[] = [<Stat key="m" label="Matches" value={int(c.matches)} sample={formatKeyLabel(fk)} />];
  if (batted) {
    tiles.push(
      <Stat key="r" label="Runs" value={int(c.runs)} sample={`${plural(c.batInnings ?? 0, "innings", "innings")}, ${int(c.notOuts)} not out`} />,
      <Stat key="a" label="Batting average" value={num(c.batAvg)} sample={`runs per dismissal, ${plural(c.outs ?? 0, "dismissal")}`} />,
      <Stat key="s" label="Strike rate" value={num(c.batSr)} sample={`runs per 100 balls, ${plural(c.balls ?? 0, "ball")}`} />,
    );
    if (!bowled) tiles.push(<Stat key="h" label="100s / 50s" value={`${int(c.hundreds)} / ${int(c.fifties)}`} sample={`highest score ${hs(c)}`} />);
  }
  if (bowled) {
    tiles.push(
      <Stat key="w" label="Wickets" value={int(c.wickets)} sample={`${plural(c.bowlInnings ?? 0, "innings", "innings")} bowled`} />,
      <Stat key="ba" label="Bowling average" value={num(c.bowlAvg)} sample={`runs per wicket, ${plural(c.wickets ?? 0, "wicket")}`} />,
      <Stat key="e" label="Economy" value={num(c.bowlEcon)} sample={`runs per over, ${plural(c.bowlBalls ?? 0, "ball")}`} />,
    );
    tiles.push(<Stat key="b" label="Best bowling" value={c.best ? `${c.best.wickets}/${c.best.runs}` : DASH} sample={`${plural(c.fiveWkts ?? 0, "five-wicket haul")}`} />);
  }
  const cols = tiles.length === 5 ? "lg:grid-cols-5" : tiles.length === 8 ? "lg:grid-cols-4" : "lg:grid-cols-4";
  return (
    <StatGrid accent={TEAM_LINE} className={`${cols} [&_.score]:text-[2.75rem] sm:[&_.score]:text-[3.25rem]`}>
      {tiles}
    </StatGrid>
  );
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
              {c.formatKey === active ? <span className="sr-only"> (shown on this page)</span> : null}
            </th>
            <td className="num">{int(c.matches)}</td>
            <td className="num">{int(c.batInnings)}</td>
            <td className="num">{int(c.notOuts)}</td>
            <td className="num font-semibold">{int(c.runs)}</td>
            <td className="num">{hs(c)}</td>
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
  const v = Math.min(100, Math.max(0, value));
  return (
    <div className="relative mt-1 h-2.5 rounded-full bg-surface-3" aria-hidden="true">
      <div className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
      <div className={`wipe absolute inset-y-0 rounded-full ${good ? "bg-positive/35" : "bg-negative/35"}`} style={good ? { left: "50%", width: `${Math.max(0, v - 50)}%` } : { left: `${v}%`, width: `${Math.max(0, 50 - v)}%` }} />
      <div className={`absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface ${good ? "bg-positive" : "bg-negative"}`} style={{ left: `${v}%` }} />
    </div>
  );
}

function Claims({ title, claims, kind, empty }: { title: string; claims: TraitRow[]; kind: "strength" | "weakness"; empty: string }) {
  const good = kind === "strength";
  return (
    <div>
      <h3 className="mb-3 flex items-center gap-2 font-display text-xl font-bold uppercase tracking-[0.03em]">
        <span aria-hidden="true" className={good ? "text-positive" : "text-negative"}>
          {good ? "▲" : "▼"}
        </span>
        {title}
        <span className="font-sans text-sm font-normal normal-case tracking-normal text-muted">({claims.length})</span>
      </h3>
      {claims.length ? (
        <ul className="space-y-3">
          {claims.map((t) => (
            <li key={`${t.kind}-${t.rank}`} className={`card relative overflow-hidden p-4 pl-5 sm:p-5 sm:pl-6`}>
              <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${good ? "bg-positive" : "bg-negative"}`} />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{t.subject}</p>
                  <p className="text-sm text-muted">
                    {t.dimension} · {t.metricLabel}
                  </p>
                </div>
                <p className="shrink-0 text-right">
                  <span className={`score block text-[2rem] ${good ? "text-positive" : "text-negative"}`}>{t.percentile < 0.5 ? "<1" : ordinal(t.percentile)}</span>
                  <span className="label block">percentile</span>
                </p>
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
                <p className="sr-only">{t.percentile < 0.5 ? "Below the 1st" : ordinal(t.percentile)} percentile among comparable players</p>
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
      <h3 className="font-display text-lg font-bold uppercase tracking-[0.03em]">{label}</h3>
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
              <div className="wipe h-1.5 rounded-full" style={{ width: `${(100 * r.count) / max}%`, background: TEAM_LINE }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A heading that groups the page into "the picture" (charts) and "the numbers" (tables). */
function Part({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className="mt-14 first:mt-0">
      <div className="mb-6 border-b border-line pb-3">
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={`${id}-title`} className="mt-1 font-display text-[2rem] font-extrabold uppercase leading-none">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

const shortDate = (d: string) => date(d);

async function Analysis({ slug, fmt, gender, teamCode }: { slug: string; fmt: Fmt; gender: Gender; teamCode: string }) {
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
  // Recent innings, oldest first, for the form chart.
  const recent: InningsRow[] = [...(batted ? p.recentBatting : p.recentBowling)].reverse();
  const formData = recent.map((i, k) => ({
    key: `${i.matchId}-${i.inningsNo ?? k}-${k}`,
    value: (batted ? i.runs : i.wickets) ?? 0,
    notOut: batted ? i.out === false : false,
    label: `v ${i.opponent}, ${shortDate(i.playedOn)}${batted ? ` (${int(i.ballsFaced)} balls)` : ` (${int(i.runsConceded)} runs, ${int(i.ballsBowled)} balls)`}`,
  }));
  const formTable = batted ? "recent-batting" : "recent-bowling";

  return (
    <>
      <Part id="picture" eyebrow={`${formatKeyLabel(fk)} · ${teamCode}`} title="The picture">
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

        <Section id="form" title="Form" sub={`The last ${plural(recent.length, "innings", "innings")} in this format, oldest on the left, next to the career figures.`}>
          {p.form.batting || p.form.bowling ? (
            <dl className={`tiles mb-4 grid grid-cols-1 gap-3 ${p.form.batting && p.form.bowling ? "sm:grid-cols-2" : ""}`} style={{ "--tile-accent": TEAM_LINE } as CSSProperties}>
              {p.form.batting ? (
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
              ) : null}
              {p.form.bowling ? (
                <Stat
                  label={`Last ${p.form.bowling.innings} innings bowling`}
                  value={int(p.form.bowling.wickets)}
                  unit={`wickets for ${int(p.form.bowling.runsConceded)} runs`}
                  sample={`${plural(p.form.bowling.balls, "ball")} · ${date(p.form.bowling.from)} to ${date(p.form.bowling.to)}`}
                />
              ) : null}
            </dl>
          ) : null}
          {formData.length ? (
            <div className="card p-4 sm:p-5">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-display text-lg font-bold uppercase tracking-[0.03em]">{batted ? "Runs per innings" : "Wickets per innings"}</h3>
                {batted ? (
                  <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                    <span className="inline-flex items-center gap-2">
                      <span aria-hidden="true" className="inline-block h-3 w-3 rounded-[2px] border-[1.5px]" style={{ borderColor: TEAM_LINE }} />
                      Hollow bar: not out
                    </span>
                    {career?.batAvg != null ? (
                      <span className="inline-flex items-center gap-2">
                        <span aria-hidden="true" className="inline-block w-4 border-t-2 border-dashed border-fg/60" />
                        Career average {num(career.batAvg)}
                      </span>
                    ) : null}
                  </p>
                ) : null}
              </div>
              <ChartFrame
                label={`Bar chart of ${primary} in each of the last ${formData.length} innings, oldest first: ${formData.map((d) => `${d.value}${d.notOut ? "*" : ""}`).join(", ")}.`}
                tableId={formTable}
                className="h-56"
              >
                <InningsBars data={formData} unit={primary} color={TEAM_LINE} average={batted ? (career?.batAvg ?? null) : null} />
              </ChartFrame>
            </div>
          ) : (
            <Muted>No recent innings in this format.</Muted>
          )}
        </Section>

        <Section id="profile" title="Percentile profile and career by year" sub="Where each measure ranks among comparable players (50 is the cohort median), and the career year by year.">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="card p-4">
              <h3 className="font-display text-lg font-bold uppercase tracking-[0.03em]">Percentiles</h3>
              {p.profile.length ? (
                <ChartFrame
                  label={`Radar chart of ${p.player.name}'s percentiles: ${p.profile.map((a) => `${a.label} ${ordinal(a.percentile)}`).join(", ")}.`}
                  tableId="profile-table"
                  className="h-72 sm:h-80"
                >
                  <PercentileRadar data={p.profile.map((a) => ({ label: a.label, percentile: a.percentile }))} colors={[TEAM_LINE]} />
                </ChartFrame>
              ) : (
                <p className="mt-3 text-sm text-muted">Not enough balls in this format to place the player in a cohort.</p>
              )}
            </div>
            <div className="card p-4">
              <h3 className="font-display text-lg font-bold uppercase tracking-[0.03em]">{capitalise(primary)} by year</h3>
              {p.yearly.length ? (
                <ChartFrame label={`Bar chart of ${primary} per year: ${yearData.map((y) => `${y.year} ${y.value}`).join(", ")}.`} tableId="year-table" className="h-72 sm:h-80">
                  <YearBars data={yearData} unit={primary} color={TEAM_LINE} />
                </ChartFrame>
              ) : (
                <p className="mt-3 text-sm text-muted">No yearly records.</p>
              )}
            </div>
          </div>
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
      </Part>

      <Part id="numbers" eyebrow="Every figure behind the charts" title="The numbers">
        <Section id="career" title="Career by format" sub="Only matches with ball-by-ball records are counted.">
          {p.careers.length ? <CareerTable careers={p.careers} active={fk} /> : <Muted>No career records in this build.</Muted>}
        </Section>

        {p.profile.length ? (
          <Section id="profile-numbers" title="Percentile profile">
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
          </Section>
        ) : null}

        <Section id="recent" title="Recent innings">
          {p.recentBatting.length ? (
            <div id="recent-batting" tabIndex={-1}>
              <h3 className="mb-3 font-display text-lg font-bold uppercase tracking-[0.03em]">Batting</h3>
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
                        <span className="inline-flex items-center gap-2">
                          <Flag mark={teamMark(i.opponent)} size="xs" />
                          {i.opponent}
                        </span>
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
            <div id="recent-bowling" tabIndex={-1} className={p.recentBatting.length ? "mt-6" : ""}>
              <h3 className="mb-3 font-display text-lg font-bold uppercase tracking-[0.03em]">Bowling</h3>
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
                      <td>
                        <span className="inline-flex items-center gap-2">
                          <Flag mark={teamMark(i.opponent)} size="xs" />
                          {i.opponent}
                        </span>
                      </td>
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
          {!p.recentBatting.length && !p.recentBowling.length ? <Muted>No recent innings in this format.</Muted> : null}
        </Section>

        <Section id="years" title="Career by year" sub="Every figure, with the innings behind it.">
          {p.yearly.length ? (
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
          ) : (
            <Muted>No yearly records.</Muted>
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
                  <summary className="flex min-h-8 items-center justify-between font-display text-lg font-bold uppercase tracking-[0.03em]">
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
      </Part>

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
  const side = player.teams[0] ?? player.country ?? null;
  const team = player.teams.join(", ") || player.country;
  const mark = teamMark(side);
  const career = fk ? (careers.find((c) => c.formatKey === fk) ?? null) : null;
  const facts = [
    player.role,
    player.battingHand ? `${capitalise(player.battingHand)}-hand bat` : null,
    player.bowlingType ? (meta?.bowlingTypes[player.bowlingType]?.label ?? player.bowlingType) : null,
  ].filter((x): x is string => Boolean(x));

  return (
    <div style={teamVars(mark) as CSSProperties}>
      <TeamBand mark={mark} label={`${player.name}, ${team ?? "team not recorded"}`}>
        <Link href={genderHref("/players", player.gender)} className="-ml-1 mb-4 inline-flex min-h-10 items-center gap-1.5 rounded-control px-1 font-display text-sm font-semibold uppercase tracking-[0.06em] underline-offset-4 hover:underline">
          <span aria-hidden="true">←</span> All players
        </Link>
        <div className="flex items-start gap-4 sm:gap-7">
          <PlayerPhoto
            photo={player.photo}
            name={player.name}
            team={team}
            size="xl"
            tone="inherit"
            avatar={{ background: mark.deep, color: mark.on }}
            className="rise shadow-[0_18px_40px_-18px_rgb(0_0_0/0.6)] [&_img]:border-transparent"
          />
          <div className="min-w-0 flex-1">
            <p className="rise flex flex-wrap items-center gap-x-2.5 gap-y-1 font-display text-sm font-bold uppercase tracking-[0.08em] sm:text-base">
              <Flag mark={mark} size="md" />
              <span>{team ?? "Team not recorded"}</span>
              <span aria-hidden="true">·</span>
              <span>{genderWord(player.gender)}&apos;s cricket</span>
            </p>
            <h1 className="rise rise-1 mt-2 text-title text-balance break-words">{player.name}</h1>
            {player.fullName && player.fullName !== player.name ? <p className="rise rise-1 mt-2 text-base font-medium sm:text-lg">{player.fullName}</p> : null}
            {facts.length ? (
              <ul className="rise rise-2 mt-3 flex flex-wrap gap-1.5" aria-label="Role and style">
                {facts.map((f) => (
                  <li key={f} className="rounded-full border border-current px-2.5 py-0.5 text-xs font-semibold sm:text-sm">
                    {f}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="rise rise-2 mt-3 text-sm">
              First match in the data {date(player.debut)} · last {date(player.lastPlayed)}
              {coverage && fk ? ` · ${formatKeyLabel(fk)} ball-by-ball coverage since ${date(coverage)}` : ""}
            </p>
          </div>
        </div>
        {fmt ? (
          <div className="rise rise-3 mt-6 theme-dark">
            <FormatTabs formats={careers.map((c) => c.format)} active={fmt} href={(f) => `/players/${slug}${qs({ f })}`} label="Format shown on this page" />
          </div>
        ) : null}
      </TeamBand>

      <div className="page">
        <DataCredit className="-mt-2 mb-6" />
        {career && fk ? (
          <section aria-labelledby="headline-title" className="mb-14">
            <h2 id="headline-title" className="sr-only">
              {formatKeyLabel(fk)} career
            </h2>
            <CareerTiles c={career} fk={fk} />
          </section>
        ) : null}

        {fmt ? (
          <Suspense
            key={fmt}
            fallback={
              <div className="space-y-10">
                <SectionSkeleton label={`Loading ${player.name}'s ${FORMAT_LABEL[fmt]} analysis`} height="h-72" />
                <SectionSkeleton label="Loading the charts" height="h-64" />
                <TableSkeleton label="Loading the tables" />
              </div>
            }
          >
            <Analysis slug={slug} fmt={fmt} gender={player.gender} teamCode={mark.code} />
          </Suspense>
        ) : (
          <>
            {careers.length ? <CareerTable careers={careers} active={null} /> : null}
            <div className="mt-6">
              <Muted>No format has enough data for analysis.</Muted>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
