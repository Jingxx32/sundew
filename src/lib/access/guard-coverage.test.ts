import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/** Bodies of exported async functions, keyed by name (each runs to the next export). */
function exportedBodies(file: string): Map<string, string> {
  const source = readFileSync(file, "utf8");
  const starts = [...source.matchAll(/^export async function (\w+)/gm)];
  return new Map(starts.map((m, i) => [m[1], source.slice(m.index, starts[i + 1]?.index ?? source.length)]));
}

const WHOLE_FILES: Array<{ file: string; feature: string; summaryReads?: string[] }> = [
  { file: "src/lib/actions/tcf.ts", feature: "tcf", summaryReads: ["getTcfReviewCount", "listRecentTcfAttempts"] },
  { file: "src/lib/actions/speaking.ts", feature: "speaking" },
  { file: "src/lib/actions/speaking-simulation.ts", feature: "speaking" },
  { file: "src/lib/actions/quiz.ts", feature: "quiz" },
  { file: "src/lib/actions/cloze.ts", feature: "quiz" },
];

for (const { file, feature, summaryReads = [] } of WHOLE_FILES) {
  test(`${file}: every export is gated on ${feature}`, () => {
    const bodies = exportedBodies(file);
    assert.ok(bodies.size > 0, "no exports found");
    for (const [name, body] of bodies) {
      const pattern = summaryReads.includes(name) ? `canUse(user.access, "${feature}")` : `requireFeature("${feature}")`;
      assert.ok(body.includes(pattern), `${name} must call ${pattern}`);
    }
  });
}

/** [file, exported function, feature] — single gated exports inside otherwise open files. */
export const SINGLE_EXPORTS: Array<[string, string, string]> = [
  ["src/lib/actions/tasks.ts", "writeFromTcfPassage", "tcf"],
  ["src/lib/actions/vocab-gaps.ts", "markTcfVocabGap", "tcf"],
];

test("single gated exports", () => {
  for (const [file, name, feature] of SINGLE_EXPORTS) {
    const body = exportedBodies(file).get(name);
    assert.ok(body, `${file} has no export ${name}`);
    assert.ok(body.includes(`requireFeature("${feature}")`), `${name} must call requireFeature("${feature}")`);
  }
});

const GATED_FILES: Array<[string, string]> = [
  ["src/app/api/speaking/assess/route.ts", `requireFeature("speaking")`],
  ["src/app/api/speaking/follow-ups/[followUpId]/route.ts", `requireFeature("speaking")`],
  ["src/app/api/speaking/recordings/[assetId]/route.ts", `requireFeature("speaking")`],
  ["src/app/api/speaking/sessions/[sessionId]/turns/route.ts", `requireFeature("speaking")`],
  ["src/app/tcf/page.tsx", `pageGate("tcf")`],
  ["src/app/tcf/drill/page.tsx", `pageGate("tcf")`],
  ["src/app/tcf/exam/page.tsx", `pageGate("tcf")`],
  ["src/app/tcf/review/page.tsx", `pageGate("tcf")`],
  ["src/app/(main)/quiz/page.tsx", `pageGate("quiz")`],
  ["src/app/(main)/quiz/[setId]/page.tsx", `pageGate("quiz")`],
  ["src/app/(main)/speaking/page.tsx", `pageGate("speaking")`],
  ["src/app/(main)/speaking/task-2/page.tsx", `pageGate("speaking")`],
  ["src/app/(main)/speaking/sessions/[sessionId]/page.tsx", `pageGate("speaking")`],
  ["src/app/(main)/speaking/sessions/[sessionId]/feedback/page.tsx", `pageGate("speaking")`],
  ["src/app/(main)/speaking/[promptId]/script/page.tsx", `pageGate("speaking")`],
];

test("gated routes and pages call their guard", () => {
  for (const [file, call] of GATED_FILES) assert.ok(readFileSync(file, "utf8").includes(call), `${file} must call ${call}`);
});
