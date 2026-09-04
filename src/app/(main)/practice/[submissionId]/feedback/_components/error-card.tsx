"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, BookOpen, Info } from "lucide-react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { ERROR_TAXONOMY } from "@/lib/taxonomy";
import type { ErrorRecord, Rule } from "@/lib/db/schema";
import type { ErrorCategory } from "@/lib/taxonomy";
import { CATEGORY_STYLES, superscript } from "@/lib/category-styles";
import { MicroDrillDialog } from "@/components/micro-drill-dialog";

type Props = {
  error: ErrorRecord;
  index: number;
  rule?: Rule | null;
};

export function ErrorCard({ error, index, rule }: Props) {
  const [showCorrection, setShowCorrection] = useState(false);

  const category = error.category as ErrorCategory;
  const style = CATEGORY_STYLES[category];
  const categoryDef = ERROR_TAXONOMY[category];
  const subcategoryLabel =
    (categoryDef?.subcategories as Record<string, string>)?.[error.subcategory] ??
    error.subcategory;
  const frExamples = (error.frExamples as string[]) ?? [];

  return (
    <div
      id={`error-${index}`}
      className="bg-surface rounded-xl border border-border p-4 space-y-3 scroll-mt-6"
    >
      {/* Header: number + category chip + subcategory label */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-xs text-muted-foreground shrink-0">
          {superscript(index)}
        </span>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style.chip}`}
        >
          {categoryDef?.label ?? category}
        </span>
        <span className="text-xs text-muted-foreground">{subcategoryLabel}</span>
      </div>

      {/* Original */}
      <div className="space-y-0.5">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          Original
        </div>
        <p className="text-sm line-through text-muted-foreground">{error.original}</p>
      </div>

      {/* Show correction toggle — two-click per §5.5 No spoilers */}
      <button
        onClick={() => setShowCorrection((s) => !s)}
        className="flex items-center gap-1 text-xs text-accent hover:underline"
      >
        {showCorrection ? (
          <>
            <ChevronUp className="h-3 w-3" />
            Hide correction
          </>
        ) : (
          <>
            <ChevronDown className="h-3 w-3" />
            Show correction
          </>
        )}
      </button>

      {showCorrection && (
        <div className="space-y-0.5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            Correction
          </div>
          <p className="text-sm font-medium text-foreground">{error.correction}</p>
        </div>
      )}

      {/* Explanation */}
      <p className="text-sm text-foreground leading-relaxed">{error.explanationEn}</p>

      {/* Trigger context — subtle, only when present */}
      {error.triggerContext && (
        <p className="text-xs text-muted-foreground italic">Context: {error.triggerContext}</p>
      )}

      {/* French examples */}
      {frExamples.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            Examples
          </div>
          <ul className="space-y-0.5">
            {frExamples.map((ex, i) => (
              <li key={i} className="text-xs text-muted-foreground">
                {ex}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Rule inline card with Popover */}
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
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {rule.descriptionEn}
                  </p>
                  {(rule.examples as string[] | null)?.map((ex, i) => (
                    <p
                      key={i}
                      className="text-xs text-muted-foreground border-l-2 border-border pl-2"
                    >
                      {ex}
                    </p>
                  ))}
                  <PopoverPrimitive.Arrow className="fill-border" />
                </PopoverPrimitive.Content>
              </PopoverPrimitive.Portal>
            </PopoverPrimitive.Root>
          ) : (
            <span className="text-[10px] text-muted-foreground">Rule: {error.ruleId}</span>
          )}
        </div>
      )}

      {/* Micro-drill trigger */}
      {error.microDrill && (
        <div className="pt-1 border-t border-border/60">
          <MicroDrillDialog
            errorId={error.id}
            microDrill={error.microDrill}
            original={error.original}
            correction={error.correction}
          />
        </div>
      )}
    </div>
  );
}
