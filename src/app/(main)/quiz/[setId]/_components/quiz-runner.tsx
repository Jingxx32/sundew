"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { submitQuizAttempt } from "@/lib/actions/quiz";
import type { QuizPassage, QuizQuestion } from "@/lib/db/schema";

type PassageWithQuestions = QuizPassage & { questions: QuizQuestion[] };

export function QuizRunner({
  setId,
  passages,
}: {
  setId: string;
  passages: PassageWithQuestions[];
}) {
  // questionId → selected option index
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<{ score: number; total: number } | null>(
    null,
  );
  const [saving, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const questions = useMemo(
    () => passages.flatMap((p) => p.questions),
    [passages],
  );
  // Phase 1: only `single` is gradable; other types render as stubs
  const gradable = useMemo(
    () => questions.filter((q) => q.type === "single"),
    [questions],
  );

  // Continuous question numbering across passages
  const numbering = useMemo(() => {
    const map = new Map<string, number>();
    questions.forEach((q, index) => map.set(q.id, index + 1));
    return map;
  }, [questions]);

  const allAnswered = gradable.every((q) => answers[q.id] !== undefined);
  const submitted = result !== null;

  function handleSubmit() {
    const score = gradable.filter(
      (q) => answers[q.id] === Number(q.answer),
    ).length;
    const total = gradable.length;
    setResult({ score, total });

    startTransition(async () => {
      try {
        await submitQuizAttempt({ setId, score, total });
        setSaved(true);
      } catch {
        setSaved(false);
      }
    });
  }

  return (
    <div className="space-y-8">
      {passages.map((passage) => (
        <section key={passage.id} className="space-y-5">
          <article className="reading-prose whitespace-pre-wrap rounded-xl bg-surface shadow-card px-6 py-5">
            {passage.text}
          </article>

          {passage.questions.map((question) => (
            <QuestionBlock
              key={question.id}
              number={numbering.get(question.id) ?? 0}
              question={question}
              selected={answers[question.id]}
              submitted={submitted}
              onSelect={(index) =>
                setAnswers((prev) => ({ ...prev, [question.id]: index }))
              }
            />
          ))}
        </section>
      ))}

      {/* Submit / result bar */}
      {result === null ? (
        <div className="flex items-center justify-between rounded-xl bg-surface-muted px-5 py-4">
          <p className="text-sm text-muted-foreground">
            {allAnswered
              ? "All questions answered — ready to check."
              : `${Object.keys(answers).length}/${gradable.length} answered`}
          </p>
          <Button onClick={handleSubmit} disabled={!allAnswered}>
            Check answers
          </Button>
        </div>
      ) : (
        <div className="rounded-xl bg-surface shadow-card px-5 py-4">
          <p className="text-xl font-semibold">
            {result.score}/{result.total} correct
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {saving
              ? "Saving attempt…"
              : saved
                ? "Attempt saved."
                : "Attempt could not be saved."}
          </p>
        </div>
      )}
    </div>
  );
}

function QuestionBlock({
  number,
  question,
  selected,
  submitted,
  onSelect,
}: {
  number: number;
  question: QuizQuestion;
  selected: number | undefined;
  submitted: boolean;
  onSelect: (index: number) => void;
}) {
  // D-2: render branches purely on question.type
  switch (question.type) {
    case "single":
      return (
        <SingleChoice
          number={number}
          question={question}
          selected={selected}
          submitted={submitted}
          onSelect={onSelect}
        />
      );
    case "multi":
    case "true_false":
    case "fill_blank":
      return <UnsupportedStub number={number} type={question.type} />;
  }
}

function SingleChoice({
  number,
  question,
  selected,
  submitted,
  onSelect,
}: {
  number: number;
  question: QuizQuestion;
  selected: number | undefined;
  submitted: boolean;
  onSelect: (index: number) => void;
}) {
  const options = (question.options ?? []) as string[];
  const correctIndex = Number(question.answer);
  const isCorrect = selected === correctIndex;

  return (
    <div className="rounded-xl bg-surface shadow-card px-5 py-4">
      <p className="text-sm font-medium mb-3">
        <span className="text-subtle-foreground mr-1.5">{number}.</span>
        {question.questionText}
      </p>

      <div role="radiogroup" className="space-y-1.5">
        {options.map((option, index) => {
          const isSelected = selected === index;
          const showCorrect = submitted && index === correctIndex;
          const showWrong = submitted && isSelected && index !== correctIndex;

          return (
            <button
              key={index}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={submitted}
              onClick={() => onSelect(index)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                showCorrect
                  ? "border-success/40 bg-success-soft text-success"
                  : showWrong
                    ? "border-danger/40 bg-danger-soft text-danger"
                    : isSelected
                      ? "border-accent/50 bg-accent-soft text-accent"
                      : "border-border/60 bg-surface hover:bg-surface-muted text-foreground",
                submitted && "cursor-default",
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium",
                  isSelected || showCorrect
                    ? "border-current"
                    : "border-border",
                )}
              >
                {showCorrect ? (
                  <Check className="h-3 w-3" />
                ) : showWrong ? (
                  <X className="h-3 w-3" />
                ) : (
                  String.fromCharCode(65 + index)
                )}
              </span>
              {option}
            </button>
          );
        })}
      </div>

      {submitted && (
        <div
          className={cn(
            "mt-3 rounded-lg px-3 py-2 text-xs",
            isCorrect
              ? "bg-success-soft text-success"
              : "bg-danger-soft text-danger",
          )}
        >
          <span className="font-medium">
            {isCorrect ? "Correct." : "Incorrect."}
          </span>{" "}
          {!isCorrect && (
            <span>
              Right answer: {String.fromCharCode(65 + correctIndex)}.{" "}
            </span>
          )}
          {question.explanation && (
            <span className="text-muted-foreground">{question.explanation}</span>
          )}
        </div>
      )}
    </div>
  );
}

function UnsupportedStub({
  number,
  type,
}: {
  number: number;
  type: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface-muted/40 px-5 py-4">
      <p className="text-sm text-muted-foreground">
        <span className="text-subtle-foreground mr-1.5">{number}.</span>
        Question type «{type}» isn&apos;t supported yet — coming in a later
        sprint.
      </p>
    </div>
  );
}
