"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A container that scrolls sideways on narrow screens. Only while its content
 * overflows does it become a named, focusable region, so keyboard users can
 * scroll it with the arrow keys without an extra tab stop on wide screens.
 */
export function ScrollRegion({ label, children, className = "" }: { label?: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrolls, setScrolls] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // The observer reports once on observe, then on every resize.
    const ro = new ResizeObserver(() => setScrolls(el.scrollWidth > el.clientWidth + 1));
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`table-scroll ${className}`}
      tabIndex={scrolls ? 0 : undefined}
      role={scrolls ? "region" : undefined}
      aria-label={scrolls ? (label ? `${label} (scrolls sideways)` : "Table (scrolls sideways)") : undefined}
    >
      {children}
    </div>
  );
}
