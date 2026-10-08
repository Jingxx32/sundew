"use server";

import { syncReviewTarget } from "@/lib/review/service";
import { reviewDataEnabled, lockReviewOwner, conjugationKey } from "@/lib/review/adapters";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { desc, inArray, and, eq, count, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { errors, conjugationAttempts } from "@/lib/db/schema";
import {
  conjugate,
  acceptedForms,
  isKnownVerb,
  parseInfinitive,
  DRILL_TENSES,
  PERSON_LABELS,
  type DrillTense,
} from "@/lib/conjugation/source";
import { requireUser } from "@/lib/auth/session";

/* ------------------------------------------------------------------ */
/*  Drill targets                                                      */
/* ------------------------------------------------------------------ */

/** Common A2-B1 verbs used to fill the queue after error-driven picks. */
const COMMON_VERBS = [
  "être",
  "avoir",
  "aller",
  "faire",
  "prendre",
  "pouvoir",
  "vouloir",
  "devoir",
  "venir",
  "voir",
  "savoir",
  "mettre",
  "dire",
  "partir",
  "sortir",
  "finir",
  "choisir",
  "attendre",
  "comprendre",
  "boire",
  "lire",
  "écrire",
  "manger",
  "acheter",
  "se lever",
  "se coucher",
  "habiter",
  "travailler",
  "parler",
  "aimer",
] as const;

/** Grammar subcategories that signal conjugation trouble → drill tenses. */
const ERROR_SUBCATEGORY_TENSES: Record<string, DrillTense[]> = {
  conjugation_present: ["présent"],
  conjugation_passe_compose: ["passé composé"],
  auxiliary_choice: ["passé composé"],
  past_participle_agreement: ["passé composé"],
  pc_vs_imparfait: ["passé composé", "imparfait"],
  tense_choice: ["imparfait", "passé composé"],
  subjonctif_basic: ["subjonctif présent"],
  futur_vs_conditionnel: ["futur simple", "conditionnel présent"],
};

export type DrillItem = {
  verb: string;
  tense: DrillTense;
  person: number;
  personLabel: string;
  pronominal: boolean;
  /** True when this drill was seeded from the error archive (D-1/D-8). */
  fromErrors: boolean;
};

/* ------------------------------------------------------------------ */
/*  Queue — error archive first (D-1/D-8), then common verbs           */
/* ------------------------------------------------------------------ */

export async function getDrillQueue(limit = 10): Promise<DrillItem[]> {
  const user = await requireUser();
  const verbErrors = await db
    .select({
      subcategory: errors.subcategory,
      original: errors.original,
      correction: errors.correction,
    })
    .from(errors)
    .where(
      and(
        eq(errors.userId, user.id),
        eq(errors.category, "Grammar"),
        inArray(errors.subcategory, Object.keys(ERROR_SUBCATEGORY_TENSES)),
      ),
    )
    .orderBy(desc(errors.createdAt))
    .limit(40);

  // Reverse map: every conjugated form of every common verb → its infinitive,
  // so the verb actually erred on can be recovered from the correction text.
  const formToVerb = getFormIndex();

  const queue: DrillItem[] = [];
  const used = new Set<string>();

  const push = (
    verb: string,
    tense: DrillTense,
    fromErrors: boolean,
  ): boolean => {
    if (queue.length >= limit) return false;
    const person = Math.floor(Math.random() * PERSON_LABELS.length);
    const key = `${verb}::${tense}::${person}`;
    if (used.has(key) || !isKnownVerb(verb)) return false;
    used.add(key);
    queue.push({
      verb,
      tense,
      person,
      personLabel: PERSON_LABELS[person],
      pronominal: parseInfinitive(verb).pronominal,
      fromErrors,
    });
    return true;
  };

  // 1) Error-driven items: recover the verb from the corrected text where
  //    possible, and always target the tense the subcategory points at.
  for (const err of verbErrors) {
    if (queue.length >= limit) break;
    const tenses = ERROR_SUBCATEGORY_TENSES[err.subcategory] ?? [];
    if (tenses.length === 0) continue;
    const tense = tenses[Math.floor(Math.random() * tenses.length)];
    const verb =
      findVerbInText(err.correction, formToVerb) ??
      findVerbInText(err.original, formToVerb) ??
      COMMON_VERBS[Math.floor(Math.random() * COMMON_VERBS.length)];
    push(verb, tense, true);
  }

  // 2) Fill with common verbs × random drill tenses.
  let guard = 0;
  while (queue.length < limit && guard < 200) {
    guard += 1;
    const verb = COMMON_VERBS[Math.floor(Math.random() * COMMON_VERBS.length)];
    const tense =
      DRILL_TENSES[Math.floor(Math.random() * DRILL_TENSES.length)];
    push(verb, tense, false);
  }

  return queue;
}

// The form index is derived purely from the static COMMON_VERBS set (~1000+
// conjugations), so build it once and reuse across requests.
let formIndexCache: Map<string, string> | null = null;
const getFormIndex = (): Map<string, string> =>
  (formIndexCache ??= buildFormIndex());

/** form ("suis allé", "mangeons", …) → infinitive, over the common-verb set. */
function buildFormIndex(): Map<string, string> {
  const index = new Map<string, string>();
  for (const verb of COMMON_VERBS) {
    index.set(normalizeForm(parseInfinitive(verb).verb), verb);
    for (const tense of DRILL_TENSES) {
      for (let person = 0; person < PERSON_LABELS.length; person++) {
        for (const form of acceptedForms(verb, tense, person)) {
          // Index the participle/last word too, so "est allée" matches inside text
          for (const token of form.split(" ")) {
            const cleaned = normalizeForm(token);
            if (cleaned.length >= 3 && !index.has(cleaned)) {
              index.set(cleaned, verb);
            }
          }
        }
      }
    }
  }
  return index;
}

function findVerbInText(
  text: string,
  formToVerb: Map<string, string>,
): string | null {
  for (const raw of text.split(/\s+/)) {
    const token = normalizeForm(raw);
    const verb = formToVerb.get(token);
    if (verb) return verb;
  }
  return null;
}

function normalizeForm(value: string): string {
  return value
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "'")
    .replace(/^[^\p{L}']+|[^\p{L}']+$/gu, "");
}

/* ------------------------------------------------------------------ */
/*  Grade + record (the answer key is the library — D-7)               */
/* ------------------------------------------------------------------ */

/** Accent-tolerant comparison key (DevPlan S10 §3). */
function gradeKey(value: string): string {
  return normalizeForm(value)
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

const RULE_HINTS: Record<DrillTense, string> = {
  "présent":
    "Watch the irregulars and stem changes (je me lève, nous mangeons).",
  "passé composé":
    "Auxiliary (avoir/être) + past participle. With être the participle agrees with the subject.",
  "imparfait":
    "Stem of the nous-form + -ais, -ais, -ait, -ions, -iez, -aient.",
  "futur simple":
    "Infinitive (or irregular stem: ser-, aur-, ir-, fer-) + -ai, -as, -a, -ons, -ez, -ont.",
  "subjonctif présent":
    "Stem of the ils-form + -e, -es, -e, -ions, -iez, -ent (irregular: sois, aie, aille, fasse).",
  "conditionnel présent":
    "Futur stem + imparfait endings: -ais, -ais, -ait, -ions, -iez, -aient.",
};

export type GradeResult = {
  correct: boolean;
  /** Canonical correct form (masculine agreement). */
  expected: string;
  /** All accepted spellings (feminine agreement variant when it differs). */
  accepted: string[];
  ruleHint: string;
};

export async function recordConjugationAttempt(input: {
  verb: string;
  tense: DrillTense;
  person: number;
  userInput: string;
  requestKey?: string;
}): Promise<GradeResult> {
  const user = await requireUser();
  if (input.requestKey !== undefined && (typeof input.requestKey !== "string" || !/^[a-zA-Z0-9-]{12,100}$/.test(input.requestKey))) {
    throw new Error("Invalid request key");
  }
  if (!Number.isInteger(input.person) || input.person < 0 || input.person > 5 ||
      typeof input.userInput !== "string" || !input.userInput.trim() || input.userInput.length > 200) {
    throw new Error("Invalid conjugation answer");
  }
  if (!DRILL_TENSES.includes(input.tense) || !isKnownVerb(input.verb)) {
    throw new Error(`Unknown drill target: ${input.verb} / ${input.tense}`);
  }
  const person = input.person;
  const userInput = input.userInput.normalize("NFC").trim();
  const requestHash = createHash("sha256").update(JSON.stringify({ verb: input.verb, tense: input.tense, person, userInput })).digest("hex");

  const accepted = acceptedForms(input.verb, input.tense, person);
  const expected = conjugate(input.verb, input.tense, person);
  const given = gradeKey(input.userInput);
  const correct = given !== "" && accepted.some((a) => gradeKey(a) === given);

  const saved = await db.transaction(async tx => {
    if (reviewDataEnabled()) await lockReviewOwner(tx,user.id);
  const [created] = await tx.insert(conjugationAttempts).values({
    id: randomUUID(),
    userId: user.id,
    verb: input.verb,
    tense: input.tense,
    person,
    userInput,
    expected,
    correct,
    requestKey: input.requestKey ?? null,
    requestHash,
  }).onConflictDoNothing({ target: [conjugationAttempts.userId, conjugationAttempts.requestKey] }).returning();
  let saved = created;
  if (!saved) {
    [saved] = await tx.select().from(conjugationAttempts).where(and(
      eq(conjugationAttempts.userId, user.id), eq(conjugationAttempts.requestKey, input.requestKey!),
    )).limit(1);
    if (!saved || saved.requestHash !== requestHash) throw new Error("Request key was reused with a different answer");
  }
    if (reviewDataEnabled()) await syncReviewTarget(tx,user.id,"conjugation",conjugationKey(input.verb,input.tense,input.person));
    return saved;
  });

  revalidatePath("/today");

  // Today must stay fresh. Next also re-renders the page the action was called
  // from, so /conjugation gets a new random queue prop mid-round; DrillCard keeps
  // its own deck and adopts the new queue only on "New round".
  return { correct: saved.correct, expected: saved.expected, accepted, ruleHint: RULE_HINTS[input.tense] };
}

/* ------------------------------------------------------------------ */
/*  Stats — surfaces drill mastery per verb/tense (D-8)                */
/* ------------------------------------------------------------------ */

export type ConjugationStats = {
  totalAttempts: number;
  totalCorrect: number;
  /** Per verb+tense accuracy, weakest first. */
  byTarget: {
    verb: string;
    tense: string;
    attempts: number;
    correct: number;
  }[];
};

export async function getConjugationStats(): Promise<ConjugationStats> {
  const user = await requireUser();
  // Aggregate in SQL so this doesn't get slower as attempt history grows.
  const rows = await db
    .select({
      verb: conjugationAttempts.verb,
      tense: conjugationAttempts.tense,
      attempts: count(),
      correct: sql<number>`count(*) filter (where ${conjugationAttempts.correct})`,
    })
    .from(conjugationAttempts)
    .where(eq(conjugationAttempts.userId, user.id))
    .groupBy(conjugationAttempts.verb, conjugationAttempts.tense);

  let totalAttempts = 0;
  let totalCorrect = 0;
  const byTarget = rows.map((row) => {
    const attempts = Number(row.attempts);
    const correct = Number(row.correct);
    totalAttempts += attempts;
    totalCorrect += correct;
    return { verb: row.verb, tense: row.tense, attempts, correct };
  });

  byTarget.sort((a, b) => a.correct / a.attempts - b.correct / b.attempts);

  return { totalAttempts, totalCorrect, byTarget };
}
