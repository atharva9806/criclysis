import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { formatKey, type Fmt } from "@/lib/contract/pipeline";
import { getDatasetMeta, getHeadToHead } from "@/lib/data";
import { FORMAT_LABEL, formatKeyLabel, plural, record } from "@/lib/format";
import { fmtParam, qs, type SearchParams } from "@/lib/params";
import { FormatTabs, MatchGrid, Muted, PageHeader, RecordCells, RecordHeads, Section, TableWrap } from "@/components/data";
import { CardGridSkeleton } from "@/components/Loading";
import { FMTS, findTeam } from "../../../lookup";

type Props = { params: Promise<{ teamId: string; oppId: string }>; searchParams: Promise<SearchParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { teamId, oppId } = await params;
  const [a, b] = await Promise.all([findTeam(teamId), findTeam(oppId)]);
  return { title: a && b ? `${a.label} v ${b.label} · Criclysis` : "Head to head not found · Criclysis" };
}

async function Body({ teamId, oppId, fmt, T, O, minM }: { teamId: string; oppId: string; fmt: Fmt; T: string; O: string; minM: number }) {
  const h = await getHeadToHead(teamId, oppId, fmt);
  return (
    <>
      {h.summary ? (
        <Section id="summary" title="Summary" sub={`${T} ${record(h.summary, minM)} against ${O}.`}>
          <TableWrap caption="Head to head record">
            <thead>
              <RecordHeads first="" />
            </thead>
            <tbody>
              <tr>
                <th scope="row">{T}</th>
                <RecordCells r={h.summary} minMatches={minM} />
              </tr>
            </tbody>
          </TableWrap>
        </Section>
      ) : null}
      <Section id="matches" title="Every match" sub={plural(h.matches.length, "match", "matches")}>
        {h.matches.length ? <MatchGrid matches={h.matches} empty="" /> : <Muted>No {FORMAT_LABEL[fmt]} matches between these teams in the data.</Muted>}
      </Section>
    </>
  );
}

export default async function HeadToHeadPage({ params, searchParams }: Props) {
  const [{ teamId, oppId }, sp] = await Promise.all([params, searchParams]);
  // Both teams must exist before anything streams, so a bogus pair is a real 404.
  const [team, opp, meta] = await Promise.all([findTeam(teamId), findTeam(oppId), getDatasetMeta()]);
  if (!team || !opp || teamId === oppId) notFound();
  // Formats both teams have played; default to the requested one, else the first shared one.
  const shared = FMTS.filter((f) => team.formats[f] && opp.formats[f]);
  const wanted = fmtParam(sp.f);
  const fmt: Fmt = wanted && shared.includes(wanted) ? wanted : (shared[0] ?? wanted ?? "odi");
  const minM = meta?.thresholds.teamMinMatches ?? 5;

  return (
    <div className="page">
      <PageHeader
        back={{ href: `/teams/${teamId}${qs({ f: fmt })}`, label: team.label }}
        eyebrow={`${formatKeyLabel(formatKey(fmt, team.gender))} · head to head`}
        title={`${team.label} v ${opp.label}`}
        actions={<FormatTabs formats={shared} active={fmt} href={(f) => `/teams/${teamId}/vs/${oppId}${qs({ f })}`} />}
      />
      {team.gender !== opp.gender ? (
        <Muted>
          {team.label} and {opp.label} play in different competitions (men&apos;s and women&apos;s), so there are no matches between them.
        </Muted>
      ) : (
        <Suspense key={fmt} fallback={<CardGridSkeleton label="Loading the head-to-head record" count={3} />}>
          <Body teamId={teamId} oppId={oppId} fmt={fmt} T={team.label} O={opp.label} minM={minM} />
        </Suspense>
      )}
    </div>
  );
}
