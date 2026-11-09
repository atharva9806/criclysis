"use client";

import { RouteError } from "@/components/states";

export default function LiveError(props: { error: unknown; retry?: () => void; reset?: () => void }) {
  return <RouteError {...props} what="the latest results" />;
}
