/** Server-rendered building blocks for the data pages. */
import Link from "next/link";
import type { ReactNode } from "react";
import type { MatchRow, SplitRow } from "@/lib/contract/db";
import type { Fmt, Record5 } from "@/lib/contract/pipeline";
import { DASH, FORMAT_LABEL, date, genderWord, int, num, pct } from "@/lib/format";
import { DataCredit } from "./DataCredit";

export function PageHeader({ eyebrow, title, sub, children }: { eyebrow?: string; title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-8">
      {eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#0071e3]">{eyebrow}</p>}
      <h1 className="headline text-3xl md:text-5xl">{title}</h1>
      {sub ? <div className="mt-3 max-w-3xl text-[17px] text-[#6e6e73]">{sub}</div> : null}
      {children}
      <DataCredit className="mt-3" />
    </header>
  );
}

export function Section({ title, sub, children, id }: { title: string; sub?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="mt-12">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      {sub ? <p className="mt-1 text-sm text-[#6e6e73]">{sub}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Links that switch a page between formats, keeping the other params. */
export function FormatTabs({ formats, active, href }: { formats: Fmt[]; active: Fmt | null; href: (f: Fmt) => string }) {
  if (formats.length < 2) return null;
  return (
    <nav className="segment mt-4" aria-label="Format">
      {formats.map((f) => (
        <Link key={f} href={href(f)} data-active={f === active} aria-current={f === active ? "page" : undefined} className="rounded-full px-4 py-1.5 font-medium text-[#1d1d1f]/70 data-[active=true]:bg-white data-[active=true]:text-[#1d1d1f] data-[active=true]:shadow-sm">
          {FORMAT_LABEL[f]}
        </Link>
      ))}
    </nav>
  );
}

/** A table that scrolls sideways on narrow screens instead of the page. */
export function TableWrap({ children, caption }: { children: ReactNode; caption?: string }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="table-apple w-full text-left">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          {children}
        </table>
      </div>
    </div>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <p className="card p-5 text-sm text-[#6e6e73]">{children}</p>;
}

function innings(m: MatchRow) {
  return m.innings.map((i, k) => (
    <span key={k} className="tabular-nums">
      {i.runs}
      {i.wickets < 10 ? `/${i.wickets}` : ""}
      {i.declared ? "d" : ""} <span className="text-[#6e6e73]">({i.overs} ov)</span>
    </span>
  ));
}

/** One result: teams, innings totals, the official result text, date and event. */
export function MatchCard({ m }: { m: MatchRow }) {
  const byTeam = (teamId: string) => m.innings.filter((i) => i.teamId === teamId);
  return (
    <article className="card flex h-full flex-col p-5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6e6e73]">
        {genderWord(m.gender)}&apos;s {FORMAT_LABEL[m.format]} · {date(m.endDate)}
      </p>
      <ul className="mt-2 space-y-1 text-sm">
        {[
          [m.team1Id, m.team1],
          [m.team2Id, m.team2],
        ].map(([id, name]) => (
          <li key={id} className="flex items-baseline justify-between gap-3">
            <span className={`font-medium ${m.result.winnerId === id ? "text-[#1d1d1f]" : "text-[#1d1d1f]/70"}`}>{name}</span>
            <span className="flex flex-wrap justify-end gap-x-2 text-right">
              {byTeam(id).length ? innings({ ...m, innings: byTeam(id) }) : <span className="text-[#6e6e73]">{DASH}</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm font-medium">{m.result.text}</p>
      <p className="mt-1 text-xs text-[#6e6e73]">
        {[m.eventName, m.eventStage].filter(Boolean).join(", ") || m.season} · {m.venue}
      </p>
      <p className="mt-auto flex gap-4 pt-3 text-sm font-medium">
        <Link href={`/matches/${m.id}`} className="text-[#0071e3] hover:underline">Scorecard</Link>
        {m.hasReplay ? <Link href={`/live/${m.id}`} className="text-[#0071e3] hover:underline">Replay</Link> : null}
      </p>
    </article>
  );
}

export function MatchGrid({ matches, empty }: { matches: MatchRow[]; empty: string }) {
  if (!matches.length) return <Muted>{empty}</Muted>;
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {matches.map((m) => (
        <li key={m.id}>
          <MatchCard m={m} />
        </li>
      ))}
    </ul>
  );
}

/** Splits for one dimension, with the derived rates from lib/metrics.ts and the balls behind each row. */
export function SplitTable({
  rows,
  label = (r) => r.label ?? r.subject,
  subjectHeader,
  empty,
}: {
  rows: SplitRow[];
  label?: (r: SplitRow) => ReactNode;
  subjectHeader: string;
  empty: string;
}) {
  if (!rows.length) return <Muted>{empty}</Muted>;
  const bowling = rows[0].discipline === "bowling";
  return (
    <TableWrap>
      <thead>
        <tr>
          <th scope="col">{subjectHeader}</th>
          <th scope="col" className="text-right">Balls</th>
          <th scope="col" className="text-right">Runs</th>
          <th scope="col" className="text-right">{bowling ? "Wkts" : "Outs"}</th>
          <th scope="col" className="text-right">Avg</th>
          {bowling ? <th scope="col" className="text-right">Econ</th> : null}
          <th scope="col" className="text-right">{bowling ? "Balls/wkt" : "SR"}</th>
          <th scope="col" className="text-right">Dot %</th>
          <th scope="col" className="text-right">4s+6s %</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.dimension}|${r.subject}`}>
            <td className="font-medium">{label(r)}</td>
            <td className="text-right tabular-nums">{int(r.balls)}</td>
            <td className="text-right tabular-nums">{int(r.runs)}</td>
            <td className="text-right tabular-nums">{int(bowling ? r.wickets : r.outs)}</td>
            <td className="text-right tabular-nums">{num(r.average)}</td>
            {bowling ? <td className="text-right tabular-nums">{num(r.economy)}</td> : null}
            <td className="text-right tabular-nums">{num(r.strikeRate, bowling ? 1 : 2)}</td>
            <td className="text-right tabular-nums">{pct(r.dotPct)}</td>
            <td className="text-right tabular-nums">{pct(r.boundaryPct)}</td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}

/** W/L/T/D/NR cells; the win percentage is hidden below the team threshold (§4.4). */
export function RecordCells({ r, minMatches }: { r: Record5; minMatches: number }) {
  return (
    <>
      <td className="text-right tabular-nums">{int(r.matches)}</td>
      <td className="text-right tabular-nums">{int(r.won)}</td>
      <td className="text-right tabular-nums">{int(r.lost)}</td>
      <td className="text-right tabular-nums">{int(r.tied)}</td>
      <td className="text-right tabular-nums">{int(r.drawn)}</td>
      <td className="text-right tabular-nums">{int(r.noResult)}</td>
      <td className="text-right tabular-nums" title={r.matches < minMatches ? `Shown from ${minMatches} matches` : undefined}>
        {r.matches >= minMatches ? pct(r.winPct) : DASH}
      </td>
    </>
  );
}

export function RecordHeads({ first }: { first: string }) {
  return (
    <tr>
      <th scope="col">{first}</th>
      <th scope="col" className="text-right">Mat</th>
      <th scope="col" className="text-right">Won</th>
      <th scope="col" className="text-right">Lost</th>
      <th scope="col" className="text-right">Tied</th>
      <th scope="col" className="text-right">Drawn</th>
      <th scope="col" className="text-right">NR</th>
      <th scope="col" className="text-right">Win %</th>
    </tr>
  );
}

export function Pagination({ page, pageSize, total, href }: { page: number; pageSize: number; total: number; href: (p: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav className="mt-6 flex items-center justify-between text-sm" aria-label="Pages">
      {page > 1 ? <Link className="btn-ghost px-0" href={href(page - 1)}>← Previous</Link> : <span />}
      <span className="text-[#6e6e73]">
        Page {page} of {pages}
      </span>
      {page < pages ? <Link className="btn-ghost px-0" href={href(page + 1)}>Next →</Link> : <span />}
    </nav>
  );
}

/** A labelled select for GET filter forms (works without JavaScript). */
export function Select({ name, label, value, options }: { name: string; label: string; value: string | undefined; options: [string, string][] }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-[#6e6e73]">
      {label}
      <select name={name} defaultValue={value ?? ""} className="rounded-full bg-[#e8e8ed] px-4 py-2.5 text-sm text-[#1d1d1f]">
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
