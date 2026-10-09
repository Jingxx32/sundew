import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen } from "lucide-react";
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
    const samples = user.access === "guest" ? await listRecentSubmissions() : [];
    return (
      <div className="max-w-2xl mx-auto px-10 py-24 text-center space-y-6">
        <div className="flex justify-center mb-2">
          <BookOpen className="h-10 w-10 text-muted-foreground/40" />
        </div>
        <h1 className="text-2xl font-semibold tracking-[-0.025em]">Practice</h1>
        <div className="flex justify-center">
          <QuickWriteButton />
        </div>
        {samples.length > 0 && (
          <div className="mx-auto max-w-sm space-y-2 text-left">
            <div className="text-[11px] font-medium uppercase tracking-wider text-accent">Sample feedback</div>
            <ul className="space-y-1">
              {samples.map((s) => (
                <li key={s.id}>
                  <Link href={`/practice/${s.id}/feedback`} className="block truncate text-sm text-muted-foreground transition-colors hover:text-foreground">
                    {s.promptEn}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
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
