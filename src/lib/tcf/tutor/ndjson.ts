/** One line of the tutor stream. Pure: shared by the route and the client reader. */
export type TutorStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; messageId: string }
  | { type: "error" };

export function encodeEvent(e: TutorStreamEvent): string {
  return `${JSON.stringify(e)}\n`;
}

/** Parses the complete lines of `buffer`; the unfinished tail comes back as `rest`. Malformed lines are skipped. */
export function parseEvents(buffer: string): { events: TutorStreamEvent[]; rest: string } {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const events: TutorStreamEvent[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as TutorStreamEvent;
      if (parsed && (parsed.type === "delta" || parsed.type === "done" || parsed.type === "error")) events.push(parsed);
    } catch {
      // a corrupt line must not stop the stream
    }
  }
  return { events, rest };
}
