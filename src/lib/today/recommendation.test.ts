import assert from "node:assert/strict";
import test from "node:test";
import { recommendActivity } from "./recommendation";

const base = { learningMode: "general" as const, dueVocabulary: 0, repeatedConjugationIssue: false, wroteToday: false, suggestedTcfSkill: "listening" as const };

test("due review outranks a new activity", () => assert.equal(recommendActivity({ ...base, dueVocabulary: 3 }), "vocabulary"));
test("repeated conjugation evidence selects a related drill", () => assert.equal(recommendActivity({ ...base, repeatedConjugationIssue: true }), "conjugation"));
test("TCF goals select an exam activity", () => assert.equal(recommendActivity({ ...base, learningMode: "tcf", suggestedTcfSkill: "reading" }), "tcf-reading"));
test("general learners receive writing before a generic fallback", () => assert.equal(recommendActivity(base), "writing"));
