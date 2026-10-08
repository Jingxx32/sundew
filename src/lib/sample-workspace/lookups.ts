/** Keys for the guests' pre-generated look-ups (spec §9.4). Pure. */
const EDGE_PUNCTUATION = /^[\s«»"“”'’()\[\].,;:!?…–—-]+|[\s«»"“”'’()\[\].,;:!?…–—-]+$/g;
const ELISION = /^(?:qu|jusqu|lorsqu|puisqu|[cdjlmnst])['’]/i;

/** What a selection is matched by: lowercase NFC, edge punctuation stripped, French elision removed. */
export function sampleLookupKey(text: string): string {
  return text.normalize("NFC").toLowerCase().replace(EDGE_PUNCTUATION, "").replace(ELISION, "");
}

/** Every distinct key in a text, with its first surface form and that paragraph as context (as the reader sends it). */
export function tokenizeForLookups(text: string): Array<{ key: string; surface: string; context: string }> {
  const seen = new Map<string, { key: string; surface: string; context: string }>();
  for (const paragraph of text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)) {
    for (const token of paragraph.split(/\s+/)) {
      const surface = token.normalize("NFC").replace(EDGE_PUNCTUATION, "").replace(ELISION, "");
      const key = sampleLookupKey(surface);
      if (key.length < 2 || /\d/.test(key) || seen.has(key)) continue;
      seen.set(key, { key, surface, context: paragraph });
    }
  }
  return [...seen.values()];
}
