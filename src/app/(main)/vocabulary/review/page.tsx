import { getDueGapCards } from "@/lib/actions/vocab-gaps";
import { GapReviewRunner } from "./_components/gap-review-runner";

export const dynamic = "force-dynamic";

export default async function VocabReviewPage() {
  const cards = await getDueGapCards();
  return (
    <div className="px-8 py-8 max-w-2xl mx-auto">
      <h1 className="font-serif text-3xl font-semibold tracking-tight mb-1">Révision du vocabulaire</h1>
      <p className="text-sm text-muted-foreground mb-6">Les mots arrivés à échéance aujourd&rsquo;hui.</p>
      <GapReviewRunner initialCards={cards} />
    </div>
  );
}
