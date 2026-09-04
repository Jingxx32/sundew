import { Suspense } from "react";
import { getMostRecentDocument, listDocuments } from "@/lib/actions/documents";
import { AddDocumentDialog } from "./_components/add-document-dialog";
import { ContinueReadingCard } from "./_components/continue-reading";
import { DocumentRow } from "./_components/document-row";
import { LibraryFilters } from "./_components/library-filters";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; q?: string }>;
}) {
  const { type, q } = await searchParams;

  const [docs, recent] = await Promise.all([
    listDocuments({ type, query: q }),
    getMostRecentDocument(),
  ]);

  // Always fetch unfiltered counts for chip labels
  const allDocs = await listDocuments();
  const counts = countByType(allDocs);
  const totalWords = docs.reduce((sum, d) => sum + d.wordCount, 0);

  return (
    <div className="px-10 py-10 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-[38px] font-bold tracking-[-0.035em]">
            Library
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {allDocs.length === 0
              ? "Your French reading material will live here."
              : `${allDocs.length} ${allDocs.length === 1 ? "document" : "documents"} · ${totalWords.toLocaleString()} words`}
          </p>
        </div>
        <AddDocumentDialog />
      </div>

      {/* Filter / Search bar */}
      <Suspense>
        <LibraryFilters counts={counts} />
      </Suspense>

      {/* Continue Reading hero card — only when not filtering */}
      {recent && !type && !q && (
        <div className="mb-10">
          <ContinueReadingCard document={recent} />
        </div>
      )}

      {/* Document list */}
      <div className="mb-3 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
        {type || q ? `${docs.length} result${docs.length === 1 ? "" : "s"}` : "All documents"}
      </div>
      {docs.length === 0 ? (
        <EmptyState filtered={!!(type || q)} />
      ) : (
        <div className="space-y-1">
          {docs.map((doc) => (
            <DocumentRow key={doc.id} document={doc} />
          ))}
        </div>
      )}
    </div>
  );
}

function countByType(docs: Array<{ type: string }>) {
  const c: Record<string, number> = {};
  for (const d of docs) c[d.type] = (c[d.type] ?? 0) + 1;
  return c;
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface/50 px-8 py-16 text-center">
      <p className="text-xl text-foreground">
        {filtered ? "No documents match your search." : "Your library is empty."}
      </p>
      <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">
        {filtered
          ? "Try a different search term or remove the filter."
          : "Click Add Document to paste your first French text."}
      </p>
    </div>
  );
}
