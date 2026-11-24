"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateNotebookReview, type NotebookReviewCard } from "@/lib/actions/tcf-notebook";
import type { GapReviewCard } from "@/lib/actions/vocab-gaps";
import type { TcfGeneratedReviewItem } from "@/lib/db/schema";
import { GapReviewRunner } from "../../../vocabulary/review/_components/gap-review-runner";
import { NotebookReviewRunner } from "./notebook-review-runner";

type Phase = "words" | "notes" | "done";
type Items = Record<string, TcfGeneratedReviewItem | null>;

/**
 * Due words first, then due notebook cards. `notes` is always empty without TCF access,
 * so no notebook action is ever called for a guest.
 */
export function ReviewSession({ words, notes }: { words: GapReviewCard[]; notes: NotebookReviewCard[] }) {
  // Each grade revalidates this page and re-sends both lists; keep the ones the session started with.
  const [deck] = useState(() => ({ words, notes }));
  const [phase, setPhase] = useState<Phase>("words");
  const [items, setItems] = useState<Items | "pending">("pending");
  const generationStarted = useRef(false);
  const hasNotes = deck.notes.length > 0;

  // Generate the notebook questions while the learner works through the words.
  useEffect(() => {
    if (!hasNotes || generationStarted.current) return;
    generationStarted.current = true;
    const ids = deck.notes.map((note) => note.noteId);
    generateNotebookReview(ids).then(setItems, () => {
      // Any failure (budget, network): every card falls back to self-grading.
      setItems(Object.fromEntries(ids.map((id) => [id, null])));
    });
  }, [hasNotes, deck]);

  const wordsDone = useCallback(() => setPhase(hasNotes ? "notes" : "done"), [hasNotes]);
  const notesDone = useCallback(() => setPhase("done"), []);

  return (
    <div>
      <h1 className="text-[30px] font-bold tracking-[-0.025em] mb-1">
        {hasNotes ? "Review notebook and words" : "Review due vocabulary"}
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        {hasNotes ? "Due words first, then your notebook cards." : "The words that are due now."}
      </p>

      {phase === "words" && <GapReviewRunner initialCards={deck.words} onDone={wordsDone} />}
      {phase === "notes" && <NotebookReviewRunner cards={deck.notes} items={items} onDone={notesDone} />}
      {phase === "done" && (
        <div className="rounded-xl bg-surface shadow-card px-6 py-10 text-center">
          <CheckCircle2 className="mx-auto h-6 w-6 text-success" aria-hidden="true" />
          <p className="mt-3 text-lg">Done for now</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {deck.words.length + deck.notes.length > 0 ? "You finished this review session." : "Nothing is due right now."}
          </p>
          <Button asChild className="mt-5">
            <Link href="/today">
              Back to Today
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
