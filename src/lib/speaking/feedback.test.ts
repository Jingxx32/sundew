import assert from "node:assert/strict";
import test from "node:test";
import type { SpeakingTurn } from "@/lib/db/schema";
import { validateFeedback } from "./feedback";

const learner = { id: "11111111-1111-4111-8111-111111111111", role: "user", text: "Bonjour, quels sont les horaires ?" } as SpeakingTurn;
const partner = { id: "22222222-2222-4222-8222-222222222222", role: "examiner", text: "Le cours commence mardi." } as SpeakingTurn;
const valid = { summary: "The learner asked about the schedule.", strengths: [{ text: "Asked for a concrete detail", turnId: learner.id, quote: "quels sont les horaires" }], issues: [], limitations: [] };

test("accepts exact learner evidence", () => assert.equal(validateFeedback(valid, [learner, partner]).strengths.length, 1));
test("rejects fabricated and partner quotes", () => {
  assert.throws(() => validateFeedback({ ...valid, strengths: [{ ...valid.strengths[0], quote: "quel est le prix" }] }, [learner, partner]));
  assert.throws(() => validateFeedback({ ...valid, strengths: [{ text: "Good", turnId: partner.id, quote: "Le cours commence" }] }, [learner, partner]));
});
test("rejects unsupported levels and mismatched drills", () => {
  assert.throws(() => validateFeedback({ ...valid, summary: "Your speaking is B2." }, [learner, partner]));
  assert.throws(() => validateFeedback({ ...valid, issues: [{ id: "issue-1", category: "questions", explanation: "Ask more clearly", turnId: learner.id,
    quote: "quels sont les horaires", example: "Quand le cours commence-t-il ?", drillId: "clarification" }] }, [learner, partner]));
});
