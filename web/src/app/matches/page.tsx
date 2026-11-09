import type { Metadata } from "next";
import { Suspense } from "react";
import type { Fmt, Gender } from "@/lib/contract/pipeline";
import { listMatches, listMatchYears, listTeams } from "@/lib/data";
import { FORMAT_LABEL, int } from "@/lib/format";
import { fmtParam, genderParam, intParam, qs, str, type SearchParams } from "@/lib/params";
import { FilterForm, GenderToggle, MatchGrid, Muted, NoGenderData, PageHeader, Pagination, Select, genderHref } from "@/components/data";
import { CardGridSkeleton } from "@/components/Loading";

export const metadata: Metadata = { title: "Matches · Criclysis" };

const PAGE_SIZE = 30;

type Query = { gender: Gender; format?: Fmt; teamId?: string; year?: number; page: number };

function urlParams(q: Query) {
  return { gender: q.gender === "female" ? "women" : undefined, format: q.format, team: q.teamId, year: q.year };
}

async function Results({ q, teamLabel }: { q: Query; teamLabel?: string }) {
  const result = await listMatches({ ...q, pageSize: PAGE_SIZE });
  const filtered = Boolean(q.format || q.teamId || q.year);
  if (!result.total && !filtered) return <NoGenderData gender={q.gender} what="matches" menHref="/matches" />;
  const scope = [q.gender === "female" ? "Women's" : "Men's", q.format && FORMAT_LABEL[q.format], teamLabel, q.year].filter(Boolean).join(" · ");
  return (
    <>
      <p className="mb-4 text-sm text-muted" role="status">
        {int(result.total)} matches · {scope}
      </p>
      <MatchGrid
        matches={result.rows}
        empty={
          <Muted>{result.total ? `Page ${q.page} is past the end of this list; the link below goes back.` : "No matches match these filters. Try a different format, team or year."}</Muted>
        }
      />
      <Pagination page={q.page} pageSize={PAGE_SIZE} total={result.total} href={(p) => `/matches${qs({ ...urlParams(q), page: p })}`} />
    </>
  );
}

export default async function MatchesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const q: Query = {
    gender: genderParam(sp.gender) ?? "male",
    format: fmtParam(sp.format),
    teamId: str(sp.team),
    year: intParam(sp.year, 1800, 3000),
    page: intParam(sp.page) ?? 1,
  };
  const [years, teams] = await Promise.all([listMatchYears(q.gender), listTeams(q.gender)]);
  const params = urlParams(q);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Matches"
        title={`Every ${q.gender === "female" ? "women's" : "men's"} international in the data`}
        sub="Results as Cricsheet records them, newest first. Matches with ball-by-ball records have a full scorecard and a replay."
        actions={<GenderToggle gender={q.gender} href={(g) => genderHref("/matches", g, { format: q.format })} />}
      />
      <FilterForm action="/matches" label="Filter matches">
        {q.gender === "female" ? <input type="hidden" name="gender" value="women" /> : null}
        <Select name="format" label="Format" value={q.format} options={[["", "All formats"], ["test", "Test"], ["odi", "ODI"], ["t20i", "T20I"]]} />
        {teams.length ? <Select name="team" label="Team" value={q.teamId} options={[["", "All teams"], ...teams.map((t) => [t.id, t.label] as [string, string])]} /> : null}
        {years.length ? (
          <Select name="year" label="Year" value={q.year ? String(q.year) : undefined} options={[["", "All years"], ...years.map((y) => [String(y), String(y)] as [string, string])]} />
        ) : null}
      </FilterForm>
      <div className="mt-6">
        <Suspense key={JSON.stringify(params) + q.page} fallback={<CardGridSkeleton label="Loading matches" count={9} />}>
          <Results q={q} teamLabel={q.teamId ? teams.find((t) => t.id === q.teamId)?.label : undefined} />
        </Suspense>
      </div>
    </div>
  );
}
