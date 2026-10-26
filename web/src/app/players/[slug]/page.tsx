import Link from "next/link";
import { notFound } from "next/navigation";
import type { CareerRow, SplitRow, TraitRow } from "@/lib/contract/db";
import { getDatasetMeta, getPlayerProfile } from "@/lib/data";
import { DASH, FORMAT_LABEL, capitalise, date, formatKeyLabel, genderWord, int, num, plural, splitLabel, type LabelContext } from "@/lib/format";
import { fmtOfKey } from "@/lib/data/rows";
import { fmtParam, qs, type SearchParams } from "@/lib/params";
import { FormatTabs, Muted, PageHeader, Section, SplitTable, TableWrap } from "@/components/data";
import { AttributeRadar, CareerArea, DismissalDonut } from "@/components/charts/Charts";

function careerTable(careers: CareerRow[]) {
  const bowled = careers.some((c) => (c.bowlBalls ?? 0) > 0);
  return (
    <TableWrap caption="Career by format">
      <thead>
        <tr>
          <th scope="col">Format</th>
          <th scope="col" className="text-right">Mat</th>
          <th scope="col" className="text-right">Inns</th>
          <th scope="col" className="text-right">NO</th>
          <th scope="col" className="text-right">Runs</th>
          <th scope="col" className="text-right">HS</th>
          <th scope="col" className="text-right">Avg</th>
          <th scope="col" className="text-right">SR</th>
          <th scope="col" className="text-right">100/50</th>
          {bowled ? (
            <>
              <th scope="col" className="text-right">Balls</th>
              <th scope="col" className="text-right">Wkts</th>
              <th scope="col" className="text-right">BBI</th>
              <th scope="col" className="text-right">Avg</th>
              <th scope="col" className="text-right">Econ</th>
              <th scope="col" className="text-right">5w</th>
            </>
          ) : null}
        </tr>
      </thead>
      <tbody>
        {careers.map((c) => (
          <tr key={c.formatKey}>
            <th scope="row" className="font-semibold">{FORMAT_LABEL[c.format]}</th>
            <td className="text-right tabular-nums">{int(c.matches)}</td>
            <td className="text-right tabular-nums">{int(c.batInnings)}</td>
            <td className="text-right tabular-nums">{int(c.notOuts)}</td>
            <td className="text-right font-medium tabular-nums">{int(c.runs)}</td>
            <td className="text-right tabular-nums">{c.highest === null ? DASH : `${c.highest}${c.highestNotOut ? "*" : ""}`}</td>
            <td className="text-right tabular-nums">{num(c.batAvg)}</td>
            <td className="text-right tabular-nums">{num(c.batSr)}</td>
            <td className="text-right tabular-nums">{c.hundreds === null ? DASH : `${c.hundreds}/${c.fifties}`}</td>
            {bowled ? (
              <>
                <td className="text-right tabular-nums">{int(c.bowlBalls)}</td>
                <td className="text-right font-medium tabular-nums">{int(c.wickets)}</td>
                <td className="text-right tabular-nums">{c.best ? `${c.best.wickets}/${c.best.runs}` : DASH}</td>
                <td className="text-right tabular-nums">{num(c.bowlAvg)}</td>
                <td className="text-right tabular-nums">{num(c.bowlEcon)}</td>
                <td className="text-right tabular-nums">{int(c.fiveWkts)}</td>
              </>
            ) : null}
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}

function Claims({ title, claims, tone }: { title: string; claims: TraitRow[]; tone: "good" | "bad" }) {
  const colour = tone === "good" ? "border-[#34c759]" : "border-[#ff375f]";
  return (
    <div>
      <h3 className="mb-3 font-semibold">{title}</h3>
      {claims.length ? (
        <ul className="space-y-3">
          {claims.map((t) => (
            <li key={`${t.kind}-${t.rank}`} className={`card border-l-4 p-5 ${colour}`}>
              <p className="font-semibold">
                {t.subject} <span className="font-normal text-[#6e6e73]">· {t.dimension}, {t.metricLabel}</span>
              </p>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-5">
                <div><dt className="text-xs text-[#6e6e73]">Value</dt><dd className="tabular-nums">{num(t.value)}</dd></div>
                <div><dt className="text-xs text-[#6e6e73]">Own baseline</dt><dd className="tabular-nums">{num(t.baseline)}</dd></div>
                <div><dt className="text-xs text-[#6e6e73]">Cohort median</dt><dd className="tabular-nums">{num(t.cohortMedian)}</dd></div>
                <div><dt className="text-xs text-[#6e6e73]">Percentile</dt><dd className="tabular-nums">{num(t.percentile, 1)}</dd></div>
                <div><dt className="text-xs text-[#6e6e73]">Sample</dt><dd className="tabular-nums">{plural(t.balls, "ball")}</dd></div>
              </dl>
              <p className="mt-2 text-sm leading-relaxed text-[#6e6e73]">{t.text}</p>
              <p className="mt-1 text-[11px] uppercase tracking-wider text-[#6e6e73]">{capitalise(t.confidence)} confidence</p>
            </li>
          ))}
        </ul>
      ) : (
        <Muted>None in this format: no split clears the sample and percentile thresholds.</Muted>
      )}
    </div>
  );
}

export default async function PlayerPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const [p, meta] = await Promise.all([getPlayerProfile(slug, fmtParam(sp.f)), getDatasetMeta()]);
  if (!p) notFound();
  const { player } = p;
  const fk = p.formatKey;
  const fmt = fk ? fmtOfKey(fk) : null;
  const ctx: LabelContext = { bowlingTypes: meta?.bowlingTypes ?? {}, phases: fmt ? (meta?.phases[fmt] ?? []) : [] };
  const t = meta?.thresholds;
  const coverage = fk ? meta?.formats[fk]?.firstDate : undefined;
  const career = p.careers.find((c) => c.formatKey === fk) ?? null;
  const bat = (d: string) => p.splits.filter((s) => s.discipline === "batting" && s.dimension === d);
  const bowl = (d: string) => p.splits.filter((s) => s.discipline === "bowling" && s.dimension === d);
  const lab = (r: SplitRow) => splitLabel(r.dimension, r.subject, r.label, ctx);
  const batEmpty = `Not enough balls: batting splits are shown from ${t?.minBallsSplit ?? 60} balls faced.`;
  const bowlEmpty = `Not enough balls: bowling splits are shown from ${t?.minBallsBowledSplit ?? 90} balls bowled.`;
  const batted = (career?.balls ?? 0) > 0;
  const bowled = (career?.bowlBalls ?? 0) > 0;
  const how = p.dismissals.filter((d) => d.kind === "how");
  const byType = p.dismissals.filter((d) => d.kind === "byType");
  const kinds = p.dismissals.filter((d) => d.kind === "wicketKind");
  const facts = [
    genderWord(player.gender),
    player.teams.join(", ") || player.country,
    player.role,
    player.battingHand ? `${capitalise(player.battingHand)}-hand bat` : null,
    player.bowlingType ? (meta?.bowlingTypes[player.bowlingType]?.label ?? player.bowlingType) : null,
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
      <Link href="/players" className="text-sm text-[#0071e3]">← All players</Link>
      <div className="mt-4">
        <PageHeader
          eyebrow={facts.join(" · ")}
          title={player.name}
          sub={
            <>
              {player.fullName && player.fullName !== player.name ? <span className="block">{player.fullName}</span> : null}
              <span className="block text-sm">
                First match in the data {date(player.debut)} · last {date(player.lastPlayed)}
                {coverage && fk ? ` · ${formatKeyLabel(fk)} ball-by-ball coverage since ${date(coverage)}` : ""}
              </span>
            </>
          }
        />
      </div>

      <Section title="Career by format" sub="Only matches with ball-by-ball records are counted.">
        {p.careers.length ? careerTable(p.careers) : <Muted>No career records in this build.</Muted>}
      </Section>

      <FormatTabs formats={p.careers.map((c) => c.format)} active={fmt} href={(f) => `/players/${slug}${qs({ f })}`} />

      {fk && fmt ? (
        <>
          <Section
            title={`Strengths and weaknesses, ${formatKeyLabel(fk)}`}
            sub={`Measured against ${genderWord(player.gender).toLowerCase()}'s ${FORMAT_LABEL[fmt]} players with comparable samples. Strengths sit at or above the ${num(t?.strengthPercentile ?? 70, 0)}th percentile, weaknesses at or below the ${num(t?.weaknessPercentile ?? 30, 0)}th.`}
          >
            <div className="grid gap-6 md:grid-cols-2">
              <Claims title="Strengths" claims={p.strengths} tone="good" />
              <Claims title="Weaknesses" claims={p.weaknesses} tone="bad" />
            </div>
          </Section>

          <Section title="Percentile profile" sub="Where each measure ranks among comparable players (50 is the median).">
            {p.profile.length ? (
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="card p-4">
                  <AttributeRadar data={p.profile.map((a) => ({ attribute: a.label, value: a.percentile }))} keys={[{ key: "value", name: "Percentile", color: "#0071e3" }]} />
                </div>
                <TableWrap caption="Percentile profile">
                  <thead>
                    <tr>
                      <th scope="col">Measure</th>
                      <th scope="col" className="text-right">Value</th>
                      <th scope="col" className="text-right">Percentile</th>
                      <th scope="col" className="text-right">Balls</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.profile.map((a) => (
                      <tr key={a.axis}>
                        <td>
                          {a.label} <span className="text-xs text-[#6e6e73]">({a.discipline})</span>
                        </td>
                        <td className="text-right tabular-nums">{num(a.value)}</td>
                        <td className="text-right tabular-nums">{num(a.percentile, 1)}</td>
                        <td className="text-right tabular-nums">{int(a.balls)}</td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              </div>
            ) : (
              <Muted>Not enough balls in this format to place the player in a cohort.</Muted>
            )}
          </Section>

          {batted ? (
            <>
              <Section title="Batting matchups" sub="Against each bowling type and family, by phase of the innings, and by how long the batter has been in.">
                <div className="space-y-6">
                  <SplitTable rows={bat("type")} label={lab} subjectHeader="Bowling type" empty={batEmpty} />
                  <SplitTable rows={bat("family")} label={lab} subjectHeader="Pace or spin" empty={batEmpty} />
                  <SplitTable rows={bat("phase")} label={lab} subjectHeader="Phase" empty={batEmpty} />
                  <SplitTable rows={bat("typePhase")} label={lab} subjectHeader="Type and phase" empty={batEmpty} />
                  <SplitTable rows={bat("entry")} label={lab} subjectHeader="Stage of innings" empty={batEmpty} />
                </div>
              </Section>
              <Section title="Batting by context">
                <div className="space-y-6">
                  <SplitTable rows={bat("opposition")} label={lab} subjectHeader="Opposition" empty={batEmpty} />
                  <SplitTable rows={[...bat("home"), ...bat("chase")]} label={lab} subjectHeader="Home and chase" empty={batEmpty} />
                  <SplitTable rows={bat("position").sort((a, b) => Number(a.subject) - Number(b.subject))} label={lab} subjectHeader="Batting position" empty={batEmpty} />
                  <SplitTable rows={bat("inningsNo")} label={lab} subjectHeader="Innings" empty={batEmpty} />
                  <details>
                    <summary className="cursor-pointer text-sm font-medium text-[#0071e3]">Venues and host countries</summary>
                    <div className="mt-4 space-y-6">
                      <SplitTable rows={bat("venue")} label={lab} subjectHeader="Venue" empty={batEmpty} />
                      <SplitTable rows={bat("country")} label={lab} subjectHeader="Host country" empty={batEmpty} />
                    </div>
                  </details>
                </div>
              </Section>
              <Section title="Head to head with bowlers" sub="The bowlers this batter has faced most.">
                <SplitTable rows={bat("vsBowler")} label={lab} subjectHeader="Bowler" empty={batEmpty} />
              </Section>
            </>
          ) : null}

          {bowled ? (
            <>
              <Section title="Bowling splits">
                <div className="space-y-6">
                  <SplitTable rows={bowl("hand")} label={lab} subjectHeader="Batter" empty={bowlEmpty} />
                  <SplitTable rows={bowl("phase")} label={lab} subjectHeader="Phase" empty={bowlEmpty} />
                  <SplitTable rows={bowl("opposition")} label={lab} subjectHeader="Opposition" empty={bowlEmpty} />
                  <SplitTable rows={[...bowl("home"), ...bowl("inningsNo")]} label={lab} subjectHeader="Context" empty={bowlEmpty} />
                  <SplitTable rows={bowl("country")} label={lab} subjectHeader="Host country" empty={bowlEmpty} />
                </div>
              </Section>
              <Section title="Head to head with batters">
                <SplitTable rows={bowl("vsBatter")} label={lab} subjectHeader="Batter" empty={bowlEmpty} />
              </Section>
            </>
          ) : null}

          <Section title="Career by year">
            {p.yearly.length ? (
              <div className="space-y-6">
                <div className="card p-4">
                  <CareerArea
                    data={p.yearly.map((y) => ({ year: y.year, runs: y.runs, wickets: y.wickets }))}
                    metric={batted ? "runs" : "wickets"}
                    color={batted ? "#0071e3" : "#ff375f"}
                  />
                </div>
                <TableWrap caption="Career by year">
                  <thead>
                    <tr>
                      <th scope="col">Year</th>
                      <th scope="col" className="text-right">Inns</th>
                      <th scope="col" className="text-right">Runs</th>
                      <th scope="col" className="text-right">Avg</th>
                      <th scope="col" className="text-right">SR</th>
                      <th scope="col" className="text-right">Bowl inns</th>
                      <th scope="col" className="text-right">Wkts</th>
                      <th scope="col" className="text-right">Bowl avg</th>
                      <th scope="col" className="text-right">Econ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.yearly.map((y) => (
                      <tr key={y.year}>
                        <th scope="row">{y.year}</th>
                        <td className="text-right tabular-nums">{int(y.batInnings)}</td>
                        <td className="text-right tabular-nums">{int(y.runs)}</td>
                        <td className="text-right tabular-nums">{num(y.average)}</td>
                        <td className="text-right tabular-nums">{num(y.strikeRate)}</td>
                        <td className="text-right tabular-nums">{int(y.bowlInnings)}</td>
                        <td className="text-right tabular-nums">{int(y.wickets)}</td>
                        <td className="text-right tabular-nums">{num(y.bowlAverage)}</td>
                        <td className="text-right tabular-nums">{num(y.economy)}</td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              </div>
            ) : (
              <Muted>No yearly records.</Muted>
            )}
          </Section>

          <Section title="Recent form">
            <div className="grid gap-3 sm:grid-cols-2">
              {p.form.batting ? (
                <div className="card p-5 text-sm">
                  <p className="font-semibold">Last {p.form.batting.innings} innings batting</p>
                  <p className="mt-1">
                    {int(p.form.batting.runs)} runs, {p.form.batting.outs} dismissals: average {num(p.form.batting.average)}, strike rate{" "}
                    {num(p.form.batting.strikeRate)}
                  </p>
                  <p className="text-[#6e6e73]">
                    Career average {num(career?.batAvg)}, strike rate {num(career?.batSr)} · {date(p.form.batting.from)} to {date(p.form.batting.to)}
                  </p>
                </div>
              ) : null}
              {p.form.bowling ? (
                <div className="card p-5 text-sm">
                  <p className="font-semibold">Last {p.form.bowling.innings} innings bowling</p>
                  <p className="mt-1">
                    {p.form.bowling.wickets} wickets for {p.form.bowling.runsConceded} runs in {plural(p.form.bowling.balls, "ball")}
                  </p>
                  <p className="text-[#6e6e73]">
                    {date(p.form.bowling.from)} to {date(p.form.bowling.to)}
                  </p>
                </div>
              ) : null}
            </div>
            {p.recentBatting.length ? (
              <div className="mt-6">
                <TableWrap caption="Recent batting innings">
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Opposition</th>
                      <th scope="col" className="text-right">Runs</th>
                      <th scope="col" className="text-right">Balls</th>
                      <th scope="col" className="text-right">4s</th>
                      <th scope="col" className="text-right">6s</th>
                      <th scope="col" className="text-right">Pos</th>
                      <th scope="col">Dismissal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.recentBatting.map((i) => (
                      <tr key={`${i.matchId}-${i.inningsNo}`}>
                        <td className="whitespace-nowrap">{date(i.playedOn)}</td>
                        <td>
                          {i.opponent}
                          {i.venue ? <span className="block text-xs text-[#6e6e73]">{i.venue}</span> : null}
                        </td>
                        <td className="text-right font-medium tabular-nums">
                          {int(i.runs)}
                          {i.out ? "" : "*"}
                        </td>
                        <td className="text-right tabular-nums">{int(i.ballsFaced)}</td>
                        <td className="text-right tabular-nums">{int(i.fours)}</td>
                        <td className="text-right tabular-nums">{int(i.sixes)}</td>
                        <td className="text-right tabular-nums">{int(i.position)}</td>
                        <td>{i.out ? (i.dismissal ?? DASH) : "not out"}</td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              </div>
            ) : null}
            {p.recentBowling.length ? (
              <div className="mt-6">
                <TableWrap caption="Recent bowling innings">
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Opposition</th>
                      <th scope="col" className="text-right">Balls</th>
                      <th scope="col" className="text-right">Maidens</th>
                      <th scope="col" className="text-right">Runs</th>
                      <th scope="col" className="text-right">Wkts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.recentBowling.map((i, k) => (
                      <tr key={`${i.matchId}-${k}`}>
                        <td className="whitespace-nowrap">{date(i.playedOn)}</td>
                        <td>{i.opponent}</td>
                        <td className="text-right tabular-nums">{int(i.ballsBowled)}</td>
                        <td className="text-right tabular-nums">{int(i.maidens)}</td>
                        <td className="text-right tabular-nums">{int(i.runsConceded)}</td>
                        <td className="text-right font-medium tabular-nums">{int(i.wickets)}</td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              </div>
            ) : null}
          </Section>

          {how.length || kinds.length ? (
            <Section title="Dismissals">
              <div className="grid gap-6 md:grid-cols-2">
                {how.length ? (
                  <div className="card p-5">
                    <h3 className="font-semibold">How they got out</h3>
                    <DismissalDonut data={how.map((d) => ({ name: d.subject, value: d.count }))} />
                    <ul className="mt-2 grid grid-cols-2 gap-1 text-sm">
                      {how.map((d) => (
                        <li key={d.subject}>
                          {capitalise(d.subject)}: <span className="tabular-nums">{d.count}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="space-y-6">
                  {byType.length ? (
                    <div className="card p-5">
                      <h3 className="font-semibold">Dismissed by bowling type</h3>
                      <ul className="mt-2 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
                        {byType.map((d) => (
                          <li key={d.subject}>
                            {ctx.bowlingTypes[d.subject]?.label ?? d.subject}: <span className="tabular-nums">{d.count}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {kinds.length ? (
                    <div className="card p-5">
                      <h3 className="font-semibold">Wickets taken, by kind</h3>
                      <ul className="mt-2 grid grid-cols-2 gap-1 text-sm">
                        {kinds.map((d) => (
                          <li key={d.subject}>
                            {capitalise(d.subject)}: <span className="tabular-nums">{d.count}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </div>
            </Section>
          ) : null}

          <p className="mt-12 text-sm">
            <Link href={`/compare${qs({ a: slug, f: fmt })}`} className="text-[#0071e3] hover:underline">
              Compare with another player →
            </Link>
            <span className="mx-3 text-[#6e6e73]">·</span>
            <Link href={`/strategy${qs({ mode: "player", p: slug, f: fmt })}`} className="text-[#0071e3] hover:underline">
              Scouting dossier →
            </Link>
          </p>
        </>
      ) : (
        <Section title="Analysis">
          <Muted>No format has enough data for analysis.</Muted>
        </Section>
      )}
    </div>
  );
}
