"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { genderParam } from "@/lib/params";
import { ThemeToggle } from "./theme";

/** `gendered` sections carry the Men/Women choice from the URL to the next page. */
const LINKS = [
  { href: "/teams", label: "Teams", gendered: true },
  { href: "/players", label: "Players", gendered: true },
  { href: "/matches", label: "Matches", gendered: true },
  { href: "/live", label: "Live", gendered: true },
  { href: "/compare", label: "Compare", gendered: false },
  { href: "/strategy", label: "Strategy", gendered: false },
  { href: "/method", label: "Method", gendered: false },
] as const;

type LinksProps = { path: string; variant: "bar" | "menu"; onNavigate?: () => void };

function Links({ women, path, variant, onNavigate }: LinksProps & { women: boolean }) {
  return (
    <ul className={variant === "bar" ? "flex items-center gap-0.5" : "grid gap-1 py-2 sm:grid-cols-2"}>
      {LINKS.map((l) => {
        const active = path === l.href || path.startsWith(`${l.href}/`);
        return (
          <li key={l.href}>
            <Link
              href={l.gendered && women ? `${l.href}?gender=women` : l.href}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
              className={
                variant === "bar"
                  ? "relative inline-flex min-h-10 items-center rounded-control px-3 font-display text-[0.9375rem] font-semibold uppercase tracking-[0.06em] text-muted transition-colors after:absolute after:inset-x-3 after:-bottom-[0.6875rem] after:h-[3px] after:rounded-full after:bg-accent after:opacity-0 after:transition-opacity hover:text-fg aria-[current=page]:text-fg aria-[current=page]:after:opacity-100"
                  : "flex min-h-11 items-center gap-3 rounded-control px-3 font-display text-lg font-semibold uppercase tracking-[0.05em] text-fg transition-colors hover:bg-surface-2 aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent-strong"
              }
            >
              {l.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Reads ?gender from the URL; needs a Suspense boundary on statically rendered pages. */
function GenderLinks(props: LinksProps) {
  const sp = useSearchParams();
  const women = genderParam(sp.get("gender") ?? sp.get("g") ?? undefined) === "female";
  return <Links women={women} {...props} />;
}

function NavLinks(props: LinksProps) {
  return (
    <Suspense fallback={<Links women={false} {...props} />}>
      <GenderLinks {...props} />
    </Suspense>
  );
}

function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5 rounded-control py-1 pr-2 text-fg">
      <span className="grid h-8 w-8 -skew-x-6 place-items-center rounded-[0.375rem] bg-accent text-on-accent shadow-[0_0_18px_-4px_var(--accent)]" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="skew-x-6">
          <path d="M7 20V9M12 20V9M17 20V9M6 5.5h5M13 5.5h5" />
        </svg>
      </span>
      <span className="font-display text-[1.375rem] font-extrabold uppercase leading-none tracking-[0.04em]">Criclysis</span>
    </Link>
  );
}

export default function Nav() {
  const path = usePathname();
  // The menu belongs to the page it was opened on, so it closes on navigation.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenOn(null);
        document.getElementById("menu-button")?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    // A dark broadcast strip in both themes (scheme-dark resolves the tokens dark).
    <header className="sticky top-0 z-40 border-b border-line bg-bg/95 text-fg scheme-dark backdrop-blur-md supports-[not(backdrop-filter:blur(1px))]:bg-bg">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-transparent via-accent to-transparent opacity-70" />
      <div className="mx-auto flex h-15 max-w-page items-center gap-2 px-4 sm:px-6">
        <Logo />
        <nav aria-label="Main" className="ml-4 hidden lg:block">
          <NavLinks path={path} variant="bar" />
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <button
            id="menu-button"
            type="button"
            className="icon-btn lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpenOn(open ? null : path)}
          >
            <span className="sr-only">Menu</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>
      <nav id="mobile-menu" aria-label="Main" hidden={!open} className="border-t border-line bg-bg lg:hidden">
        <div className="mx-auto max-w-page px-2 sm:px-4">
          <NavLinks path={path} variant="menu" onNavigate={() => setOpenOn(null)} />
        </div>
      </nav>
    </header>
  );
}
