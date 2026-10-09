import Link from "next/link";
import { ArrowRight, Eye } from "lucide-react";
import { InviteDisclosure } from "@/components/invite-disclosure";
import { listRecentSubmissions } from "@/lib/actions/tasks";
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

type Showcase = { does: string[]; tryInstead: { label: string; href: string } };

/** What a guest gets on the three page-gated features; `sampleFeedback` links a guest's own sample submission. */
function showcase(feature: FeatureKey, sampleFeedback: string): Showcase | null {
  switch (feature) {
    case "tcf":
      return {
        does: [
          "3,000+ listening and reading questions by CEFR level",
          "Drill and timed-exam modes, with an explanation for every question",
          "Wrong or unsure answers flow into a review center",
        ],
        tryInstead: { label: "Try the original sample question", href: "/#try-demo" },
      };
    case "speaking":
      return {
        does: ["Read-aloud practice scored by Azure Speech", "A timed TCF Task 2 simulation"],
        tryInstead: { label: "See AI writing feedback", href: sampleFeedback },
      };
    case "quiz":
      return {
        does: [
          "Import exam PDFs or podcasts; AI structures them into questions",
          "Podcast cloze dictation",
          "Auto-grading with attempt history",
        ],
        tryInstead: { label: "Try a conjugation drill", href: "/conjugation" },
      };
    default:
      return null;
  }
}

/** Shown to guests instead of a members-only page: what the feature is, why it's held back, what to try now. */
export async function FeaturePreview({ feature }: { feature: FeatureKey }) {
  const [sample] = feature === "speaking" ? await listRecentSubmissions(1) : [];
  const extra = showcase(feature, sample ? `/practice/${sample.id}/feedback` : "/practice");

  return (
    <div className="mx-auto max-w-xl px-5 py-12 sm:px-8 sm:py-16">
      <section className="rounded-2xl bg-surface p-6 shadow-card sm:p-8">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-blue text-accent">
          <Eye className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-accent">Preview</p>
        <h1 className="mt-2 text-[28px] font-bold tracking-[-0.025em]">{FEATURES[feature].label}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{DESCRIPTIONS[feature]}</p>

        {extra && (
          <>
            <h2 className="mt-6 text-sm font-semibold">What it does</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">
              {extra.does.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </>
        )}

        <h2 className="mt-6 text-sm font-semibold">Why it&apos;s not in the guest tour</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{FEATURES[feature].memberReason}</p>

        {extra && (
          <Link href={extra.tryInstead.href} className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
            {extra.tryInstead.label}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        )}

        <div className="mt-8 border-t border-border pt-5">
          <InviteDisclosure next="/login?callbackURL=%2Ftoday" />
        </div>
      </section>
    </div>
  );
}
