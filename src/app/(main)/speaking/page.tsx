export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowDown, AudioLines, Clock3, MessagesSquare } from "lucide-react";
import { listPromptsWithStats } from "@/lib/actions/speaking";
import { Button } from "@/components/ui/button";
import { PromptList } from "./_components/prompt-list";

export default async function SpeakingPage() {
  const prompts = await listPromptsWithStats();

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="max-w-2xl">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
          TCF Canada
        </p>
        <h1 className="text-[38px] font-bold tracking-[-0.035em]">Expression orale</h1>
        <p className="mt-2 text-[15px] leading-6 text-muted-foreground">
          Rehearse the exam interaction, then slow down and refine the parts that need work.
        </p>
      </header>

      <section aria-labelledby="speaking-modes" className="mt-9">
        <h2 id="speaking-modes" className="sr-only">
          Practice modes
        </h2>
        <div className="grid gap-4 lg:grid-cols-[1.45fr_1fr]">
          <article className="relative overflow-hidden rounded-2xl bg-surface-blue p-6 sm:p-8">
            <div
              className="sundew-organic-shape pointer-events-none absolute -right-16 -top-24 h-56 w-56 bg-accent-soft-strong/70"
              aria-hidden="true"
            />
            <div className="relative">
              <div className="flex items-center justify-between gap-4">
                <span className="inline-flex items-center gap-2 text-xs font-semibold text-accent">
                  <MessagesSquare className="h-4 w-4" aria-hidden="true" />
                  Exam simulation
                </span>
                <span className="rounded-full bg-surface/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                  Live dialogue next
                </span>
              </div>

              <h2 className="mt-7 max-w-md text-2xl font-bold tracking-[-0.025em]">
                Tâche 2 · Obtain information through conversation
              </h2>
              <p className="mt-3 max-w-xl text-[15px] leading-6 text-muted-foreground">
                You lead the exchange with questions. The AI stays in character, answers naturally,
                and saves feedback until the simulation ends.
              </p>

              <div className="mt-7 grid grid-cols-3 overflow-hidden rounded-xl border border-accent/10 bg-surface/75">
                {[
                  ["Prepare", "02:00"],
                  ["Exchange", "03:30"],
                  ["Review", "After"],
                ].map(([label, value], index) => (
                  <div
                    key={label}
                    className={`px-3 py-3.5 sm:px-4 ${index > 0 ? "border-l border-accent/10" : ""}`}
                  >
                    <div className="font-mono text-base font-semibold text-foreground">{value}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div>
                  </div>
                ))}
              </div>

              <p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
                <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                The full exam flow will open here in the next stage.
              </p>
            </div>
          </article>

          <article className="flex flex-col rounded-2xl border border-border/80 bg-surface p-6 shadow-card sm:p-8">
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-accent">
              <AudioLines className="h-4 w-4" aria-hidden="true" />
              Pronunciation lab
            </span>
            <h2 className="mt-7 text-xl font-bold tracking-[-0.02em]">Build a clear, confident delivery</h2>
            <p className="mt-3 flex-1 text-[15px] leading-6 text-muted-foreground">
              Generate a personal reference script, record it sentence by sentence, and inspect
              Azure pronunciation feedback down to individual words.
            </p>
            <Button asChild variant="outline" className="mt-7 w-full">
              <Link href="#pronunciation-lab">
                Choose a prompt
                <ArrowDown className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </article>
        </div>
      </section>

      <section id="pronunciation-lab" aria-labelledby="pronunciation-heading" className="mt-14 scroll-mt-8">
        <div className="mb-6 max-w-2xl">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Pronunciation lab
          </p>
          <h2 id="pronunciation-heading" className="text-2xl font-bold tracking-[-0.025em]">
            Choose a prompt to rehearse
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            This mode uses a reference script. It supports exam preparation, but it does not simulate
            a live examiner.
          </p>
        </div>
        <PromptList prompts={prompts} />
      </section>
    </div>
  );
}
