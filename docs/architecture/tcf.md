# TCF Canada

## Scope

The TCF area supports French reading and listening practice. It has two complementary modes:

- **Level drills:** practice questions grouped by skill and CEFR level.
- **Complete exams:** complete test runs with score and attempt history.

After an answer, the interface can show a structured verdict and a Markdown explanation. Marked, incorrect, or uncertain questions enter the review flow.

## Content model

`tcf_sets` groups questions by test number and skill. `tcf_questions` stores the question text, options, answer, level, type, transcript, passage, media paths, English translation, explanation, and structured explanation metadata.

The currently supported question types are image, spoken options, and dialogue. Reading questions may have a text passage; listening questions may have transcript and audio data.

## Learning model

Individual drill and exam answers are persisted for the current user. Progress views summarize answered questions, accuracy, review needs, and complete-exam results. Vocabulary encountered in TCF content can feed the vocabulary-gap profile.

## Explanations

Explanations are stored in the database. The development-only `POST /api/tcf/explanations` endpoint is the maintenance entry point. It accepts a locator from frontmatter or URL parameters, validates it, stores the raw Markdown, extracts the English Translation section, and parses an optional Verdict section for structured rendering.

Older explanation records can use legacy Chinese headings; the parser retains compatibility for them. New explanations should be authored in English.

## Data quality

Known source-data problems are tracked in [TCF data quality](../operations/data-quality.md). Do not replace a source answer merely because an explanation seems implausible: verify against the original material first.
