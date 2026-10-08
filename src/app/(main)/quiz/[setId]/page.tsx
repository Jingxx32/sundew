import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Chip } from "@/components/ui/chip";
import { getQuizSet } from "@/lib/actions/quiz";
import { QuizRunner } from "./_components/quiz-runner";
import { ClozeRunner } from "./_components/cloze-runner";
import { pageGate } from "@/lib/access/page-gate";

export default async function QuizSetPage({
  params,
}: {
  params: Promise<{ setId: string }>;
}) {
  const locked = await pageGate("quiz");
  if (locked) return locked;
  const { setId } = await params;
  const detail = await getQuizSet(setId);
  if (!detail) notFound();

  const { set, passages } = detail;
  const questionTotal = passages.reduce(
    (sum, p) => sum + p.questions.length,
    0,
  );

  return (
    <div className="px-10 py-10 max-w-3xl mx-auto">
      <Link
        href="/quiz"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Quiz
      </Link>

      <div className="mb-8">
        <h1 className="text-[30px] font-bold tracking-[-0.03em]">
          {set.title}
        </h1>
        <div className="mt-2 flex items-center gap-2">
          <Chip variant="accent">
            {set.exam}
            {set.number != null ? ` nº${set.number}` : ""}
          </Chip>
          <Chip>{set.section}</Chip>
          <span className="text-xs text-muted-foreground">
            {questionTotal} {questionTotal === 1 ? "question" : "questions"}
            {set.source ? ` · ${set.source}` : ""}
          </span>
        </div>
      </div>

      {set.section === "dictation" ? (
        <ClozeRunner setId={set.id} passages={passages} />
      ) : (
        <QuizRunner setId={set.id} passages={passages} />
      )}
    </div>
  );
}
