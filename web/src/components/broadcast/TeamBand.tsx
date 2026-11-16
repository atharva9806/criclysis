/**
 * A hero band in a side's colours: a primary-to-deep gradient, kit-trim
 * stripes in the secondary colour, the team code as a faint watermark and,
 * optionally, the floodlit ground fading in on the right. Text inside uses
 * the side's `on` colour, which lib/teams/colors.ts keeps at 4.5:1 or more
 * against both ends of the gradient. Decoration never sits behind text on
 * narrow screens.
 */
import type { CSSProperties, ReactNode } from "react";
import type { TeamMark } from "@/lib/teams/flags";
import { Ground } from "./Ground";

export function TeamBand({ mark, children, ground = false, label }: { mark: TeamMark; children: ReactNode; ground?: boolean; label?: string }) {
  const style: CSSProperties = {
    background: `linear-gradient(105deg, ${mark.primary} 0%, ${mark.primary} 40%, ${mark.deep} 100%)`,
    color: mark.on,
    borderBottomColor: mark.secondary,
  };
  return (
    <section aria-label={label} className="on-team relative isolate overflow-hidden border-b-4" style={style}>
      {ground ? (
        <div aria-hidden="true" className="absolute inset-y-0 right-0 hidden w-[45%] opacity-75 [mask-image:linear-gradient(to_right,transparent,black_50%)] md:block">
          <Ground variant="band" id="band-ground" />
        </div>
      ) : null}
      <span aria-hidden="true" className="absolute inset-y-0 right-[9%] hidden w-7 -skew-x-[20deg] opacity-90 md:block" style={{ background: mark.secondary }} />
      <span aria-hidden="true" className="absolute inset-y-0 right-[calc(9%+2.75rem)] hidden w-2 -skew-x-[20deg] opacity-70 md:block" style={{ background: mark.secondary }} />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-6 -right-4 hidden select-none font-display text-[12rem] font-extrabold uppercase leading-none tracking-tight opacity-[0.07] lg:block"
      >
        {mark.code}
      </span>
      {/* The right quarter is kept for the stripes and the ground, so text never sits on them. */}
      <div className="relative mx-auto w-full max-w-page px-4 py-7 sm:px-6 md:py-11 md:pr-[24%]">{children}</div>
    </section>
  );
}
