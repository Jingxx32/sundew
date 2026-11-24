"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Loader2, Volume2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { speakFrench, useTtsSupported } from "@/hooks/use-speech";
import { dismissNote, gradeNotebookCard, type NotebookReviewCard } from "@/lib/actions/tcf-notebook";
import type { TcfGeneratedReviewItem } from "@/lib/db/schema";
import { userErrorMessage } from "@/lib/user-error";

const KIND_LABEL: Record<NotebookReviewCard["kind"], string> = {
  grammar: "Grammaire",
  hearing: "Écoute",
  comprehension: "Compréhension",
};

type Grade = { chosen: number | null; selfCorrect: boolean | null };

/**
 * One notebook card at a time: a generated multiple-choice question when there is an item,
 * otherwise the front, the back and a self-grade. A failed save never blocks the session:
 * the learner can retry it or skip the card.
 */
export function NotebookReviewRunner({
  cards,
  items,
  onDone,
}: {
  cards: NotebookReviewCard[];
  items: Record<string, TcfGeneratedReviewItem | null> | "pending";
  onDone: () => void;
}) {
  // Grading revalidates this page; keep the deck the session started with.
  const [deck] = useState(cards);
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [result, setResult] = useState<{ correct: boolean } | null>(null);
  const [lastGrade, setLastGrade] = useState<Grade | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const finished = useRef(false);
  const ttsSupported = useTtsSupported();

  const card = deck[index];
  const item = items === "pending" || !card ? null : (items[card.noteId] ?? null);
  const spoken = card?.kind === "hearing" ? (item?.spoken ?? null) : null;

  useEffect(() => {
    if (spoken && ttsSupported) speakFrench(spoken);
  }, [spoken, ttsSupported, index]);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    onDone();
  };

  useEffect(() => {
    if (deck.length === 0) finish();
  });

  function next() {
    if (index + 1 >= deck.length) {
      finish();
      return;
    }
    setIndex(index + 1);
    setChosen(null);
    setRevealed(false);
    setResult(null);
    setLastGrade(null);
    setError(null);
  }

  async function grade(g: Grade) {
    if (!card || inFlight.current || result) return;
    inFlight.current = true;
    setSaving(true);
    setError(null);
    setLastGrade(g);
    try {
      const saved = await gradeNotebookCard({ noteId: card.noteId, item, chosen: g.chosen, selfCorrect: g.selfCorrect });
      // A self-graded card has already shown its back: move on.
      if (item) setResult({ correct: saved.correct });
      else next();
    } catch (err) {
      setError(userErrorMessage(err, "Échec de l’enregistrement."));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  function choose(i: number) {
    // inFlight also catches a second key press before the first one re-renders.
    if (!item || chosen !== null || inFlight.current) return;
    setChosen(i);
    grade({ chosen: i, selfCorrect: null });
  }

  async function dismiss() {
    if (!card || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    // On failure the card simply comes back in a later session.
    await dismissNote(card.noteId).catch(() => {});
    inFlight.current = false;
    setSaving(false);
    next();
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!card || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable)) return;
      if (item && chosen === null) {
        const letter = ["a", "b", "c", "d"].indexOf(e.key.toLowerCase());
        if (letter >= 0 && letter < item.options.length) {
          e.preventDefault();
          choose(letter);
          return;
        }
      }
      // A focused button or link handles Enter itself.
      const handlesEnter = (target instanceof HTMLButtonElement && !target.disabled) || target instanceof HTMLAnchorElement;
      if (e.key === "Enter" && result && !handlesEnter) {
        e.preventDefault();
        next();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (items === "pending") {
    return (
      <div role="status" className="rounded-xl bg-surface shadow-card px-6 py-10 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-accent" aria-hidden="true" />
        <p className="mt-3 text-sm text-muted-foreground">Preparing notebook questions…</p>
      </div>
    );
  }
  if (!card) return null;

  const back = (
    <div className="rounded-lg bg-surface-muted/60 px-3 py-2 text-sm text-muted-foreground">
      <p className="font-medium text-foreground">{card.point}</p>
      <p className="mt-1 whitespace-pre-line">{card.back}</p>
      {card.sourceQuestionId && (
        <Link
          href={`/tcf/review?q=${encodeURIComponent(card.sourceQuestionId)}`}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-xs font-medium text-accent hover:underline"
        >
          Question source{card.sourceLocator ? ` · ${card.sourceLocator}` : ""}
        </Link>
      )}
    </div>
  );

  const errorBar = error && (
    <div role="alert" className="flex items-center justify-between gap-3 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
      <span>{error}</span>
      <span className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={() => lastGrade && grade(lastGrade)}
          className="font-medium underline"
        >
          Réessayer
        </button>
        <button type="button" disabled={saving} onClick={next} className="font-medium underline">
          Passer
        </button>
      </span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {index + 1} / {deck.length} · {KIND_LABEL[card.kind]} · boîte {card.box}
        </span>
        <button
          type="button"
          onClick={dismiss}
          disabled={saving}
          className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:text-danger disabled:opacity-50"
        >
          Retirer du carnet
        </button>
      </div>

      <div className="space-y-4 rounded-xl bg-surface shadow-card px-6 py-5">
        {item ? (
          <>
            {spoken && (
              <div className="text-center">
                {ttsSupported && (
                  <button
                    type="button"
                    onClick={() => speakFrench(spoken)}
                    className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
                    aria-label="Écouter"
                  >
                    <Volume2 className="h-5 w-5" aria-hidden="true" />
                  </button>
                )}
                {/* Without a voice the card can only be answered by reading it. */}
                {(!ttsSupported || result) && <p className="mt-3 text-lg">{spoken}</p>}
              </div>
            )}
            <p className="text-base font-medium">{item.stem}</p>
            <div className="space-y-1.5">
              {item.options.map((option, i) => {
                const isCorrect = i === item.answer;
                const isChosen = chosen === i;
                const wrong = result && isChosen && !isCorrect;
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={chosen !== null}
                    onClick={() => choose(i)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-left text-sm transition-colors",
                      result && isCorrect
                        ? "border-success/40 bg-success-soft text-success"
                        : wrong
                          ? "border-danger/40 bg-danger-soft text-danger"
                          : result
                            ? "border-border/60 bg-surface text-foreground"
                            : isChosen
                              ? "border-accent/50 bg-accent-soft text-accent"
                              : chosen !== null
                                ? "border-border/60 bg-surface text-foreground"
                                : "border-border/60 bg-surface text-foreground hover:border-accent/30 hover:bg-accent-soft/40 cursor-pointer",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] font-medium",
                        result && isCorrect ? "border-success text-success" : wrong ? "border-danger text-danger" : "border-border",
                      )}
                    >
                      {result && isCorrect ? (
                        <Check className="h-3 w-3" aria-hidden="true" />
                      ) : wrong ? (
                        <X className="h-3 w-3" aria-hidden="true" />
                      ) : (
                        String.fromCharCode(65 + i)
                      )}
                    </span>
                    <span>{option}</span>
                  </button>
                );
              })}
            </div>
            {saving && chosen !== null && !result && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Enregistrement…
              </p>
            )}
            {result && (
              <p
                className={cn(
                  "rounded-lg px-3.5 py-2.5 text-sm font-medium",
                  result.correct ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
                )}
              >
                {result.correct ? "Correct" : "Incorrect"}
              </p>
            )}
            {result && back}
            {errorBar}
            {result && (
              <Button onClick={next} className="w-full">
                Suivant
              </Button>
            )}
          </>
        ) : (
          <>
            <p className="whitespace-pre-line text-lg">{card.front}</p>
            {!revealed ? (
              <Button onClick={() => setRevealed(true)} className="w-full">
                Afficher la réponse
              </Button>
            ) : (
              <>
                {back}
                {errorBar}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    disabled={saving || error !== null}
                    onClick={() => grade({ chosen: null, selfCorrect: true })}
                  >
                    Je savais
                  </Button>
                  <Button
                    variant="outline"
                    disabled={saving || error !== null}
                    onClick={() => grade({ chosen: null, selfCorrect: false })}
                  >
                    Je ne savais pas
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
