"use client";

import { RouteError } from "@/components/states";

export default function MethodError(props: { error: unknown; retry?: () => void; reset?: () => void }) {
  return <RouteError {...props} what="the method notes" />;
}
