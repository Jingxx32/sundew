"use client";

import type { ErrorRecord } from "@/lib/db/schema";
import type { ErrorCategory } from "@/lib/taxonomy";
import { CATEGORY_STYLES, superscript } from "@/lib/category-styles";
import { locateErrorSpan } from "@/lib/feedback/error-span";

type Props = {
  contentFr: string;
  errors: ErrorRecord[];
};

type Segment =
  | { type: "text"; text: string }
  | { type: "error"; text: string; originalIndex: number; category: ErrorCategory };

export function SubmissionText({ contentFr, errors }: Props) {
  // Pair each error with its original DB-order index so superscripts match the right panel.
  // Re-locate every span: stored offsets can point at unrelated text (older rows).
  const located = errors.flatMap((err, originalIndex) => {
    const span = locateErrorSpan(
      contentFr,
      err.original,
      err.spanStart,
      err.spanEnd,
      err.triggerContext,
    );
    return span ? [{ err, originalIndex, span }] : [];
  });
  // Sort by span start to walk the text in order
  const sorted = [...located].sort((a, b) => a.span.start - b.span.start);

  const segments: Segment[] = [];
  let pos = 0;

  for (const { err, originalIndex, span } of sorted) {
    const { start, end } = span;

    if (start >= end || start < pos) continue; // degenerate or overlapping span

    if (pos < start) {
      segments.push({ type: "text", text: contentFr.slice(pos, start) });
    }
    segments.push({
      type: "error",
      text: contentFr.slice(start, end),
      originalIndex,
      category: err.category as ErrorCategory,
    });
    pos = end;
  }

  if (pos < contentFr.length) {
    segments.push({ type: "text", text: contentFr.slice(pos) });
  }

  return (
    <p className="text-base leading-relaxed whitespace-pre-wrap">
      {segments.map((seg, i) => {
        if (seg.type === "text") {
          return <span key={i}>{seg.text}</span>;
        }
        const style = CATEGORY_STYLES[seg.category];
        return (
          <a key={i} href={`#error-${seg.originalIndex}`} className="no-underline">
            <mark
              className={`${style.mark} rounded-sm px-0.5 cursor-pointer hover:ring-1 hover:ring-current/30`}
            >
              {seg.text}
              <sup className="text-[10px] font-sans ml-0.5 select-none">
                {superscript(seg.originalIndex)}
              </sup>
            </mark>
          </a>
        );
      })}
    </p>
  );
}
