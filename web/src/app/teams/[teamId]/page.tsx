import Link from "next/link";
import { notFound } from "next/navigation";
import { getDatasetMeta, getTeam } from "@/lib/data";
import { fmtOfKey } from "@/lib/data/rows";
import { DASH, date, formatKeyLabel, genderWord, int, num, pct, plural, record } from "@/lib/format";
import { phaseRates } from "@/lib/metrics";
import { fmtParam, qs, type SearchParams } from "@/lib/params";
import type { PhaseRow } from "@/lib/contract/pipeline";
import { FormatTabs, MatchGrid, Muted, PageHeader, RecordCells, RecordHeads, Section, TableWrap } from "@/components/data";

function PhaseTable({ rows, caption }: { rows: PhaseRow[]; caption: string }) {
  if (!rows.length) return <Muted>No phase records.</Muted>;
  return (
    <TableWrap caption={caption}>
      <thead>
        <tr>
          <th scope="col">Phase</th>
          <th scope="col" className="text-right">Innings</th>
          <th scope="col" className="text-right">Balls</th>
          <th scope="col" className="text-right">Runs</th>
          <th scope="col" className="text-right">Wkts</th>
          <th scope="col" className="text-right">Run rate</th>
          <th scope="col" className="text-right">Balls/wkt</th>
          <th scope="col" className="text-right">Dot %</th>
          <th scope="col" className="text-right">4s+6s %</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const x = phaseRates(r);
          return (
            <tr key={r.phase}>
              <th scope="row" className="font-normal">{r.label}</th>
              <td className="text-right tabular-nums">{int(r.innings)}</td>
              <td className="text-right tabular-nums">{int(r.balls)}</td>
              <td className="text-right tabular-nums">{int(r.runs)}</td>
              <td className="text-right tabular-nums">{int(r.wickets)}</td>
              <td className="text-right tabular-nums">{num(x.runsPerOver)}</td>
              <td className="text-right tabular-nums">{num(x.ballsPerWicket, 1)}</td>
              <td className="text-right tabular-nums">{pct(x.dotPct)}</td>
              <td className="text-right tabular-nums">{pct(x.boundaryPct)}</td>
            </tr>
          );
        })}
      </tbody>
    </TableWrap>
  );
}

export default async function TeamPage({ params, searchParams }: { params: Promise<{ teamId: string }>; searchParams: Promise<SearchParams> }) {
  const [{ teamId }, sp] = await Promise.all([params, searchParams]);
  const [t, meta] = await Promise.all([getTeam(teamId, fmtParam(sp.f)), getDatasetMeta()]);
  if (!t) notFound();
  const fmt = fmtOfKey(t.formatKey);
  const minM = meta?.thresholds.teamMinMatches ?? 5;
  const minInn = meta?.thresholds.venueMinInnings ?? 3;
  const d = t.detail;
  const avg = (x: { n: number; avg: number | null }) => (x.n >= minInn ? num(x.avg, 1) : DASH);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
      <Link href="/teams" className="text-sm text-[#0071e3]">← All teams</Link>
      <div className="mt-4">
        <PageHeader
          eyebrow={`${genderWord(t.team.gender)} · ${formatKeyLabel(t.formatKey)}`}
          title={t.team.label}
          sub={`${formatKeyLabel(t.formatKey)} matches in the data from ${date(t.span.first)} to ${date(t.span.last)}: ${record(t.record, minM)}.`}
        />
      </div>
      <FormatTabs formats={t.formats} active={fmt} href={(f) => `/teams/${teamId}${qs({ f })}`} />

      <Section title="Record" sub={`Win percentage = won / (won + lost + tied + drawn), shown from ${minM} matches.`}>
        <TableWrap caption="Record">
          <thead><RecordHeads first="" /></thead>
          <tbody>
            <tr><th scope="row">Overall</th><RecordCells r={t.record} minMatches={minM} /></tr>
            <tr><th scope="row" className="font-normal">At home</th><RecordCells r={d.venueType.home} minMatches={minM} /></tr>
            <tr><th scope="row" className="font-normal">Away</th><RecordCells r={d.venueType.away} minMatches={minM} /></tr>
            <tr><th scope="row" className="font-normal">Neutral venues</th><RecordCells r={d.venueType.neutral} minMatches={minM} /></tr>
            {d.venueType.unknown.matches ? <tr><th scope="row" className="font-normal">Venue country unknown</th><RecordCells r={d.venueType.unknown} minMatches={minM} /></tr> : null}
            <tr><th scope="row" className="font-normal">Batting first</th><RecordCells r={d.batFirstChase.battingFirst} minMatches={minM} /></tr>
            <tr><th scope="row" className="font-normal">Chasing</th><RecordCells r={d.batFirstChase.chasing} minMatches={minM} /></tr>
            <tr><th scope="row" className="font-normal">Won the toss, chose to bat</th><RecordCells r={d.toss.decisions.bat} minMatches={minM} /></tr>
            <tr><th scope="row" className="font-normal">Won the toss, chose to field</th><RecordCells r={d.toss.decisions.field} minMatches={minM} /></tr>
          </tbody>
        </TableWrap>
        <p className="mt-2 text-sm text-[#6e6e73]">
          Tosses won {d.toss.won}, lost {d.toss.lost}. Win % after winning the toss {d.toss.won >= minM ? pct(d.toss.winPctWonToss) : DASH}; after losing it{" "}
          {d.toss.lost >= minM ? pct(d.toss.winPctLostToss) : DASH}.
        </p>
      </Section>

      <Section title="Head to head" sub="Against every opponent in this format, most-played first.">
        {d.headToHead.length ? (
          <TableWrap caption="Head to head">
            <thead><RecordHeads first="Opponent" /></thead>
            <tbody>
              {d.headToHead.map((h) => (
                <tr key={h.opponentId}>
                  <th scope="row">
                    <Link href={`/teams/${teamId}/vs/${h.opponentId}${qs({ f: fmt })}`} className="font-medium hover:text-[#0071e3]">{h.opponent}</Link>
                    <span className="block text-xs font-normal text-[#6e6e73]">last met {date(h.lastDate)}</span>
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

      <Section title="By year">
        {d.byYear.length ? (
          <TableWrap caption="By year">
            <thead><RecordHeads first="Year" /></thead>
            <tbody>
              {d.byYear.map((y) => (
                <tr key={y.year}><th scope="row">{y.year}</th><RecordCells r={y} minMatches={minM} /></tr>
              ))}
            </tbody>
          </TableWrap>
        ) : (
          <Muted>No yearly records.</Muted>
        )}
      </Section>

      <Section title="Scoring by phase" sub="Team totals including extras, on legal balls.">
        <div className="space-y-6">
          <h3 className="font-semibold">Batting</h3>
          <PhaseTable rows={d.phases.batting} caption="Batting by phase" />
          <h3 className="font-semibold">Bowling</h3>
          <PhaseTable rows={d.phases.bowling} caption="Bowling by phase" />
        </div>
      </Section>

      <Section title="Venues" sub={`First-innings averages are shown from ${minInn} innings.`}>
        {d.venues.length ? (
          <TableWrap caption="Venues">
            <thead>
              <tr>
                <th scope="col">Venue</th>
                <th scope="col" className="text-right">Mat</th>
                <th scope="col" className="text-right">Won</th>
                <th scope="col" className="text-right">1st-inns avg (all sides)</th>
                <th scope="col" className="text-right">1st-inns avg ({t.team.label})</th>
              </tr>
            </thead>
            <tbody>
              {d.venues.map((v) => (
                <tr key={v.venueKey}>
                  <th scope="row" className="font-normal">{v.name}<span className="block text-xs text-[#6e6e73]">{[v.city, v.country].filter(Boolean).join(", ")}</span></th>
                  <td className="text-right tabular-nums">{int(v.record.matches)}</td>
                  <td className="text-right tabular-nums">{int(v.record.won)}</td>
                  <td className="text-right tabular-nums">{avg(v.firstInnings)} <span className="text-xs text-[#6e6e73]">({v.firstInnings.n})</span></td>
                  <td className="text-right tabular-nums">{avg(v.teamFirstInnings)} <span className="text-xs text-[#6e6e73]">({v.teamFirstInnings.n})</span></td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : (
          <Muted>No venue records.</Muted>
        )}
      </Section>

      <Section title="Leading players" sub={`For ${t.team.label} only, in this format.`}>
        <div className="grid gap-6 lg:grid-cols-2">
          {d.topBatters.length ? (
            <TableWrap caption="Top batters">
              <thead>
                <tr><th scope="col">Batter</th><th scope="col" className="text-right">Inns</th><th scope="col" className="text-right">Runs</th><th scope="col" className="text-right">Avg</th><th scope="col" className="text-right">100/50</th><th scope="col" className="text-right">HS</th></tr>
              </thead>
              <tbody>
                {d.topBatters.map((b) => (
                  <tr key={b.playerId}>
                    <th scope="row" className="font-normal">{b.slug ? <Link href={`/players/${b.slug}${qs({ f: fmt })}`} className="hover:text-[#0071e3]">{b.name}</Link> : b.name}</th>
                    <td className="text-right tabular-nums">{int(b.innings)}</td>
                    <td className="text-right font-medium tabular-nums">{int(b.runs)}</td>
                    <td className="text-right tabular-nums">{b.outs ? num(b.runs / b.outs) : DASH}</td>
                    <td className="text-right tabular-nums">{b.hundreds}/{b.fifties}</td>
                    <td className="text-right tabular-nums">{int(b.highest)}</td>
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
                <tr><th scope="col">Bowler</th><th scope="col" className="text-right">Inns</th><th scope="col" className="text-right">Wkts</th><th scope="col" className="text-right">Avg</th><th scope="col" className="text-right">Econ</th><th scope="col" className="text-right">5w</th></tr>
              </thead>
              <tbody>
                {d.topBowlers.map((b) => (
                  <tr key={b.playerId}>
                    <th scope="row" className="font-normal">{b.slug ? <Link href={`/players/${b.slug}${qs({ f: fmt })}`} className="hover:text-[#0071e3]">{b.name}</Link> : b.name}</th>
                    <td className="text-right tabular-nums">{int(b.innings)}</td>
                    <td className="text-right font-medium tabular-nums">{int(b.wickets)}</td>
                    <td className="text-right tabular-nums">{b.wickets ? num(b.runsConceded / b.wickets) : DASH}</td>
                    <td className="text-right tabular-nums">{b.balls ? num((6 * b.runsConceded) / b.balls) : DASH}</td>
                    <td className="text-right tabular-nums">{int(b.fiveWickets)}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          ) : (
            <Muted>No bowling records.</Muted>
          )}
        </div>
      </Section>

      <Section title="Recent results" sub={`The last ${plural(t.recent.length, "match", "matches")} in this format.`}>
        <MatchGrid matches={t.recent} empty="No matches in this format." />
        <p className="mt-4 text-sm">
          <Link href={`/matches${qs({ team: teamId, format: fmt })}`} className="text-[#0071e3] hover:underline">All {t.team.label} matches →</Link>
        </p>
      </Section>
    </div>
  );
}
