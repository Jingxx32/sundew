import { requirePageUser } from "@/lib/auth/session";
import { canUse } from "@/lib/access/features";
import { getDueGapCards } from "@/lib/actions/vocab-gaps";
import { getDueNotebookCards, type NotebookReviewCard } from "@/lib/actions/tcf-notebook";
import { ReviewSession } from "./_components/review-session";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Review session" };

export const dynamic = "force-dynamic";

/** Open to guests: without TCF access it is the words-only review, and the notebook is never read. */
export default async function ReviewSessionPage() {
  const user = await requirePageUser();
  const canTcf = canUse(user.access, "tcf") === true;
  const [words, notes] = await Promise.all([
    getDueGapCards(),
    canTcf ? getDueNotebookCards() : ([] as NotebookReviewCard[]),
  ]);
  return (
    <div className="mx-auto max-w-2xl px-5 py-8 sm:px-8">
      <ReviewSession words={words} notes={notes} />
    </div>
  );
}
