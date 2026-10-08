import Link from "next/link";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { InviteCodeForm } from "@/components/invite-code-form";
import { FEATURES, type FeatureKey } from "@/lib/access/features";

const DESCRIPTIONS: Record<FeatureKey, string> = {
  tcf: "Timed listening and reading questions from the TCF Canada bank, with explanations and a review queue.",
  speaking: "Read-aloud practice with pronunciation scoring, and a timed Task 2 conversation.",
  quiz: "Import your own quizzes and podcast cloze dictations, then drill them.",
  writing: "Write a response and get structured feedback that feeds your error profile.",
  microDrill: "Short drills generated from your own mistakes.",
  upload: "Add your own French texts and read them with look-ups.",
  lookup: "Look up any word in your own texts.",
  enrich: "Full dictionary entries with conjugations and usage notes.",
};

export function FeatureLocked({ feature }: { feature: FeatureKey }) {
  return (
    <div className="mx-auto max-w-xl px-5 py-12 sm:px-8 sm:py-16">
      <section className="rounded-2xl bg-surface p-6 shadow-card sm:p-8">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-blue text-accent">
          <LockKeyhole className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-accent">Invite only</p>
        <h1 className="mt-2 text-[28px] font-bold tracking-[-0.035em]">{FEATURES[feature].label}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{DESCRIPTIONS[feature]}</p>
        {feature === "tcf" && (
          <Link href="/demo#try-demo" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
            Try an original sample question
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        )}
        <div className="mt-8 border-t border-border pt-6">
          <InviteCodeForm next="/login?callbackURL=%2Ftoday" />
        </div>
      </section>
    </div>
  );
}
