import { Suspense } from "react";
import Link from "next/link";
import { ERROR_TAXONOMY } from "@/lib/taxonomy";
import type { ErrorCategory } from "@/lib/taxonomy";
import {
  listErrors,
  getErrorCounts,
  getDashboardStats,
  getErrorTrend,
  getTopRecurringPatterns,
  batchGetRules,
} from "@/lib/actions/errors";
import { getDocument } from "@/lib/actions/documents";
import { listRecentTcfAttempts } from "@/lib/actions/tcf";
import { getReadinessSummary } from "@/lib/actions/readiness";
import { ReadinessCard } from "./_components/readiness-card";
import { ProgressFilters } from "./_components/progress-filters";
import { TcfAttempts } from "./_components/tcf-attempts";
import { CategorySection } from "./_components/category-section";
import { StatCards } from "./_components/stat-cards";
import { TrendChart } from "./_components/trend-chart";
import { DistributionChart } from "./_components/distribution-chart";
import { TopPatterns } from "./_components/top-patterns";
import { EncouragementBanner } from "./_components/encouragement-banner";

const CATEGORY_ORDER = Object.keys(ERROR_TAXONOMY) as ErrorCategory[];
const VALID_WINDOWS = [30, 90, 365] as const;
type WindowDays = (typeof VALID_WINDOWS)[number];
const PAGE_SIZE = 200;

export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<{
    category?: string;
    documentId?: string;
    subcategory?: string;
    window?: string;
    show?: string;
  }>;
}) {
  const { category, documentId, subcategory, window: windowParam, show: showParam } =
    await searchParams;

  const shownRaw = Number(showParam);
  const shown =
    Number.isFinite(shownRaw) && shownRaw > 0 ? Math.min(shownRaw, 5000) : PAGE_SIZE;
  const activeCategory = CATEGORY_ORDER.includes(category as ErrorCategory)
    ? (category as ErrorCategory)
    : undefined;

  const rawWindow = Number(windowParam);
  const parsedWindow: WindowDays = VALID_WINDOWS.includes(rawWindow as WindowDays)
    ? (rawWindow as WindowDays)
    : 30;

  const [errorList, errorCounts, dashboardStats, trend, patterns, filterDoc, tcfAttempts, readiness] =
    await Promise.all([
      listErrors({ category: activeCategory, subcategory, documentId, limit: shown + 1 }),
      getErrorCounts({ documentId }),
      getDashboardStats(),
      getErrorTrend(parsedWindow),
      getTopRecurringPatterns(3),
      documentId ? getDocument(documentId) : Promise.resolve(null),
      listRecentTcfAttempts(10),
      getReadinessSummary(),
    ]);

  // Fetched one extra row to detect whether more exist beyond `shown`.
  const hasMore = errorList.length > shown;
  const visibleErrors = hasMore ? errorList.slice(0, shown) : errorList;

  const ruleIds = [
    ...new Set(visibleErrors.map((e) => e.ruleId).filter(Boolean) as string[]),
  ];
  const ruleMap = await batchGetRules(ruleIds);

  const byCategory = new Map<ErrorCategory, typeof visibleErrors>();
  for (const err of visibleErrors) {
    const cat = err.category as ErrorCategory;
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(err);
  }

  const totalErrors = Object.values(errorCounts).reduce((a, b) => a + b, 0);
  const filterDocTitle = filterDoc?.title ?? (documentId ? "Document removed" : null);
  const hasEnoughData = dashboardStats.totalSubmissions >= 3;

  return (
    <div className="px-10 py-10 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[38px] font-bold tracking-[-0.035em]">Progress</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {dashboardStats.totalErrors === 0
            ? "No errors yet — start writing to build your archive."
            : `${dashboardStats.totalErrors} ${dashboardStats.totalErrors === 1 ? "error" : "errors"} logged across ${dashboardStats.totalSubmissions} ${dashboardStats.totalSubmissions === 1 ? "submission" : "submissions"}`}
        </p>
      </div>

      {/* Readiness — independent of the writing-dashboard gate */}
      <div className="mb-8">
        <ReadinessCard summary={readiness} />
      </div>

      {/* Dashboard layer */}
      {!hasEnoughData ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface/50 px-8 py-10 text-center mb-8">
          <p className="font-serif text-lg text-foreground">
            Submit at least 3 writing tasks to unlock your progress dashboard.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            <Link href="/library" className="text-accent hover:underline">
              Go to Library →
            </Link>{" "}
            to pick a document and generate a task.
          </p>
        </div>
      ) : (
        <div className="space-y-6 mb-10">
          <StatCards stats={dashboardStats} />

          <hr className="border-border" />

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3">
              <Suspense>
                <TrendChart data={trend} windowDays={parsedWindow} />
              </Suspense>
            </div>
            <div className="lg:col-span-2">
              <Suspense>
                <DistributionChart counts={errorCounts} />
              </Suspense>
            </div>
          </div>

          <hr className="border-border" />

          <TopPatterns patterns={patterns} />

          <hr className="border-border" />

          <EncouragementBanner stats={dashboardStats} />

          <hr className="border-border" />
        </div>
      )}

      {/* TCF practice history — independent of the writing dashboard gate */}
      {tcfAttempts.length > 0 && (
        <div className="mb-10">
          <TcfAttempts attempts={tcfAttempts} />
        </div>
      )}

      {/* Filter bar — only render when there's something to filter */}
      {totalErrors > 0 && (
        <Suspense>
          <ProgressFilters counts={errorCounts} documentTitle={filterDocTitle} />
        </Suspense>
      )}

      {/* Error archive list */}
      {visibleErrors.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface/50 px-8 py-16 text-center">
          <p className="font-serif text-xl text-foreground">
            {dashboardStats.totalErrors === 0
              ? "No errors yet."
              : "No errors match the current filter."}
          </p>
          <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">
            {dashboardStats.totalErrors === 0 ? (
              <>
                Submit a writing task to start building your archive.{" "}
                <Link href="/library" className="text-accent hover:underline">
                  Go to Library →
                </Link>
              </>
            ) : (
              "Try removing the filter to see all errors."
            )}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {CATEGORY_ORDER.flatMap((cat) => {
              const group = byCategory.get(cat);
              if (!group || group.length === 0) return [];
              return [
                <CategorySection
                  key={cat}
                  category={cat}
                  errors={group}
                  ruleMap={ruleMap}
                  defaultOpen={!activeCategory || activeCategory === cat}
                />,
              ];
            })}
          </div>

          {hasMore && (
            <div className="text-center mt-8">
              <Link
                href={`/progress?${new URLSearchParams({
                  ...(activeCategory ? { category: activeCategory } : {}),
                  ...(subcategory ? { subcategory } : {}),
                  ...(documentId ? { documentId } : {}),
                  ...(windowParam ? { window: String(parsedWindow) } : {}),
                  show: String(shown + PAGE_SIZE),
                }).toString()}`}
                scroll={false}
                className="inline-flex items-center rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-accent hover:bg-surface-muted transition-colors"
              >
                Load more
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
