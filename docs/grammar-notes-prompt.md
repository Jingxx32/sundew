# Grammar Notes Generation Prompt (for External AI Tools)

> **Status: not implemented (verified 2026-08-25).** Neither `scripts/import-grammar-points.ts` nor
> `npm run grammar:import` exists, so the database-import step described below has no supporting code yet.
> This prompt can still generate notes, but the importer must be written before saved notes can be loaded into the database.

> Usage: there are eight batches. For each batch, copy the complete **MASTER PROMPT** below into an AI tool (ChatGPT, Gemini, DeepSeek, Claude web, etc.), append that batch's grammar-point list, and send both together.
>
> - Save the AI output **verbatim**: one `.md` file per batch in Obsidian, or one page per batch in Notion. **Do not change the format**: the importer parses markers such as the `## slug` heading and `**Summary:**`.
> - If output is truncated, reply “continue”, join the two parts, and save them together.
> - Use a capable model if possible. These notes will become your grammar textbook, so quality is worthwhile.
> - After saving all eight batches, tell Claude where the files are (an Obsidian folder path or Notion page). `npm run grammar:import` will parse them into the database. Format details and parser rules are maintained together in this file and implementation-plan Task 3.

---

## MASTER PROMPT (start every batch with this text)

```text
You are an experienced teacher of French as a foreign language (FLE) writing a grammar reference for an English-speaking learner at CEFR A2–B1 level.

For EACH grammar point listed at the end of this message, output one section in EXACTLY the following format. Your output will be parsed by a script, so: no introduction, no closing remarks, nothing outside the sections, and do not change the slugs.

## <slug exactly as given in the list>

**Level:** <the level given for this point>

**Summary:** <one plain sentence, max 25 words, no formatting>

**Explanation:**

<150–350 words. Structure: what the rule is → how to form / use it → common pitfalls for English speakers. Formatting is STRICTLY limited to: plain paragraphs separated by blank lines, **bold** for French forms and key terms, *italic* for emphasis, and bullet lines starting with "- ". NO headings, NO tables, NO numbered lists, NO links, NO code.>

**Common mistakes:**

- ✗ <an incorrect French sentence an English speaker typically produces>
  ✓ <the corrected French sentence>
  (<one short reason, max 15 words>)
- ✗ …
  ✓ …
  (…)

(2 to 4 items. Each item is exactly three lines: the "✗" line, the "✓" line, the parenthesised reason. The ✗ sentence must be a realistic learner error — a literal translation from English, a wrong agreement, a wrong word order — never random nonsense. Use exactly the characters "✗" and "✓".)

**Examples:**

1. <French sentence>
   → <natural English translation>
2. <French sentence>
   → <natural English translation>

(4 to 8 examples per point. Cover the main uses AND at least one contrast or negative/edge case. Keep vocabulary at A2–B1. Every French sentence gets its own "→" translation line.)

Accuracy matters more than completeness: state the rules standard references agree on; where usage is genuinely contested, say "usually" rather than inventing a hard rule.

Grammar points for this batch:
```

---

## Batch 1 — Nouns & Articles (7 points)

```text
- slug: noun-gender-patterns | name: Noun gender and typical endings | level: A2
- slug: plural-of-nouns | name: Plural of nouns (-s, -x, -aux) | level: A2
- slug: definite-and-indefinite-articles | name: Definite vs indefinite articles (le/la/les vs un/une/des) | level: A2
- slug: partitive-articles | name: Partitive articles (du, de la, des) | level: A2
- slug: contracted-articles | name: Contracted articles (au, aux, du, des) | level: A2
- slug: articles-in-negation | name: Articles in negation (un/une/des → de) | level: A2
- slug: article-omission | name: When to omit the article (professions, quantities, fixed expressions) | level: B1
```

## Batch 2 — Adjectives & Agreement (6 points)

```text
- slug: adjective-agreement | name: Adjective gender and number agreement | level: A2
- slug: adjective-position | name: Adjective position (before / after the noun) | level: A2
- slug: possessive-adjectives | name: Possessive adjectives (mon/ma/mes, son/sa/ses) | level: A2
- slug: demonstrative-adjectives | name: Demonstrative adjectives (ce, cet, cette, ces) | level: A2
- slug: comparative-and-superlative | name: Comparative and superlative (plus/moins/aussi… que, le plus…) | level: A2
- slug: indefinite-adjectives | name: Indefinite adjectives (chaque, quelques, plusieurs, tout) | level: B1
```

## Batch 3 — Pronouns (12 points; long output, may be sent in two parts)

```text
- slug: subject-pronouns-and-on | name: Subject pronouns and 'on' | level: A2
- slug: direct-object-pronouns | name: Direct object pronouns (me, te, le, la, nous, vous, les) | level: A2
- slug: indirect-object-pronouns | name: Indirect object pronouns (me, te, lui, nous, vous, leur) | level: A2
- slug: pronoun-y | name: The pronoun y | level: A2
- slug: pronoun-en | name: The pronoun en | level: A2
- slug: stressed-pronouns | name: Stressed pronouns (moi, toi, lui, elle…) | level: A2
- slug: double-pronoun-order | name: Order of double object pronouns | level: B1
- slug: relative-pronouns-qui-que-ou | name: Relative pronouns qui, que, où | level: B1
- slug: relative-pronoun-dont-lequel | name: Relative pronouns dont and lequel | level: B1
- slug: demonstrative-pronouns | name: Demonstrative pronouns (celui, celle, ceux; ceci/cela/ça) | level: B1
- slug: possessive-pronouns | name: Possessive pronouns (le mien, la tienne…) | level: B1
- slug: indefinite-pronouns | name: Indefinite pronouns (quelqu'un, personne, rien, chacun) | level: B1
```

## Batch 4 — Verb Tenses (14 points; long output, preferably split into the first 7 and final 7 points)

```text
- slug: present-tense-regular | name: Present tense: regular -er / -ir / -re verbs | level: A2
- slug: present-tense-irregular | name: Present tense: key irregular verbs (être, avoir, aller, faire, venir…) | level: A2
- slug: pronominal-verbs | name: Pronominal (reflexive) verbs | level: A2
- slug: passe-compose-with-avoir | name: Passé composé with avoir | level: A2
- slug: passe-compose-with-etre | name: Passé composé with être | level: A2
- slug: imparfait | name: The imparfait | level: A2
- slug: passe-compose-vs-imparfait | name: Passé composé vs imparfait | level: B1
- slug: plus-que-parfait | name: The plus-que-parfait | level: B1
- slug: futur-proche | name: Futur proche (aller + infinitive) | level: A2
- slug: futur-simple | name: Futur simple | level: A2
- slug: venir-de-recent-past | name: Recent past (venir de + infinitive) | level: A2
- slug: etre-en-train-de | name: Ongoing action (être en train de + infinitive) | level: A2
- slug: past-participle-agreement-avoir | name: Past participle agreement with avoir (preceding direct object) | level: B1
- slug: depuis-pendant-il-y-a | name: Time markers with tenses (depuis, pendant, il y a) | level: B1
```

## Batch 5 — Moods (8 points)

```text
- slug: imperative | name: The imperative | level: A2
- slug: conditionnel-present | name: Conditionnel présent (politeness, wishes, suggestions) | level: A2
- slug: si-clauses | name: Hypotheses with si (si + présent / si + imparfait) | level: B1
- slug: subjunctive-formation | name: Subjunctive: formation | level: B1
- slug: subjunctive-triggers | name: Subjunctive: common triggers (il faut que, vouloir que, avant que…) | level: B1
- slug: subjunctive-vs-indicative | name: Subjunctive vs indicative (penser que vs ne pas penser que…) | level: B1
- slug: gerund-en-participe-present | name: Gérondif (en + -ant) and the present participle | level: B1
- slug: infinitive-constructions | name: Infinitive constructions (verb + infinitive, avant de, pour…) | level: B1
```

## Batch 6 — Negation & Questions (7 points)

```text
- slug: basic-negation | name: Basic negation (ne… pas) | level: A2
- slug: negation-variants | name: Negation variants (ne… plus / jamais / rien / personne) | level: A2
- slug: negation-compound-tenses | name: Negation in compound tenses and with pronouns | level: B1
- slug: restriction-ne-que | name: Restriction with ne… que | level: B1
- slug: yes-no-questions | name: Yes/no questions (intonation, est-ce que) | level: A2
- slug: information-questions | name: Information questions (où, quand, comment, pourquoi, quel, lequel) | level: A2
- slug: inversion-questions | name: Questions with inversion | level: B1
```

## Batch 7 — Prepositions (6 points)

```text
- slug: prepositions-of-place | name: Prepositions of place (dans, sur, sous, devant, chez…) | level: A2
- slug: prepositions-with-places | name: Prepositions with cities and countries (à, en, au, aux) | level: A2
- slug: prepositions-of-time | name: Prepositions of time (à, en, dans, depuis, pendant, pour) | level: A2
- slug: verbs-with-preposition-a | name: Verbs followed by à (penser à, réussir à…) | level: B1
- slug: verbs-with-preposition-de | name: Verbs followed by de (avoir besoin de, essayer de…) | level: B1
- slug: a-vs-de-before-infinitive | name: à vs de before an infinitive | level: B1
```

## Batch 8 — Sentence Structure & Discourse (8 points)

```text
- slug: word-order-basics | name: Basic word order (SVO, pronoun placement) | level: A2
- slug: adverbs-formation-placement | name: Adverbs: formation (-ment) and placement | level: A2
- slug: impersonal-expressions | name: Impersonal expressions (il faut, il y a, il fait…) | level: A2
- slug: connectors-time-sequence | name: Time and sequence connectors (d'abord, ensuite, puis, enfin…) | level: B1
- slug: connectors-cause-consequence | name: Cause and consequence connectors (parce que, comme, donc, alors…) | level: B1
- slug: indirect-speech | name: Indirect speech (dire que, demander si…) | level: B1
- slug: emphasis-cest-qui-que | name: Emphasis with c'est… qui / c'est… que | level: B1
- slug: passive-voice-intro | name: The passive voice (introduction) | level: B1
```
