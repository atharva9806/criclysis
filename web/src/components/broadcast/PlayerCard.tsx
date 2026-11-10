/**
 * A player as a broadcast trading card: the photo (or initials) on a panel in
 * the team's colours, the flag and side, the name, and one headline number
 * with the sample behind it. The whole card links to the profile; the photo
 * keeps its own compact credit link above that.
 */
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { PlayerPhoto as Photo } from "@/lib/contract/pipeline";
import { teamMark } from "@/lib/teams/flags";
import { PlayerPhoto } from "../PlayerPhoto";
import { Flag } from "./Flag";

export function PlayerCard({
  href,
  name,
  team,
  photo,
  value,
  unit,
  sample,
  tag,
}: {
  href: string;
  name: string;
  team: string | null;
  photo: Photo | null;
  value: ReactNode;
  unit: string;
  sample: ReactNode;
  /** A short label over the photo, e.g. "Runs #1". */
  tag?: ReactNode;
}) {
  const mark = teamMark(team);
  const panel: CSSProperties = { background: `linear-gradient(155deg, ${mark.primary} 0%, ${mark.deep} 100%)`, color: mark.on };
  return (
    <article className="card-link group relative flex h-full flex-col overflow-hidden has-[h3_a:focus-visible]:ring-2 has-[h3_a:focus-visible]:ring-accent">
      <div className="relative overflow-hidden p-3 pb-0" style={panel}>
        {/* Two diagonal stripes in the secondary colour, like a kit trim. */}
        <span aria-hidden="true" className="absolute -right-10 top-6 h-5 w-40 rotate-[-38deg] opacity-80" style={{ background: mark.secondary }} />
        <span aria-hidden="true" className="absolute -right-10 top-12 h-1.5 w-40 rotate-[-38deg] opacity-60" style={{ background: mark.secondary }} />
        {tag ? (
          <span className="relative z-[1] mb-2 inline-flex items-center rounded-[0.25rem] bg-black/55 px-2 py-0.5 font-display text-xs font-bold uppercase tracking-[0.08em] text-white">
            {tag}
          </span>
        ) : null}
        <PlayerPhoto
          photo={photo}
          name={name}
          team={team}
          size="fill"
          credit="compact"
          avatar={{ background: mark.deep, color: mark.on }}
          // Above the card's stretched link, so the credit stays clickable; the photo itself lets clicks through to the card.
          className="pointer-events-none relative z-[2] mx-auto max-w-[11rem] translate-y-px [&_a]:pointer-events-auto [&_img]:rounded-b-none [&_img]:border-b-0"
        />
      </div>
      <div className="flex flex-1 flex-col border-t-[3px] p-3.5" style={{ borderTopColor: mark.secondary }}>
        <p className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted">
          <Flag mark={mark} size="xs" />
          <span className="truncate">{team ?? "Team not recorded"}</span>
        </p>
        <h3 className="mt-1 font-display text-xl font-bold uppercase leading-tight tracking-[0.02em]">
          <Link href={href} className="after:absolute after:inset-0 after:z-[1] after:content-['']">
            {name}
          </Link>
        </h3>
        <p className="mt-auto pt-2">
          <span className="score text-[2.25rem] text-fg">{value}</span>
          <span className="ml-1.5 font-display text-sm font-semibold uppercase tracking-[0.06em] text-muted">{unit}</span>
        </p>
        <p className="text-xs text-muted">{sample}</p>
      </div>
    </article>
  );
}
