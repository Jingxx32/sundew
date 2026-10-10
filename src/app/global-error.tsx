"use client";

import "./globals.css";
import { RouteError } from "@/components/route-error";

/** Replaces the root layout when it fails, so it brings its own html, body and styles. */
export default function GlobalError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <title>Something went wrong · Sundew</title>
        <RouteError error={error} retry={unstable_retry} homeHref="/" />
      </body>
    </html>
  );
}
