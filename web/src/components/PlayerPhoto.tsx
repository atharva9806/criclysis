import type { PlayerPhoto as Photo } from "@/lib/contract/pipeline";

export type PlayerPhotoSize = "sm" | "md" | "lg";

/** Width per size; the height follows from the fixed 4:5 portrait ratio. */
const WIDTH: Record<PlayerPhotoSize, string> = {
  sm: "w-12",
  md: "w-20",
  lg: "w-24 sm:w-32",
};
const INITIALS_TEXT: Record<PlayerPhotoSize, string> = {
  sm: "text-base",
  md: "text-xl",
  lg: "text-2xl sm:text-3xl",
};

/** "V Kohli" -> "VK", "Shakib Al Hasan" -> "SH", "Sikandar" -> "S". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const first = Array.from(words[0])[0];
  const last = words.length > 1 ? Array.from(words[words.length - 1])[0] : "";
  return (first + last).toUpperCase();
}

/**
 * A player's photo from Wikimedia Commons with its credit, or a neutral
 * initials avatar when there is none. A plain <img> (not next/image) so the
 * thumbnail comes straight from upload.wikimedia.org without using Vercel's
 * image optimisation. The credit is always visible: the licences (CC BY and
 * CC BY-SA, GODL-India) require it.
 */
export function PlayerPhoto({
  photo,
  name,
  team,
  size = "md",
}: {
  photo?: Photo | null;
  name: string;
  /** The team the player represents; names the avatar when there is no photo. */
  team?: string | null;
  size?: PlayerPhotoSize;
}) {
  const frame = "aspect-[4/5] rounded-card border border-line bg-surface-3";
  if (!photo) {
    return (
      <div
        role="img"
        aria-label={`${name}${team ? `, ${team}` : ""}: no photo available`}
        className={`${WIDTH[size]} ${frame} grid shrink-0 select-none place-items-center font-semibold text-muted ${INITIALS_TEXT[size]}`}
      >
        <span aria-hidden="true">{initials(name)}</span>
      </div>
    );
  }
  return (
    <figure className={`${WIDTH[size]} shrink-0`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a Commons thumbnail, deliberately not next/image (no Vercel image quota) */}
      <img src={photo.thumbUrl} alt={name} loading="lazy" decoding="async" className={`${frame} block w-full object-cover object-top`} />
      <figcaption className="mt-1.5 break-words text-[0.6875rem] leading-snug text-muted">
        Photo:{" "}
        <a href={photo.pageUrl} className="link font-normal">
          {photo.author}
        </a>
        ,{" "}
        {photo.licenseUrl ? (
          <a href={photo.licenseUrl} rel="license" className="link font-normal">
            {photo.license}
          </a>
        ) : (
          photo.license
        )}
      </figcaption>
    </figure>
  );
}
