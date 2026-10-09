import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen } from "lucide-react";
import { getWritingTaskWithDocument, listRecentSubmissions } from "@/lib/actions/tasks";
import { requirePageUser } from "@/lib/auth/session";
import { TaskCard } from "./_components/task-card";
import { WritingForm } from "./_components/writing-form";
import { QuickWriteButton } from "./_components/quick-write-button";

export default async function PracticePage({
  searchParams,
}: {
  searchParams: Promise<{ taskId?: string }>;
}) {
  const { taskId } = await searchParams;

  if (!taskId) {
    const user = await requirePageUser();
    if (user.access === "guest") return <GuestPractice samples={await listRecentSubmissions()} />;
    return (
      <div className="max-w-2xl mx-auto px-10 py-24 text-center space-y-6">
        <div className="flex justify-center mb-2">
          <BookOpen className="h-10 w-10 text-muted-foreground/40" />
        </div>
        <h1 className="text-2xl font-semibold tracking-[-0.025em]">Practice</h1>
        <div className="flex justify-center">
          <QuickWriteButton />
        </div>
        <p className="text-muted-foreground text-sm leading-relaxed max-w-sm mx-auto">
          Prefer writing about something you read? Open a document in the{" "}
          <Link href="/library" className="text-accent hover:underline">
            Library
          </Link>{" "}
          and generate a task from it, or hit{" "}
          <span className="font-medium text-foreground">Practice</span> on a recurring
          pattern in Progress.
        </p>
      </div>
    );
  }

  const data = await getWritingTaskWithDocument(taskId);
  if (!data) notFound();

  const { task, doc } = data;

  return (
    <div className="max-w-2xl mx-auto px-10 py-10 space-y-8">
      <Link
        href={doc ? `/documents/${doc.id}` : "/library"}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        {doc ? doc.title : "Library"}
      </Link>

      <TaskCard task={task} doc={doc} />

      <div>
        <div className="text-[11px] uppercase tracking-wider text-accent font-medium mb-3">
          Your Response
        </div>
        <WritingForm
          taskId={task.id}
          minWordCount={task.minWordCount}
          maxWordCount={task.maxWordCount}
        />
      </div>
    </div>
  );
}

/** Guests can't write new answers, so the sample feedback leads and writing is explained, not offered. */
function GuestPractice({ samples }: { samples: Array<{ id: string; promptEn: string; submittedAt: Date }> }) {
  const date = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric" });
  return (
    <div className="mx-auto max-w-2xl px-5 py-10 sm:px-8">
      <h1 className="mb-1 text-[38px] font-bold tracking-[-0.025em]">Practice</h1>
      <p className="text-sm text-muted-foreground">Write in French and get feedback that classifies every error.</p>

      <section aria-labelledby="sample-feedback" className="mt-8">
        <h2 id="sample-feedback" className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Sample feedback</h2>
        <ul className="mt-3 space-y-3">
          {samples.map((sample) => (
            <li key={sample.id}>
              <Link
                href={`/practice/${sample.id}/feedback`}
                className="group block rounded-xl border border-border/80 bg-surface p-4 transition-colors hover:border-accent/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <span className="line-clamp-2 text-sm font-medium group-hover:text-accent">{sample.promptEn}</span>
                <span className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  {date.format(sample.submittedAt)}
                  <span className="inline-flex items-center gap-1 font-semibold text-accent">
                    View feedback
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="write-your-own" className="mt-10 border-t border-border pt-6">
        <h2 id="write-your-own" className="text-sm font-semibold">Write your own</h2>
        <div className="mt-3">
          <QuickWriteButton />
        </div>
      </section>
    </div>
  );
}
