import Link from "next/link";
import type { TeamListRow } from "@/lib/contract/db";
import type { Fmt, Gender } from "@/lib/contract/pipeline";
import { getDatasetMeta, listTeams } from "@/lib/data";
import { DASH, FORMAT_LABEL, genderWord, int, pct, year } from "@/lib/format";
import { genderParam, genderSlug, type SearchParams } from "@/lib/params";
import { Muted, PageHeader, Section, TableWrap } from "@/components/data";

const FMTS: Fmt[] = ["test", "odi", "t20i"];
const tab = "rounded-full px-4 py-1.5 font-medium text-[#1d1d1f]/70 data-[active=true]:bg-white data-[active=true]:text-[#1d1d1f] data-[active=true]:shadow-sm";

function TeamTable({ teams, minMatches }: { teams: TeamListRow[]; minMatches: number }) {
  return (
    <TableWrap caption="Teams">
      <thead>
        <tr>
          <th scope="col">Team</th>
          {FMTS.map((f) => (
            <th key={f} scope="col" className="text-right">{FORMAT_LABEL[f]}: played, won, win %</th>
          ))}
          <th scope="col" className="text-right">Span</th>
        </tr>
      </thead>
      <tbody>
        {teams.map((t) => (
          <tr key={t.id}>
            <th scope="row">
              <Link href={`/teams/${t.id}`} className="font-semibold hover:text-[#0071e3]">{t.label}</Link>
            </th>
            {FMTS.map((f) => {
              const r = t.formats[f];
              return (
                <td key={f} className="text-right tabular-nums">
                  {r ? `${int(r.matches)} · ${int(r.won)} · ${r.matches >= minMatches ? pct(r.winPct) : DASH}` : DASH}
                </td>
              );
            })}
            <td className="text-right tabular-nums">{year(t.firstMatch)}–{year(t.lastMatch)}</td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}

export default async function TeamsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const gender = genderParam(sp.gender);
  const [teams, meta] = await Promise.all([listTeams(gender), getDatasetMeta()]);
  const minMatches = meta?.thresholds.teamMinMatches ?? 5;
  const genders: Gender[] = (["male", "female"] as Gender[]).filter((g) => teams.some((t) => t.gender === g));
  const allGenders = [...new Set(Object.values(meta?.formats ?? {}).map((f) => f.gender))];

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
      <PageHeader
        eyebrow="Teams"
        title="Every international side in the data."
        sub={`Teams as Cricsheet names them, including associate nations. Win percentages count wins against decided and drawn matches, and are shown from ${minMatches} matches.`}
      />
      {allGenders.length > 1 ? (
        <nav className="segment mb-6" aria-label="Gender">
          <Link href="/teams" data-active={!gender} className={tab}>All</Link>
          {allGenders.map((g) => (
            <Link key={g} href={`/teams?gender=${genderSlug(g)}`} data-active={gender === g} className={tab}>{genderWord(g)}</Link>
          ))}
        </nav>
      ) : null}
      {teams.length ? (
        genders.map((g) => (
          <Section key={g} title={`${genderWord(g)}'s teams`}>
            <TeamTable teams={teams.filter((t) => t.gender === g)} minMatches={minMatches} />
          </Section>
        ))
      ) : (
        <Muted>Team records are not in this build yet.</Muted>
      )}
    </div>
  );
}
