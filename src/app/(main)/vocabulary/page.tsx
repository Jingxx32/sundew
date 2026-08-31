import Link from "next/link";
import { getVocabEntries } from "@/lib/actions/vocabulary";
import { getCefrLevel } from "@/lib/actions/settings";
import { getDueGapCards } from "@/lib/actions/vocab-gaps";
import { Button } from "@/components/ui/button";
import { VocabBrowser } from "./_components/vocab-browser";

export const dynamic = "force-dynamic";

export default async function VocabularyPage() {
  const [entries, level, dueCards] = await Promise.all([
    getVocabEntries(),
    getCefrLevel(),
    getDueGapCards(),
  ]);
  return (
    <div className="px-8 py-8 max-w-5xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight mb-1">Vocabulary</h1>
          <p className="text-sm text-muted-foreground">
            Every word you looked up while reading or practising TCF.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/vocabulary/review">Réviser ({dueCards.length})</Link>
        </Button>
      </div>
      <VocabBrowser initialEntries={entries} learnerLevel={level ?? "A2"} />
    </div>
  );
}
