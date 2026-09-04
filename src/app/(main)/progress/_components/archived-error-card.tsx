"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { BookOpen, Info } from "lucide-react";
import { ERROR_TAXONOMY } from "@/lib/taxonomy";
import type { ErrorCategory } from "@/lib/taxonomy";
import { CATEGORY_STYLES } from "@/lib/category-styles";
import { extractSentence } from "@/lib/text";
import type { Rule } from "@/lib/db/schema";
import type { ErrorWithContext } from "@/lib/actions/errors";
import { MicroDrillDialog } from "@/components/micro-drill-dialog";

type Props = {
  error: ErrorWithContext;
  rule: Rule | null;
};

export function ArchivedErrorCard({ error, rule }: Props) {
  const category = error.category as ErrorCategory;
  const style = CATEGORY_STYLES[category];
  const categoryDef = ERROR_TAXONOMY[category];
  const subcategoryLabel =
    (categoryDef?.subcategories as Record<string, string>)?.[error.subcategory] ??
    error.subcategory;

  const { sentence, errorStart, errorEnd } = extractSentence(
    error.submissionContentFr,
    error.spanStart,
    error.spanEnd,
  );

  const before = sentence.slice(0, errorStart);
  const highlighted = sentence.slice(errorStart, errorEnd);
  const after = sentence.slice(errorEnd);

  const docTitle = error.documentTitle ?? "Original document removed";
  const relativeDate = formatDistanceToNow(new Date(error.submittedAt), { addSuffix: true });

  return (
    <div className="rounded-xl bg-background p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style.chip}`}
        >
          {categoryDef?.label ?? category}
        </span>
        <span className="text-xs text-muted-foreground">{subcategoryLabel}</span>
      </div>

      {/* Sentence snippet */}
      <p className="text-sm leading-relaxed">
        <span className="text-muted-foreground">{before}</span>
        <mark className={`${style.mark} rounded-sm px-0.5 text-foreground font-medium`}>
          {highlighted}
        </mark>
        <span className="text-muted-foreground">{after}</span>
      </p>

      {/* Original → correction */}
      <div className="flex items-start gap-4 text-xs">
        <div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium block mb-0.5">
            Original
          </span>
          <span className="line-through text-muted-foreground">{error.original}</span>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium block mb-0.5">
            Correction
          </span>
          <span className="font-medium">{error.correction}</span>
        </div>
      </div>

      {/* Rule inline card */}
      {error.ruleId && (
        <div className="flex items-center gap-1.5">
          <BookOpen className="h-3 w-3 text-muted-foreground shrink-0" />
          {rule ? (
            <PopoverPrimitive.Root>
              <PopoverPrimitive.Trigger asChild>
                <button className="flex items-center gap-1 text-xs text-accent hover:underline">
                  {rule.name}
                  <Info className="h-3 w-3" />
                </button>
              </PopoverPrimitive.Trigger>
              <PopoverPrimitive.Portal>
                <PopoverPrimitive.Content
                  side="top"
                  align="start"
                  sideOffset={6}
                  className="z-50 w-72 rounded-xl border border-border bg-surface shadow-lg p-4 space-y-3"
                >
                  <p className="text-xs font-medium">{rule.name}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{rule.descriptionEn}</p>
                  {(rule.examples as string[] | null)?.map((ex, i) => (
                    <p key={i} className="text-xs text-muted-foreground border-l-2 border-border pl-2">
                      {ex}
                    </p>
                  ))}
                  <PopoverPrimitive.Arrow className="fill-border" />
                </PopoverPrimitive.Content>
              </PopoverPrimitive.Portal>
            </PopoverPrimitive.Root>
          ) : (
            <span className="text-xs text-muted-foreground">Rule: {error.ruleId}</span>
          )}
        </div>
      )}

      {/* Footer: metadata + CTAs */}
      <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-border/60">
        <span className="text-xs text-muted-foreground truncate">
          {docTitle} · {relativeDate}
        </span>
        <div className="flex items-center gap-3 shrink-0">
          <Link
            href={`/practice/${error.submissionId}/feedback#error-${error.errorIndex}`}
            className="text-xs text-accent hover:underline"
          >
            View in feedback →
          </Link>
          {error.microDrill && (
            <MicroDrillDialog
              errorId={error.id}
              microDrill={error.microDrill}
              original={error.original}
              correction={error.correction}
            />
          )}
        </div>
      </div>
    </div>
  );
}
