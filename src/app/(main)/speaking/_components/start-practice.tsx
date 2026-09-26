"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { startSimulation } from "@/lib/actions/speaking-simulation";

export function StartPractice({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const key = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function start() {
    key.current ??= crypto.randomUUID();
    setBusy(true);
    setError("");
    try { router.push(`/speaking/sessions/${await startSimulation(key.current)}`); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not start practice"); setBusy(false); }
  }
  return <>
    <button type="button" onClick={start} disabled={!enabled || busy} className="rounded-lg bg-accent px-5 py-2.5 font-medium text-white disabled:opacity-50">
      {busy ? "Starting…" : "Start Task 2 practice"}
    </button>
    {!enabled && <p className="mt-2 text-sm text-muted-foreground">The private voice pilot is currently unavailable.</p>}
    {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
  </>;
}
