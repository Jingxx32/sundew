import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import * as nodeModule from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { drizzle } from "drizzle-orm/postgres-js";
import type postgres from "postgres";
import { A, B, GAP_A, GAP_B, TCF_Q, TCF_SET } from "./fixtures.mjs";

export type Check = (id: string, expected: string, work: () => Promise<void>) => Promise<void>;
type Feedback = { ok: boolean; comments: string[]; better_examples: string[] };

/** Replace only framework/auth/provider boundaries; execute actual action and SQL code. */
export async function loadActions(sql: postgres.Sql) {
  const owner = new AsyncLocalStorage<string | null>();
  const context = { db: drizzle(sql), owner, revalidate: () => {}, feedback: async (): Promise<Feedback> => {
    throw new Error("Synthetic provider failure");
  } };
  const globalKey = Symbol.for("sundew.review.rehearsal");
  (globalThis as Record<symbol, unknown>)[globalKey] = context;
  const ctx = 'globalThis[Symbol.for("sundew.review.rehearsal")]';
  const mocks = new Map([
    ["@/lib/db", `export const db = ${ctx}.db;`],
    ["@/lib/auth/session", `export async function requireUser() { const id = ${ctx}.owner.getStore(); if (!id) throw new Error("UNAUTHENTICATED"); return {id,role:"member"}; }`],
    ["next/cache", `export function revalidatePath() { ${ctx}.revalidate(); }`],
    ["@/lib/ai/micro-drill", `export async function evaluateMicroDrill(...args) { return ${ctx}.feedback(...args); }`],
    ["@/lib/pdf/extract", 'export function extractPdfText() { throw new Error("Outside rehearsal scope"); }'],
    ["@/lib/ai/quiz-parse", 'export function parseQuizFromText() { throw new Error("Paid calls forbidden"); }'],
    ["@/lib/actions/vocabulary", 'export function resolveLookup() { throw new Error("Outside rehearsal scope"); }'],
  ]);
  const mockDirectory = await mkdtemp(path.join(tmpdir(), "sundew-review-boundaries-"));
  const mockUrls = new Map<string, string>();
  for (const [index, [key, source]] of [...mocks.entries()].entries()) {
    const file = path.join(mockDirectory, `stub-${index}.cjs`);
    await writeFile(file, source.replace(/export const (\w+) =/g, "exports.$1 =")
      .replace(/export async function (\w+)\(/g, "exports.$1 = async function(")
      .replace(/export function (\w+)\(/g, "exports.$1 = function("));
    mockUrls.set(key, pathToFileURL(file).href);
  }
  type Resolve = (specifier: string, context: unknown) => { url: string; shortCircuit?: boolean };
  const registerHooks = (nodeModule as unknown as { registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, next: Resolve) => ReturnType<Resolve>;
  }) => { deregister(): void } }).registerHooks;
  assert(registerHooks, "Rehearsal requires Node >=22.15 or >=23.5 for module boundary hooks");
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      const alias = [...mocks.keys()].find((key) => specifier === key ||
        (key.startsWith("@/") && specifier.replace(/\\/g, "/").endsWith(`/src/${key.slice(2)}${key === "@/lib/db" ? "/index" : ""}.ts`)));
      return alias ? { url: mockUrls.get(alias)!, shortCircuit: true } : next(specifier, context);
    },
  });
  try {
    const require = nodeModule.createRequire(import.meta.url);
    const quiz = require("../../src/lib/actions/quiz") as typeof import("../../src/lib/actions/quiz");
    const tcf = require("../../src/lib/actions/tcf") as typeof import("../../src/lib/actions/tcf");
    const vocab = require("../../src/lib/actions/vocab-gaps") as typeof import("../../src/lib/actions/vocab-gaps");
    const writing = require("../../src/lib/actions/errors") as typeof import("../../src/lib/actions/errors");
    const conjugation = require("../../src/lib/actions/conjugation") as typeof import("../../src/lib/actions/conjugation");
    return { quiz, tcf, vocab, writing, conjugation, context,
      as: <T,>(id: string | null, fn: () => Promise<T>) => owner.run(id, fn),
      close: async () => { hooks.deregister(); delete (globalThis as Record<symbol, unknown>)[globalKey]; await rm(mockDirectory, { recursive: true, force: true }); } };
  } catch (error) { hooks.deregister(); delete (globalThis as Record<symbol, unknown>)[globalKey]; await rm(mockDirectory, { recursive: true, force: true }); throw error; }
}

export async function actionChecks(sql: postgres.Sql, check: Check, barrier: (table: string, work: () => Promise<unknown>) => Promise<void>) {
  const app = await loadActions(sql);
  const answers = [{ questionId: "q-a-1", answer: 0 }, { questionId: "q-a-2", answer: 1, uncertain: true }];
  try {
    await check("quiz-retry", "Concurrent and sequential retries save one parent and two item answers", async () => {
      const input = { setId: "quiz-a", answers, requestKey: "quiz-request-0001" };
      await barrier("quiz_attempts", () => app.as(A, () => Promise.all([app.quiz.submitQuizAttempt(input), app.quiz.submitQuizAttempt(input)])));
      const replay = await app.as(A, () => app.quiz.submitQuizAttempt(input));
      assert.equal(replay.score, 1); assert.equal(replay.total, 2);
      assert.equal(Number((await sql`select count(*) as n from quiz_attempts where request_key=${input.requestKey}`)[0].n), 1);
      assert.equal(Number((await sql`select count(*) as n from quiz_question_attempts where attempt_id=${replay.id}`)[0].n), 2);
      await assert.rejects(app.as(A, () => app.quiz.submitQuizAttempt({ ...input, answers: answers.map(a => ({ ...a, answer: 1 })) })), /different answers/);
    });
    await check("cloze-grading", "Cloze grading uses saved per-question answer and rejects malformed selection", async () => {
      const result = await app.as(A, () => app.quiz.submitQuizAttempt({ setId: "cloze-a", answers: [{ questionId: "cloze-q", answer: "ecole" }], requestKey: "cloze-request-0001" }));
      assert.equal(result.score, 1);
      await assert.rejects(app.as(A, () => app.quiz.submitQuizAttempt({ setId: "quiz-a", answers: [{ questionId: "q-a-1", answer: 99 }, answers[1]], requestKey: "invalid-request-0001" })), /Invalid choice/);
    });
    await check("committed-answer-lost-receipt", "A failure after commit retries to the same answer without duplicate records", async () => {
      const input = { setId: "quiz-a", answers, requestKey: "lost-receipt-0001", userId: B };
      app.context.revalidate = () => { throw new Error("Synthetic failure after commit"); };
      try { await assert.rejects(app.as(A, () => app.quiz.submitQuizAttempt(input)), /after commit/); }
      finally { app.context.revalidate = () => {}; }
      const [saved] = await sql`select id,user_id from quiz_attempts where request_key=${input.requestKey}`;
      const replay = await app.as(A, () => app.quiz.submitQuizAttempt(input));
      assert.equal(replay.id, saved.id); assert.equal(saved.user_id, A);
      assert.equal(Number((await sql`select count(*) as n from quiz_attempts where request_key=${input.requestKey}`)[0].n), 1);
    });
    await check("tcf-retry-grading", "Two concurrent forged verdicts are graded server-side and deduplicated", async () => {
      const input = { questionId: TCF_Q, chosen: 1, correct: true, requestKey: "tcf-request-0001" };
      await barrier("tcf_question_attempts", () => app.as(A, () => Promise.all([app.tcf.recordTcfQuestionAttempt(input), app.tcf.recordTcfQuestionAttempt(input)])));
      await app.as(A, () => app.tcf.recordTcfQuestionAttempt(input));
      const rows = await sql`select correct from tcf_question_attempts where request_key=${input.requestKey}`;
      assert.equal(rows.length, 1); assert.equal(rows[0].correct, false);
      await assert.rejects(app.as(A, () => app.tcf.recordTcfQuestionAttempt({ ...input, uncertain: true })), /different answers/);
      // Same key in another authenticated owner's scope is legitimate.
      await app.as(B, () => app.tcf.recordTcfQuestionAttempt(input));
      assert.equal(Number((await sql`select count(*) as n from tcf_question_attempts where request_key=${input.requestKey}`)[0].n), 2);
    });
    await check("tcf-exam-retry", "Exam score and child rows are server graded and saved once", async () => {
      const input = { setId: TCF_SET, skill: "reading" as const, testNumber: 9999, score: 99, total: 99,
        perLevel: {}, answers: [{ questionId: TCF_Q, chosen: 1, correct: true }], requestKey: "exam-request-0001" };
      await barrier("tcf_attempts", () => app.as(A, () => Promise.all([app.tcf.recordTcfExamAttempt(input), app.tcf.recordTcfExamAttempt(input)])));
      const rows = await sql`select id,score,total from tcf_attempts where request_key=${input.requestKey}`;
      assert.equal(rows.length, 1); assert.equal(rows[0].score, 0); assert.equal(rows[0].total, 1);
      assert.equal(Number((await sql`select count(*) as n from tcf_question_attempts where exam_attempt_id=${rows[0].id}`)[0].n), 1);
    });
    await check("vocabulary-retry", "Concurrent reviews log once and increment Leitner once; exact replay works when no longer due", async () => {
      const run = () => app.as(A, () => app.vocab.gradeGapReview(GAP_A, "hello", "vocab-request-0001"));
      await barrier("vocabulary_review_attempts", () => Promise.all([run(), run()]));
      const result = await run(); assert.equal(result.box, 2);
      assert.equal((await sql`select box from vocabulary_gaps where id=${GAP_A}`)[0].box, 2);
      assert.equal(Number((await sql`select count(*) as n from vocabulary_review_attempts where request_key='vocab-request-0001'`)[0].n), 1);
      await assert.rejects(app.as(A, () => app.vocab.gradeGapReview(GAP_A, "wrong", "vocab-request-0001")), /different answer/);
    });
    await check("conjugation-retry", "Concurrent retries save one server-graded conjugation answer; changed payload is rejected", async () => {
      const input = { verb: "être", tense: "présent" as const, person: 0, userInput: "suis", requestKey: "conjugation-request-0001" };
      const run = () => app.as(A, () => app.conjugation.recordConjugationAttempt(input));
      await barrier("conjugation_attempts", () => Promise.all([run(), run()]));
      assert.equal((await run()).correct, true);
      assert.equal(Number((await sql`select count(*) as n from conjugation_attempts where request_key=${input.requestKey}`)[0].n), 1);
      await assert.rejects(app.as(A, () => app.conjugation.recordConjugationAttempt({ ...input, userInput: "est" })), /different answer/);
      await assert.rejects(app.as(A, () => app.conjugation.recordConjugationAttempt({ ...input, person: 9 })), /Invalid conjugation answer/);
      await app.as(B, () => app.conjugation.recordConjugationAttempt(input));
      assert.equal(Number((await sql`select count(*) as n from conjugation_attempts where request_key=${input.requestKey}`)[0].n), 2);
    });
    await check("action-ownership", "Actual actions reject foreign resources and unauthenticated calls", async () => {
      assert.equal(await app.as(A, () => app.quiz.getQuizSet("quiz-b")), null);
      await assert.rejects(app.as(B, () => app.quiz.submitQuizAttempt({ setId: "quiz-a", answers, requestKey: "foreign-quiz-0001" })), /not found/);
      await assert.rejects(app.as(A, () => app.vocab.gradeGapReview(GAP_B, "hello", "foreign-vocab-0001")), /unavailable/);
      await assert.rejects(app.as(A, () => app.writing.createMicroDrill("error-b", "Je suis ici.", "foreign-writing-0001")), /not found/);
      assert.equal((await app.as(A, () => app.writing.getMicroDrillsForError("error-b"))).length, 0);
      await assert.rejects(app.as(null, () => app.quiz.submitQuizAttempt({ setId: "quiz-a", answers, requestKey: "anonymous-quiz-0001" })), /UNAUTHENTICATED/);
      assert.equal((await sql`select box from vocabulary_gaps where id=${GAP_B}`)[0].box, 1);
    });
    await check("vocabulary-atomic-failure", "A forced log-insert failure rolls back the preceding box update", async () => {
      await sql`create function review_test_fail() returns trigger language plpgsql as $$ begin raise exception 'synthetic insert failure'; end $$`;
      await sql`create trigger review_test_fail before insert on vocabulary_review_attempts for each row execute function review_test_fail()`;
      try {
        await assert.rejects(app.as(B, () => app.vocab.gradeGapReview(GAP_B, "hello", "vocab-rollback-0001")));
        assert.equal((await sql`select box from vocabulary_gaps where id=${GAP_B}`)[0].box, 1);
        assert.equal(Number((await sql`select count(*) as n from vocabulary_review_attempts where request_key='vocab-rollback-0001'`)[0].n), 0);
      } finally { await sql`drop trigger review_test_fail on vocabulary_review_attempts`; await sql`drop function review_test_fail()`; }
      await app.as(B, () => app.vocab.gradeGapReview(GAP_B, "hello", "vocab-rollback-0001"));
      assert.equal((await sql`select box from vocabulary_gaps where id=${GAP_B}`)[0].box, 2);
    });
    await check("writing-save-before-ai", "Failed AI leaves one saved response; same-key retry makes no extra provider call", async () => {
      let calls = 0;
      app.context.feedback = async () => { calls++; throw new Error("Synthetic failure"); };
      const run = () => app.as(A, () => app.writing.createMicroDrill("error-a", "Je suis ici.", "writing-request-0001"));
      await barrier("micro_drills", () => Promise.all([run(), run()]));
      const result = await run(); assert.equal(result.feedbackStatus, "failed"); assert.equal(calls, 1);
      assert.equal(Number((await sql`select count(*) as n from micro_drills where request_key='writing-request-0001'`)[0].n), 1);
      app.context.feedback = async () => { calls++; return { ok: true, comments: ["Synthetic recovery"], better_examples: [] }; };
      const recovered = await app.as(A, () => app.writing.retryMicroDrillFeedback(result.id));
      assert.equal(recovered.feedbackStatus, "ready");
      await app.as(A, () => app.writing.retryMicroDrillFeedback(result.id)); assert.equal(calls, 2);
    });
    for (const outcome of ["success", "failure"] as const) await check(`writing-stale-worker-${outcome}`, "An older provider result cannot overwrite a newer feedback generation", async () => {
      let release!: (value: Feedback) => void;
      let fail!: (error: Error) => void;
      let entered!: () => void;
      const started = new Promise<void>(resolve => { entered = resolve; });
      app.context.feedback = () => { entered(); return new Promise<Feedback>((resolve, reject) => { release = resolve; fail = reject; }); };
      const key = `writing-stale-${outcome}`;
      const old = app.as(A, () => app.writing.createMicroDrill("error-a", "Je suis là.", key));
      await started;
      const [row] = await sql`select id from micro_drills where request_key=${key}`;
      await sql`update micro_drills set feedback_lease_until=now()-interval '1 second' where id=${row.id}`;
      app.context.feedback = async () => ({ ok: true, comments: ["new-generation"], better_examples: [] });
      try { await app.as(A, () => app.writing.retryMicroDrillFeedback(row.id)); }
      finally {
        if (outcome === "success") release({ ok: false, comments: ["stale-generation"], better_examples: [] });
        else fail(new Error("Synthetic late failure"));
        await old;
      }
      assert.deepEqual((await sql`select feedback_json from micro_drills where id=${row.id}`)[0].feedback_json.comments, ["new-generation"]);
    });
  } finally { await app.close(); }
}
