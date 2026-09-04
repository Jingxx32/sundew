"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { ERROR_TAXONOMY } from "@/lib/taxonomy";
import type { ErrorCategory } from "@/lib/taxonomy";
import { CATEGORY_STYLES } from "@/lib/category-styles";
import type { Rule } from "@/lib/db/schema";
import type { ErrorWithContext } from "@/lib/actions/errors";
import { ArchivedErrorCard } from "./archived-error-card";

type Props = {
  category: ErrorCategory;
  errors: ErrorWithContext[];
  ruleMap: Map<string, Rule>;
  defaultOpen?: boolean;
};

export function CategorySection({ category, errors, ruleMap, defaultOpen = true }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const style = CATEGORY_STYLES[category];
  const def = ERROR_TAXONOMY[category];

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-muted transition-colors"
      >
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style.chip}`}
          >
            {def.label}
          </span>
          <span className="text-sm text-muted-foreground">{errors.length} {errors.length === 1 ? "error" : "errors"}</span>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/60 pt-3">
          {errors.map((err) => (
            <ArchivedErrorCard
              key={err.id}
              error={err}
              rule={err.ruleId ? (ruleMap.get(err.ruleId) ?? null) : null}
            />
          ))}
        </div>
      )}
    </div>
  );
}
