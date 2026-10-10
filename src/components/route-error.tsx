"use client";

import { useEffect } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { userErrorCode, userErrorMessage } from "@/lib/user-error";

/** Fallback for an error.tsx boundary: says what happened when we know, and offers a retry. */
export function RouteError({
  error,
  retry,
  homeHref = "/today",
}: {
  error: Error & { digest?: string };
  retry: () => void;
  homeHref?: string;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const code = userErrorCode(error);
  const signedOut = code === "UNAUTHENTICATED";

  return (
    <div className="mx-auto max-w-xl px-5 py-12 sm:px-8 sm:py-16">
      <section role="alert" className="rounded-2xl bg-surface p-6 shadow-card sm:p-8">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-danger-soft text-danger">
          <TriangleAlert className="h-5 w-5" aria-hidden="true" />
        </span>
        <h1 className="mt-6 text-[28px] font-bold tracking-[-0.025em]">
          {code ? "That didn't go through" : "Something went wrong"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {userErrorMessage(error, "The page hit an unexpected error. Your saved work is safe; try again in a moment.")}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {signedOut ? (
            <Button asChild>
              <Link href="/login">Sign in</Link>
            </Button>
          ) : (
            <Button onClick={retry}>Try again</Button>
          )}
          <Button variant="outline" asChild>
            <Link href={homeHref}>Back to Today</Link>
          </Button>
        </div>
        {!code && error.digest && (
          <p className="mt-6 text-xs text-subtle-foreground">Reference: {error.digest}</p>
        )}
      </section>
    </div>
  );
}
