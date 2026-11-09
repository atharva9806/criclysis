/**
 * The Criclysis component vocabulary: cards, badges, stats, section headers,
 * segmented links, empty states and skeletons. Server-safe (no hooks); the
 * classes they use are defined in app/globals.css.
 */
import Link from "next/link";
import type { ReactNode } from "react";

export function Card({ children, className = "", as: As = "div" }: { children: ReactNode; className?: string; as?: "div" | "section" | "article" | "li" }) {
  return <As className={`card ${className}`}>{children}</As>;
}

type Tone = "neutral" | "accent" | "positive" | "negative" | "warning";
const BADGE: Record<Tone, string> = {
  neutral: "badge",
  accent: "badge badge-accent",
  positive: "badge badge-positive",
  negative: "badge badge-negative",
  warning: "badge badge-warning",
};

export function Badge({ tone = "neutral", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={`${BADGE[tone]} ${className}`}>{children}</span>;
}

/**
 * One headline number. `sample` states what it rests on ("from 1,204 balls"),
 * so a statistic never appears without its sample size.
 */
export function Stat({ label, value, unit, sample, className = "" }: { label: ReactNode; value: ReactNode; unit?: ReactNode; sample?: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="label">{label}</dt>
      <dd className="mt-1">
        <span className="text-stat tabular-nums">{value}</span>
        {unit ? <span className="ml-1 text-sm text-muted">{unit}</span> : null}
        {sample ? <span className="mt-0.5 block text-xs text-muted">{sample}</span> : null}
      </dd>
    </div>
  );
}

/** A grid of Stats inside one card. */
export function StatGrid({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <dl className={`card grid grid-cols-2 gap-x-6 gap-y-5 p-5 sm:grid-cols-3 lg:grid-cols-4 ${className}`}>{children}</dl>;
}

/** A section heading with an optional description and actions (filters, toggles) on the right. */
export function SectionHeader({
  title,
  sub,
  actions,
  id,
  as: H = "h2",
}: {
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  id?: string;
  as?: "h2" | "h3";
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 max-w-3xl">
        <H id={id} className={H === "h2" ? "text-heading" : "text-base font-semibold"}>
          {title}
        </H>
        {sub ? <div className="mt-1 text-sm leading-relaxed text-muted">{sub}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** A row of links that behave as one control (format tabs, Men/Women). */
export function SegmentedLinks({ label, items }: { label: string; items: { href: string; label: ReactNode; active: boolean; key?: string }[] }) {
  return (
    <nav aria-label={label} className="segmented">
      {items.map((it, i) => (
        <Link key={it.key ?? i} href={it.href} scroll={false} aria-current={it.active ? "true" : undefined}>
          {it.label}
        </Link>
      ))}
    </nav>
  );
}

/** A designed notice in place of a section that has nothing to show. */
export function EmptyState({ title, children, action, className = "" }: { title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={`rounded-card border border-dashed border-line-strong bg-surface px-5 py-8 text-center sm:px-8 ${className}`}>
      <svg className="mx-auto text-muted" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12h8" />
      </svg>
      <p className="mt-3 font-semibold">{title}</p>
      {children ? <div className="mx-auto mt-1.5 max-w-prose text-sm leading-relaxed text-muted">{children}</div> : null}
      {action ? <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}
