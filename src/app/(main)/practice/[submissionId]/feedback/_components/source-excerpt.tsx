"use client";

import { useState } from "react";
import type { Document } from "@/lib/db/schema";

type Props = {
  doc: Document | null;
};

const PREVIEW_LEN = 500;

export function SourceExcerpt({ doc }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (!doc) {
    return (
      <div className="bg-surface rounded-2xl border border-border shadow-card p-6">
        <p className="text-sm text-muted-foreground italic">Original document removed</p>
      </div>
    );
  }

  const showToggle = doc.content.length > PREVIEW_LEN;
  const displayText = expanded ? doc.content : doc.content.slice(0, PREVIEW_LEN);

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-card p-6 space-y-3">
      <div className="text-[11px] uppercase tracking-wider text-accent font-medium">Source</div>
      <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
        {displayText}
        {!expanded && showToggle && "…"}
      </p>
      {showToggle && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-xs text-accent hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
