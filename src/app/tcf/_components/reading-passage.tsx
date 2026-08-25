import { reflowPassage } from "@/lib/tcf/reflow-passage";

/**
 * A reading document. The stored text carries one line per line of the source
 * image, so it is reflowed into paragraphs rather than rendered verbatim.
 */
export function ReadingPassage({ passage }: { passage: string }) {
  return (
    <article className="reading-prose rounded-lg border border-border/50 bg-surface-muted/40 px-5 py-4">
      {reflowPassage(passage).map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </article>
  );
}
