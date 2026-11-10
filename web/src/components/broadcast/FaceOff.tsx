/**
 * Two sides facing each other, broadcast style: each half in its own
 * colours with its flag and name, split by an angled seam. Each half's text
 * uses that side's `on` colour (4.5:1 or more on its own colours). On narrow
 * screens the halves stack.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import type { TeamMark } from "@/lib/teams/flags";
import { Flag } from "./Flag";

function Half({ mark, href, align, children }: { mark: TeamMark; href?: string; align: "left" | "right"; children?: ReactNode }) {
  const right = align === "right";
  return (
    <div
      className={`on-team relative flex min-w-0 flex-1 items-center gap-4 px-4 py-6 sm:px-6 md:py-9 ${right ? "md:flex-row-reverse md:text-right" : ""}`}
      style={{ background: `linear-gradient(${right ? 250 : 110}deg, ${mark.primary} 0%, ${mark.deep} 100%)`, color: mark.on }}
    >
      <Flag mark={mark} size="xl" label className="shadow-[0_12px_26px_-12px_rgb(0_0_0/0.6)]" />
      <div className="min-w-0">
        <p className="font-display text-sm font-bold uppercase tracking-[0.1em]">{mark.code}</p>
        <p className="font-display text-[2rem] font-extrabold uppercase leading-none sm:text-[2.75rem]">
          {href ? (
            <Link href={href} className="underline-offset-4 hover:underline">
              {mark.name}
            </Link>
          ) : (
            mark.name
          )}
        </p>
        {children}
      </div>
    </div>
  );
}

export function FaceOff({ a, b, hrefA, hrefB }: { a: TeamMark; b: TeamMark; hrefA?: string; hrefB?: string }) {
  return (
    <div className="relative flex flex-col overflow-hidden rounded-panel shadow-pop md:flex-row">
      <Half mark={a} href={hrefA} align="left" />
      <span
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 z-[1] hidden h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 border-bg bg-surface font-display text-xl font-extrabold uppercase text-fg md:grid"
      >
        v
      </span>
      <span aria-hidden="true" className="h-1 bg-bg md:hidden" />
      <Half mark={b} href={hrefB} align="right" />
    </div>
  );
}
