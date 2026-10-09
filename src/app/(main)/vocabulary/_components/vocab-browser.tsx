"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Bookmark, Loader2 } from "lucide-react";
import { getVocabEntryDetail, enrichEntry } from "@/lib/actions/vocabulary";
import type { VocabEntrySummary, VocabEntryDetail, OccurrenceLink } from "@/lib/vocabulary/types";
import { CEFR_CHIP_CLASSES, type CefrLevel } from "@/lib/cefr";
import { Button } from "@/components/ui/button";
import { MembersOnlyNote } from "@/components/members-only-note";
import { useFeatureLocked } from "@/components/access-context";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/lib/utils";
import { VerbTenses } from "./verb-tenses";
import { PosDetails } from "./pos-details";

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function occurrenceHref(o: OccurrenceLink): string {
  if (o.sourceType === "reading" && o.documentId) return `/documents/${o.documentId}`;
  if (o.sourceType === "tcf" && o.tcfQuestionId) return `/tcf/drill?q=${o.tcfQuestionId}`;
  return "#";
}

const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
const POS_OPTIONS = ["verb", "noun", "adjective", "adverb", "other"] as const;

function matchesPos(pos: string | null, filter: string): boolean {
  if (!pos) return filter === "other";
  if (filter === "verb") return pos.includes("verb");
  if (filter === "noun") return pos.includes("noun");
  if (filter === "adjective") return pos.includes("adjective");
  if (filter === "adverb") return pos.includes("adverb");
  // "other" = none of the above
  return (
    !pos.includes("verb") &&
    !pos.includes("noun") &&
    !pos.includes("adjective") &&
    !pos.includes("adverb")
  );
}

/* ------------------------------------------------------------------ */
/*  VocabBrowser                                                        */
/* ------------------------------------------------------------------ */

export function VocabBrowser({
  initialEntries,
  learnerLevel,
}: {
  initialEntries: VocabEntrySummary[];
  learnerLevel: string;
}) {
  // Filters
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<string | null>(null);
  const [posFilter, setPosFilter] = useState<string | null>(null);
  const [savedOnly, setSavedOnly] = useState(true);

  // Detail panel
  const [selectedLemma, setSelectedLemma] = useState<string | null>(null);
  const [detail, setDetail] = useState<VocabEntryDetail | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isRetrying, startRetryTransition] = useTransition();

  // Filtered entries (client-side)
  const filtered = initialEntries.filter((e) => {
    if (savedOnly && !e.saved) return false;
    if (levelFilter && e.cefrLevel !== levelFilter) return false;
    if (posFilter && !matchesPos(e.pos, posFilter)) return false;
    if (search) {
      const q = search.toLowerCase();
      const inLemma = e.lemma.toLowerCase().includes(q);
      const inTranslation = (e.translation ?? "").toLowerCase().includes(q);
      if (!inLemma && !inTranslation) return false;
    }
    return true;
  });

  function selectEntry(lemma: string) {
    setSelectedLemma(lemma);
    startTransition(async () => {
      const d = await getVocabEntryDetail(lemma);
      setDetail(d);
    });
  }

  function handleRetry() {
    if (!selectedLemma) return;
    startRetryTransition(async () => {
      await enrichEntry(selectedLemma);
      const d = await getVocabEntryDetail(selectedLemma);
      setDetail(d);
    });
  }

  const cefrClass = (level: string) =>
    CEFR_CHIP_CLASSES[level as CefrLevel] ??
    "bg-surface-muted text-muted-foreground ring-border/60";

  return (
    <div className="flex gap-6">
      {/* Left column: filters + list */}
      <div className="flex-1 min-w-0">
        {/* Filter bar */}
        <div className="flex flex-wrap gap-2 mb-4">
          {/* Text search */}
          <input
            type="search"
            aria-label="Search your vocabulary"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search words…"
            className="h-9 rounded-[var(--radius-field)] border border-border bg-surface px-3 text-[15px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          />

          {/* Level filters */}
          {CEFR_LEVELS.map((lvl) => (
            <button
              key={lvl}
              type="button"
              aria-pressed={levelFilter === lvl}
              onClick={() => setLevelFilter(levelFilter === lvl ? null : lvl)}
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset cursor-pointer transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2",
                cefrClass(lvl),
                levelFilter !== null && levelFilter !== lvl ? "opacity-40" : "opacity-100",
              )}
            >
              {lvl}
            </button>
          ))}

          {/* POS filters */}
          {POS_OPTIONS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={posFilter === p}
              onClick={() => setPosFilter(posFilter === p ? null : p)}
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset cursor-pointer transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2",
                "bg-surface-muted text-muted-foreground ring-border/60",
                posFilter !== null && posFilter !== p ? "opacity-40" : "opacity-100",
                posFilter === p ? "bg-accent-soft text-accent ring-accent-soft-strong" : "",
              )}
            >
              {p}
            </button>
          ))}

          {/* Saved only */}
          <button
            type="button"
            aria-pressed={savedOnly}
            onClick={() => setSavedOnly(!savedOnly)}
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2",
              savedOnly
                ? "bg-accent-soft text-accent ring-accent-soft-strong"
                : "bg-surface-muted text-muted-foreground ring-border/60",
            )}
          >
            Saved
          </button>
        </div>

        {/* Word list */}
        <div className="rounded-xl bg-surface shadow-card divide-y divide-border/50 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-lg text-foreground">No words found.</p>
              <p className="mt-1 text-sm text-muted-foreground">Try adjusting the filters.</p>
            </div>
          ) : (
            filtered.map((entry) => (
              <button
                key={entry.lemma}
                type="button"
                onClick={() => selectEntry(entry.lemma)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40",
                  selectedLemma === entry.lemma ? "bg-accent-soft/40" : "",
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground truncate">
                      {entry.lemma}
                    </span>
                    {entry.saved && (
                      <span className="inline-flex text-accent" title="Saved">
                        <Bookmark className="h-3 w-3" fill="currentColor" aria-hidden="true" />
                        <span className="sr-only">Saved</span>
                      </span>
                    )}
                  </div>
                  {entry.translation && (
                    <p className="text-[13px] text-muted-foreground truncate">{entry.translation}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {entry.cefrLevel && (
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset",
                        cefrClass(entry.cefrLevel),
                      )}
                    >
                      {entry.cefrLevel}
                    </span>
                  )}
                  {entry.pos && (
                    <Chip variant="neutral" className="text-[10px]">
                      {entry.pos}
                    </Chip>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {filtered.length} word{filtered.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Right column: detail panel */}
      <div className="w-80 shrink-0">
        {!selectedLemma ? (
          <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
            <p className="text-[15px] text-muted-foreground">Select a word to see details.</p>
          </div>
        ) : isPending ? (
          <div className="rounded-xl bg-surface shadow-card px-6 py-12 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : detail ? (
          <DetailPanel
            detail={detail}
            learnerLevel={learnerLevel}
            isRetrying={isRetrying}
            onRetry={handleRetry}
          />
        ) : (
          <div className="rounded-xl bg-surface shadow-card px-6 py-8 text-center">
            <p className="text-[15px] text-muted-foreground">Word not found.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Detail panel                                                        */
/* ------------------------------------------------------------------ */

function DetailPanel({
  detail,
  learnerLevel,
  isRetrying,
  onRetry,
}: {
  detail: VocabEntryDetail;
  learnerLevel: string;
  isRetrying: boolean;
  onRetry: () => void;
}) {
  const enrichLocked = useFeatureLocked("enrich");
  const cefrClass = (level: string) =>
    CEFR_CHIP_CLASSES[level as CefrLevel] ??
    "bg-surface-muted text-muted-foreground ring-border/60";

  return (
    <div className="rounded-xl bg-surface shadow-card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border/60">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-display text-2xl font-semibold tracking-[-0.025em] text-foreground">{detail.lemma}</h2>
          <div className="flex items-center gap-1.5 mt-1 shrink-0">
            {detail.cefrLevel && (
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset",
                  cefrClass(detail.cefrLevel),
                )}
              >
                {detail.cefrLevel}
              </span>
            )}
            {detail.pos && (
              <Chip variant="neutral" className="text-[10px]">
                {detail.pos}
              </Chip>
            )}
          </div>
        </div>
        {detail.translation && (
          <p className="mt-0.5 text-sm text-muted-foreground">{detail.translation}</p>
        )}
        {detail.saved && (
          <span className="mt-1 inline-block text-[10px] font-medium text-accent">★ Saved</span>
        )}
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* In context */}
        {detail.inContext && (
          <section>
            <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              In context
            </h3>
            <p className="text-sm text-foreground">{detail.inContext}</p>
          </section>
        )}

        {/* Examples */}
        {detail.examples.length > 0 && (
          <section>
            <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Examples
            </h3>
            <ul className="space-y-1">
              {detail.examples.map((ex, i) => (
                <li key={i} className="text-sm text-foreground">
                  {ex}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Rich content */}
        {detail.saved && !detail.enriched && enrichLocked && (
          <section className="rounded-lg border border-dashed border-border px-4 py-3">
            <MembersOnlyNote feature="enrich" />
          </section>
        )}
        {detail.saved && !detail.enriched && !enrichLocked && (
          <section className="rounded-lg border border-dashed border-border px-4 py-3">
            <p className="text-xs text-muted-foreground mb-2">
              {isRetrying ? "Generating…" : "Generating rich data…"}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              disabled={isRetrying}
              className="text-xs"
            >
              {isRetrying ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Retrying…
                </>
              ) : (
                "Retry"
              )}
            </Button>
          </section>
        )}

        {detail.saved && detail.enriched && detail.richEntry && (
          <>
            {/* Register + note + POS-specific structured data */}
            <PosDetails entry={detail.richEntry} />

            {/* Collocations */}
            {detail.richEntry.collocations && detail.richEntry.collocations.length > 0 && (
              <section>
                <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                  Collocations
                </h3>
                <ul className="space-y-1">
                  {detail.richEntry.collocations.map((c, i) => (
                    <li key={i} className="text-sm">
                      <span className="text-foreground">{c.fr}</span>
                      <span className="text-muted-foreground"> — {c.en}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Canada note */}
            {detail.richEntry.canada_note && (
              <section className="rounded-lg bg-surface-muted px-3 py-2">
                <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  Québec note
                </h3>
                <p className="text-xs text-foreground">{detail.richEntry.canada_note}</p>
              </section>
            )}

            {/* Verb tenses */}
            {detail.richEntry.verb && (
              <section>
                <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  Conjugation
                </h3>
                <VerbTenses entry={detail.richEntry} learnerLevel={learnerLevel} />
              </section>
            )}
          </>
        )}

        {/* Occurrences */}
        {detail.occurrences.length > 0 && (
          <section>
            <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
              Appears in
            </h3>
            <ul className="space-y-1.5">
              {detail.occurrences.map((o, i) => {
                const href = occurrenceHref(o);
                const label =
                  o.sourceType === "reading"
                    ? (o.documentTitle ?? "Untitled document")
                    : o.tcfTestNumber != null
                      ? `TCF test ${o.tcfTestNumber} · Q${(o.tcfOrderIndex ?? 0) + 1}`
                      : "TCF question";
                return (
                  <li key={i}>
                    <Link
                      href={href}
                      className="text-xs text-accent hover:underline underline-offset-2"
                    >
                      {label}
                    </Link>
                    {o.sentenceContext && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {o.sentenceContext}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
