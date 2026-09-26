import Link from "next/link";
import { ArrowRight, BookMarked, FileWarning, RotateCcw } from "lucide-react";
import { getDueGapCount } from "@/lib/actions/vocab-gaps";
import { getTcfReviewCount } from "@/lib/actions/tcf";
import { getReviewCenterItems, type ReviewSource } from "@/lib/actions/review";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ source?: string }> }) {
  const params = await searchParams;
  const [vocabularyDue, listeningDue, readingDue, center] = await Promise.all([
    getDueGapCount(),
    getTcfReviewCount("listening"),
    getTcfReviewCount("reading"),
    getReviewCenterItems(),
  ]);
  const tcfDue = listeningDue + readingDue;
  const items = [
    { title: "Vocabulary", detail: vocabularyDue > 0 ? `${vocabularyDue} word${vocabularyDue === 1 ? "" : "s"} due now.` : "No vocabulary cards are due now. You can still browse saved words.", href: vocabularyDue > 0 ? "/vocabulary/review" : "/vocabulary", action: vocabularyDue > 0 ? "Review due words" : "Browse vocabulary", icon: BookMarked, count: vocabularyDue },
    { title: "TCF questions", detail: tcfDue > 0 ? `${tcfDue} question${tcfDue === 1 ? "" : "s"} marked uncertain or due for review.` : "No TCF questions need review now.", href: "/tcf/review", action: "Open TCF review", icon: RotateCcw, count: tcfDue },
    { title: "Writing errors", detail: "Inspect feedback from previous submissions and open a drill where one is available.", href: "/progress", action: "View writing evidence", icon: FileWarning, count: null },
  ];
  const sourceOptions: Array<{ key: "all" | ReviewSource; label: string }> = [
    { key: "all", label: "All" }, { key: "tcf", label: "TCF" },
    { key: "writing", label: "Writing" }, { key: "vocabulary", label: "Vocabulary" },
    { key: "conjugation", label: "Conjugation" }, { key: "quiz", label: "Quiz" },
  ];
  const selectedSource = sourceOptions.some((option) => option.key === params.source) ? params.source : "all";
  const visible = center.items.filter((item) => selectedSource === "all" || item.source === selectedSource).slice(0, 40);

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="max-w-2xl">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent">Return to what matters</p>
        <h1 className="text-[38px] font-bold tracking-[-0.035em]">Review</h1>
        <p className="mt-2 text-[15px] leading-6 text-muted-foreground">Revisit due vocabulary, TCF questions, and evidence from your writing. Counts describe real queues, not everything you have saved.</p>
      </header>
      <div className="mt-9 divide-y divide-border rounded-2xl border border-border/80 bg-surface px-5 shadow-card sm:px-7">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <article key={item.title} className="flex gap-4 py-6">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-blue text-accent"><Icon className="h-4.5 w-4.5" aria-hidden="true" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-4"><h2 className="font-semibold">{item.title}</h2>{item.count !== null && <span className="font-mono text-sm text-muted-foreground">{item.count}</span>}</div>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.detail}</p>
                <Link href={item.href} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">{item.action}<ArrowRight className="h-3.5 w-3.5" /></Link>
              </div>
            </article>
          );
        })}
      </div>
      <section className="mt-10" aria-labelledby="review-items-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 id="review-items-heading" className="text-xl font-semibold">Review items</h2><p className="mt-1 text-xs text-muted-foreground">Recent source-linked items; showing up to 40 at a time.</p></div>
          <div className="flex flex-wrap gap-1.5" aria-label="Filter review source">
            {sourceOptions.map((option) => <Link key={option.key} href={option.key === "all" ? "/review" : `/review?source=${option.key}`}
              aria-current={selectedSource === option.key ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${selectedSource === option.key ? "border-accent bg-accent-soft text-accent" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {option.label}</Link>)}
          </div>
        </div>
        {center.unavailable.length > 0 && <p role="status" className="mt-4 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm">Some sources are temporarily unavailable: {center.unavailable.join(", ")}.</p>}
        {visible.length === 0 ? <p className="mt-5 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">No review items match this view.</p> :
          <div className="mt-4 divide-y divide-border rounded-2xl border border-border/80 bg-surface px-5">
            {visible.map((item) => <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{item.source}</p>
                <h3 className="mt-1 line-clamp-2 text-sm font-medium">{item.title}</h3><p className="mt-1 text-xs text-muted-foreground">{item.detail}</p></div>
              <Link href={item.href} className="shrink-0 text-sm font-semibold text-accent hover:underline">Open source <ArrowRight className="inline h-3.5 w-3.5" /></Link>
            </article>)}
          </div>}
      </section>
    </div>
  );
}
