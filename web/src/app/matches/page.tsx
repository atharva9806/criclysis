import { getDatasetMeta, listMatches, listMatchYears, listTeams } from "@/lib/data";
import { FORMAT_LABEL, genderWord, int } from "@/lib/format";
import { fmtParam, genderParam, genderSlug, intParam, qs, str, type SearchParams } from "@/lib/params";
import { MatchGrid, PageHeader, Pagination, Select } from "@/components/data";

const PAGE_SIZE = 30;

export default async function MatchesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const q = {
    gender: genderParam(sp.gender),
    format: fmtParam(sp.format),
    teamId: str(sp.team),
    year: intParam(sp.year, 1800, 3000),
    page: intParam(sp.page) ?? 1,
  };
  const [result, years, teams, meta] = await Promise.all([
    listMatches({ ...q, pageSize: PAGE_SIZE }),
    listMatchYears(),
    listTeams(q.gender),
    getDatasetMeta(),
  ]);
  const genders = [...new Set(Object.values(meta?.formats ?? {}).map((f) => f.gender))];
  const params = { gender: q.gender && genderSlug(q.gender), format: q.format, team: q.teamId, year: q.year };
  const scope = [q.gender && genderWord(q.gender), q.format && FORMAT_LABEL[q.format], q.year].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
      <PageHeader eyebrow="Matches" title="Every international in the data." sub="Results as Cricsheet records them, newest first." />
      <form method="get" action="/matches" className="card flex flex-wrap items-end gap-3 p-4">
        {genders.length > 1 ? <Select name="gender" label="Gender" value={params.gender} options={[["", "All"], ["men", "Men"], ["women", "Women"]]} /> : null}
        <Select name="format" label="Format" value={q.format} options={[["", "All formats"], ["test", "Test"], ["odi", "ODI"], ["t20i", "T20I"]]} />
        {teams.length ? <Select name="team" label="Team" value={q.teamId} options={[["", "All teams"], ...teams.map((t) => [t.id, t.label] as [string, string])]} /> : null}
        {years.length ? <Select name="year" label="Year" value={q.year ? String(q.year) : undefined} options={[["", "All years"], ...years.map((y) => [String(y), String(y)] as [string, string])]} /> : null}
        <button type="submit" className="btn-primary">Apply</button>
      </form>
      <p className="my-4 text-sm text-[#6e6e73]">
        {int(result.total)} matches{scope ? ` · ${scope}` : ""}
      </p>
      <MatchGrid matches={result.rows} empty="No matches found. Results appear here once a build with matches.json has been imported." />
      <Pagination page={q.page} pageSize={PAGE_SIZE} total={result.total} href={(p) => `/matches${qs({ ...params, page: p })}`} />
    </div>
  );
}
