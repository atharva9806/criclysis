/**
 * A side's flag, or a badge in its colours with its code where there is no
 * national flag (West Indies, composite XIs) or the national flag would be
 * wrong (Ireland plays for the whole island). Pure and hook-free, so client
 * components can use it with a TeamMark passed down from the server.
 */
import type { CSSProperties } from "react";
import type { TeamMark } from "@/lib/teams/flags";

export type FlagSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

/** Width and height in px, always 4:3 (flag-icons' 4x3 set). */
const PX: Record<FlagSize, [number, number]> = {
  xs: [16, 12],
  sm: [20, 15],
  md: [28, 21],
  lg: [40, 30],
  xl: [64, 48],
  "2xl": [96, 72],
};
const BADGE_TEXT: Record<FlagSize, string> = {
  xs: "text-[7px]",
  sm: "text-[8px]",
  md: "text-[10px]",
  lg: "text-sm",
  xl: "text-xl",
  "2xl": "text-3xl",
};

export type FlagMark = Pick<TeamMark, "name" | "code" | "primary" | "on" | "flagSrc">;

/**
 * Decorative by default (the side's name is next to it). Pass `label` when
 * the flag stands alone, and it is announced as "Flag of India" or
 * "West Indies colours".
 */
export function Flag({ mark, size = "sm", label = false, className = "" }: { mark: FlagMark; size?: FlagSize; label?: boolean; className?: string }) {
  const [w, h] = PX[size];
  const name = label ? (mark.flagSrc ? `Flag of ${mark.name}` : `${mark.name} colours`) : undefined;
  const frame = `inline-block shrink-0 overflow-hidden rounded-[2px] align-middle shadow-[0_0_0_1px_rgb(0_0_0/0.25)] ${size === "xl" || size === "2xl" ? "rounded-[4px]" : ""} ${className}`;
  if (mark.flagSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a tiny static SVG; next/image adds nothing here
      <img src={mark.flagSrc} alt={name ?? ""} width={w} height={h} loading="lazy" decoding="async" className={`${frame} object-cover`} style={{ width: w, height: h }} />
    );
  }
  const style: CSSProperties = { width: w, height: h, background: mark.primary, color: mark.on };
  return (
    <span role={label ? "img" : undefined} aria-label={name} aria-hidden={label ? undefined : true} className={`${frame} grid place-items-center font-display font-extrabold leading-none tracking-[0.02em] ${BADGE_TEXT[size]}`} style={style}>
      {size === "xs" ? mark.code.slice(0, 2) : mark.code}
    </span>
  );
}
