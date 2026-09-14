import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowRight, BookOpenText, Clock3, LockKeyhole, Mic2 } from "lucide-react";

import { SundewLogo } from "@/components/sundew-logo";
import { Button } from "@/components/ui/button";

import { DemoQuestion } from "./_components/demo-question";

export const metadata: Metadata = {
  title: "TCF Canada practice demo — Sundew",
  description:
    "Try one original TCF-style question and see how Sundew turns the result into a focused follow-up drill.",
};

const ROUTE_STEPS = [
  { number: "01", label: "Attempt", detail: "One original TCF-style question" },
  { number: "02", label: "Understand", detail: "The reasoning, not just the answer" },
  { number: "03", label: "Retrain", detail: "A drill built from the same signal" },
] as const;

export default function DemoPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-background">
      <header className="border-b border-border/80 bg-background/95">
        <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link href="/demo" aria-label="Sundew demo home" className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
            <SundewLogo className="w-[138px] sm:w-[150px]" priority />
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-muted-foreground sm:inline-flex">
              TCF Canada demo
            </span>
            <Link
              href="/today"
              className="rounded-lg px-2 py-2 text-sm font-semibold text-foreground transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 sm:px-3"
            >
              Private app
            </Link>
          </div>
        </div>
      </header>

      <section className="relative mx-auto max-w-6xl px-5 pb-20 pt-14 sm:px-8 sm:pb-24 sm:pt-20">
        <div className="pointer-events-none absolute -right-36 -top-28 h-[420px] w-[420px] sundew-organic-shape opacity-80 sm:-right-24" aria-hidden="true" />
        <div className="relative grid items-end gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
          <div className="max-w-2xl">
            <p className="mb-5 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-focus-star" aria-hidden="true" />
              Original practice · no sign-in
            </p>
            <h1 className="max-w-[720px] text-[42px] font-bold leading-[1.06] tracking-[-0.045em] text-foreground sm:text-[56px] lg:text-[64px]">
              Practise the exam. Train the weakness behind it.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              Sundew turns a TCF answer into a specific learning signal, then uses that signal to choose what you
              should practise next.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="h-12 px-6">
                <a href="#try-demo">
                  Try one question
                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                </a>
              </Button>
              <span className="inline-flex items-center gap-2 px-2 text-sm text-muted-foreground">
                <Clock3 className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                About 3 minutes
              </span>
            </div>
          </div>

          <div className="relative lg:pb-2">
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Demo route</p>
                  <p className="mt-1 font-bold">One answer, one useful next step</p>
                </div>
                <span className="rounded-full bg-level-b1 px-2.5 py-1 font-mono text-xs font-semibold text-level-b1-ink">B1</span>
              </div>
              <ol className="mt-2">
                {ROUTE_STEPS.map((step, index) => (
                  <li key={step.number} className="grid grid-cols-[38px_1fr_auto] items-center gap-3 border-b border-border/70 py-4 last:border-0">
                    <span className="font-mono text-xs text-muted-foreground">{step.number}</span>
                    <div>
                      <p className="text-sm font-semibold">{step.label}</p>
                      <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{step.detail}</p>
                    </div>
                    {index === ROUTE_STEPS.length - 1 ? (
                      <span className="h-2.5 w-2.5 rounded-[45%_55%_58%_42%] bg-focus-star" aria-label="Focus step" />
                    ) : (
                      <ArrowRight className="h-4 w-4 text-subtle-foreground" aria-hidden="true" />
                    )}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>

      <section id="try-demo" className="scroll-mt-6 border-y border-border bg-surface-muted/60">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Interactive sample</p>
              <h2 className="mt-2 text-3xl font-bold tracking-[-0.035em] sm:text-[40px]">Try the whole learning loop</h2>
            </div>
            <p className="max-w-sm text-sm leading-6 text-muted-foreground sm:text-right">
              This question was written for the demo and is not copied from an official exam.
            </p>
          </div>
          <DemoQuestion />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:gap-20">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Two modes, one learner</p>
            <h2 className="mt-3 text-3xl font-bold tracking-[-0.035em] sm:text-[40px]">
              Exam structure now. Natural conversation next.
            </h2>
            <p className="mt-5 text-base leading-7 text-muted-foreground">
              The public demo starts with the clearest Sundew promise: measurable TCF preparation. Daily speaking
              practice can use the same error memory later, without blurring the exam experience.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-5 sm:p-7">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <Mic2 className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-bold">TCF speaking · Task 2</p>
                    <p className="mt-1 text-sm text-muted-foreground">Guided interaction with timed preparation</p>
                  </div>
                  <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-semibold text-muted-foreground">Next phase</span>
                </div>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-surface-muted px-4 py-3">
                    <p className="font-mono text-lg font-semibold">02:00</p>
                    <p className="mt-1 text-xs text-muted-foreground">Preparation</p>
                  </div>
                  <div className="rounded-xl bg-surface-muted px-4 py-3">
                    <p className="font-mono text-lg font-semibold">03:30</p>
                    <p className="mt-1 text-xs text-muted-foreground">Exchange</p>
                  </div>
                </div>
                <p className="mt-5 flex items-start gap-2 text-sm leading-6 text-muted-foreground">
                  <BookOpenText className="mt-1 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                  The speaking preview will add dialogue, a transparent score, and reusable error signals—without
                  changing this exam-first demo story.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-7 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p className="flex items-center gap-2">
            <LockKeyhole className="h-4 w-4 text-accent" strokeWidth={1.8} aria-hidden="true" />
            Public sample only. No private history, database writes, or paid AI calls.
          </p>
          <p>TCF is a trademark of France Éducation international. Sundew is not affiliated with FEI.</p>
        </div>
      </footer>
    </main>
  );
}
