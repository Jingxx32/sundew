"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { getSimulation } from "@/lib/actions/speaking-simulation";
import { beginSimulation, deleteSimulation, finishSimulation, flagSimulationTranscription } from "@/lib/actions/speaking-simulation";
import { useWavRecorder } from "./use-wav-recorder";

type State = NonNullable<Awaited<ReturnType<typeof getSimulation>>>;

export function SimulationWorkbench({ state }: { state: State }) {
  const router = useRouter();
  const { start, stop, isRecording, error: micError } = useWavRecorder();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);
  const pendingTurn = useRef<{ key: string; audio: Blob } | null>(null);
  const [retryPending, setRetryPending] = useState(false);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const sim = state.simulation;
  const sessionId = state.session.id;
  const seconds = now === 0 ? null : sim.phase === "preparing"
    ? Math.max(0, Math.ceil((new Date(sim.preparationEndsAt).getTime() - now) / 1000))
    : sim.phase === "conversing" && sim.conversationEndsAt
      ? Math.max(0, Math.ceil((Math.min(new Date(sim.conversationEndsAt).getTime() + sim.excludedWaitMs,
        new Date(sim.preparationEndsAt).getTime() + 480_000) - now) / 1000)) : 0;
  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await fn(); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Action failed"); }
    finally { setBusy(false); }
  }
  async function submitTurn() {
    setBusy(true); setError("");
    try {
      pendingTurn.current ??= { audio: await stop(), key: crypto.randomUUID() };
      setRetryPending(true);
      const form = new FormData(); form.append("audio", pendingTurn.current.audio, "turn.wav");
      const response = await fetch(`/api/speaking/sessions/${sessionId}/turns`, {
        method: "POST", headers: { "idempotency-key": pendingTurn.current.key }, body: form,
      });
      const result = await response.json();
      if (!response.ok) {
        // A provider error may have accepted and saved part of the turn. Reload
        // rather than replaying the same paid operation with a new key.
        pendingTurn.current = null;
        setRetryPending(false);
        throw new Error(result.error ?? "Turn was not saved");
      }
      if (result.status === "silence") setError("No usable speech detected. Please try again.");
      if (result.status === "processing") setError("This turn is still processing; refresh to see saved progress.");
      if (result.status === "partial") setError("Your speech was saved, but the partner response did not finish. You can continue or end this session.");
      if (result.status === "failed") setError("This turn failed before any speech was saved. Record a new turn to continue.");
      if (result.status !== "processing") { pendingTurn.current = null; setRetryPending(false); }
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Audio upload failed"); }
    finally { setBusy(false); }
  }
  async function removeSession() {
    if (!window.confirm("Delete this practice session, transcript, feedback, and recordings?")) return;
    setBusy(true); setError("");
    try { await deleteSimulation(sessionId); router.push("/speaking/task-2"); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not delete session"); setBusy(false); }
  }
  return <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
    <Link href="/speaking/task-2" className="text-sm text-accent hover:underline">← Task 2 practice</Link>
    <h1 className="mt-7 text-3xl font-semibold tracking-[-0.025em]">{sim.scenarioSnapshot.title}</h1>
    <p className="mt-2 text-sm text-muted-foreground">{sim.phase === "preparing" ? "Preparation" : sim.phase === "conversing" ? "Conversation" : "Conversation saved"} · Practice timer, with provider waiting excluded</p>
    <section className="mt-7 rounded-2xl border border-border bg-surface p-6">
      <p lang="fr" className="leading-7">{sim.scenarioSnapshot.instruction}</p>
      {sim.phase !== "finished" && <p className="mt-5 font-mono text-3xl" aria-label={seconds === null ? "Timer loading" : `${seconds} seconds remaining`}>
        {seconds === null ? "--:--" : `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`}
      </p>}
      {sim.phase === "preparing" && <button disabled={busy} onClick={() => act(() => beginSimulation(sessionId, sim.revision))}
        className="mt-5 rounded-lg bg-accent px-4 py-2 text-white disabled:opacity-50">Begin conversation</button>}
      {sim.phase === "conversing" && <div className="mt-5 flex flex-wrap gap-3">
        <button disabled={busy || (seconds === 0 && !isRecording && !retryPending)} onClick={() => isRecording || pendingTurn.current ? submitTurn() : start().catch((e) => setError(String(e)))}
          className="rounded-lg bg-accent px-4 py-2 text-white disabled:opacity-50">{isRecording ? "Stop and send" : retryPending ? "Retry submission" : "Record a question"}</button>
        <button disabled={busy || isRecording} onClick={() => act(() => finishSimulation(sessionId, seconds === 0 ? "time_expired" : "user_finished"))}
          className="rounded-lg border border-border px-4 py-2 disabled:opacity-50">Finish conversation</button>
      </div>}
      {sim.phase === "finished" && <Link href={`/speaking/sessions/${sessionId}/feedback`}
        className="mt-5 inline-block rounded-lg bg-accent px-4 py-2 text-white">View feedback and follow-up</Link>}
      {(error || micError) && <p role="alert" className="mt-4 text-sm text-danger">{error || micError}</p>}
      {busy && <p role="status" className="mt-3 text-sm text-muted-foreground">Processing…</p>}
    </section>
    <section className="mt-8" aria-labelledby="transcript-heading">
      <h2 id="transcript-heading" className="text-xl font-semibold">Saved conversation</h2>
      {state.turns.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No confirmed turns yet. Audio still in your browser is not saved.</p> :
        <ol className="mt-4 space-y-3">{state.turns.map((turn) => <li id={`turn-${turn.id}`} key={turn.id} className="scroll-mt-6 rounded-xl border border-border bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">{turn.role === "user" ? "You" : "Receptionist"}</p>
          <p lang="fr" className="mt-2">{turn.text}</p>
          {turn.role === "user" && (turn.transcriptionDisputedAt
            ? <p className="mt-2 text-xs text-muted-foreground">Transcription flagged as inaccurate; excluded from new feedback.</p>
            : <button type="button" disabled={busy} onClick={() => act(() => flagSimulationTranscription(sessionId, turn.id))}
              className="mt-2 text-xs text-accent underline disabled:opacity-50">Flag inaccurate transcription</button>)}
          {turn.audioPath && <audio className="mt-3 w-full" controls preload="none" src={turn.audioPath} aria-label={`${turn.role === "user" ? "Your" : "Receptionist"} recording`} />}
          {turn.role === "examiner" && !turn.audioPath && <p className="mt-2 text-xs text-muted-foreground">Audio unavailable for this reply.</p>}
        </li>)}</ol>}
    </section>
    <button type="button" disabled={busy} onClick={removeSession} className="mt-10 text-sm text-danger underline disabled:opacity-50">Delete this session</button>
  </main>;
}
