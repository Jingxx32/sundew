import { test } from "node:test";
import assert from "node:assert/strict";

import { reflowPassage } from "./reflow-passage";

/**
 * Fixtures are written for this test, not copied from the question bank: the
 * bank is copyrighted and this repo is public. Each one keeps the *shape* that
 * matters — where the source wrapped, which lines carry end punctuation, where
 * a salutation or signature sits — because that shape is what reflow reads.
 */

test("joins wrapped lines but keeps salutation and signature apart", () => {
  const passage = [
    "Papa.",
    "Je révise mon cours de",
    "physique chez Camille.",
    "Je rentre à 20 heures. Bises",
    "et à tout à l'heure.",
    "Théo",
  ].join("\n");
  assert.deepEqual(reflowPassage(passage), [
    "Papa.",
    "Je révise mon cours de physique chez Camille.",
    "Je rentre à 20 heures. Bises et à tout à l'heure.",
    "Théo",
  ]);
});

test("breaks before a sign-off that carries no punctuation", () => {
  const passage = [
    "Manon, bonjour,",
    "C'est entendu, RV avec les",
    "voisines chez-moi le 12 mars",
    "pour un café",
    "Bisous",
    "Clara",
  ].join("\n");
  assert.deepEqual(reflowPassage(passage), [
    "Manon, bonjour,",
    "C'est entendu, RV avec les voisines chez-moi le 12 mars pour un café",
    "Bisous",
    "Clara",
  ]);
});

test("keeps a formal letter's four blocks", () => {
  const passage = [
    "Monsieur,",
    "Nous avons bien enregistré votre demande d'inscription",
    "pour un atelier du soir (Session de printemps). Vous nous",
    "avez transmis le formulaire rempli, mais il nous faut",
    "également une copie de votre pièce d'identité. Merci",
    "de nous la faire parvenir par voie postale ou sous forme",
    "numérique.",
    "Cordialement,",
    "Le secrétariat des cours.",
  ].join("\n");
  assert.deepEqual(reflowPassage(passage), [
    "Monsieur,",
    "Nous avons bien enregistré votre demande d'inscription pour un atelier du soir (Session de printemps). Vous nous avez transmis le formulaire rempli, mais il nous faut également une copie de votre pièce d'identité. Merci de nous la faire parvenir par voie postale ou sous forme numérique.",
    "Cordialement,",
    "Le secrétariat des cours.",
  ]);
});

test("joins across a capitalised proper noun", () => {
  const passage = [
    "Vous souhaitez rencontrer d’autres",
    "familles ? vous souhaitez pratiquer l'italien,",
    "portugais, allemand ?",
    "Ateliers à domicile ou au foyer",
    "Valmoutiers.",
    "Renseignements au 01 04 05 07 71",
  ].join("\n");
  assert.deepEqual(reflowPassage(passage), [
    "Vous souhaitez rencontrer d’autres familles ? vous souhaitez pratiquer l'italien, portugais, allemand ?",
    "Ateliers à domicile ou au foyer Valmoutiers.",
    "Renseignements au 01 04 05 07 71",
  ]);
});

test("leaves a trailing prompt fragment on its own line", () => {
  const passage = [
    "Monsieur,",
    "Suite à votre appel du 4 mai dernier, je",
    "vous adresse la brochure de nos formations.",
    "Très cordialement",
    "MARINE DUVERT Service adhérents",
    "(3) Pourquoi est-ce que Marine DUVERT écrit",
  ].join("\n");
  assert.deepEqual(reflowPassage(passage), [
    "Monsieur,",
    "Suite à votre appel du 4 mai dernier, je vous adresse la brochure de nos formations.",
    "Très cordialement",
    "MARINE DUVERT Service adhérents",
    "(3) Pourquoi est-ce que Marine DUVERT écrit",
  ]);
});

test("splits a long article on its sentence ends", () => {
  const passage = [
    "Covoiturage",
    "Le partage de trajets entre les villes moyennes",
    "progresse plus lentement que prévu. Au point que dans",
    "l'ouest du pays près de deux mille places restent vides. Ce",
    "constat ne vaut pas que pour cette région puisqu'un recul",
    "de huit pour cent aurait été observé dans plusieurs départements.",
  ].join("\n");
  assert.deepEqual(reflowPassage(passage), [
    "Covoiturage",
    "Le partage de trajets entre les villes moyennes progresse plus lentement que prévu. Au point que dans l'ouest du pays près de deux mille places restent vides. Ce constat ne vaut pas que pour cette région puisqu'un recul de huit pour cent aurait été observé dans plusieurs départements.",
  ]);
});

test("honours a blank line as a hard paragraph break", () => {
  assert.deepEqual(reflowPassage("Objet : réunion\n\nNotre prochaine\nréunion aura lieu."), [
    "Objet : réunion",
    "Notre prochaine réunion aura lieu.",
  ]);
});

test("returns nothing for an empty passage", () => {
  assert.deepEqual(reflowPassage(""), []);
  assert.deepEqual(reflowPassage("   \n  \n"), []);
});

test("keeps a heading line but still wraps a heading that spans two lines", () => {
  assert.deepEqual(reflowPassage("Objet : réunion de service\nNotre prochaine réunion aura\nlieu mercredi 12 octobre."), [
    "Objet : réunion de service",
    "Notre prochaine réunion aura lieu mercredi 12 octobre.",
  ]);
  assert.deepEqual(reflowPassage("Heures d'ouverture du service\nconsulaire :\nLe service est ouvert."), [
    "Heures d'ouverture du service consulaire :",
    "Le service est ouvert.",
  ]);
});

test("a mid-sentence colon does not end the line, a heading colon does", () => {
  assert.deepEqual(
    reflowPassage("Le lien entre un tuteur et un stagiaire n'est pas un lien amical :\non ne demande pas à un tuteur d'être chaleureux."),
    ["Le lien entre un tuteur et un stagiaire n'est pas un lien amical : on ne demande pas à un tuteur d'être chaleureux."],
  );
  assert.deepEqual(reflowPassage("Horaires du service :\nLe service est ouvert les lundis."), [
    "Horaires du service :",
    "Le service est ouvert les lundis.",
  ]);
});

test("keeps a signature that follows an unpunctuated line", () => {
  const passage = [
    "ÉCOLE BELLEVUE",
    "Les familles peuvent venir chercher leurs enfants",
    "après les activités du midi et du soir.",
    "Tous les enfants doivent avoir quitté l'école à 18h",
    "M.Vasseur",
  ].join("\n");
  assert.deepEqual(reflowPassage(passage), [
    "ÉCOLE BELLEVUE",
    "Les familles peuvent venir chercher leurs enfants après les activités du midi et du soir.",
    "Tous les enfants doivent avoir quitté l'école à 18h",
    "M.Vasseur",
  ]);
});

test("a lowercase two-word tail is a wrap, not a signature", () => {
  assert.deepEqual(reflowPassage("une série de six romans inspirés des récits du\nvieux Marcel"), [
    "une série de six romans inspirés des récits du vieux Marcel",
  ]);
});
