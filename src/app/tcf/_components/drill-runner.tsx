"use client";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Eye, Check, X, Loader2, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ExplanationPanel } from "./explanation-panel";
import { ReadingPassage } from "./reading-passage";
import { LevelNav } from "./level-nav";
import { recordTcfQuestionAttempt } from "@/lib/actions/tcf";
import { writeFromTcfPassage } from "@/lib/actions/tasks";
import type { TcfDrillSessionKind, TcfQuestionForDrill, TcfQuestionLearning, TcfLevel } from "@/lib/actions/tcf";
import type { TcfLearningStatus } from "@/lib/tcf/learning";

const LEVEL_COLORS: Record<TcfLevel, { bg: string; text: string }> = {
  A1: { bg: "bg-success-soft", text: "text-success" }, A2: { bg: "bg-success-soft", text: "text-success" },
  B1: { bg: "bg-warning-soft", text: "text-warning" }, B2: { bg: "bg-warning-soft", text: "text-warning" },
  C1: { bg: "bg-accent-soft", text: "text-accent" }, C2: { bg: "bg-accent-soft", text: "text-accent" },
};
type RoundResult = { chosen: number; correct: boolean; uncertain: boolean };

function WritePassageButton({ questionId }: { questionId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  function handleClick() {
    setFailed(false);
    startTransition(async () => {
      try { router.push(`/practice?taskId=${await writeFromTcfPassage(questionId)}`); }
      catch { setFailed(true); }
    });
  }
  return <div className="flex items-center gap-2"><button type="button" onClick={handleClick} disabled={pending} className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-accent disabled:opacity-60">{pending ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Génération…</> : <><PenLine className="h-3.5 w-3.5" />Écrire sur ce texte</>}</button>{failed && <span className="text-xs text-danger">Échec — réessayez.</span>}</div>;
}

interface DrillRunnerProps {
  questions: TcfQuestionForDrill[];
  learning: TcfQuestionLearning[];
  skill: "listening" | "reading";
  level: TcfLevel;
  kind: TcfDrillSessionKind;
  initialIndex?: number;
  /** The review centre keeps its history panel visible after a response. */
  showSummaryOnComplete?: boolean;
}

export function DrillRunner({ questions, learning, skill, level, kind, initialIndex = 0, showSummaryOnComplete = true }: DrillRunnerProps) {
  const storageKey = `tcf-drill:${skill}:${level}:${kind}:${questions.map((q) => q.id).join(",")}`;
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [showAnswer, setShowAnswer] = useState(false);
  const [chosen, setChosen] = useState<number>();
  const [uncertain, setUncertain] = useState(false);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Record<string, RoundResult>>({});
  const [statusByQuestion, setStatusByQuestion] = useState<Record<string, TcfLearningStatus>>(
    () => Object.fromEntries(learning.map((item) => [item.questionId, item.status])),
  );
  const [streakByQuestion, setStreakByQuestion] = useState<Record<string, number>>(
    () => Object.fromEntries(learning.map((item) => [item.questionId, item.consecutiveConfidentCorrect])),
  );

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    const index = saved ? Number.parseInt(saved, 10) : NaN;
    if (!Number.isInteger(index) || index < 0 || index >= questions.length) return;
    const frame = window.requestAnimationFrame(() => setCurrentIndex(index));
    return () => window.cancelAnimationFrame(frame);
  }, [questions.length, storageKey]);
  useEffect(() => { window.localStorage.setItem(storageKey, String(currentIndex)); }, [currentIndex, storageKey]);

  if (questions.length === 0) return <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-muted-foreground">Aucune question à revoir pour le moment.</div>;
  const q = questions[currentIndex];
  const allComplete = completedIds.size === questions.length;
  const answers = Object.values(results);

  function goTo(index: number) {
    const result = results[questions[index].id];
    setCurrentIndex(index);
    setShowAnswer(Boolean(result || completedIds.has(questions[index].id)));
    setChosen(result?.chosen);
    setUncertain(result?.uncertain ?? false);
  }
  function completeCurrent() { setCompletedIds((previous) => new Set(previous).add(q.id)); }
  function revealAnswer() { if (!showAnswer) { setShowAnswer(true); completeCurrent(); } }
  function choose(optionIndex: number) {
    if (showAnswer) return;
    const correct = optionIndex === q.answer;
    setChosen(optionIndex); setShowAnswer(true); completeCurrent();
    setResults((previous) => ({ ...previous, [q.id]: { chosen: optionIndex, correct, uncertain } }));
    const nextStreak = correct && !uncertain ? (streakByQuestion[q.id] ?? 0) + 1 : 0;
    setStreakByQuestion((previous) => ({ ...previous, [q.id]: nextStreak }));
    setStatusByQuestion((previous) => ({
      ...previous,
      [q.id]: !correct || uncertain ? "needs_review" : nextStreak >= 3 ? "stable" : "in_progress",
    }));
    void recordTcfQuestionAttempt({ questionId: q.id, chosen: optionIndex, uncertain, mode: kind === "review" ? "review" : "drill" }).catch(() => {});
  }

  if (allComplete && showSummaryOnComplete) {
    const correct = answers.filter((answer) => answer.correct).length;
    const uncertainCorrect = answers.filter((answer) => answer.correct && answer.uncertain).length;
    const incorrect = answers.filter((answer) => !answer.correct).length;
    const needsReview = answers.filter((answer) => !answer.correct || answer.uncertain).length;
    return <section className="mx-auto max-w-xl rounded-2xl border border-border/70 bg-surface px-8 py-10 text-center"><p className="text-xs uppercase tracking-widest text-subtle-foreground">Session terminée</p><h2 className="mt-2 font-serif text-3xl font-semibold">{questions.length} questions parcourues</h2><p className="mt-5 text-sm text-muted-foreground">{correct} correctes · {uncertainCorrect} correctes mais incertaines · {incorrect} incorrectes</p><p className="mt-2 text-sm text-danger">{needsReview} question{needsReview !== 1 ? "s" : ""} à revoir</p><div className="mt-7 flex justify-center gap-3"><Link href={`/tcf/review?skill=${skill}&level=${level}`} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">Revoir maintenant</Link><Link href={`/tcf?skill=${skill}`} className="rounded-lg border border-border px-4 py-2 text-sm font-medium">Retour au niveau</Link></div></section>;
  }

  const colors = LEVEL_COLORS[q.level];
  return <div className="flex gap-6 min-h-0"><LevelNav questions={questions} currentIndex={currentIndex} onSelect={goTo} statusByQuestion={statusByQuestion} completedIds={completedIds} /><div className="flex-1 min-w-0"><div className="flex items-center justify-between mb-4"><div className="flex items-center gap-2"><span className="font-serif text-lg font-semibold">Question {currentIndex + 1} de {questions.length}</span><span className="text-xs text-subtle-foreground">Test {q.testNumber} · {q.orderIndex}</span><span className={cn("rounded px-1.5 py-0.5 text-xs font-bold font-mono", colors.bg, colors.text)}>{q.level}</span></div>{!showAnswer && <button type="button" onClick={revealAnswer} className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"><Eye className="h-3.5 w-3.5" />Afficher réponse</button>}</div><div className="rounded-xl border border-border/70 bg-surface px-6 py-5 space-y-4"><p className="text-sm text-muted-foreground italic">{q.questionText}</p>{q.type === "image" && q.imagePath && <Image src={q.imagePath} alt={`Question ${q.orderIndex} image`} width={600} height={400} className="w-full max-h-64 object-contain rounded-lg border border-border/50" unoptimized />}{q.type === "reading_mcq" && q.passage && <div className="space-y-2"><ReadingPassage passage={q.passage} /><WritePassageButton questionId={q.id} /></div>}{q.type === "reading_mcq" && !q.passage && q.imagePath && <Image src={q.imagePath} alt={`Document question ${q.orderIndex}`} width={800} height={520} className="w-full object-contain rounded-lg border border-border/50" unoptimized />}{q.type !== "reading_mcq" && (q.audioPath ? <audio controls src={q.audioPath} className="w-full" /> : <p className="rounded-lg border border-dashed border-border/60 px-4 py-3 text-xs text-muted-foreground">Audio à générer</p>)}{!showAnswer && <label className="flex items-center gap-2 rounded-lg bg-warning-soft/50 px-3 py-2 text-sm"><input type="checkbox" checked={uncertain} onChange={(event) => setUncertain(event.target.checked)} />Je ne suis pas sûr·e / Je devine</label>}<div className="space-y-1.5">{q.options.map((option, index) => { const isCorrect = index === q.answer; const isChosen = chosen === index; const wrong = showAnswer && isChosen && !isCorrect; const audioOnly = q.type === "image" || q.type === "spoken_options"; return <button key={index} type="button" disabled={showAnswer} onClick={() => choose(index)} className={cn("flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:cursor-default", showAnswer && isCorrect ? "border-success/40 bg-success-soft text-success" : wrong ? "border-danger/40 bg-danger-soft text-danger" : "border-border/60 bg-surface hover:border-accent/30 hover:bg-accent-soft/40")}><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium">{showAnswer && isCorrect ? <Check className="h-3 w-3" /> : wrong ? <X className="h-3 w-3" /> : String.fromCharCode(65 + index)}</span>{audioOnly && !showAnswer ? <span className="text-muted-foreground">Proposition {String.fromCharCode(65 + index)}</span> : <span>{option}</span>}</button>; })}</div>{showAnswer && chosen === undefined && <p className="rounded-lg bg-surface-muted px-3 py-2 text-sm text-muted-foreground">Réponse consultée : aucune tentative n’a été enregistrée et les choix sont verrouillés.</p>}{showAnswer && q.transcript && <div className="rounded-lg border border-border/50 bg-surface-muted/60 px-4 py-3"><p className="text-[11px] uppercase tracking-widest text-subtle-foreground">Transcription</p><p className="mt-1 text-sm font-serif whitespace-pre-wrap">{q.transcript}</p></div>}{showAnswer && q.explanation && <ExplanationPanel markdown={q.explanation} />}</div><div className="mt-4 flex items-center justify-between"><Button variant="outline" size="sm" onClick={() => goTo(currentIndex - 1)} disabled={currentIndex === 0}><ChevronLeft className="mr-1 h-4 w-4" />Précédent</Button><span className="text-xs text-muted-foreground">{completedIds.size} / {questions.length} parcourues</span><Button variant="outline" size="sm" onClick={() => goTo(currentIndex + 1)} disabled={currentIndex === questions.length - 1}>Suivant<ChevronRight className="ml-1 h-4 w-4" /></Button></div></div></div>;
}
