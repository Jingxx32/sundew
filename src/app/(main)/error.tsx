"use client";

import { RouteError } from "@/components/route-error";

export default function MainError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <RouteError error={error} retry={unstable_retry} />;
}
