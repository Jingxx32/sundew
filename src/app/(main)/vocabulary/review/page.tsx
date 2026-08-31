import { getDueGapCards, listGaps } from "@/lib/actions/vocab-gaps";
import { GapReviewRunner } from "./_components/gap-review-runner";
import { GapList } from "./_components/gap-list";

export const dynamic = "force-dynamic";

export default async function VocabReviewPage() {
  const [cards, rows] = await Promise.all([getDueGapCards(), listGaps()]);
  return (
    <div className="px-8 py-8 max-w-2xl mx-auto">
      <h1 className="font-serif text-3xl font-semibold tracking-tight mb-1">Révision du vocabulaire</h1>
      <p className="text-sm text-muted-foreground mb-6">Les mots arrivés à échéance aujourd&rsquo;hui.</p>
      <GapReviewRunner initialCards={cards} />

      <details className="mt-8">
        <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
          Tous les mots ({rows.length})
        </summary>
        <div className="mt-4">
          <GapList rows={rows} />
        </div>
      </details>
    </div>
  );
}
