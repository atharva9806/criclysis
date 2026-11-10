/** Server-rendered building blocks for the data pages. */
import Link from "next/link";
import type { ReactNode } from "react";
import type { MatchRow, SplitRow } from "@/lib/contract/db";
import type { Fmt, Gender, Record5 } from "@/lib/contract/pipeline";
import { DASH, FORMAT_LABEL, date, decided, formatKeyLabel, int, num, pct, winPct } from "@/lib/format";
import { pageNav, qs } from "@/lib/params";
import { DataCredit } from "./DataCredit";
import { ScrollRegion } from "./ScrollRegion";
import { eventLine, teamScores } from "./replay/ResultCard";
import { Badge, EmptyState, SectionHeader, SegmentedLinks } from "./ui";

export function PageHeader({
  eyebrow,
  title,
  sub,
  children,
  actions,
  back,
  credit = true,
  media,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  children?: ReactNode;
  /** Controls shown beside the title on wide screens (e.g. the Men/Women toggle). */
  actions?: ReactNode;
  /** A link back up the hierarchy. */
  back?: { href: string; label: string };
  credit?: boolean;
  /** Shown beside the title block, e.g. a player's photo. */
  media?: ReactNode;
}) {
  const heading = (
    <>
      {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
      <h1 className="text-title text-balance">{title}</h1>
      {sub ? <div className="mt-3 text-base leading-relaxed text-muted">{sub}</div> : null}
      {children}
      {credit ? <DataCredit className="mt-3" /> : null}
    </>
  );
  return (
    <header className="mb-8">
      {back ? (
        <Link href={back.href} className="-ml-1 mb-3 inline-flex min-h-9 items-center gap-1 rounded-control px-1 text-sm font-medium text-muted hover:text-fg">
          <span aria-hidden="true">←</span> {back.label}
        </Link>
      ) : null}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        {media ? (
          <div className="flex min-w-0 max-w-3xl items-start gap-4 sm:gap-6">
            {media}
            <div className="min-w-0">{heading}</div>
          </div>
        ) : (
          <div className="min-w-0 max-w-3xl">{heading}</div>
        )}
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export function Section({ title, sub, children, id, actions }: { title: ReactNode; sub?: ReactNode; children: ReactNode; id?: string; actions?: ReactNode }) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section id={id} aria-labelledby={headingId} className="mt-12 first:mt-0">
      <SectionHeader id={headingId} title={title} sub={sub} actions={actions} />
      {children}
    </section>
  );
}

/** Men/Women in the URL (`?gender=women`; men is the default and has no param). */
export function GenderToggle({ gender, href }: { gender: Gender; href: (g: Gender) => string }) {
  return (
    <SegmentedLinks
      label="Men's or women's cricket"
      items={[
        { key: "male", href: href("male"), label: "Men", active: gender === "male" },
        { key: "female", href: href("female"), label: "Women", active: gender === "female" },
      ]}
    />
  );
}

/** The URL of `path` with the gender param set (dropped for men) and other params kept. */
export function genderHref(path: string, g: Gender, keep: Record<string, string | number | undefined | null> = {}): string {
  return `${path}${qs({ ...keep, gender: g === "female" ? "women" : undefined })}`;
}

/** The designed empty state for a gender that has no data in this build. */
export function NoGenderData({ gender, what, menHref }: { gender: Gender; what: string; menHref: string }) {
  const word = gender === "female" ? "women's" : "men's";
  return (
    <EmptyState
      title={`No ${word} ${what} in this build`}
      action={
        gender === "female" ? (
          <Link href={menHref} className="btn-secondary">
            Show men&apos;s cricket
          </Link>
        ) : null
      }
    >
      The dataset loaded here has no {word} internationals yet. They appear after the daily Cricsheet refresh imports them.
    </EmptyState>
  );
}

/** Links that switch a page between formats, keeping the other params. */
export function FormatTabs({ formats, active, href, label = "Format" }: { formats: Fmt[]; active: Fmt | null; href: (f: Fmt) => string; label?: string }) {
  if (formats.length < 2) return null;
  return <SegmentedLinks label={label} items={formats.map((f) => ({ key: f, href: href(f), label: FORMAT_LABEL[f], active: f === active }))} />;
}

/**
 * A table in a card that scrolls sideways inside its own container on narrow
 * screens, never the page. The first column (the row label) stays in view.
 */
export function TableWrap({ children, caption, sticky = true, className = "" }: { children: ReactNode; caption?: string; sticky?: boolean; className?: string }) {
  return (
    <div className={`card overflow-hidden ${className}`}>
      <ScrollRegion label={caption}>
        <table className={`data-table ${sticky ? "sticky-first" : ""}`}>
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          {children}
        </table>
      </ScrollRegion>
    </div>
  );
}

/** A quiet note in place of a table or section with nothing to show. */
export function Muted({ children }: { children: ReactNode }) {
  return <p className="rounded-card border border-dashed border-line-strong bg-surface px-5 py-4 text-sm leading-relaxed text-muted">{children}</p>;
}

/** One result: teams, innings totals in batting order, the official result text, date, event and venue. */
export function MatchCard({ m }: { m: MatchRow }) {
  const event = eventLine(m);
  const name = `${m.team1} v ${m.team2}, ${date(m.endDate)}`;
  return (
    <article className="card flex h-full flex-col p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="label">
          {formatKeyLabel(m.formatKey)} · <time dateTime={m.endDate}>{date(m.endDate)}</time>
        </p>
        {m.eventStage === "Final" ? <Badge tone="accent">Final</Badge> : null}
      </div>
      <h3 className="mt-3 space-y-1.5">
        {teamScores(m).map((t) => {
          const won = m.result.winner === t.team;
          return (
            <span key={t.team} className="flex items-baseline justify-between gap-3">
              <span className={`min-w-0 truncate ${won ? "font-semibold text-fg" : "font-medium text-muted"}`}>
                {t.team}
                {won ? <span className="sr-only"> (won)</span> : null}
              </span>
              <span className={`shrink-0 text-right text-sm tabular-nums ${won ? "font-semibold" : ""}`}>{t.score || DASH}</span>
            </span>
          );
        })}
      </h3>
      <p className="mt-3 text-sm font-medium">{m.result.text || "Result not recorded"}</p>
      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{[event || m.season, m.venue].filter(Boolean).join(" · ")}</p>
      <p className="-mx-2 mt-auto flex flex-wrap gap-1 pt-3">
        <Link href={`/matches/${m.id}`} className="btn-ghost px-2">
          Scorecard<span className="sr-only">: {name}</span>
        </Link>
        {m.hasReplay ? (
          <Link href={`/live/${m.id}`} className="btn-ghost px-2">
            Replay<span className="sr-only">: {name}</span>
          </Link>
        ) : null}
      </p>
    </article>
  );
}

/** A whole-card link into a replay. */
export function ReplayCard({ m }: { m: MatchRow }) {
  const event = eventLine(m);
  return (
    <Link href={`/live/${m.id}`} className="card-link group flex h-full flex-col p-4 sm:p-5">
      <span className="flex items-start justify-between gap-2">
        <span className="label">
          {formatKeyLabel(m.formatKey)} · <time dateTime={m.endDate}>{date(m.endDate)}</time>
        </span>
        {m.eventStage === "Final" ? <Badge tone="accent">Final</Badge> : null}
      </span>
      <span className="mt-3 block font-semibold">
        {m.team1} v {m.team2}
      </span>
      {event ? <span className="mt-0.5 block truncate text-xs text-muted">{event}</span> : null}
      <span className="mt-3 block text-sm text-muted">{m.result.text}</span>
      <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-semibold text-accent">
        Replay ball by ball <span aria-hidden="true" className="transition-transform motion-safe:group-hover:translate-x-0.5">→</span>
      </span>
    </Link>
  );
}

export function ReplayGrid({ matches, cols = 3 }: { matches: MatchRow[]; cols?: 3 | 4 }) {
  return (
    <ul className={`grid gap-4 sm:grid-cols-2 ${cols === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
      {matches.map((m) => (
        <li key={m.id}>
          <ReplayCard m={m} />
        </li>
      ))}
    </ul>
  );
}

export function MatchGrid({ matches, empty }: { matches: MatchRow[]; empty: ReactNode }) {
  if (!matches.length) return typeof empty === "string" ? <Muted>{empty}</Muted> : <>{empty}</>;
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
  caption,
}: {
  rows: SplitRow[];
  label?: (r: SplitRow) => ReactNode;
  subjectHeader: string;
  empty: string;
  caption?: string;
}) {
  if (!rows.length) return <Muted>{empty}</Muted>;
  const bowling = rows[0].discipline === "bowling";
  return (
    <TableWrap caption={caption ?? subjectHeader}>
      <thead>
        <tr>
          <th scope="col">{subjectHeader}</th>
          <th scope="col" className="num">Balls</th>
          <th scope="col" className="num">Runs</th>
          <th scope="col" className="num">{bowling ? "Wkts" : "Outs"}</th>
          <th scope="col" className="num">Avg</th>
          {bowling ? <th scope="col" className="num">Econ</th> : null}
          <th scope="col" className="num">{bowling ? "Balls/wkt" : "SR"}</th>
          <th scope="col" className="num">Dot %</th>
          <th scope="col" className="num">4s+6s %</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.dimension}|${r.subject}`}>
            <th scope="row">{label(r)}</th>
            <td className="num">{int(r.balls)}</td>
            <td className="num">{int(r.runs)}</td>
            <td className="num">{int(bowling ? r.wickets : r.outs)}</td>
            <td className="num">{num(r.average)}</td>
            {bowling ? <td className="num">{num(r.economy)}</td> : null}
            <td className="num">{num(r.strikeRate, bowling ? 1 : 2)}</td>
            <td className="num">{pct(r.dotPct)}</td>
            <td className="num">{pct(r.boundaryPct)}</td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}

/** W/L/T/D/NR cells; the win percentage is hidden below the team threshold of decided matches (§4.4). */
export function RecordCells({ r, minMatches }: { r: Record5; minMatches: number }) {
  const hidden = decided(r) < minMatches;
  return (
    <>
      <td className="num">{int(r.matches)}</td>
      <td className="num">{int(r.won)}</td>
      <td className="num">{int(r.lost)}</td>
      <td className="num">{int(r.tied)}</td>
      <td className="num">{int(r.drawn)}</td>
      <td className="num">{int(r.noResult)}</td>
      <td className="num font-semibold" title={hidden ? `Shown from ${minMatches} decided matches` : undefined}>
        {winPct(r, minMatches)}
        {hidden && r.matches ? <span className="sr-only"> (fewer than {minMatches} decided matches)</span> : null}
      </td>
    </>
  );
}

export function RecordHeads({ first }: { first: string }) {
  return (
    <tr>
      <th scope="col">{first || <span className="sr-only">Split</span>}</th>
      <th scope="col" className="num">Mat</th>
      <th scope="col" className="num">Won</th>
      <th scope="col" className="num">Lost</th>
      <th scope="col" className="num">Tied</th>
      <th scope="col" className="num">Drawn</th>
      <th scope="col" className="num">NR</th>
      <th scope="col" className="num">Win %</th>
    </tr>
  );
}

export function Pagination({ page, pageSize, total, href }: { page: number; pageSize: number; total: number; href: (p: number) => string }) {
  const nav = pageNav(page, pageSize, total);
  if (nav.pages <= 1 && !nav.pastEnd) return null;
  return (
    <nav className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm" aria-label="Pages">
      {nav.prev ? (
        <Link className="btn-secondary" href={href(nav.prev)} rel="prev">
          <span aria-hidden="true">←</span> {nav.pastEnd ? "Last page" : "Previous"}
        </Link>
      ) : (
        <span />
      )}
      <span className="text-muted" aria-current="page">
        {nav.pastEnd ? `Page ${page} is past the end (${nav.pages} ${nav.pages === 1 ? "page" : "pages"})` : `Page ${page} of ${nav.pages}`}
      </span>
      {nav.next ? (
        <Link className="btn-secondary" href={href(nav.next)} rel="next">
          Next <span aria-hidden="true">→</span>
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

/** A labelled select for GET filter forms (works without JavaScript). */
export function Select({ name, label, value, options, className = "" }: { name: string; label: string; value: string | undefined; options: [string, string][]; className?: string }) {
  return (
    <label className={`field ${className}`}>
      {label}
      <select name={name} defaultValue={value ?? ""} className="input pr-8">
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

/** A filter bar: a GET form in a card that wraps on narrow screens. */
export function FilterForm({ action, children, label }: { action: string; children: ReactNode; label: string }) {
  return (
    <form method="get" action={action} aria-label={label} className="card grid grid-cols-2 items-end gap-3 p-4 md:flex md:flex-wrap">
      {children}
      <button type="submit" className="btn-primary col-span-2 md:col-span-1">
        Apply filters
      </button>
    </form>
  );
}
