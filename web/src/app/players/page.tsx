import Link from "next/link";
import { getDatasetMeta, listPlayers, listTeams } from "@/lib/data";
import { FORMAT_LABEL, formatKeyLabel, int, num } from "@/lib/format";
import { fmtParam, genderParam, genderSlug, intParam, qs, roleParam, sortParam, str, type SearchParams } from "@/lib/params";
import type { FormatKey } from "@/lib/contract/pipeline";
import { Muted, PageHeader, Pagination, Select, TableWrap } from "@/components/data";

const SORT_LABEL = { runs: "Runs", wickets: "Wickets", batAvg: "Batting average", batSr: "Strike rate", bowlAvg: "Bowling average", econ: "Economy", name: "Name" };

export default async function PlayersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const q = {
    search: str(sp.q),
    gender: genderParam(sp.gender),
    format: fmtParam(sp.format),
    teamId: str(sp.team),
    role: roleParam(sp.role),
    sort: sortParam(sp.sort) ?? "runs",
    page: intParam(sp.page) ?? 1,
  };
  const [result, teams, meta] = await Promise.all([listPlayers(q), listTeams(q.gender), getDatasetMeta()]);
  const genders = [...new Set(Object.values(meta?.formats ?? {}).map((f) => f.gender))];
  const params = { q: q.search, gender: q.gender && genderSlug(q.gender), format: q.format, team: q.teamId, role: q.role, sort: q.sort };
  const scope = q.format ? (q.gender ? formatKeyLabel(`${q.format}-${q.gender === "female" ? "w" : "m"}` as FormatKey) : FORMAT_LABEL[q.format]) : "All formats combined";

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
      <PageHeader eyebrow="Players" title="Every international cricketer in the data." sub="Search and sort career records built from Cricsheet ball-by-ball data. Totals cover only matches with ball-by-ball records." />

      <form method="get" action="/players" className="card flex flex-wrap items-end gap-3 p-4">
        <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs font-medium text-[#6e6e73]">
          Name
          <input name="q" defaultValue={q.search ?? ""} placeholder="e.g. Kohli" className="rounded-full bg-[#e8e8ed] px-4 py-2.5 text-sm text-[#1d1d1f]" />
        </label>
        {genders.length > 1 ? (
          <Select name="gender" label="Gender" value={params.gender} options={[["", "All"], ["men", "Men"], ["women", "Women"]]} />
        ) : null}
        <Select name="format" label="Format" value={q.format} options={[["", "All formats"], ["test", "Test"], ["odi", "ODI"], ["t20i", "T20I"]]} />
        <Select name="role" label="Role" value={q.role} options={[["", "All roles"], ["batter", "Batters"], ["bowler", "Bowlers"], ["allrounder", "All-rounders"], ["wicketkeeper", "Wicketkeepers"]]} />
        {teams.length ? <Select name="team" label="Team" value={q.teamId} options={[["", "All teams"], ...teams.map((t) => [t.id, t.label] as [string, string])]} /> : null}
        <Select name="sort" label="Sort by" value={q.sort} options={Object.entries(SORT_LABEL) as [string, string][]} />
        <button type="submit" className="btn-primary">Apply</button>
      </form>

      <p className="mt-4 text-sm text-[#6e6e73]">
        {int(result.total)} players · {scope}
        {result.minBalls ? ` · sorted by ${SORT_LABEL[q.sort].toLowerCase()} among players with at least ${int(result.minBalls)} balls` : ""}
      </p>

      <div className="mt-4">
        {result.rows.length ? (
          <TableWrap caption="Players">
            <thead>
              <tr>
                <th scope="col">Player</th>
                <th scope="col" className="text-right">Mat</th>
                <th scope="col" className="text-right">Inns</th>
                <th scope="col" className="text-right">Runs</th>
                <th scope="col" className="text-right">Avg</th>
                <th scope="col" className="text-right">SR</th>
                <th scope="col" className="text-right">100s</th>
                <th scope="col" className="text-right">HS</th>
                <th scope="col" className="text-right">Wkts</th>
                <th scope="col" className="text-right">Bowl avg</th>
                <th scope="col" className="text-right">Econ</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r) => (
                <tr key={r.slug}>
                  <td>
                    <Link href={`/players/${r.slug}${qs({ f: q.format })}`} className="font-semibold hover:text-[#0071e3]">
                      {r.name}
                    </Link>
                    <span className="block text-xs text-[#6e6e73]">
                      {[r.teams.join(", ") || r.country, r.role].filter(Boolean).join(" · ")}
                    </span>
                  </td>
                  <td className="text-right tabular-nums">{int(r.matches)}</td>
                  <td className="text-right tabular-nums">{int(r.batInnings)}</td>
                  <td className="text-right font-medium tabular-nums">{int(r.runs)}</td>
                  <td className="text-right tabular-nums">{num(r.batAvg)}</td>
                  <td className="text-right tabular-nums">{num(r.batSr)}</td>
                  <td className="text-right tabular-nums">{int(r.hundreds)}</td>
                  <td className="text-right tabular-nums">{int(r.highest)}</td>
                  <td className="text-right font-medium tabular-nums">{int(r.wickets)}</td>
                  <td className="text-right tabular-nums">{num(r.bowlAvg)}</td>
                  <td className="text-right tabular-nums">{num(r.econ)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : (
          <Muted>No players match these filters.</Muted>
        )}
      </div>
      <Pagination page={result.page} pageSize={result.pageSize} total={result.total} href={(p) => `/players${qs({ ...params, page: p })}`} />
    </div>
  );
}
