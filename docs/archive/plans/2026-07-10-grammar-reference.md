# Grammar Reference Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A2–B1 grammar reference library (~68 points): curated outline in git → content drafted by the user in an external AI tool (prompt: `docs/grammar-notes-prompt.md`), imported into DB as `draft` → user verifies point-by-point while reading (`/grammar` list + `/grammar/[slug]` detail with inline edit + "Mark as verified").

**Architecture:** Historical spec: `docs/archive/specs/2026-07-10-grammar-reference-design.md` (see its 2026-07-11 revision note). New `grammar_points` table (uuid PK + timestamptz convention); outline file `src/lib/grammar-outline.ts` is the single authoritative source of the point list; an import script (mirrors `seed-rules.ts`) parses the user's markdown notes and fills missing slugs — **no OpenAI API calls anywhere in this plan**; pages follow the existing "async server component → `lib/actions` server actions → Drizzle" flow, no API routes.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle + postgres.js, Tailwind v4 semantic tokens, lucide-react.

## Global Constraints

- **No test suite exists (per CLAUDE.md).** Each task's verify step = `npx tsc --noEmit` + `npx eslint src` + targeted manual check via dev server at the end. Do not introduce a test framework.
- **This Next.js version has breaking changes (per AGENTS.md).** Before writing page code, consult `node_modules/next/dist/docs/01-app/` if unsure. Known ground truth from this repo: dynamic route `params` is a **Promise** (`const { slug } = await params`), server actions use `"use server"` + `revalidatePath`.
- All DB queries **async** Drizzle (`await db.select()...`); never `.run()/.get()/.all()`.
- New table: `uuid` PK `defaultRandom()`, `timestamp(..., { withTimezone: true })`.
- Colours only via semantic tokens; UI copy in `(main)` routes is English; French example sentences render in `font-serif`.
- UI primitives from `src/components/ui/` (`Button`, `Chip`, `Card`, `Input`); `cva`/`cn` conventions.
- Commit messages: plain conventional commits, **no `Co-Authored-By` / "Generated with" trailers** (explicit user preference in CLAUDE.md — overrides any harness default).
- Deliberately deferred (do NOT build): practice drills (B), B2 content, review-queue backoffice, `rules` table changes, error-card → grammar backlinks.

---

### Task 1: Branch + `grammar_points` schema + migration

**Files:**
- Modify: `src/lib/db/schema.ts` (append after the speaking tables / `userSettings` block)
- Generated: `drizzle/` migration via `npm run db:generate`

**Interfaces:**
- Produces: `grammarPoints` table export + `export type GrammarPoint = typeof grammarPoints.$inferSelect;`

- [ ] **Step 1:** `git switch -c grammar-reference`
- [ ] **Step 2:** Append to `src/lib/db/schema.ts`:

```ts
/* ------------------------------------------------------------------ */
/*  grammar_points — A2–B1 grammar reference library                   */
/*  Outline (slug/name/level/category/mapping) lives in                */
/*  src/lib/grammar-outline.ts; AI drafts content as status='draft',   */
/*  the user verifies while reading.                                   */
/* ------------------------------------------------------------------ */

export const grammarPoints = pgTable(
  "grammar_points",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Stable key from the outline; used for URLs and idempotent generation. */
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    level: text("level").notNull(), // 'A2' | 'B1'
    category: text("category").notNull(), // pedagogical group, see GRAMMAR_CATEGORIES
    orderIndex: integer("order_index").notNull(),
    summary: text("summary").notNull(),
    /** Markdown-lite: paragraphs, **bold**, *italic*, `code`, "- " bullets only. */
    descriptionEn: text("description_en").notNull(),
    examples: jsonb("examples").$type<{ fr: string; en: string }[]>().notNull(),
    /** ERROR_TAXONOMY leaf keys this point maps to (may be empty). */
    taxonomySubcategories: jsonb("taxonomy_subcategories").$type<string[]>().notNull(),
    status: text("status").notNull().default("draft"), // 'draft' | 'verified'
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("grammar_points_category_order_idx").on(t.category, t.orderIndex)],
);

export type GrammarPoint = typeof grammarPoints.$inferSelect;
```

- [ ] **Step 3:** `npm run db:generate` → new migration appears; `npm run db:init` → applies cleanly (idempotent runner).
- [ ] **Step 4:** Verify: `npx tsc --noEmit` clean; `npm run db:studio` (or a one-off `tsx` query) shows the empty table.
- [ ] **Step 5:** Commit `feat(grammar): grammar_points table` .

### Task 2: Curated outline `src/lib/grammar-outline.ts`

The outline is the deliverable the **user reviews** — 68 points, 8 categories, CEFR A2/B1 inventory-based. Copy it verbatim; it is not a sketch.

**Files:**
- Create: `src/lib/grammar-outline.ts`

**Interfaces:**
- Produces: `GRAMMAR_CATEGORIES` (ordered readonly array), `type GrammarCategory`, `type GrammarOutlineEntry`, `GRAMMAR_OUTLINE: GrammarOutlineEntry[]`
- `taxonomySubcategories` values must be leaf keys of `ERROR_TAXONOMY` (`src/lib/taxonomy.ts`)

- [ ] **Step 1:** Create the file:

```ts
/**
 * Authoritative outline of the grammar reference library (A2–B1).
 * The AI drafts content for each entry (scripts/generate-grammar-points.ts);
 * it never decides WHAT to cover — only this file does.
 *
 * taxonomySubcategories map each point to ERROR_TAXONOMY leaf keys so the
 * detail page can surface "your errors on this point". Empty = no mapping.
 */
import type { ErrorSubcategory } from "@/lib/taxonomy";

export const GRAMMAR_CATEGORIES = [
  "Nouns & Articles",
  "Adjectives & Agreement",
  "Pronouns",
  "Verb Tenses",
  "Moods",
  "Negation & Questions",
  "Prepositions",
  "Sentence Structure & Discourse",
] as const;

export type GrammarCategory = (typeof GRAMMAR_CATEGORIES)[number];

export type GrammarOutlineEntry = {
  slug: string;
  name: string;
  level: "A2" | "B1";
  category: GrammarCategory;
  orderIndex: number;
  taxonomySubcategories: ErrorSubcategory[];
};

const e = (
  category: GrammarCategory,
  orderIndex: number,
  slug: string,
  name: string,
  level: "A2" | "B1",
  taxonomySubcategories: ErrorSubcategory[] = [],
): GrammarOutlineEntry => ({ slug, name, level, category, orderIndex, taxonomySubcategories });

export const GRAMMAR_OUTLINE: GrammarOutlineEntry[] = [
  // ─── Nouns & Articles ────────────────────────────────────────────
  e("Nouns & Articles", 1, "noun-gender-patterns", "Noun gender and typical endings", "A2", ["noun_gender"]),
  e("Nouns & Articles", 2, "plural-of-nouns", "Plural of nouns (-s, -x, -aux)", "A2"),
  e("Nouns & Articles", 3, "definite-and-indefinite-articles", "Definite vs indefinite articles (le/la/les vs un/une/des)", "A2", ["definite_vs_indefinite", "article_noun_mismatch"]),
  e("Nouns & Articles", 4, "partitive-articles", "Partitive articles (du, de la, des)", "A2", ["partitive"]),
  e("Nouns & Articles", 5, "contracted-articles", "Contracted articles (au, aux, du, des)", "A2", ["contraction"]),
  e("Nouns & Articles", 6, "articles-in-negation", "Articles in negation (un/une/des → de)", "A2", ["negation_de_rule"]),
  e("Nouns & Articles", 7, "article-omission", "When to omit the article (professions, quantities, fixed expressions)", "B1", ["article_omission"]),

  // ─── Adjectives & Agreement ──────────────────────────────────────
  e("Adjectives & Agreement", 1, "adjective-agreement", "Adjective gender and number agreement", "A2", ["adjective_agreement"]),
  e("Adjectives & Agreement", 2, "adjective-position", "Adjective position (before / after the noun)", "A2", ["adjective_position"]),
  e("Adjectives & Agreement", 3, "possessive-adjectives", "Possessive adjectives (mon/ma/mes, son/sa/ses)", "A2", ["article_noun_mismatch"]),
  e("Adjectives & Agreement", 4, "demonstrative-adjectives", "Demonstrative adjectives (ce, cet, cette, ces)", "A2", ["article_noun_mismatch"]),
  e("Adjectives & Agreement", 5, "comparative-and-superlative", "Comparative and superlative (plus/moins/aussi… que, le plus…)", "A2"),
  e("Adjectives & Agreement", 6, "indefinite-adjectives", "Indefinite adjectives (chaque, quelques, plusieurs, tout)", "B1", ["adjective_agreement"]),

  // ─── Pronouns ────────────────────────────────────────────────────
  e("Pronouns", 1, "subject-pronouns-and-on", "Subject pronouns and 'on'", "A2", ["subject_pronoun"]),
  e("Pronouns", 2, "direct-object-pronouns", "Direct object pronouns (me, te, le, la, nous, vous, les)", "A2", ["object_pronoun"]),
  e("Pronouns", 3, "indirect-object-pronouns", "Indirect object pronouns (me, te, lui, nous, vous, leur)", "A2", ["object_pronoun"]),
  e("Pronouns", 4, "pronoun-y", "The pronoun y", "A2", ["y_en"]),
  e("Pronouns", 5, "pronoun-en", "The pronoun en", "A2", ["y_en"]),
  e("Pronouns", 6, "stressed-pronouns", "Stressed pronouns (moi, toi, lui, elle…)", "A2", ["stressed_pronoun"]),
  e("Pronouns", 7, "double-pronoun-order", "Order of double object pronouns", "B1", ["object_pronoun"]),
  e("Pronouns", 8, "relative-pronouns-qui-que-ou", "Relative pronouns qui, que, où", "B1"),
  e("Pronouns", 9, "relative-pronoun-dont-lequel", "Relative pronouns dont and lequel", "B1"),
  e("Pronouns", 10, "demonstrative-pronouns", "Demonstrative pronouns (celui, celle, ceux; ceci/cela/ça)", "B1"),
  e("Pronouns", 11, "possessive-pronouns", "Possessive pronouns (le mien, la tienne…)", "B1"),
  e("Pronouns", 12, "indefinite-pronouns", "Indefinite pronouns (quelqu'un, personne, rien, chacun)", "B1", ["negation_structure"]),

  // ─── Verb Tenses ─────────────────────────────────────────────────
  e("Verb Tenses", 1, "present-tense-regular", "Present tense: regular -er / -ir / -re verbs", "A2", ["conjugation_present"]),
  e("Verb Tenses", 2, "present-tense-irregular", "Present tense: key irregular verbs (être, avoir, aller, faire, venir…)", "A2", ["conjugation_present"]),
  e("Verb Tenses", 3, "pronominal-verbs", "Pronominal (reflexive) verbs", "A2", ["conjugation_present", "auxiliary_choice"]),
  e("Verb Tenses", 4, "passe-compose-with-avoir", "Passé composé with avoir", "A2", ["conjugation_passe_compose", "auxiliary_choice"]),
  e("Verb Tenses", 5, "passe-compose-with-etre", "Passé composé with être", "A2", ["conjugation_passe_compose", "auxiliary_choice", "past_participle_agreement"]),
  e("Verb Tenses", 6, "imparfait", "The imparfait", "A2", ["pc_vs_imparfait"]),
  e("Verb Tenses", 7, "passe-compose-vs-imparfait", "Passé composé vs imparfait", "B1", ["pc_vs_imparfait", "tense_choice"]),
  e("Verb Tenses", 8, "plus-que-parfait", "The plus-que-parfait", "B1", ["tense_choice"]),
  e("Verb Tenses", 9, "futur-proche", "Futur proche (aller + infinitive)", "A2", ["tense_choice"]),
  e("Verb Tenses", 10, "futur-simple", "Futur simple", "A2", ["tense_choice", "futur_vs_conditionnel"]),
  e("Verb Tenses", 11, "venir-de-recent-past", "Recent past (venir de + infinitive)", "A2", ["tense_choice"]),
  e("Verb Tenses", 12, "etre-en-train-de", "Ongoing action (être en train de + infinitive)", "A2"),
  e("Verb Tenses", 13, "past-participle-agreement-avoir", "Past participle agreement with avoir (preceding direct object)", "B1", ["past_participle_agreement"]),
  e("Verb Tenses", 14, "depuis-pendant-il-y-a", "Time markers with tenses (depuis, pendant, il y a)", "B1", ["time_preposition", "tense_choice"]),

  // ─── Moods ───────────────────────────────────────────────────────
  e("Moods", 1, "imperative", "The imperative", "A2"),
  e("Moods", 2, "conditionnel-present", "Conditionnel présent (politeness, wishes, suggestions)", "A2", ["futur_vs_conditionnel"]),
  e("Moods", 3, "si-clauses", "Hypotheses with si (si + présent / si + imparfait)", "B1", ["futur_vs_conditionnel", "tense_choice"]),
  e("Moods", 4, "subjunctive-formation", "Subjunctive: formation", "B1", ["subjonctif_basic"]),
  e("Moods", 5, "subjunctive-triggers", "Subjunctive: common triggers (il faut que, vouloir que, avant que…)", "B1", ["subjonctif_basic"]),
  e("Moods", 6, "subjunctive-vs-indicative", "Subjunctive vs indicative (penser que vs ne pas penser que…)", "B1", ["subjonctif_basic"]),
  e("Moods", 7, "gerund-en-participe-present", "Gérondif (en + -ant) and the present participle", "B1"),
  e("Moods", 8, "infinitive-constructions", "Infinitive constructions (verb + infinitive, avant de, pour…)", "B1", ["verb_preposition"]),

  // ─── Negation & Questions ────────────────────────────────────────
  e("Negation & Questions", 1, "basic-negation", "Basic negation (ne… pas)", "A2", ["negation_structure"]),
  e("Negation & Questions", 2, "negation-variants", "Negation variants (ne… plus / jamais / rien / personne)", "A2", ["negation_structure"]),
  e("Negation & Questions", 3, "negation-compound-tenses", "Negation in compound tenses and with pronouns", "B1", ["negation_structure"]),
  e("Negation & Questions", 4, "restriction-ne-que", "Restriction with ne… que", "B1", ["negation_structure"]),
  e("Negation & Questions", 5, "yes-no-questions", "Yes/no questions (intonation, est-ce que)", "A2", ["question_formation"]),
  e("Negation & Questions", 6, "information-questions", "Information questions (où, quand, comment, pourquoi, quel, lequel)", "A2", ["question_formation"]),
  e("Negation & Questions", 7, "inversion-questions", "Questions with inversion", "B1", ["question_formation"]),

  // ─── Prepositions ────────────────────────────────────────────────
  e("Prepositions", 1, "prepositions-of-place", "Prepositions of place (dans, sur, sous, devant, chez…)", "A2", ["place_preposition"]),
  e("Prepositions", 2, "prepositions-with-places", "Prepositions with cities and countries (à, en, au, aux)", "A2", ["place_preposition"]),
  e("Prepositions", 3, "prepositions-of-time", "Prepositions of time (à, en, dans, depuis, pendant, pour)", "A2", ["time_preposition"]),
  e("Prepositions", 4, "verbs-with-preposition-a", "Verbs followed by à (penser à, réussir à…)", "B1", ["verb_preposition"]),
  e("Prepositions", 5, "verbs-with-preposition-de", "Verbs followed by de (avoir besoin de, essayer de…)", "B1", ["verb_preposition"]),
  e("Prepositions", 6, "a-vs-de-before-infinitive", "à vs de before an infinitive", "B1", ["verb_preposition"]),

  // ─── Sentence Structure & Discourse ──────────────────────────────
  e("Sentence Structure & Discourse", 1, "word-order-basics", "Basic word order (SVO, pronoun placement)", "A2", ["word_order"]),
  e("Sentence Structure & Discourse", 2, "adverbs-formation-placement", "Adverbs: formation (-ment) and placement", "A2", ["word_order"]),
  e("Sentence Structure & Discourse", 3, "impersonal-expressions", "Impersonal expressions (il faut, il y a, il fait…)", "A2"),
  e("Sentence Structure & Discourse", 4, "connectors-time-sequence", "Time and sequence connectors (d'abord, ensuite, puis, enfin…)", "B1"),
  e("Sentence Structure & Discourse", 5, "connectors-cause-consequence", "Cause and consequence connectors (parce que, comme, donc, alors…)", "B1"),
  e("Sentence Structure & Discourse", 6, "indirect-speech", "Indirect speech (dire que, demander si…)", "B1", ["tense_choice"]),
  e("Sentence Structure & Discourse", 7, "emphasis-cest-qui-que", "Emphasis with c'est… qui / c'est… que", "B1", ["awkward_structure"]),
  e("Sentence Structure & Discourse", 8, "passive-voice-intro", "The passive voice (introduction)", "B1"),
];
```

- [ ] **Step 2:** Guard against typos — slugs unique, orderIndex contiguous per category. One-off check:

Run: `npx tsx -e "import('./src/lib/grammar-outline').then(m=>{const s=new Set(m.GRAMMAR_OUTLINE.map(x=>x.slug));console.log(m.GRAMMAR_OUTLINE.length,'entries,',s.size,'unique slugs')})"`
Expected: `68 entries, 68 unique slugs` (taxonomy keys are already compile-checked via the `ErrorSubcategory` type).

- [ ] **Step 3:** `npx tsc --noEmit` clean (this is what validates every taxonomy key).
- [ ] **Step 4:** Commit `feat(grammar): curated A2–B1 outline (68 points, taxonomy-mapped)`.

### Task 2b: `common_mistakes` column (2026-07-11 format revision)

> Added after Tasks 1–2 were committed: the note format gains a structured **Common mistakes** block (✗ wrong → ✓ right + reason), rendered with the same visual language as error cards. See the spec's “note structure” decision row.

**Files:**
- Modify: `src/lib/db/schema.ts` — add to `grammarPoints` after `examples`:

```ts
    /** ✗→✓ learner-error pairs; rendered like error cards. */
    commonMistakes: jsonb("common_mistakes")
      .$type<{ wrong: string; right: string; note: string }[]>()
      .notNull()
      .default([]),
```

- Generated: `drizzle/` migration via `npm run db:generate`

- [ ] **Step 1:** Add the column, `npm run db:generate`, `npm run db:init`.
- [ ] **Step 2:** `npx tsc --noEmit` clean.
- [ ] **Step 3:** Commit `feat(grammar): common_mistakes column`.

### Task 3: Notes import pipeline (external AI content — no OpenAI spend)

> **2026-07-11 revision:** the OpenAI drafting module is dropped at the user's request (do NOT call the user's OpenAI API for content generation). Instead the user generates notes with an external AI chatbot using `docs/grammar-notes-prompt.md`, saves them as markdown (Obsidian files or Notion pages), and this task's importer parses them into the DB.

**Files:**
- Create: `src/lib/grammar-notes-parser.ts` (pure parser, no DB, no I/O)
- Create: `scripts/import-grammar-points.ts`
- Modify: `package.json` — add script `"grammar:import": "tsx scripts/import-grammar-points.ts"`

**Interfaces:**
- Consumes: `GRAMMAR_OUTLINE` (Task 2); `grammarPoints` (Task 1)
- Produces: `parseGrammarNotes(markdown: string): { notes: ParsedNote[]; problems: string[] }` with `ParsedNote = { slug: string; summary: string; descriptionEn: string; commonMistakes: { wrong: string; right: string; note: string }[]; examples: { fr: string; en: string }[] }`

**Note format** (single source of truth: `docs/grammar-notes-prompt.md` — parser and prompt must stay in sync):

```markdown
## <slug>

**Level:** A2

**Summary:** <one sentence>

**Explanation:**

<markdown-lite: paragraphs, **bold**, *italic*, "- " bullets>

**Common mistakes:**

- ✗ <wrong French sentence>
  ✓ <corrected French sentence>
  (<one short reason>)

**Examples:**

1. <French sentence>
   → <English translation>
2. …
```

**Parser rules** (`src/lib/grammar-notes-parser.ts`):
- Split the document on lines matching `/^## /`; heading text (trimmed) = slug. Ignore any prose before the first `## `.
- Within a section: `**Summary:**` → remainder of that line (or the following paragraph if the line is empty); text between `**Explanation:**` and `**Common mistakes:**` (fall back to `**Examples:**` if the mistakes block is missing) → `descriptionEn` (trimmed); under `**Common mistakes:**`, each bullet starting `- ✗ ` opens an item (`wrong` = rest of line), a following line starting `✓ ` is its `right`, a following line wrapped in `(` `)` is its `note` (missing note → `""`); under `**Examples:**`, each numbered item `N.` starts an example (French), a following line starting `→` is its English translation.
- Per-note validation → push a message into `problems` and EXCLUDE the note when: summary empty, `descriptionEn` < 50 chars, fewer than 2 complete (wrong+right) common mistakes, fewer than 3 complete (fr+en) examples.
- Slug not found in `GRAMMAR_OUTLINE` → `problems` + exclude. A `**Level:**` disagreeing with the outline is a warning in `problems` but does NOT exclude (outline stays authoritative).

**Import script** (`scripts/import-grammar-points.ts`, env/client setup mirrors `seed-rules.ts`):
- Args: one or more file or directory paths (directories: read every `*.md` inside, non-recursive): `npm run grammar:import -- data/grammar-notes/`
- Idempotent: skip slugs already in DB.
- Insert with `status: 'draft'` and `name/level/category/orderIndex/taxonomySubcategories` taken from `GRAMMAR_OUTLINE` (never from the note).
- Print summary: `inserted N, skipped-existing N, invalid N, unknown-slug N` + each `problems` line.

- [ ] **Step 1:** Write `src/lib/grammar-notes-parser.ts` implementing the rules above.
- [ ] **Step 2:** Write `scripts/import-grammar-points.ts` + the npm script.
- [ ] **Step 3:** Hand-write a sample notes file in the scratchpad covering 2 real slugs (e.g. `pronoun-y`, `basic-negation`, each with a complete Common mistakes block) + 1 fake slug + 1 note with only 2 examples + 1 note with only 1 common mistake; run `npm run grammar:import -- <sample>` → expect `inserted 2, invalid 2, unknown-slug 1`; re-run → `skipped-existing 2`.
- [ ] **Step 4:** Delete the 2 test rows: one-off `tsx` script or SQL `delete from grammar_points where slug in ('pronoun-y','basic-negation')`. Verify count back to 0.
- [ ] **Step 5:** `npx tsc --noEmit` + `npx eslint src scripts/import-grammar-points.ts` clean.
- [ ] **Step 6:** Commit `feat(grammar): notes parser + idempotent import pipeline (grammar:import)`.

### Task 4: Server actions `src/lib/actions/grammar.ts`

**Files:**
- Create: `src/lib/actions/grammar.ts`

**Interfaces:**
- Consumes: `grammarPoints`, `GrammarPoint`, `errors` from schema; `GRAMMAR_CATEGORIES`
- Produces (used by Tasks 6–7):
  - `listGrammarPoints(): Promise<{ points: GrammarPoint[]; verified: number; total: number }>`
  - `getGrammarPointBySlug(slug: string): Promise<GrammarPoint | null>`
  - `getErrorsForSubcategories(subs: string[]): Promise<{ total: number; recent: RecentGrammarError[] }>` with `RecentGrammarError = { id: string; original: string; correction: string; explanationEn: string; createdAt: Date }`
  - `updateGrammarPoint(id: string, data: { summary: string; descriptionEn: string; commonMistakes: { wrong: string; right: string; note: string }[]; examples: { fr: string; en: string }[] }): Promise<void>`
  - `verifyGrammarPoint(id: string): Promise<void>`

- [ ] **Step 1:** Create the file:

```ts
"use server";

import { asc, count, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { errors, grammarPoints, type GrammarPoint } from "@/lib/db/schema";

export async function listGrammarPoints(): Promise<{
  points: GrammarPoint[];
  verified: number;
  total: number;
}> {
  const points = await db
    .select()
    .from(grammarPoints)
    .orderBy(asc(grammarPoints.category), asc(grammarPoints.orderIndex));
  const verified = points.filter((p) => p.status === "verified").length;
  return { points, verified, total: points.length };
}

export async function getGrammarPointBySlug(slug: string): Promise<GrammarPoint | null> {
  const row = await db
    .select()
    .from(grammarPoints)
    .where(eq(grammarPoints.slug, slug))
    .limit(1)
    .then((r) => r[0] ?? null);
  return row;
}

export type RecentGrammarError = {
  id: string;
  original: string;
  correction: string;
  explanationEn: string;
  createdAt: Date;
};

export async function getErrorsForSubcategories(
  subs: string[],
): Promise<{ total: number; recent: RecentGrammarError[] }> {
  if (subs.length === 0) return { total: 0, recent: [] };

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(errors)
    .where(inArray(errors.subcategory, subs));

  const recent = await db
    .select({
      id: errors.id,
      original: errors.original,
      correction: errors.correction,
      explanationEn: errors.explanationEn,
      createdAt: errors.createdAt,
    })
    .from(errors)
    .where(inArray(errors.subcategory, subs))
    .orderBy(desc(errors.createdAt))
    .limit(5);

  return { total, recent };
}

export async function updateGrammarPoint(
  id: string,
  data: {
    summary: string;
    descriptionEn: string;
    commonMistakes: { wrong: string; right: string; note: string }[];
    examples: { fr: string; en: string }[];
  },
): Promise<void> {
  const [row] = await db
    .update(grammarPoints)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(grammarPoints.id, id))
    .returning({ slug: grammarPoints.slug });
  if (row) {
    revalidatePath("/grammar");
    revalidatePath(`/grammar/${row.slug}`);
  }
}

export async function verifyGrammarPoint(id: string): Promise<void> {
  const [row] = await db
    .update(grammarPoints)
    .set({ status: "verified", verifiedAt: new Date(), updatedAt: new Date() })
    .where(eq(grammarPoints.id, id))
    .returning({ slug: grammarPoints.slug });
  if (row) {
    revalidatePath("/grammar");
    revalidatePath(`/grammar/${row.slug}`);
  }
}
```

- [ ] **Step 2:** `npx tsc --noEmit` + `npx eslint src/lib/actions/grammar.ts` clean.
- [ ] **Step 3:** Commit `feat(grammar): server actions (list, get, errors-for-point, update, verify)`.

### Task 5: `MarkdownLite` renderer

No markdown dependency exists in this project and we don't add one — the AI prompt (Task 3) restricts output to paragraphs / bold / italic / "- " bullets, so a ~60-line renderer covers it deterministically.

**Files:**
- Create: `src/components/markdown-lite.tsx`

**Interfaces:**
- Produces: `<MarkdownLite text={string} />` — pure component, safe in server AND client components (no hooks, no dangerouslySetInnerHTML).

- [ ] **Step 1:** Create the file:

```tsx
import React from "react";

/**
 * Renders the markdown-lite dialect used by grammar_points.description_en:
 * paragraphs (blank-line separated), "- " bullet lists, **bold**, *italic*.
 * Everything else renders as literal text — by design (no HTML injection).
 */

function renderInline(text: string): React.ReactNode[] {
  // Split on **bold** first, then *italic* inside the remainder.
  const nodes: React.ReactNode[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  parts.forEach((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      nodes.push(<strong key={i}>{part.slice(2, -2)}</strong>);
    } else if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      nodes.push(<em key={i}>{part.slice(1, -1)}</em>);
    } else if (part) {
      nodes.push(part);
    }
  });
  return nodes;
}

export function MarkdownLite({ text }: { text: string }) {
  const blocks = text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        const lines = block.split("\n").map((l) => l.trim());
        const isList = lines.every((l) => l.startsWith("- "));
        if (isList) {
          return (
            <ul key={i} className="list-disc pl-5 space-y-1">
              {lines.map((l, j) => (
                <li key={j}>{renderInline(l.slice(2))}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{renderInline(lines.join(" "))}</p>;
      })}
    </div>
  );
}
```

- [ ] **Step 2:** `npx tsc --noEmit` + `npx eslint src/components/markdown-lite.tsx` clean.
- [ ] **Step 3:** Commit `feat(grammar): MarkdownLite renderer for the constrained draft dialect`.

### Task 6: `/grammar` list page + sidebar entry

**Files:**
- Create: `src/app/(main)/grammar/page.tsx`
- Create: `src/app/(main)/grammar/_components/grammar-browser.tsx`
- Modify: `src/components/sidebar.tsx` — insert nav item after Vocabulary

**Interfaces:**
- Consumes: `listGrammarPoints` (Task 4), `GRAMMAR_CATEGORIES` (Task 2), `Chip`, `Input`

- [ ] **Step 1:** `page.tsx` (follows the Vocabulary page pattern):

```tsx
import { listGrammarPoints } from "@/lib/actions/grammar";
import { GrammarBrowser } from "./_components/grammar-browser";

export const dynamic = "force-dynamic";

export default async function GrammarPage() {
  const { points, verified, total } = await listGrammarPoints();
  return (
    <div className="px-8 py-8 max-w-5xl mx-auto">
      <h1 className="font-serif text-3xl font-semibold tracking-tight mb-1">Grammar</h1>
      <p className="text-sm text-muted-foreground mb-6">
        A2–B1 reference library. Drafted by AI — verify each point as you study it.
        {total > 0 && ` ${verified}/${total} verified.`}
      </p>
      <GrammarBrowser points={points} />
    </div>
  );
}
```

- [ ] **Step 2:** `_components/grammar-browser.tsx` (client — search + category grouping):

```tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { GrammarPoint } from "@/lib/db/schema";
import { GRAMMAR_CATEGORIES } from "@/lib/grammar-outline";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";

export function GrammarBrowser({ points }: { points: GrammarPoint[] }) {
  const [query, setQuery] = useState("");

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? points.filter((p) => `${p.name} ${p.summary}`.toLowerCase().includes(q))
      : points;
    return GRAMMAR_CATEGORIES.map((cat) => ({
      category: cat,
      items: filtered.filter((p) => p.category === cat),
    })).filter((g) => g.items.length > 0);
  }, [points, query]);

  return (
    <div className="space-y-8">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search grammar points…"
        className="max-w-sm"
      />
      {grouped.map(({ category, items }) => (
        <section key={category}>
          <h2 className="font-serif text-lg font-semibold mb-3">{category}</h2>
          <ul className="divide-y divide-border/60 rounded-2xl border border-border/70 bg-surface">
            {items.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/grammar/${p.slug}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-surface-muted transition-colors"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate">{p.name}</span>
                    <span className="block text-xs text-muted-foreground truncate">{p.summary}</span>
                  </span>
                  <Chip variant={p.level === "A2" ? "success" : "accent"}>{p.level}</Chip>
                  {p.status === "draft" && <Chip variant="warning">Draft</Chip>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {grouped.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {points.length === 0
            ? "No grammar points yet — import your notes with `npm run grammar:import`."
            : "No points match your search."}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3:** Sidebar: in `src/components/sidebar.tsx`, add `SpellCheck` to the lucide import and insert after the Vocabulary item:

```ts
  {
    href: "/grammar",
    label: "Grammar",
    icon: SpellCheck,
    matcher: (p) => p.startsWith("/grammar"),
  },
```

- [ ] **Step 4:** Verify: `npx tsc --noEmit` + `npx eslint src` clean; dev server → `/grammar` renders groups from the trial rows (Task 3), search filters, Draft chips show, sidebar highlights.
- [ ] **Step 5:** Commit `feat(grammar): /grammar list page + sidebar entry`.

### Task 7: `/grammar/[slug]` detail page (read, edit, verify, linked errors)

**Files:**
- Create: `src/app/(main)/grammar/[slug]/page.tsx`
- Create: `src/app/(main)/grammar/[slug]/_components/point-editor.tsx`

**Interfaces:**
- Consumes: `getGrammarPointBySlug`, `getErrorsForSubcategories`, `updateGrammarPoint`, `verifyGrammarPoint` (Task 4); `MarkdownLite` (Task 5); `Button`, `Chip`, `Card`, `Input`

- [ ] **Step 1:** `page.tsx` — server component; `params` is a Promise (Next 16); linked-errors block server-rendered below the editor:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getErrorsForSubcategories, getGrammarPointBySlug } from "@/lib/actions/grammar";
import { PointEditor } from "./_components/point-editor";

export const dynamic = "force-dynamic";

export default async function GrammarPointPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const point = await getGrammarPointBySlug(slug);
  if (!point) notFound();

  const linked = await getErrorsForSubcategories(point.taxonomySubcategories);

  return (
    <div className="px-8 py-8 max-w-3xl mx-auto space-y-8">
      <div>
        <Link href="/grammar" className="text-xs text-muted-foreground hover:text-foreground">
          ← Grammar
        </Link>
      </div>

      <PointEditor point={point} />

      {point.taxonomySubcategories.length > 0 && (
        <section>
          <h2 className="font-serif text-lg font-semibold mb-3">Your errors on this point</h2>
          {linked.total === 0 ? (
            <p className="text-sm text-muted-foreground">
              No errors recorded on this point yet. Keep it up!
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {linked.total} error{linked.total === 1 ? "" : "s"} recorded — most recent:
              </p>
              <ul className="space-y-2">
                {linked.recent.map((err) => (
                  <li key={err.id} className="rounded-xl border border-border/70 bg-surface px-4 py-3 text-sm">
                    <span className="font-serif line-through text-danger">{err.original}</span>
                    {" → "}
                    <span className="font-serif text-success">{err.correction}</span>
                    <p className="mt-1 text-xs text-muted-foreground">{err.explanationEn}</p>
                  </li>
                ))}
              </ul>
              <Link href="/progress" className="text-xs text-accent hover:underline">
                View all in Progress →
              </Link>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2:** `_components/point-editor.tsx` (client — view/edit toggle + verify):

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GrammarPoint } from "@/lib/db/schema";
import { updateGrammarPoint, verifyGrammarPoint } from "@/lib/actions/grammar";
import { MarkdownLite } from "@/components/markdown-lite";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input, Textarea } from "@/components/ui/input";

type Example = { fr: string; en: string };
type Mistake = { wrong: string; right: string; note: string };

export function PointEditor({ point }: { point: GrammarPoint }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState(point.summary);
  const [description, setDescription] = useState(point.descriptionEn);
  const [mistakes, setMistakes] = useState<Mistake[]>(point.commonMistakes);
  const [examples, setExamples] = useState<Example[]>(point.examples);

  const startEdit = () => {
    setSummary(point.summary);
    setDescription(point.descriptionEn);
    setMistakes(point.commonMistakes);
    setExamples(point.examples);
    setEditing(true);
  };

  const save = () =>
    startTransition(async () => {
      await updateGrammarPoint(point.id, {
        summary,
        descriptionEn: description,
        commonMistakes: mistakes.filter((m) => m.wrong.trim() && m.right.trim()),
        examples: examples.filter((ex) => ex.fr.trim()),
      });
      setEditing(false);
      router.refresh();
    });

  const verify = () =>
    startTransition(async () => {
      await verifyGrammarPoint(point.id);
      router.refresh();
    });

  const setExample = (i: number, patch: Partial<Example>) =>
    setExamples((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const setMistake = (i: number, patch: Partial<Mistake>) =>
    setMistakes((ms) => ms.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Chip variant={point.level === "A2" ? "success" : "accent"}>{point.level}</Chip>
          {point.status === "verified" ? (
            <Chip variant="success">Verified</Chip>
          ) : (
            <Chip variant="warning">AI draft — not yet verified</Chip>
          )}
        </div>
        <h1 className="font-serif text-3xl font-semibold tracking-tight">{point.name}</h1>
        {!editing && <p className="text-sm text-muted-foreground">{point.summary}</p>}
      </header>

      {!editing ? (
        <>
          <div className="text-[15px] leading-relaxed">
            <MarkdownLite text={point.descriptionEn} />
          </div>
          {point.commonMistakes.length > 0 && (
            <section>
              <h2 className="font-serif text-lg font-semibold mb-3">Common mistakes</h2>
              <ul className="space-y-2">
                {point.commonMistakes.map((m, i) => (
                  <li key={i} className="rounded-xl border border-border/70 bg-surface px-4 py-3 text-sm">
                    <span className="font-serif line-through text-danger">{m.wrong}</span>
                    {" → "}
                    <span className="font-serif text-success">{m.right}</span>
                    {m.note && <p className="mt-1 text-xs text-muted-foreground">{m.note}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section>
            <h2 className="font-serif text-lg font-semibold mb-3">Examples</h2>
            <ul className="space-y-2">
              {point.examples.map((ex, i) => (
                <li key={i} className="rounded-xl border border-border/70 bg-surface px-4 py-3">
                  <p className="font-serif text-[15px]">{ex.fr}</p>
                  <p className="text-sm text-muted-foreground">{ex.en}</p>
                </li>
              ))}
            </ul>
          </section>
          <div className="flex gap-2">
            <Button variant="outline" onClick={startEdit} disabled={isPending}>
              Edit
            </Button>
            {point.status !== "verified" && (
              <Button onClick={verify} disabled={isPending}>
                Mark as verified
              </Button>
            )}
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Summary</span>
            <Input value={summary} onChange={(e) => setSummary(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Description (paragraphs, **bold**, *italic*, &quot;- &quot; bullets)
            </span>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={14}
              className="font-mono text-sm leading-relaxed"
            />
          </label>
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">Common mistakes</span>
            {mistakes.map((m, i) => (
              <div key={i} className="flex gap-2 items-start">
                <div className="flex-1 space-y-1">
                  <Input
                    value={m.wrong}
                    onChange={(e) => setMistake(i, { wrong: e.target.value })}
                    placeholder="✗ wrong French"
                    className="font-serif"
                  />
                  <Input
                    value={m.right}
                    onChange={(e) => setMistake(i, { right: e.target.value })}
                    placeholder="✓ corrected French"
                    className="font-serif"
                  />
                  <Input
                    value={m.note}
                    onChange={(e) => setMistake(i, { note: e.target.value })}
                    placeholder="Why (short reason)"
                  />
                </div>
                <Button
                  variant="ghost"
                  onClick={() => setMistakes((ms) => ms.filter((_, j) => j !== i))}
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              onClick={() => setMistakes((ms) => [...ms, { wrong: "", right: "", note: "" }])}
            >
              Add mistake
            </Button>
          </div>
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">Examples</span>
            {examples.map((ex, i) => (
              <div key={i} className="flex gap-2 items-start">
                <div className="flex-1 space-y-1">
                  <Input
                    value={ex.fr}
                    onChange={(e) => setExample(i, { fr: e.target.value })}
                    placeholder="French sentence"
                    className="font-serif"
                  />
                  <Input
                    value={ex.en}
                    onChange={(e) => setExample(i, { en: e.target.value })}
                    placeholder="English translation"
                  />
                </div>
                <Button
                  variant="ghost"
                  onClick={() => setExamples((xs) => xs.filter((_, j) => j !== i))}
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              onClick={() => setExamples((xs) => [...xs, { fr: "", en: "" }])}
            >
              Add example
            </Button>
          </div>
          <div className="flex gap-2">
            <Button onClick={save} disabled={isPending}>
              {isPending ? "Saving…" : "Save"}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)} disabled={isPending}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

(Verified against `src/components/ui/button.tsx`: `outline` and `ghost` variants exist; `Textarea` is exported from `src/components/ui/input.tsx`.)

- [ ] **Step 3:** Verify: `npx tsc --noEmit` + `npx eslint src` clean. Dev server walk-through on a trial row: open detail → body + Common mistakes (✗ struck-through / ✓ success-coloured) + examples render; Edit → change a word → Save → view mode shows the change; Mark as verified → chip flips, list page Draft chip gone; a point whose `taxonomySubcategories` overlap existing errors shows the errors block (pick `passe-compose-vs-imparfait` — `pc_vs_imparfait` almost certainly has rows); a point with no mapping (e.g. `plural-of-nouns`) hides the block; unknown slug → 404.
- [ ] **Step 4:** Commit `feat(grammar): detail page with inline edit, verify, linked errors`.

### Task 8: Full notes import + end-to-end pass + docs

> **Gated on the user:** runs only after the user has generated notes for all 68 points with `docs/grammar-notes-prompt.md` and handed them over (markdown files, an Obsidian folder, or Notion pages to fetch). Tasks 4–7 can ship before this.

**Files:**
- Modify: `CLAUDE.md` — Commands block: add `npm run grammar:import  # Import grammar-reference notes (markdown) for missing outline entries`; Database section: table count 23→24, add `grammar_points` to the group list (its own bullet: "Grammar reference: `grammar_points` (outline in `src/lib/grammar-outline.ts`)"); update the "Current status" sentence to mention the grammar reference module.

- [ ] **Step 1:** Collect the user's notes into `data/grammar-notes/` (already gitignored; copy `.md` files there, or export Notion pages to markdown first). Run `npm run grammar:import -- data/grammar-notes/` until all 68 are in. Report every `invalid` / `unknown-slug` problem to the user for a fix-and-rerun round (the script is idempotent).
- [ ] **Step 2:** Sanity queries: total rows = 68; no empty descriptions:

Run: `npx tsx -e "import('dotenv').then(d=>{d.config({path:'.env.local'});d.config();import('postgres').then(async({default:pg})=>{const s=pg(process.env.DATABASE_URL);const r=await s\`select count(*)::int as n, count(*) filter (where length(description_en)<50)::int as thin from grammar_points\`;console.log(r[0]);await s.end()})})"`
Expected: `{ n: 68, thin: 0 }`

- [ ] **Step 3:** Browser pass: `/grammar` shows 8 groups / 68 points / "0/68 verified" (or trial-verified count); read 2–3 points end-to-end (markdown blocks, bold, bullets, examples); verify one → progress counter increments.
- [ ] **Step 4:** Update `CLAUDE.md` per above.
- [ ] **Step 5:** Final gates: `npx tsc --noEmit`, `npx eslint src`, `npm run build` — all clean.
- [ ] **Step 6:** Commit `feat(grammar): full library import + docs`. Merge decision via superpowers:finishing-a-development-branch.

---

## Self-review notes

- **Spec coverage:** §3.1 table → Task 1; §3.2 outline → Task 2; §4 pipeline (idempotent, `--limit`, model env var) → Task 3; §5.1 list (grouping, chips, progress, search) → Task 6; §5.2 detail (markdown body, serif examples, errors block, edit, verify) → Tasks 5+7; §5.3 actions → Task 4; §6 boundaries respected (no `rules` change, no API route); §7 verification path → Tasks 3/7/8 verify steps; §8 exclusions in Global Constraints.
- **Spec deviation (deliberate):** outline lands at 68 points (the spec said “approximately 60–80”) and Markdown is the constrained markdown-lite dialect rendered by a purpose-built component (the spec said “Markdown” — full Markdown would need a new dependency; the AI prompt enforces the dialect, and the editor labels it).
- **Type consistency:** `examples`/`taxonomySubcategories` are `notNull` jsonb in schema and typed non-optional in `GrammarPoint`; script always inserts both; actions/components consume them without null-guards — consistent. `RecentGrammarError.createdAt` is `Date` (naive timestamp column on the legacy `errors` table — fine).
