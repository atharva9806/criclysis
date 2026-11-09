/**
 * Loading skeletons (Suspense fallbacks inside pages) and the not-found body.
 * Skeletons only pulse when motion is allowed (.skeleton uses motion-safe).
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { Skeleton } from "./ui";

/** Announces the pending section once, politely, and hides the shapes from assistive tech. */
function Busy({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className} aria-busy="true">
      <p className="sr-only" role="status">
        {label}…
      </p>
      {children}
    </div>
  );
}

export function HeaderSkeleton() {
  return (
    <div className="mb-8 space-y-3" aria-hidden="true">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-9 w-3/4 max-w-xl" />
      <Skeleton className="h-4 w-full max-w-2xl" />
    </div>
  );
}

export function CardGridSkeleton({ label = "Loading", count = 6, height = "h-40" }: { label?: string; count?: number; height?: string }) {
  return (
    <Busy label={label}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className={`card p-5 ${height}`}>
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="mt-4 h-4 w-4/5" />
            <Skeleton className="mt-2 h-4 w-3/5" />
            <Skeleton className="mt-5 h-3 w-2/3" />
          </div>
        ))}
      </div>
    </Busy>
  );
}

export function TableSkeleton({ label = "Loading the table", rows = 8, cols = 6 }: { label?: string; rows?: number; cols?: number }) {
  return (
    <Busy label={label}>
      <div className="card overflow-hidden">
        <div className="flex gap-4 border-b border-line bg-surface-2 px-3 py-3">
          {Array.from({ length: cols }, (_, i) => (
            <Skeleton key={i} className={`h-3 ${i === 0 ? "w-32" : "w-12"}`} />
          ))}
        </div>
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="flex gap-4 border-b border-line px-3 py-3.5 last:border-0">
            {Array.from({ length: cols }, (_, i) => (
              <Skeleton key={i} className={`h-3.5 ${i === 0 ? "w-32" : "w-12"}`} />
            ))}
          </div>
        ))}
      </div>
    </Busy>
  );
}

/** A block placeholder for a section body (charts, leader boards). */
export function SectionSkeleton({ label = "Loading", height = "h-64" }: { label?: string; height?: string }) {
  return (
    <Busy label={label}>
      <Skeleton className={`${height} w-full rounded-card`} />
    </Busy>
  );
}

/** A full-page fallback for route segments that keep a loading.tsx (pages that never 404). */
export function PageLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="page">
      <HeaderSkeleton />
      <CardGridSkeleton label={label} />
    </div>
  );
}

/** The body of every not-found page: what was missing, why that can happen, and where to go next. */
export function NotFoundBody({
  what,
  back,
  backLabel,
  children,
}: {
  what: string;
  back: string;
  backLabel: string;
  children?: ReactNode;
}) {
  return (
    <div className="page">
      <div className="mx-auto max-w-xl py-6 text-center sm:py-12">
        <p className="font-mono text-sm font-semibold text-accent">404</p>
        <h1 className="mt-2 text-title">{what} not found</h1>
        <div className="mt-3 text-sm leading-relaxed text-muted">
          {children ?? <p>It may not be in the current Cricsheet build, or the address may be mistyped.</p>}
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href={back} className="btn-primary">
            {backLabel}
          </Link>
          {back !== "/" ? (
            <Link href="/" className="btn-secondary">
              Home
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
