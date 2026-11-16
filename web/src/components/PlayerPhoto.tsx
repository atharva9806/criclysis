import type { CSSProperties } from "react";
import type { PlayerPhoto as Photo } from "@/lib/contract/pipeline";

export type PlayerPhotoSize = "xs" | "sm" | "md" | "lg" | "xl" | "fill";

/** Width per size; the height follows from the fixed 4:5 portrait ratio. */
const WIDTH: Record<PlayerPhotoSize, string> = {
  xs: "w-10",
  sm: "w-12",
  md: "w-20",
  lg: "w-24 sm:w-32",
  xl: "w-28 sm:w-40 lg:w-44",
  fill: "w-full",
};
const INITIALS_TEXT: Record<PlayerPhotoSize, string> = {
  xs: "text-sm",
  sm: "text-base",
  md: "text-xl",
  lg: "text-2xl sm:text-3xl",
  xl: "text-3xl sm:text-5xl",
  fill: "text-5xl",
};

/** "V Kohli" -> "VK", "Shakib Al Hasan" -> "SH", "Sikandar" -> "S". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const first = Array.from(words[0])[0];
  const last = words.length > 1 ? Array.from(words[words.length - 1])[0] : "";
  return (first + last).toUpperCase();
}

/** The licence, linked to its deed when Commons gives one. */
function License({ photo, className }: { photo: Photo; className: string }) {
  return photo.licenseUrl ? (
    <a href={photo.licenseUrl} rel="license" className={className}>
      {photo.license}
    </a>
  ) : (
    <>{photo.license}</>
  );
}

/**
 * A player's photo from Wikimedia Commons with its credit, or an initials
 * avatar when there is none. A plain <img> (not next/image) so the thumbnail
 * comes straight from upload.wikimedia.org without using Vercel's image
 * optimisation. The credit is always visible: the licences (CC BY and
 * CC BY-SA, GODL-India) require it.
 *
 * - `credit="full"` (the default): "Photo: author, licence" under the image,
 *   linked to the file page and the licence deed.
 * - `credit="compact"`, for dense cards and lists: a "©" link to the file page
 *   on the image (40px hit area), whose accessible name is the full credit;
 *   hovering the photo or focusing the link shows the credit as a caption.
 *   The profile page always shows the full credit.
 * - `tone="inherit"` draws the full credit in the surrounding text colour, for
 *   team-colour bands where the accent would not have enough contrast.
 */
export function PlayerPhoto({
  photo,
  name,
  team,
  size = "md",
  credit = "full",
  tone = "default",
  avatar,
  className = "",
}: {
  photo?: Photo | null;
  name: string;
  /** The team the player represents; names the avatar when there is no photo. */
  team?: string | null;
  size?: PlayerPhotoSize;
  credit?: "full" | "compact";
  tone?: "default" | "inherit";
  /** Background and text colour of the initials avatar (e.g. the team's colours). */
  avatar?: { background: string; color: string };
  className?: string;
}) {
  const frame = "aspect-[4/5] rounded-card border border-line bg-surface-3";
  if (!photo) {
    const style: CSSProperties | undefined = avatar ? { background: avatar.background, color: avatar.color, borderColor: "transparent" } : undefined;
    return (
      <div
        role="img"
        aria-label={`${name}${team ? `, ${team}` : ""}: no photo available`}
        className={`${WIDTH[size]} ${frame} grid shrink-0 select-none place-items-center font-display font-bold ${avatar ? "" : "text-muted"} ${INITIALS_TEXT[size]} ${className}`}
        style={style}
      >
        <span aria-hidden="true">{initials(name)}</span>
      </div>
    );
  }
  const img = (
    // eslint-disable-next-line @next/next/no-img-element -- a Commons thumbnail, deliberately not next/image (no Vercel image quota)
    <img src={photo.thumbUrl} alt={name} loading="lazy" decoding="async" className={`${frame} block w-full object-cover object-top`} />
  );

  if (credit === "compact") {
    return (
      <figure className={`group/photo relative ${WIDTH[size]} shrink-0 ${className}`}>
        {img}
        <figcaption>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-card bg-black/80 px-2 pb-1.5 pr-8 pt-1 text-[0.6875rem] leading-snug text-white opacity-0 transition-opacity group-hover/photo:opacity-100 group-has-[a:focus-visible]/photo:opacity-100"
          >
            Photo: {photo.author}, {photo.license}
          </span>
          <a
            href={photo.pageUrl}
            className="absolute bottom-1 right-1 z-[2] grid h-6 w-6 place-items-center rounded-full bg-black/75 text-xs font-semibold text-white ring-1 ring-white/40 transition-colors before:absolute before:-inset-2 before:content-[''] hover:bg-black"
          >
            <span aria-hidden="true">©</span>
            <span className="sr-only">
              Photo: {photo.author}, {photo.license} (Wikimedia Commons)
            </span>
          </a>
        </figcaption>
      </figure>
    );
  }

  const linkCls = tone === "inherit" ? "font-normal underline underline-offset-2" : "link font-normal";
  return (
    <figure className={`${WIDTH[size]} shrink-0 ${className}`}>
      {img}
      <figcaption className={`mt-1.5 break-words text-[0.6875rem] leading-snug ${tone === "inherit" ? "" : "text-muted"}`}>
        Photo:{" "}
        <a href={photo.pageUrl} className={linkCls}>
          {photo.author}
        </a>
        , <License photo={photo} className={linkCls} />
      </figcaption>
    </figure>
  );
}
