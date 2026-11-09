import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import type { TeamListRow } from "@/lib/contract/db";
import type { Fmt, Gender } from "@/lib/contract/pipeline";
import { getDatasetMeta, listTeams } from "@/lib/data";
import { DASH, FORMAT_LABEL, int, winPct, year } from "@/lib/format";
import { genderParam, type SearchParams } from "@/lib/params";
import { GenderToggle, NoGenderData, PageHeader, TableWrap, genderHref } from "@/components/data";
import { TableSkeleton } from "@/components/Loading";

export const metadata: Metadata = { title: "Teams · Criclysis" };

const FMTS: Fmt[] = ["test", "odi", "t20i"];

function TeamTable({ teams, minMatches, label }: { teams: TeamListRow[]; minMatches: number; label: string }) {
  return (
    <TableWrap caption={label}>
      <thead>
        <tr>
          <th scope="col" rowSpan={2} className="align-bottom">
            Team
          </th>
          {FMTS.map((f) => (
            <th key={f} scope="colgroup" colSpan={3} className="!border-b-0 !pb-0 text-center">
              {FORMAT_LABEL[f]}
            </th>
          ))}
          <th scope="col" rowSpan={2} className="num align-bottom">
            Span
          </th>
        </tr>
        <tr>
          {FMTS.flatMap((f) => [
            <th key={`${f}-m`} scope="col" className="num">
              Mat
            </th>,
            <th key={`${f}-w`} scope="col" className="num">
              Won
            </th>,
            <th key={`${f}-p`} scope="col" className="num">
              Win %
            </th>,
          ])}
        </tr>
      </thead>
      <tbody>
        {teams.map((t) => (
          <tr key={t.id}>
            <th scope="row">
              <Link href={`/teams/${t.id}`} className="link-quiet font-semibold">
                {t.label}
              </Link>
            </th>
            {FMTS.flatMap((f) => {
              const r = t.formats[f];
              return [
                <td key={`${f}-m`} className="num">{r ? int(r.matches) : DASH}</td>,
                <td key={`${f}-w`} className="num">{r ? int(r.won) : DASH}</td>,
                <td key={`${f}-p`} className="num font-semibold">{r ? winPct(r, minMatches) : DASH}</td>,
              ];
            })}
            <td className="num text-muted">
              {year(t.firstMatch)}–{year(t.lastMatch)}
            </td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}

async function Teams({ gender, minMatches }: { gender: Gender; minMatches: number }) {
  const teams = await listTeams(gender);
  if (!teams.length) return <NoGenderData gender={gender} what="teams" menHref="/teams" />;
  return (
    <>
      <p className="mb-3 text-sm text-muted">
        {int(teams.length)} {gender === "female" ? "women's" : "men's"} teams, alphabetical. A dash in Win % means fewer than {minMatches} decided
        matches.
      </p>
      <TeamTable teams={teams} minMatches={minMatches} label={`${gender === "female" ? "Women's" : "Men's"} teams`} />
    </>
  );
}

export default async function TeamsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const gender = genderParam(sp.gender) ?? "male";
  const meta = await getDatasetMeta();
  const minMatches = meta?.thresholds.teamMinMatches ?? 5;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Teams"
        title={`Every ${gender === "female" ? "women's" : "men's"} international side in the data`}
        sub={`Teams as Cricsheet names them, including associate nations. Win % counts wins against decided and drawn matches (no-results are left out) and is shown from ${minMatches} such matches.`}
        actions={<GenderToggle gender={gender} href={(g) => genderHref("/teams", g)} />}
      />
      <Suspense key={gender} fallback={<TableSkeleton label="Loading teams" cols={8} />}>
        <Teams gender={gender} minMatches={minMatches} />
      </Suspense>
    </div>
  );
}
