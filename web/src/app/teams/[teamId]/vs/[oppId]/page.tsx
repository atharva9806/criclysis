import Link from "next/link";
import { notFound } from "next/navigation";
import { getDatasetMeta, getHeadToHead } from "@/lib/data";
import { formatKeyLabel, plural, record } from "@/lib/format";
import { fmtParam, qs, type SearchParams } from "@/lib/params";
import type { Fmt } from "@/lib/contract/pipeline";
import { FormatTabs, MatchGrid, Muted, PageHeader, RecordCells, RecordHeads, Section, TableWrap } from "@/components/data";

export default async function HeadToHeadPage({ params, searchParams }: { params: Promise<{ teamId: string; oppId: string }>; searchParams: Promise<SearchParams> }) {
  const [{ teamId, oppId }, sp] = await Promise.all([params, searchParams]);
  const meta = await getDatasetMeta();
  const probe = await getHeadToHead(teamId, oppId, fmtParam(sp.f) ?? "odi");
  if (!probe.team || !probe.opponent) notFound();
  // Formats both teams have played; default to the requested one, else the first shared one.
  const shared = (["test", "odi", "t20i"] as Fmt[]).filter((f) => probe.team!.formats[f] && probe.opponent!.formats[f]);
  const fmt = fmtParam(sp.f) && shared.includes(fmtParam(sp.f)!) ? fmtParam(sp.f)! : (shared[0] ?? "odi");
  const h = fmt === (fmtParam(sp.f) ?? "odi") ? probe : await getHeadToHead(teamId, oppId, fmt);
  const minM = meta?.thresholds.teamMinMatches ?? 5;
  const T = probe.team.label;
  const O = probe.opponent.label;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
      <Link href={`/teams/${teamId}${qs({ f: fmt })}`} className="text-sm text-[#0071e3]">← {T}</Link>
      <div className="mt-4">
        <PageHeader
          eyebrow={h.formatKey ? formatKeyLabel(h.formatKey) : "Head to head"}
          title={`${T} v ${O}`}
          sub={h.summary ? `${T} ${record(h.summary, minM)} against ${O}.` : `No ${fmt.toUpperCase()} matches between these teams in the data.`}
        />
      </div>
      <FormatTabs formats={shared} active={fmt} href={(f) => `/teams/${teamId}/vs/${oppId}${qs({ f })}`} />
      {h.summary ? (
        <Section title="Summary">
          <TableWrap caption="Head to head">
            <thead><RecordHeads first="" /></thead>
            <tbody>
              <tr><th scope="row">{T}</th><RecordCells r={h.summary} minMatches={minM} /></tr>
            </tbody>
          </TableWrap>
        </Section>
      ) : null}
      <Section title="Every match" sub={plural(h.matches.length, "match", "matches")}>
        {h.matches.length ? <MatchGrid matches={h.matches} empty="" /> : <Muted>No matches between these teams in this format.</Muted>}
      </Section>
    </div>
  );
}
