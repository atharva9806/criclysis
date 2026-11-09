import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { formatKey, type Fmt, type PhaseRow } from "@/lib/contract/pipeline";
import { getDatasetMeta, getTeam } from "@/lib/data";
import { FMTS, findTeam, pickFormat } from "../lookup";
import { DASH, date, decided, formatKeyLabel, int, num, pct, plural, record, tossWinPcts, winPct } from "@/lib/format";
import { phaseRates } from "@/lib/metrics";
import { fmtParam, qs, type SearchParams } from "@/lib/params";
import { FormatTabs, MatchGrid, Muted, PageHeader, RecordCells, RecordHeads, Section, TableWrap, genderHref } from "@/components/data";
import { SectionSkeleton, TableSkeleton } from "@/components/Loading";
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
  const r = t.record;

  return (
    <>
      <StatGrid>
        <Stat label="Matches" value={int(r.matches)} sample={`${date(t.span.first)} to ${date(t.span.last)}`} />
        <Stat label="Won" value={int(r.won)} sample={`Lost ${int(r.lost)}${r.tied ? ` · tied ${int(r.tied)}` : ""}${r.drawn ? ` · drawn ${int(r.drawn)}` : ""}`} />
        <Stat label="Win %" value={winPct(r, minM)} sample={decided(r) >= minM ? `of ${plural(decided(r), "decided match", "decided matches")}` : `Shown from ${minM} decided matches`} />
        <Stat label="Tosses won" value={int(d.toss.won)} sample={`of ${plural(d.toss.won + d.toss.lost, "toss", "tosses")}`} />
      </StatGrid>

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

      <Section id="h2h" title="Head to head" sub="Against every opponent in this format, most-played first.">
        {d.headToHead.length ? (
          <TableWrap caption="Head to head">
            <thead>
              <RecordHeads first="Opponent" />
            </thead>
            <tbody>
              {d.headToHead.map((h) => (
                <tr key={h.opponentId}>
                  <th scope="row">
                    <Link href={`/teams/${teamId}/vs/${h.opponentId}${qs({ f: fmt })}`} className="link-quiet">
                      {h.opponent}
                    </Link>
                    <span className="block text-xs font-normal text-muted">last met {date(h.lastDate)}</span>
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
        ) : (
          <Muted>No yearly records.</Muted>
        )}
      </Section>

      <Section id="phases" title="Scoring by phase" sub="Team totals including extras, on legal balls.">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div>
            <h3 className="mb-3 font-semibold">Batting</h3>
            <PhaseTable rows={d.phases.batting} caption="Batting by phase" />
          </div>
          <div>
            <h3 className="mb-3 font-semibold">Bowling</h3>
            <PhaseTable rows={d.phases.bowling} caption="Bowling by phase" />
          </div>
        </div>
      </Section>

      <Section id="venues" title="Venues" sub={`First-innings averages are shown from ${minInn} innings; the number of innings is in brackets.`}>
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
                    {v.name}
                    <span className="block text-xs text-muted">{[v.city, v.country].filter(Boolean).join(", ")}</span>
                  </th>
                  <td className="num">{int(v.record.matches)}</td>
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

  return (
    <div className="page">
      <PageHeader
        back={{ href: genderHref("/teams", team.gender), label: "All teams" }}
        eyebrow={fk ? formatKeyLabel(fk) : team.gender === "female" ? "Women's team" : "Men's team"}
        title={team.label}
        sub={rec && fk ? `${formatKeyLabel(fk)} matches in the data from ${date(rec.first)} to ${date(rec.last)}: ${record(rec, minM)}.` : undefined}
        actions={<FormatTabs formats={fmts} active={fmt} href={(f) => `/teams/${teamId}${qs({ f })}`} />}
      />
      {fmt ? (
        <Suspense
          key={fmt}
          fallback={
            <div className="space-y-10">
              <SectionSkeleton label={`Loading ${team.label}'s record`} height="h-28" />
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
  );
}
