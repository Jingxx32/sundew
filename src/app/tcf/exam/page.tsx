import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getTcfSetQuestions } from "@/lib/actions/tcf";
import { ExamRunner } from "../_components/exam-runner";

export default async function TcfExamPage({
  searchParams,
}: {
  searchParams: Promise<{ skill?: string; test?: string; i?: string }>;
}) {
  const { skill: skillParam, test: testParam, i: indexParam } = await searchParams;
  const skill = (skillParam === "reading" ? "reading" : "listening") as "listening" | "reading";
  const testNumber = Math.max(1, parseInt(testParam ?? "1", 10) || 1);

  const questions = await getTcfSetQuestions(skill, testNumber);
  const title = skill === "reading" ? "Compréhension écrite" : "Compréhension orale";
  const requestedIndex = (parseInt(indexParam ?? "1", 10) || 1) - 1;
  const initialIndex = Math.min(Math.max(0, requestedIndex), Math.max(0, questions.length - 1));

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <Link
          href={`/tcf?skill=${skill}`}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3 w-fit"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          TCF
        </Link>
        <h1 className="font-serif text-3xl font-semibold tracking-tight">
          Test {testNumber} · {title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Mode examen · {questions.length} question{questions.length !== 1 ? "s" : ""} · répondez puis terminez pour
          voir votre score
        </p>
      </div>

      {questions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface/50 px-8 py-16 text-center">
          <p className="font-serif text-xl text-foreground">Test {testNumber} introuvable.</p>
          <p className="mt-2 text-sm text-muted-foreground">Choisissez un autre test depuis la page TCF.</p>
        </div>
      ) : (
        <ExamRunner questions={questions} skill={skill} testNumber={testNumber} initialIndex={initialIndex} />
      )}
    </div>
  );
}
