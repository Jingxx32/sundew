"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { getSimulation } from "@/lib/actions/speaking-simulation";
import { generateSimulationFeedback, startFollowUp } from "@/lib/actions/speaking-simulation";
import { DRILLS, type DrillId } from "@/lib/speaking/scenario";
import { useWavRecorder } from "./use-wav-recorder";

type State = NonNullable<Awaited<ReturnType<typeof getSimulation>>>;

export function FeedbackWorkbench({ state }: { state: State }) {
  const router = useRouter();
  const { start, stop, isRecording, error: micError } = useWavRecorder();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const followUpRequest = useRef<string | null>(null);
  const assessment = state.assessment;
  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await fn(); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Action failed"); }
    finally { setBusy(false); }
  }
  async function submitFollowUp(id: string) {
    setBusy(true); setError("");
    try {
      const form = new FormData(); form.append("audio", await stop(), "follow-up.wav");
      followUpRequest.current ??= crypto.randomUUID();
      const response = await fetch(`/api/speaking/follow-ups/${id}`, {
        method: "POST", headers: { "idempotency-key": followUpRequest.current }, body: form,
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 502) followUpRequest.current = null;
        throw new Error(result.error ?? "Follow-up failed");
      }
      followUpRequest.current = null;
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Follow-up failed"); }
    finally { setBusy(false); }
  }
  if (state.simulation.phase !== "finished") return <p className="mt-8">Finish the conversation before requesting feedback.</p>;
  return <>
    {!assessment && <section className="mt-7 rounded-xl border border-border bg-surface p-5">
      <p>Generate a practice assessment from the saved conversation.</p>
      <button disabled={busy} onClick={() => act(() => generateSimulationFeedback(state.session.id))}
        className="mt-4 rounded-lg bg-accent px-4 py-2 text-white disabled:opacity-50">Generate feedback</button>
    </section>}
    {assessment?.status === "pending" && <p className="mt-7">Assessment is processing. Refresh to check its status.</p>}
    {assessment?.status === "failed" && <div className="mt-7">
      <p role="alert" className="text-danger">Feedback could not be validated. Your conversation remains saved.</p>
      <button disabled={busy} onClick={() => act(() => generateSimulationFeedback(state.session.id))}
        className="mt-3 rounded-lg border border-accent px-4 py-2 text-accent disabled:opacity-50">Retry feedback</button>
    </div>}
    {assessment?.result && <section className="mt-7 space-y-7">
      <div className="rounded-xl border border-border bg-surface p-5"><h2 className="font-semibold">Summary</h2><p className="mt-2">{assessment.result.summary}</p></div>
      {assessment.result.strengths.length > 0 && <div><h2 className="text-lg font-semibold">What worked</h2>
        <ul className="mt-3 space-y-3">{assessment.result.strengths.map((item, i) => <li key={i} className="rounded-xl border border-border bg-surface p-4">
          <p>{item.text}</p><p lang="fr" className="mt-2 text-sm text-muted-foreground">Evidence: “{item.quote}”</p>
          <Link href={`/speaking/sessions/${state.session.id}#turn-${item.turnId}`} className="mt-2 inline-block text-xs text-accent underline">Open source turn</Link>
        </li>)}</ul></div>}
      {assessment.result.issues.length > 0 && <div><h2 className="text-lg font-semibold">Focus areas</h2>
        <ul className="mt-3 space-y-3">{assessment.result.issues.map((item) => <li key={item.id} className="rounded-xl border border-border bg-surface p-4">
          <p>{item.explanation}</p><p lang="fr" className="mt-2 text-sm text-muted-foreground">You said: “{item.quote}”</p>
          <Link href={`/speaking/sessions/${state.session.id}#turn-${item.turnId}`} className="mt-2 inline-block text-xs text-accent underline">Open source turn</Link>
          <p lang="fr" className="mt-2 text-sm">Example: {item.example}</p>
          {item.drillId && state.followUps.length === 0 && <button disabled={busy}
            onClick={() => act(() => startFollowUp(assessment.id, item.id))}
            className="mt-3 rounded-lg border border-accent px-3 py-1.5 text-sm text-accent disabled:opacity-50">Practice this point</button>}
        </li>)}</ul></div>}
      {assessment.result.limitations.length > 0 && <div><h2 className="font-semibold">Limits of this feedback</h2>
        <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">{assessment.result.limitations.map((item, i) => <li key={i}>{item}</li>)}</ul>
      </div>}
    </section>}
    {state.followUps.length > 0 && <section className="mt-9"><h2 className="text-xl font-semibold">Follow-up practice</h2>
      {state.followUps.map((item) => {
        const drill = DRILLS[item.drillId as DrillId];
        return <div key={item.id} className="mt-4 rounded-xl border border-border bg-surface p-5">
          <h3 className="font-semibold">{drill?.title ?? "Focused practice"}</h3>
          <p lang="fr" className="mt-3">{item.prompt}</p>
          <p lang="fr" className="mt-2 text-sm text-muted-foreground">Example: {drill?.example}</p>
          {!item.transcript && <button disabled={busy} onClick={() => isRecording ? submitFollowUp(item.id) : start().catch((e) => setError(String(e)))}
            className="mt-4 rounded-lg bg-accent px-4 py-2 text-white disabled:opacity-50">{isRecording ? "Stop and save attempt" : "Record an answer"}</button>}
          {item.transcript && <div className="mt-4"><p lang="fr">Your answer: {item.transcript}</p><p className="mt-2 text-sm">{item.feedback}</p>
            {item.audioPath && <audio className="mt-3 w-full" controls preload="none" src={item.audioPath} aria-label="Your follow-up recording" />}</div>}
        </div>;
      })}
    </section>}
    {(error || micError) && <p role="alert" className="mt-5 text-sm text-danger">{error || micError}</p>}
    {busy && <p role="status" className="mt-3 text-sm">Processing…</p>}
  </>;
}
