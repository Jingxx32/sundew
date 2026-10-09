import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { listRecentSubmissions } from "@/lib/actions/tasks";

/** A guest's first stop: the three places in the sample workspace that show the learning loop best. */
export async function GuestStartHere() {
  const [sample] = await listRecentSubmissions(1);
  const steps = [
    {
      title: "See AI writing feedback",
      detail: "A sample answer with every error classified",
      href: sample ? `/practice/${sample.id}/feedback` : "/practice",
    },
    { title: "Find the weak spots", detail: "How errors roll up into a learner profile", href: "/progress" },
    { title: "Try a conjugation drill", detail: "Live, auto-graded practice", href: "/conjugation" },
  ];

  return (
    <section aria-labelledby="start-here" className="mb-6 rounded-2xl border border-border/80 bg-surface p-5 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Start here</p>
      <h2 id="start-here" className="mt-2 text-lg font-semibold">Welcome — you&apos;re in a sample workspace</h2>
      <p className="mt-1 text-sm text-muted-foreground">It&apos;s set up as an A2 learner. Three places show the learning loop best:</p>
      <ol className="mt-4 grid gap-3 sm:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title}>
            <Link
              href={step.href}
              className="group flex h-full flex-col rounded-xl border border-border/80 p-4 transition-colors hover:border-accent/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <span className="font-mono text-xs text-accent">0{index + 1}</span>
              <span className="mt-2 text-sm font-semibold group-hover:text-accent">{step.title}</span>
              <span className="mt-1 flex-1 text-xs leading-5 text-muted-foreground">{step.detail}</span>
              <ArrowRight className="mt-3 h-4 w-4 text-accent" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        TCF, speaking and quiz are previews: real exam content and paid AI stay with members.
      </p>
    </section>
  );
}
