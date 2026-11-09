import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import type { PlayerSort, RoleFilter } from "@/lib/contract/db";
import { formatKey, type Fmt, type Gender } from "@/lib/contract/pipeline";
import { getDatasetMeta, listPlayers, listTeams } from "@/lib/data";
import { formatKeyLabel, int, num } from "@/lib/format";
import { fmtParam, genderParam, intParam, qs, roleParam, sortParam, str, type SearchParams } from "@/lib/params";
import { FilterForm, GenderToggle, Muted, NoGenderData, PageHeader, Pagination, Select, TableWrap, genderHref } from "@/components/data";
import { TableSkeleton } from "@/components/Loading";

export const metadata: Metadata = { title: "Players · Criclysis" };

const SORT_LABEL: Record<PlayerSort, string> = {
  runs: "Runs",
  wickets: "Wickets",
  batAvg: "Batting average",
  batSr: "Strike rate",
  bowlAvg: "Bowling average",
  econ: "Economy",
  name: "Name",
};

type Query = { search?: string; gender: Gender; format?: Fmt; teamId?: string; role?: RoleFilter; sort: PlayerSort; page: number };

function urlParams(q: Query) {
  return { q: q.search, gender: q.gender === "female" ? "women" : undefined, format: q.format, team: q.teamId, role: q.role, sort: q.sort === "runs" ? undefined : q.sort };
}

async function Results({ q }: { q: Query }) {
  const result = await listPlayers(q);
  const scope = q.format ? formatKeyLabel(formatKey(q.format, q.gender)) : `${q.gender === "female" ? "Women's" : "Men's"} Tests, ODIs and T20Is combined`;
  const filtered = Boolean(q.search || q.teamId || q.role || q.format);

  if (!result.total && !filtered) return <NoGenderData gender={q.gender} what="players" menHref="/players" />;
  return (
    <>
      <p className="mb-3 text-sm text-muted" role="status">
        {int(result.total)} players · {scope}
        {result.minBalls ? ` · ranked by ${SORT_LABEL[q.sort].toLowerCase()} among players with at least ${int(result.minBalls)} balls` : ""}
      </p>
      {result.rows.length ? (
        <TableWrap caption={`Players, ${scope}, sorted by ${SORT_LABEL[q.sort].toLowerCase()}`}>
          <thead>
            <tr>
              <th scope="col">Player</th>
              <th scope="col" className="num">Mat</th>
              <th scope="col" className="num">Inns</th>
              <th scope="col" className="num">Runs</th>
              <th scope="col" className="num">Avg</th>
              <th scope="col" className="num">SR</th>
              <th scope="col" className="num">100s</th>
              <th scope="col" className="num">HS</th>
              <th scope="col" className="num">Wkts</th>
              <th scope="col" className="num">Bowl avg</th>
              <th scope="col" className="num">Econ</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r) => (
              <tr key={r.slug}>
                <th scope="row">
                  <Link href={`/players/${r.slug}${qs({ f: q.format })}`} className="link-quiet font-semibold">
                    {r.name}
                  </Link>
                  <span className="block truncate text-xs font-normal text-muted">{[r.teams.join(", ") || r.country, r.role].filter(Boolean).join(" · ")}</span>
                </th>
                <td className="num">{int(r.matches)}</td>
                <td className="num">{int(r.batInnings)}</td>
                <td className={`num ${q.sort === "runs" ? "font-semibold" : ""}`}>{int(r.runs)}</td>
                <td className={`num ${q.sort === "batAvg" ? "font-semibold" : ""}`}>{num(r.batAvg)}</td>
                <td className={`num ${q.sort === "batSr" ? "font-semibold" : ""}`}>{num(r.batSr)}</td>
                <td className="num">{int(r.hundreds)}</td>
                <td className="num">{int(r.highest)}</td>
                <td className={`num ${q.sort === "wickets" ? "font-semibold" : ""}`}>{int(r.wickets)}</td>
                <td className={`num ${q.sort === "bowlAvg" ? "font-semibold" : ""}`}>{num(r.bowlAvg)}</td>
                <td className={`num ${q.sort === "econ" ? "font-semibold" : ""}`}>{num(r.econ)}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      ) : (
        <Muted>{result.total ? `Page ${result.page} is past the end of this list; the link below goes back.` : "No players match these filters."}</Muted>
      )}
      <Pagination page={result.page} pageSize={result.pageSize} total={result.total} href={(p) => `/players${qs({ ...urlParams(q), page: p })}`} />
    </>
  );
}

export default async function PlayersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const q: Query = {
    search: str(sp.q),
    gender: genderParam(sp.gender) ?? "male",
    format: fmtParam(sp.format),
    teamId: str(sp.team),
    role: roleParam(sp.role),
    sort: sortParam(sp.sort) ?? "runs",
    page: intParam(sp.page) ?? 1,
  };
  const [teams, meta] = await Promise.all([listTeams(q.gender), getDatasetMeta()]);
  const t = meta?.thresholds;
  const params = urlParams(q);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Players"
        title={`Every ${q.gender === "female" ? "women's" : "men's"} international cricketer in the data`}
        sub={`Career records from Cricsheet's ball-by-ball data; totals cover only matches with ball-by-ball records. Rate sorts list players from ${int(t?.minBallsCohort ?? 600)} balls faced or ${int(t?.minBallsBowledCohort ?? 900)} bowled.`}
        actions={<GenderToggle gender={q.gender} href={(g) => genderHref("/players", g, { q: q.search })} />}
      />

      <FilterForm action="/players" label="Filter players">
        {q.gender === "female" ? <input type="hidden" name="gender" value="women" /> : null}
        <label className="field col-span-2 md:min-w-56 md:flex-1">
          Name
          <input name="q" type="search" defaultValue={q.search ?? ""} placeholder="e.g. Kohli" className="input" autoComplete="off" />
        </label>
        <Select name="format" label="Format" value={q.format} options={[["", "All formats"], ["test", "Test"], ["odi", "ODI"], ["t20i", "T20I"]]} />
        <Select
          name="role"
          label="Role"
          value={q.role}
          options={[["", "All roles"], ["batter", "Batters"], ["bowler", "Bowlers"], ["allrounder", "All-rounders"], ["wicketkeeper", "Wicketkeepers"]]}
        />
        {teams.length ? <Select name="team" label="Team" value={q.teamId} options={[["", "All teams"], ...teams.map((t) => [t.id, t.label] as [string, string])]} /> : null}
        <Select name="sort" label="Sort by" value={q.sort} options={Object.entries(SORT_LABEL) as [string, string][]} />
      </FilterForm>

      <div className="mt-6">
        <Suspense key={JSON.stringify(params) + q.page} fallback={<TableSkeleton label="Loading players" rows={12} cols={8} />}>
          <Results q={q} />
        </Suspense>
      </div>
    </div>
  );
}
