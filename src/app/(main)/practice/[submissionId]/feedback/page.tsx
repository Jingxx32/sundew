import { notFound } from "next/navigation";
import { BookOpen } from "lucide-react";
import { getSubmissionWithFeedback } from "@/lib/actions/tasks";
import { CEFR_CHIP_CLASSES, type CefrLevel } from "@/lib/cefr";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/lib/utils";
import type { FeedbackResult } from "@/lib/ai/feedback";
import { SourceExcerpt } from "./_components/source-excerpt";
import { SubmissionText } from "./_components/submission-text";
import { FeedbackPanel } from "./_components/feedback-panel";
import { FeedbackRetry } from "./_components/feedback-retry";
import { FeedbackPending } from "./_components/feedback-pending";

export default async function FeedbackPage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const { submissionId } = await params;
  const data = await getSubmissionWithFeedback(submissionId);
  if (!data) notFound();

  const { submission, doc, errors } = data;
  const feedback = submission.feedbackJson as FeedbackResult | null;
  const level = (submission.estimatedLevel ?? "B1") as CefrLevel;

  return (
    <div className="px-6 py-8 space-y-6">
      {/* Page header */}
      <div className="max-w-[1200px] mx-auto space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold">Feedback</h1>
          {submission.estimatedLevel && (
            <Chip className={cn(CEFR_CHIP_CLASSES[level])}>{submission.estimatedLevel}</Chip>
          )}
        </div>

        {submission.summaryEn && (
          <p className="text-muted-foreground text-sm leading-relaxed max-w-2xl">
            {submission.summaryEn}
          </p>
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          {doc && (
            <>
              <BookOpen className="h-3.5 w-3.5 shrink-0" />
              <span className="uppercase tracking-wider font-medium">From</span>
              <span className="font-medium text-foreground">{doc.title}</span>
              <span className="text-border">·</span>
            </>
          )}
          <span>{submission.wordCount} words</span>
        </div>
      </div>

      {feedback === null ? (
        submission.feedbackStatus === "pending" ? (
          /* Generating in the background — polls, and self-converts to the
             retry card once the pending state goes stale (dead after() job). */
          <FeedbackPending
            submissionId={submission.id}
            submittedAtMs={submission.submittedAt.getTime()}
          />
        ) : (
          /* Generation failed — writing is saved; offer a retry */
          <FeedbackRetry submissionId={submission.id} />
        )
      ) : (
        /* Three-column layout: source | submission | feedback */
        <div className="max-w-[1200px] mx-auto grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_360px] gap-5 items-start">
          {/* Left — collapsible source excerpt */}
          <SourceExcerpt doc={doc} />

          {/* Centre — submission with inline error highlights */}
          <div className="bg-surface rounded-2xl shadow-card p-6 space-y-4">
            <div className="text-[11px] uppercase tracking-wider text-accent font-medium">
              Your Writing
            </div>
            <SubmissionText contentFr={submission.contentFr} errors={errors} />
          </div>

          {/* Right — feedback panel: praise → errors → improvements */}
          <FeedbackPanel feedback={feedback} errors={errors} />
        </div>
      )}
    </div>
  );
}
