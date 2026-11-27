/**
 * What the post-answer area shows while the explanation is collapsed or open.
 * Pure: no IO, no React, so the rules are testable without a browser.
 */
import type { TcfExplanationMeta } from "@/lib/db/schema";
import { hasTranscriptSection, stripVerdictSection } from "./parse-explanation";

/**
 * The raw (OCR) transcript stays visible while the explanation is collapsed. Once
 * the explanation is open and carries its own rewritten `## Transcript`, that
 * version replaces the raw one so a dialogue is never printed twice.
 */
export function transcriptPanel(input: {
  transcript: string | null;
  explanation: string | null;
  explanationOpen: boolean;
}): "raw" | "none" {
  if (!input.transcript) return "none";
  if (input.explanationOpen && input.explanation !== null && hasTranscriptSection(input.explanation)) return "none";
  return "raw";
}

/** True when there is anything to reveal behind the "Voir l'explication" toggle. */
export function hasExplanationDetails(meta: TcfExplanationMeta | null, explanation: string | null): boolean {
  if (meta && (meta.keyPoint || meta.options.some(Boolean))) return true;
  return explanation !== null && stripVerdictSection(explanation).trim() !== "";
}
