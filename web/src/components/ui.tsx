export function SectionTitle({ eyebrow, title, sub }: { eyebrow?: string; title: string; sub?: string }) {
  return (
    <div className="mb-8">
      {eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#0071e3]">{eyebrow}</p>}
      <h2 className="headline text-3xl md:text-4xl">{title}</h2>
      {sub && <p className="mt-3 max-w-2xl text-[17px] text-[#6e6e73]">{sub}</p>}
    </div>
  );
}

export function Sparkline({ values, color = "#0071e3" }: { values: number[]; color?: string }) {
  if (!values.length) return null;
  const w = 90;
  const h = 26;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * w},${h - (v / max) * (h - 3) - 1}`).join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** A short notice in place of a section that has nothing to show. */
export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="card p-8 text-center">
      <p className="font-semibold">{title}</p>
      {children ? <div className="mt-2 text-sm text-[#6e6e73]">{children}</div> : null}
    </div>
  );
}
