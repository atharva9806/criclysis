"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/players", label: "Players" },
  { href: "/teams", label: "Teams" },
  { href: "/matches", label: "Matches" },
  { href: "/compare", label: "Compare" },
  { href: "/strategy", label: "Strategy" },
  { href: "/live", label: "Live" },
];

export default function Nav() {
  const path = usePathname();

  return (
    <header className="glass fixed inset-x-0 top-0 z-50 border-b border-black/5">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 md:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-[15px] font-semibold tracking-tight">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#1d1d1f] text-white">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 20l6-6M14 4l6 6M9 15l6-6M6 18l-2 2M18 6l2-2" />
              <circle cx="18" cy="18" r="2.5" />
            </svg>
          </span>
          Criclysis
        </Link>
        <nav className="hidden items-center gap-7 text-[13px] text-[#1d1d1f]/80 md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={`transition hover:text-[#1d1d1f] ${path.startsWith(l.href) ? "font-medium text-[#1d1d1f]" : ""}`}>
              {l.label}
            </Link>
          ))}
        </nav>
        <nav className="flex items-center gap-1 overflow-x-auto md:hidden">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${path.startsWith(l.href) ? "bg-[#1d1d1f] text-white" : "text-[#1d1d1f]/70"}`}>
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
