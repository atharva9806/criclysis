/**
 * Server helpers that look a side up by name and draw its flag (or colour
 * badge). Client components take a TeamMark prop and use Flag directly, so
 * the flag table never ships to the browser.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { teamMark } from "@/lib/teams/flags";
import { Flag, type FlagSize } from "./Flag";

export function TeamFlag({ name, size = "sm", label = false, className = "" }: { name: string; size?: FlagSize; label?: boolean; className?: string }) {
  return <Flag mark={teamMark(name)} size={size} label={label} className={className} />;
}

/** Flag and name on one line; the name links to the team page when `href` is given. */
export function TeamName({
  name,
  href,
  size = "sm",
  className = "",
  children,
}: {
  name: string;
  href?: string;
  size?: FlagSize;
  className?: string;
  /** Replaces the visible name (e.g. the team code), which then stays in the accessible name. */
  children?: ReactNode;
}) {
  const body = (
    <>
      <TeamFlag name={name} size={size} />
      <span className="min-w-0 truncate">{children ?? name}</span>
    </>
  );
  const cls = `inline-flex min-w-0 items-center gap-2 ${className}`;
  return href ? (
    <Link href={href} className={`${cls} link-quiet`}>
      {body}
    </Link>
  ) : (
    <span className={cls}>{body}</span>
  );
}
