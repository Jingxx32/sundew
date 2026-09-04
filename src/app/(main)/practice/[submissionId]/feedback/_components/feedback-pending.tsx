"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { FeedbackRetry } from "./feedback-retry";

/** after() isn't durable — a dev-server restart mid-generation strands the
 *  submission in 'pending'. Past this age we stop spinning and offer retry. */
const STALE_PENDING_MS = 3 * 60_000;

/** Shown while feedback generates in the background (after()); polls until the
 *  server component re-renders with feedback (status flips to ready/failed).
 *  If the submission has been pending past the staleness window, the background
 *  job likely died with the process — switch to the retry card. */
export function FeedbackPending({
  submissionId,
  submittedAtMs,
}: {
  submissionId: string;
  submittedAtMs: number;
}) {
  const router = useRouter();
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const check = () => setStale(Date.now() - submittedAtMs > STALE_PENDING_MS);
    check();
    const t = setInterval(() => {
      check();
      router.refresh();
    }, 4000);
    return () => clearInterval(t);
  }, [router, submittedAtMs]);

  if (stale) return <FeedbackRetry submissionId={submissionId} stalePending />;

  return (
    <div className="max-w-md mx-auto rounded-2xl border border-border bg-surface shadow-card px-8 py-10 text-center space-y-4">
      <Loader2 className="h-6 w-6 animate-spin text-accent mx-auto" />
      <h2 className="text-xl font-semibold">Generating feedback…</h2>
      <p className="text-sm text-muted-foreground">
        Your writing is saved. The AI is analysing it — this usually takes 20–40
        seconds. This page updates automatically.
      </p>
    </div>
  );
}
