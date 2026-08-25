"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

import { stripVerdictSection } from "@/lib/tcf/parse-explanation";

/**
 * Renders one question's hand-written explanation (see
 * docs/superpowers/specs/2026-08-13-tcf-explanations-design.md).
 *
 * The markdown is authored by hand and contains conjugation tables, so GFM is
 * required — without remark-gfm a table renders as a row of pipes. Styling is
 * an explicit component map rather than a typography plugin, to stay consistent
 * with the surrounding Transcription panel and avoid a new Tailwind dependency.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
const MARKDOWN_COMPONENTS = {
  h1: ({ children }: any) => (
    <h3 className="text-sm font-semibold text-foreground mt-4 first:mt-0">{children}</h3>
  ),
  h2: ({ children }: any) => (
    <h3 className="text-sm font-semibold text-foreground mt-4 first:mt-0">{children}</h3>
  ),
  h3: ({ children }: any) => (
    <h4 className="text-sm font-medium text-foreground mt-3">{children}</h4>
  ),
  p: ({ children }: any) => <p className="my-2">{children}</p>,
  ul: ({ children }: any) => <ul className="my-2 list-disc pl-5 space-y-1">{children}</ul>,
  ol: ({ children }: any) => <ol className="my-2 list-decimal pl-5 space-y-1">{children}</ol>,
  blockquote: ({ children }: any) => (
    <blockquote className="my-2 border-l-2 border-border/70 pl-3 text-muted-foreground">
      {children}
    </blockquote>
  ),
  code: ({ children }: any) => (
    <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[13px]">
      {children}
    </code>
  ),
  table: ({ children }: any) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  ),
  th: ({ children }: any) => (
    <th className="border border-border/60 bg-surface-muted px-2 py-1 text-left font-medium">
      {children}
    </th>
  ),
  td: ({ children }: any) => (
    <td className="border border-border/60 px-2 py-1 align-top">{children}</td>
  ),
  hr: () => <hr className="my-4 border-border/60" />,
  // Links are deliberately flattened to plain text because explanation bodies are prose,
  // not link collections. The link destination is therefore dropped.
  a: ({ children }: any) => <span>{children}</span>,
} satisfies Components;
/* eslint-enable @typescript-eslint/no-explicit-any */

export function ExplanationPanel({ markdown }: { markdown: string }) {
  // The 速判 section is rendered as a verdict bar and per-option lines by the
  // runners; printing it again here would duplicate every line.
  const prose = stripVerdictSection(markdown);
  if (!prose.trim()) return null;

  return (
    <div className="rounded-lg border border-border/50 bg-surface-muted/60 px-4 py-3">
      <p className="text-[11px] uppercase tracking-widest text-subtle-foreground font-medium mb-2">
        Explication
      </p>
      <div className="text-sm leading-relaxed text-foreground">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={MARKDOWN_COMPONENTS}
        >
          {prose}
        </ReactMarkdown>
      </div>
    </div>
  );
}
