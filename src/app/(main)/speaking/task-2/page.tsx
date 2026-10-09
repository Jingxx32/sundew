export const dynamic = "force-dynamic";

import Link from "next/link";
import { listSimulations } from "@/lib/actions/speaking-simulation";
import { simulationEnabled } from "@/lib/speaking/operations";
import { SCENARIO } from "@/lib/speaking/scenario";
import { StartPractice } from "../_components/start-practice";
import { pageGate } from "@/lib/access/page-gate";

export default async function TaskTwoPage() {
  const locked = await pageGate("speaking");
  if (locked) return locked;
  const history = await listSimulations();
  const enabled = simulationEnabled();
  return <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
    <Link href="/speaking" className="text-sm text-accent hover:underline">← Speaking</Link>
    <p className="mt-8 text-xs font-semibold uppercase tracking-widest text-accent">TCF Canada · Task 2 practice</p>
    <h1 className="mt-2 text-3xl font-semibold tracking-[-0.025em]">Lead an information seeking conversation</h1>
    <p className="mt-3 text-muted-foreground">Prepare for 2 minutes, then ask questions for approximately 3 minutes 30 seconds. The partner responds aloud. This is practice, not an official TCF assessment; provider waiting time is excluded from the practice timer.</p>
    <section className="mt-8 rounded-2xl border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold">{SCENARIO.title}</h2>
      <p lang="fr" className="mt-3 leading-7">{SCENARIO.instruction}</p>
      <p className="mt-5 text-sm text-muted-foreground">Your recordings and transcript are private. Speech and AI providers process your turns. Recordings expire after 30 days; saved transcript and feedback remain until you delete this practice session.</p>
      <p className="mt-2 text-sm text-muted-foreground">Allow microphone access when prompted. A working microphone and audio playback are needed for the full voice experience.</p>
      <div className="mt-6"><StartPractice enabled={enabled} /></div>
    </section>
    <section className="mt-10" aria-labelledby="history-heading">
      <h2 id="history-heading" className="text-xl font-semibold">Recent Task 2 practice</h2>
      {history.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No sessions yet.</p> :
        <ul className="mt-4 space-y-2">{history.map((item) => <li key={item.id}>
          <Link className="block rounded-xl border border-border bg-surface px-4 py-3 hover:border-accent" href={`/speaking/sessions/${item.id}`}>
            <span className="font-medium">{item.title.title}</span>
            <span className="ml-2 text-xs text-muted-foreground">{item.startedAt.toLocaleDateString("en-CA")} · {item.phase}</span>
          </Link>
        </li>)}</ul>}
    </section>
  </main>;
}
