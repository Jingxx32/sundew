/**
 * Error Taxonomy for French learner feedback (A2-B1 optimized)
 *
 * This is the single source of truth for how AI feedback classifies errors.
 * It is also the schema the AI must conform to when emitting structured
 * feedback. See `src/lib/ai/feedback-schema.ts` (added in S4) for the Zod
 * version used in OpenAI structured outputs.
 *
 * Design principles:
 *  - Mutually exclusive leaves (no ambiguity for AI labelling)
 *  - 9 categories x ~4 subcategories = 37 leaves (sweet spot for AI accuracy)
 *  - Re-weighted for A2-B1: heavy on tense/gender/articles; light on style
 *  - No `severity` field — keeps AI output stable and treats all errors equally
 */

export const ERROR_TAXONOMY = {
  Grammar: {
    label: "Grammar",
    description: "Verb forms, tenses, moods, and core syntactic rules",
    subcategories: {
      conjugation_present: "Present tense conjugation",
      conjugation_passe_compose: "Passé composé conjugation",
      auxiliary_choice: "Auxiliary choice (être / avoir)",
      tense_choice: "Tense choice (present in past context, etc.)",
      pc_vs_imparfait: "Passé composé vs imparfait",
      past_participle_agreement: "Past participle agreement",
      subjonctif_basic: "Subjunctive (basic triggers)",
      futur_vs_conditionnel: "Futur vs conditionnel",
    },
  },
  GenderAgreement: {
    label: "Gender & Agreement",
    description: "Noun gender and agreement of articles, adjectives, etc.",
    subcategories: {
      noun_gender: "Wrong noun gender (le/la confusion)",
      adjective_agreement: "Adjective gender/number agreement",
      adjective_position: "Adjective placement before/after noun",
      article_noun_mismatch: "Article and noun gender mismatch",
    },
  },
  Articles: {
    label: "Articles",
    description: "Definite, indefinite, partitive, omission, contraction",
    subcategories: {
      definite_vs_indefinite: "le/la vs un/une choice",
      partitive: "Partitive du/de la/des",
      article_omission: "Missing or extra article",
      negation_de_rule: "un/une/des → de in negation",
      contraction: "à+le=au, de+le=du contraction",
    },
  },
  Prepositions: {
    label: "Prepositions",
    description: "Verb-preposition links, place, time, and general prepositions",
    subcategories: {
      verb_preposition: "Verb-preposition pairing (penser à/de)",
      place_preposition: "Place prepositions (en/à/au/aux + place)",
      time_preposition: "Time prepositions (à/en/dans/depuis/pendant/pour)",
      general_preposition: "Other preposition errors",
    },
  },
  Pronouns: {
    label: "Pronouns",
    description: "Subject, object, y/en, and stressed pronouns",
    subcategories: {
      subject_pronoun: "Subject pronoun choice (tu/vous, on)",
      object_pronoun: "COD/COI choice or placement",
      y_en: "y / en pronoun usage",
      stressed_pronoun: "Stressed pronouns (moi, toi, lui...)",
    },
  },
  NegationQuestion: {
    label: "Negation & Question",
    description: "Negation structure and question formation",
    subcategories: {
      negation_structure: "ne...pas / ne...plus / ne...jamais structure",
      question_formation: "Question formation (est-ce que / inversion)",
    },
  },
  Vocabulary: {
    label: "Vocabulary",
    description: "Word choice, faux amis, anglicisms, word form",
    subcategories: {
      wrong_word: "Wrong word (incl. faux amis)",
      anglicism: "Anglicism / direct translation from English",
      word_form: "Wrong word form (noun/verb/adj confusion)",
    },
  },
  Orthography: {
    label: "Orthography",
    description: "Spelling, accents, homophones, liaison/elision",
    subcategories: {
      accent: "Accent marks (é/è/ê/à) missing or wrong",
      cedilla: "Missing cedilla (ç)",
      homophone: "Homophone confusion (a/à, ou/où, ces/ses)",
      liaison_elision: "Liaison/elision (l'arbre, d'amis, etc.)",
      spelling: "Other spelling errors",
    },
  },
  Syntax: {
    label: "Syntax",
    description: "Word order and sentence structure",
    subcategories: {
      word_order: "Word order issues",
      awkward_structure: "Awkward / overly literal structure",
    },
  },
} as const;

export type ErrorCategory = keyof typeof ERROR_TAXONOMY;

export type ErrorSubcategory = {
  [K in ErrorCategory]: keyof (typeof ERROR_TAXONOMY)[K]["subcategories"];
}[ErrorCategory];

/** Flat list of every (category, subcategory) pair, useful for selects. */
export const ALL_SUBCATEGORIES: Array<{
  category: ErrorCategory;
  subcategory: string;
  label: string;
}> = Object.entries(ERROR_TAXONOMY).flatMap(([cat, def]) =>
  Object.entries(def.subcategories).map(([sub, label]) => ({
    category: cat as ErrorCategory,
    subcategory: sub,
    label: label as string,
  })),
);

/** Color hint per category, used in feedback highlights & dashboards. */
export const CATEGORY_COLORS: Record<ErrorCategory, string> = {
  Grammar: "amber",
  GenderAgreement: "rose",
  Articles: "violet",
  Prepositions: "red",
  Pronouns: "emerald",
  NegationQuestion: "cyan",
  Vocabulary: "blue",
  Orthography: "stone",
  Syntax: "fuchsia",
};
