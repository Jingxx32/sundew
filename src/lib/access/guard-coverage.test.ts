import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
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
  ["src/lib/actions/tasks.ts", "generateWritingTask", "writing"],
  ["src/lib/actions/tasks.ts", "practiceFromPattern", "writing"],
  ["src/lib/actions/tasks.ts", "quickWrite", "writing"],
  ["src/lib/actions/tasks.ts", "createSubmission", "writing"],
  ["src/lib/actions/tasks.ts", "regenerateFeedback", "writing"],
  ["src/lib/actions/errors.ts", "createMicroDrill", "microDrill"],
  ["src/lib/actions/errors.ts", "retryMicroDrillFeedback", "microDrill"],
  ["src/lib/actions/documents.ts", "createDocument", "upload"],
  ["src/lib/actions/vocabulary.ts", "enrichEntry", "enrich"],
  ["src/lib/actions/vocabulary.ts", "reexplainInContext", "lookup"],
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

/** [file, exported function] — AI actions that check the member's daily budget before writing anything. */
const AI_BUDGET_EXPORTS: Array<[string, string]> = [
  ["src/lib/actions/tasks.ts", "generateWritingTask"],
  ["src/lib/actions/tasks.ts", "practiceFromPattern"],
  ["src/lib/actions/tasks.ts", "quickWrite"],
  ["src/lib/actions/tasks.ts", "writeFromTcfPassage"],
  ["src/lib/actions/tasks.ts", "createSubmission"],
  ["src/lib/actions/tasks.ts", "regenerateFeedback"],
  ["src/lib/actions/errors.ts", "createMicroDrill"],
  ["src/lib/actions/errors.ts", "retryMicroDrillFeedback"],
  ["src/lib/actions/quiz.ts", "importQuizFromPdf"],
  ["src/lib/actions/quiz.ts", "parseQuizFromPastedText"],
  ["src/lib/actions/cloze.ts", "preparePodcastCloze"],
  ["src/lib/actions/speaking.ts", "generateScript"],
  ["src/lib/actions/vocabulary.ts", "enrichEntry"],
  ["src/lib/actions/vocabulary.ts", "reexplainInContext"],
];

test("AI actions check the daily budget", () => {
  for (const [file, name] of AI_BUDGET_EXPORTS) {
    const body = exportedBodies(file).get(name);
    assert.ok(body, `${file} has no export ${name}`);
    assert.ok(body.includes("assertAiBudget("), `${name} must call assertAiBudget`);
  }
});

test("every OpenAI call names its budget bucket", () => {
  const files = readdirSync("src", { recursive: true, encoding: "utf8" })
    .filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts"))
    .map((f) => `src/${f}`);
  const bare = files.filter((f) => readFileSync(f, "utf8").includes("getOpenAI()"));
  assert.deepEqual(bare, [], "getOpenAI() needs a bucket");
});
