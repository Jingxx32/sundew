/**
 * LLM character offsets are unreliable, and short originals ("des ", "il", "à")
 * repeat across a submission. Recover the span by trusting, in order: the
 * reported offsets, the sentence the error was quoted from, a unique match,
 * and finally the occurrence closest to the reported start.
 */
export function locateErrorSpan(
  content: string,
  original: string,
  start: number,
  end: number,
  context?: string | null,
): { start: number; end: number } | null {
  const clampedStart = Math.max(0, Math.min(content.length, start));
  const clampedEnd = Math.max(clampedStart, Math.min(content.length, end));
  if (content.slice(clampedStart, clampedEnd) === original) {
    return { start: clampedStart, end: clampedEnd };
  }
  if (original.length === 0) return { start: clampedStart, end: clampedEnd };

  const found = (idx: number) => ({ start: idx, end: idx + original.length });

  if (context) {
    // Every occurrence of the context holds `original` at the same offset, so
    // the first occurrence decides.
    const ctxIdx = content.indexOf(context);
    const inner = context.indexOf(original);
    if (ctxIdx !== -1 && inner !== -1) return found(ctxIdx + inner);
  }

  const first = content.indexOf(original);
  if (first === -1) return null;
  if (content.indexOf(original, first + 1) === -1) return found(first);

  let best = first;
  for (let idx = first; idx !== -1; idx = content.indexOf(original, idx + 1)) {
    if (Math.abs(idx - clampedStart) < Math.abs(best - clampedStart)) best = idx;
  }
  return found(best);
}
