import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type CSSProperties } from "react";
import type { MatchRow } from "@/lib/contract/db";
import { formatKey, type Fmt, type PhaseRow, type Record5 } from "@/lib/contract/pipeline";
import { getDatasetMeta, getTeam } from "@/lib/data";
import { FMTS, findTeam, pickFormat } from "../lookup";
import { DASH, date, decided, formatKeyLabel, int, num, pct, plural, record, tossWinPcts, winPct } from "@/lib/format";
import { phaseRates } from "@/lib/metrics";
import { fmtParam, qs, type SearchParams } from "@/lib/params";
import { teamVars } from "@/lib/teams/colors";
import { teamMark } from "@/lib/teams/flags";
import { DataCredit } from "@/components/DataCredit";
import { FormatTabs, MatchGrid, Muted, RecordCells, RecordHeads, Section, TableWrap, genderHref } from "@/components/data";
import { ChartFrame, ResultsByYear } from "@/components/charts/Charts";
import { SectionSkeleton, TableSkeleton } from "@/components/Loading";
import { Flag } from "@/components/broadcast/Flag";
import { TeamBand } from "@/components/broadcast/TeamBand";
import { EmptyState, Stat, StatGrid } from "@/components/ui";

type Props = { params: Promise<{ teamId: string }>; searchParams: Promise<SearchParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const team = await findTeam((await params).teamId);
  return { title: team ? `${team.label} · Teams · Criclysis` : "Team not found · Criclysis" };
}

function PhaseTable({ rows, caption }: { rows: PhaseRow[]; caption: string }) {
  if (!rows.length) return <Muted>No phase records.</Muted>;
  return (
    <TableWrap caption={caption}>
      <thead>
        <tr>
          <th scope="col">Phase</th>
          <th scope="col" className="num">Innings</th>
          <th scope="col" className="num">Balls</th>
          <th scope="col" className="num">Runs</th>
          <th scope="col" className="num">Wkts</th>
          <th scope="col" className="num">Run rate</th>
          <th scope="col" className="num">Balls/wkt</th>
          <th scope="col" className="num">Dot %</th>
          <th scope="col" className="num">4s+6s %</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const x = phaseRates(r);
          return (
            <tr key={r.phase}>
              <th scope="row" className="!font-normal">{r.label}</th>
              <td className="num">{int(r.innings)}</td>
              <td className="num">{int(r.balls)}</td>
              <td className="num">{int(r.runs)}</td>
              <td className="num">{int(r.wickets)}</td>
              <td className="num font-semibold">{num(x.runsPerOver)}</td>
              <td className="num">{num(x.ballsPerWicket, 1)}</td>
              <td className="num">{pct(x.dotPct)}</td>
              <td className="num">{pct(x.boundaryPct)}</td>
            </tr>
          );
        })}
      </tbody>
    </TableWrap>
  );
}

/** Won, lost and everything else as one thin bar; the numbers are in the same row, so the bar is decoration. */
function RecordBar({ r }: { r: Pick<Record5, "matches" | "won" | "lost"> }) {
  if (!r.matches) return null;
  const w = (100 * r.won) / r.matches;
  const l = (100 * r.lost) / r.matches;
  return (
    <span aria-hidden="true" className="mt-1.5 flex h-1.5 w-full max-w-40 overflow-hidden rounded-full bg-surface-3">
      <span className="wipe h-full" style={{ width: `${w}%`, background: "var(--chart-3)" }} />
      <span className="wipe h-full" style={{ width: `${l}%`, background: "var(--chart-2)" }} />
    </span>
  );
}

type Outcome = { letter: "W" | "L" | "T" | "D" | "NR"; word: string };

/** This side's result in a match, from the official result only. */
function outcome(m: MatchRow, teamId: string): Outcome {
  const r = m.result;
  if (r.type === "win") return r.winnerId === teamId ? { letter: "W", word: "Won" } : { letter: "L", word: "Lost" };
  if (r.type === "tie") return { letter: "T", word: "Tied" };
  if (r.type === "draw") return { letter: "D", word: "Drawn" };
  return { letter: "NR", word: "No result" };
}

const OUTCOME_TONE: Record<Outcome["letter"], string> = {
  W: "bg-positive text-bg",
  L: "bg-negative text-bg",
  T: "bg-surface-3 text-fg",
  D: "bg-surface-3 text-fg",
  NR: "bg-surface-3 text-muted",
};

/** The last results as a broadcast form guide, newest first. */
function FormGuide({ matches, teamId }: { matches: MatchRow[]; teamId: string }) {
  if (!matches.length) return <p className="text-sm text-muted">No matches in this format.</p>;
  return (
    <ol className="grid grid-cols-5 gap-2" aria-label="Recent results, newest first">
      {matches.map((m) => {
        const o = outcome(m, teamId);
        const opp = m.team1Id === teamId ? m.team2 : m.team1;
        const mark = teamMark(opp);
        return (
          <li key={m.id}>
            <Link href={`/matches/${m.id}`} className="group flex min-h-10 flex-col items-center gap-1.5 rounded-control p-1 hover:bg-surface-2">
              <span className={`score grid h-10 w-full place-items-center rounded-[0.375rem] text-xl transition-transform motion-safe:group-hover:-translate-y-0.5 ${OUTCOME_TONE[o.letter]}`}>
                <span aria-hidden="true">{o.letter}</span>
              </span>
              <span aria-hidden="true" className="flex items-center gap-1 font-display text-xs font-semibold uppercase tracking-[0.04em] text-muted">
                <Flag mark={mark} size="xs" />
                {mark.code}
              </span>
              <span className="sr-only">
                {o.word} against {opp}, {date(m.endDate)}
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

async function TeamBody({ teamId, fmt, label }: { teamId: string; fmt: Fmt; label: string }) {
  const [t, meta] = await Promise.all([getTeam(teamId, fmt), getDatasetMeta()]);
  if (!t) {
    return <EmptyState title="No records for this team yet">Cricsheet has no completed matches for {label} in this build.</EmptyState>;
  }
  const minM = meta?.thresholds.teamMinMatches ?? 5;
  const minInn = meta?.thresholds.venueMinInnings ?? 3;
  const d = t.detail;
  const avg = (x: { n: number; avg: number | null }) => (x.n >= minInn ? num(x.avg, 1) : DASH);
  const toss = tossWinPcts(d.toss, t.record, minM);
  const years = [...d.byYear].sort((a, b) => String(a.year).localeCompare(String(b.year))).map((y) => ({ year: y.year, won: y.won, lost: y.lost, other: y.tied + y.drawn + y.noResult, matches: y.matches }));
  const venueMax = Math.max(1, ...d.venues.map((v) => v.record.matches));

  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section aria-labelledby="results-chart-title" className="card p-4 sm:p-5">
          <h2 id="results-chart-title" className="font-display text-xl font-bold uppercase tracking-[0.03em]">
            Results by year
          </h2>
          <p className="mb-3 text-xs text-muted">Matches won, lost and otherwise in each calendar year. Counts, not percentages: some years have only a few matches.</p>
          {years.length ? (
            <ChartFrame
              label={`Stacked bar chart of ${label}'s results by year: ${years.map((y) => `${y.year} won ${y.won}, lost ${y.lost}, other ${y.other}`).join("; ")}.`}
              tableId="years-table"
              className="h-64"
            >
              <ResultsByYear data={years} />
            </ChartFrame>
          ) : (
            <p className="text-sm text-muted">No yearly records.</p>
          )}
        </section>
        <section aria-labelledby="form-title" className="card p-4 sm:p-5">
          <h2 id="form-title" className="font-display text-xl font-bold uppercase tracking-[0.03em]">
            Form guide
          </h2>
          <p className="mb-4 text-xs text-muted">The last {plural(t.recent.length, "result")} in this format, newest first.</p>
          <FormGuide matches={t.recent} teamId={teamId} />
          <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
            <div>
              <dt className="label">Tosses won</dt>
              <dd className="score mt-1 text-3xl">{int(d.toss.won)}</dd>
              <dd className="text-xs text-muted">of {plural(d.toss.won + d.toss.lost, "toss", "tosses")}</dd>
            </div>
            <div>
              <dt className="label">Win % after</dt>
              <dd className="mt-1 text-sm">
                winning the toss <span className="font-semibold">{toss.won}</span>
              </dd>
              <dd className="text-sm">
                losing it <span className="font-semibold">{toss.lost}</span>
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <Section id="record" title="Record" sub={`Win % = won / (won + lost + tied + drawn), shown from ${minM} of those decided matches.`}>
        <TableWrap caption="Record by venue, innings order and toss">
          <thead>
            <RecordHeads first="" />
          </thead>
          <tbody>
            <tr>
              <th scope="row">Overall</th>
              <RecordCells r={t.record} minMatches={minM} />
            </tr>
            <tr>
              <th scope="row" className="!font-normal">At home</th>
              <RecordCells r={d.venueType.home} minMatches={minM} />
            </tr>
            <tr>
              <th scope="row" className="!font-normal">Away</th>
              <RecordCells r={d.venueType.away} minMatches={minM} />
            </tr>
            <tr>
              <th scope="row" className="!font-normal">Neutral venues</th>
              <RecordCells r={d.venueType.neutral} minMatches={minM} />
            </tr>
            {d.venueType.unknown.matches ? (
              <tr>
                <th scope="row" className="!font-normal">Venue country unknown</th>
                <RecordCells r={d.venueType.unknown} minMatches={minM} />
              </tr>
            ) : null}
            <tr>
              <th scope="row" className="!font-normal">Batting first</th>
              <RecordCells r={d.batFirstChase.battingFirst} minMatches={minM} />
            </tr>
            <tr>
              <th scope="row" className="!font-normal">Chasing</th>
              <RecordCells r={d.batFirstChase.chasing} minMatches={minM} />
            </tr>
            <tr>
              <th scope="row" className="!font-normal">Won the toss, chose to bat</th>
              <RecordCells r={d.toss.decisions.bat} minMatches={minM} />
            </tr>
            <tr>
              <th scope="row" className="!font-normal">Won the toss, chose to field</th>
              <RecordCells r={d.toss.decisions.field} minMatches={minM} />
            </tr>
          </tbody>
        </TableWrap>
        <p className="mt-3 text-sm text-muted">
          Tosses won {int(d.toss.won)}, lost {int(d.toss.lost)}. Win % after winning the toss {toss.won}; after losing it {toss.lost}.
        </p>
      </Section>

      <Section
        id="h2h"
        title="Head to head"
        sub={
          <>
            Against every opponent in this format, most-played first. The bar under each name shows{" "}
            <span className="whitespace-nowrap">
              <span aria-hidden="true" className="mr-1 inline-block h-2 w-3 rounded-[2px] align-middle" style={{ background: "var(--chart-3)" }} />
              won
            </span>{" "}
            and{" "}
            <span className="whitespace-nowrap">
              <span aria-hidden="true" className="mr-1 inline-block h-2 w-3 rounded-[2px] align-middle" style={{ background: "var(--chart-2)" }} />
              lost
            </span>{" "}
            as shares of the matches played.
          </>
        }
      >
        {d.headToHead.length ? (
          <TableWrap caption="Head to head">
            <thead>
              <RecordHeads first="Opponent" />
            </thead>
            <tbody>
              {d.headToHead.map((h) => (
                <tr key={h.opponentId}>
                  <th scope="row">
                    <Link href={`/teams/${teamId}/vs/${h.opponentId}${qs({ f: fmt })}`} className="link-quiet inline-flex items-center gap-2 font-semibold">
                      <Flag mark={teamMark(h.opponent)} size="sm" />
                      {h.opponent}
                    </Link>
                    <RecordBar r={h} />
                    <span className="mt-1 block text-xs font-normal text-muted">last met {date(h.lastDate)}</span>
                  </th>
                  <RecordCells r={h} minMatches={minM} />
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : (
          <Muted>No opponents recorded.</Muted>
        )}
      </Section>

      <Section id="years" title="By year">
        {d.byYear.length ? (
          <div id="years-table" tabIndex={-1}>
            <TableWrap caption="Record by year">
              <thead>
                <RecordHeads first="Year" />
              </thead>
              <tbody>
                {d.byYear.map((y) => (
                  <tr key={y.year}>
                    <th scope="row">{y.year}</th>
                    <RecordCells r={y} minMatches={minM} />
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </div>
        ) : (
          <Muted>No yearly records.</Muted>
        )}
      </Section>

      <Section id="phases" title="Scoring by phase" sub="Team totals including extras, on legal balls.">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div>
            <h3 className="mb-3 font-display text-lg font-bold uppercase tracking-[0.03em]">Batting</h3>
            <PhaseTable rows={d.phases.batting} caption="Batting by phase" />
          </div>
          <div>
            <h3 className="mb-3 font-display text-lg font-bold uppercase tracking-[0.03em]">Bowling</h3>
            <PhaseTable rows={d.phases.bowling} caption="Bowling by phase" />
          </div>
        </div>
      </Section>

      <Section id="venues" title="Venues" sub={`Grounds by matches played. First-innings averages are shown from ${minInn} innings; the number of innings is in brackets.`}>
        {d.venues.length ? (
          <TableWrap caption="Venues">
            <thead>
              <tr>
                <th scope="col">Venue</th>
                <th scope="col" className="num">Mat</th>
                <th scope="col" className="num">Won</th>
                <th scope="col" className="num">1st-inns avg (all sides)</th>
                <th scope="col" className="num">1st-inns avg ({t.team.label})</th>
              </tr>
            </thead>
            <tbody>
              {d.venues.map((v) => (
                <tr key={v.venueKey}>
                  <th scope="row" className="!font-normal">
                    <span className="font-semibold">{v.name}</span>
                    <span className="block text-xs text-muted">{[v.city, v.country].filter(Boolean).join(", ")}</span>
                    <span aria-hidden="true" className="mt-1.5 block h-1 max-w-40 rounded-full bg-surface-3">
                      <span className="wipe block h-1 rounded-full" style={{ width: `${(100 * v.record.matches) / venueMax}%`, background: "var(--team-line)" }} />
                    </span>
                  </th>
                  <td className="num font-semibold">{int(v.record.matches)}</td>
                  <td className="num">{int(v.record.won)}</td>
                  <td className="num">
                    {avg(v.firstInnings)} <span className="text-xs text-muted">({v.firstInnings.n})</span>
                  </td>
                  <td className="num">
                    {avg(v.teamFirstInnings)} <span className="text-xs text-muted">({v.teamFirstInnings.n})</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : (
          <Muted>No venue records.</Muted>
        )}
      </Section>

      <Section id="players" title="Leading players" sub={`For ${t.team.label} only, in this format.`}>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {d.topBatters.length ? (
            <TableWrap caption="Top batters">
              <thead>
                <tr>
                  <th scope="col">Batter</th>
                  <th scope="col" className="num">Inns</th>
                  <th scope="col" className="num">Runs</th>
                  <th scope="col" className="num">Avg</th>
                  <th scope="col" className="num">100/50</th>
                  <th scope="col" className="num">HS</th>
                </tr>
              </thead>
              <tbody>
                {d.topBatters.map((b) => (
                  <tr key={b.playerId}>
                    <th scope="row" className="!font-normal">
                      {b.slug ? (
                        <Link href={`/players/${b.slug}${qs({ f: fmt })}`} className="link-quiet">
                          {b.name}
                        </Link>
                      ) : (
                        b.name
                      )}
                    </th>
                    <td className="num">{int(b.innings)}</td>
                    <td className="num font-semibold">{int(b.runs)}</td>
                    <td className="num">{b.outs ? num(b.runs / b.outs) : DASH}</td>
                    <td className="num">
                      {b.hundreds}/{b.fifties}
                    </td>
                    <td className="num">{int(b.highest)}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          ) : (
            <Muted>No batting records.</Muted>
          )}
          {d.topBowlers.length ? (
            <TableWrap caption="Top bowlers">
              <thead>
                <tr>
                  <th scope="col">Bowler</th>
                  <th scope="col" className="num">Inns</th>
                  <th scope="col" className="num">Wkts</th>
                  <th scope="col" className="num">Avg</th>
                  <th scope="col" className="num">Econ</th>
                  <th scope="col" className="num">5w</th>
                </tr>
              </thead>
              <tbody>
                {d.topBowlers.map((b) => (
                  <tr key={b.playerId}>
                    <th scope="row" className="!font-normal">
                      {b.slug ? (
                        <Link href={`/players/${b.slug}${qs({ f: fmt })}`} className="link-quiet">
                          {b.name}
                        </Link>
                      ) : (
                        b.name
                      )}
                    </th>
                    <td className="num">{int(b.innings)}</td>
                    <td className="num font-semibold">{int(b.wickets)}</td>
                    <td className="num">{b.wickets ? num(b.runsConceded / b.wickets) : DASH}</td>
                    <td className="num">{b.balls ? num((6 * b.runsConceded) / b.balls) : DASH}</td>
                    <td className="num">{int(b.fiveWickets)}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          ) : (
            <Muted>No bowling records.</Muted>
          )}
        </div>
      </Section>

      <Section id="recent" title="Recent results" sub={`The last ${plural(t.recent.length, "match", "matches")} in this format.`}>
        <MatchGrid matches={t.recent} empty="No matches in this format." />
        <p className="mt-4">
          <Link href={genderHref("/matches", t.team.gender, { team: teamId, format: fmt })} className="btn-secondary">
            All {t.team.label} matches <span aria-hidden="true">→</span>
          </Link>
        </p>
      </Section>
    </>
  );
}

export default async function TeamPage({ params, searchParams }: Props) {
  const [{ teamId }, sp] = await Promise.all([params, searchParams]);
  // Existence first, before any Suspense boundary streams, so an unknown team is a real 404.
  const [team, meta] = await Promise.all([findTeam(teamId), getDatasetMeta()]);
  if (!team) notFound();
  const fmt = pickFormat(team, fmtParam(sp.f));
  const fmts = FMTS.filter((f) => team.formats[f]);
  const minM = meta?.thresholds.teamMinMatches ?? 5;
  const rec = fmt ? team.formats[fmt] : undefined;
  const fk = fmt ? formatKey(fmt, team.gender) : null;
  const mark = teamMark(team.name);
  const other = rec ? rec.tied + rec.drawn + rec.noResult : 0;

  return (
    <div style={teamVars(mark) as CSSProperties}>
      <TeamBand mark={mark} ground label={`${team.label}, ${team.gender === "female" ? "women's" : "men's"} team`}>
        <Link href={genderHref("/teams", team.gender)} className="-ml-1 mb-4 inline-flex min-h-10 items-center gap-1.5 rounded-control px-1 font-display text-sm font-semibold uppercase tracking-[0.06em] underline-offset-4 hover:underline">
          <span aria-hidden="true">←</span> All teams
        </Link>
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <Flag mark={mark} size="2xl" label className="rise shadow-[0_14px_30px_-12px_rgb(0_0_0/0.6)] max-sm:hidden" />
          <Flag mark={mark} size="xl" label className="rise shadow-[0_14px_30px_-12px_rgb(0_0_0/0.6)] sm:hidden" />
          <div className="min-w-0">
            <p className="rise font-display text-sm font-bold uppercase tracking-[0.1em] sm:text-base">
              {fk ? formatKeyLabel(fk) : team.gender === "female" ? "Women's team" : "Men's team"} · {mark.code}
            </p>
            <h1 className="rise rise-1 mt-1 text-title text-balance">{team.label}</h1>
          </div>
        </div>
        {rec && fk ? (
          <p className="rise rise-2 mt-4 max-w-2xl text-base font-medium">
            {formatKeyLabel(fk)} matches in the data from {date(rec.first)} to {date(rec.last)}: {record(rec, minM)}.
          </p>
        ) : null}
        {fmts.length > 1 ? (
          <div className="rise rise-3 mt-6 theme-dark">
            <FormatTabs formats={fmts} active={fmt} href={(f) => `/teams/${teamId}${qs({ f })}`} />
          </div>
        ) : null}
      </TeamBand>

      <div className="page">
        <DataCredit className="-mt-2 mb-6" />
        {rec && fk ? (
          <section aria-labelledby="record-tiles-title" className="mb-8">
            <h2 id="record-tiles-title" className="sr-only">
              {formatKeyLabel(fk)} record
            </h2>
            <StatGrid accent="var(--team-line)" className="lg:grid-cols-5 [&_.score]:text-[2.75rem] sm:[&_.score]:text-[3.25rem]">
              <Stat label="Matches" value={int(rec.matches)} sample={`${date(rec.first)} to ${date(rec.last)}`} />
              <Stat label="Won" value={int(rec.won)} sample={`of ${plural(rec.matches, "match", "matches")}`} />
              <Stat label="Lost" value={int(rec.lost)} sample={`of ${plural(rec.matches, "match", "matches")}`} />
              <Stat
                label="Win %"
                value={winPct(rec, minM)}
                sample={decided(rec) >= minM ? `of ${plural(decided(rec), "decided match", "decided matches")}` : `shown from ${minM} decided matches`}
              />
              <Stat label="Tied, drawn, no result" value={int(other)} sample={`${int(rec.tied)} tied · ${int(rec.drawn)} drawn · ${int(rec.noResult)} NR`} />
            </StatGrid>
          </section>
        ) : null}
        {fmt ? (
          <Suspense
            key={fmt}
            fallback={
              <div className="space-y-10">
                <SectionSkeleton label={`Loading ${team.label}'s record`} height="h-72" />
                <TableSkeleton label="Loading the record table" rows={9} cols={8} />
              </div>
            }
          >
            <TeamBody teamId={teamId} fmt={fmt} label={team.label} />
          </Suspense>
        ) : (
          <EmptyState title="No records for this team yet">Cricsheet has no completed matches for {team.label} in this build.</EmptyState>
        )}
      </div>
    </div>
  );
}
