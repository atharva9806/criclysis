"use client";

import { RouteError } from "@/components/states";

export default function MatchError(props: { error: unknown; retry?: () => void; reset?: () => void }) {
  return <RouteError {...props} what="this match" />;
}
