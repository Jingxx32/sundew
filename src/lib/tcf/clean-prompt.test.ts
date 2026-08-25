import { test } from "node:test";
import assert from "node:assert/strict";

import { cleanPromptText } from "./clean-prompt";

/**
 * Fixtures are written for this test, not copied from the question bank: the
 * bank is copyrighted and this repo is public. What each one preserves is the
 * *noise* the cleaner has to recognise — the numbering styles, stray glyphs and
 * table debris the OCR leaves in front of a prompt — not any real question.
 */

test("strips a numbered prefix", () => {
  assert.equal(cleanPromptText("2. À quoi sert ce panneau ?"), "À quoi sert ce panneau ?");
  assert.equal(cleanPromptText("6. Qu'est-ce que M. Vasseur écrit ?"), "Qu'est-ce que M. Vasseur écrit ?");
  assert.equal(cleanPromptText("32) Que pense le journaliste ?"), "Que pense le journaliste ?");
  assert.equal(cleanPromptText("35)Que pense le journaliste ?"), "Que pense le journaliste ?");
});

test("strips a parenthesised number, including the source's own global numbering", () => {
  assert.equal(cleanPromptText("(83) Quel est le paradoxe de cette mesure ?"), "Quel est le paradoxe de cette mesure ?");
  assert.equal(cleanPromptText("(5) salle des fêtes ?"), "salle des fêtes ?");
});

test("strips a bare number followed by the sentence", () => {
  assert.equal(cleanPromptText("9 Que veut faire Camille ?"), "Que veut faire Camille ?");
});

test("strips a stray glyph", () => {
  assert.equal(cleanPromptText("p Quelles sont les relations entre Manon et Clara ?"), "Quelles sont les relations entre Manon et Clara ?");
  assert.equal(cleanPromptText("D Quel formulaire doit remplir le client ?"), "Quel formulaire doit remplir le client ?");
});

test("strips a quote glyph only when it precedes a number", () => {
  assert.equal(cleanPromptText("‘5. Pourquoi Théo écrit-il ce message ?"), "Pourquoi Théo écrit-il ce message ?");
});

test("strips OCR question-mark noise", () => {
  assert.equal(cleanPromptText("??? la personne décrite ?"), "la personne décrite ?");
});

test("keeps a real one-letter opening word", () => {
  for (const prompt of [
    "À quoi sert ce service ?",
    "À qui est adressé ce message ?",
    "À quelle difficulté se heurtent les spécialistes ?",
    "Y a-t-il une différence ?",
  ]) {
    assert.equal(cleanPromptText(prompt), prompt);
  }
});

test("keeps a prompt that opens on a quotation", () => {
  for (const prompt of ["« périurbains » ?", "« Vallée verte » ?", "« Horizon Jeunes » ?"]) {
    assert.equal(cleanPromptText(prompt), prompt);
  }
});

test("leaves a clean prompt untouched and is idempotent", () => {
  const clean = "Que propose la médiathèque du 6 au 10 septembre ?";
  assert.equal(cleanPromptText(clean), clean);
  assert.equal(cleanPromptText(cleanPromptText("2. " + clean)), clean);
});

test("leaves a truncated prompt alone apart from its prefix", () => {
  assert.equal(cleanPromptText("piscine ?"), "piscine ?");
  assert.equal(cleanPromptText("événement ?"), "événement ?");
  assert.equal(cleanPromptText("des TIC ?"), "des TIC ?");
});

test("does not eat a listening instruction", () => {
  const prompt = "Ecoutez le document sonore et la question, choisissez la bonne réponse :";
  assert.equal(cleanPromptText(prompt), prompt);
});

test("strips a bracketed number and a pipe left by the table border", () => {
  assert.equal(cleanPromptText("22] Qu'apprend-on au sujet du « covoiturage » ?"), "Qu'apprend-on au sujet du « covoiturage » ?");
  assert.equal(cleanPromptText("25)| Pour quoi ce satellite a-t-il été lancé ?"), "Pour quoi ce satellite a-t-il été lancé ?");
  assert.equal(cleanPromptText("25| Qu'apprend-on au sujet de l’apprentissage ?"), "Qu'apprend-on au sujet de l’apprentissage ?");
});

test("strips a bare number before lowercase only when it is the question's own number", () => {
  assert.equal(cleanPromptText("23 l'usage de pièces d'occasion ?", 23), "l'usage de pièces d'occasion ?");
  assert.equal(cleanPromptText("18 théâtre contemporain ?", 18), "théâtre contemporain ?");
  // A time the sentence is about, on question 7 — must survive.
  assert.equal(cleanPromptText("18 h 30 ?", 7), "18 h 30 ?");
  assert.equal(cleanPromptText("18h 30 ?", 7), "18h 30 ?");
  // Without the question number there is nothing to disambiguate with.
  assert.equal(cleanPromptText("18 h 30 ?"), "18 h 30 ?");
});

test("never empties a prompt that is only a number", () => {
  assert.equal(cleanPromptText("23", 23), "23");
});
