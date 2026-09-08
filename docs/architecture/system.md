# System Architecture

## Application

Lumière is a Next.js 16 App Router application using React 19, TypeScript, Tailwind CSS, and Radix-based UI primitives. Most product data access occurs through server actions in `src/lib/actions/`; narrow HTTP route handlers exist where browser uploads or development-only maintenance require them.

The primary routes are `/today`, `/library`, `/vocabulary`, `/practice`, `/quiz`, `/tcf`, `/speaking`, `/conjugation`, `/progress`, and `/settings`.

## Data and ownership

PostgreSQL with Drizzle ORM is the production data model. The schema in `src/lib/db/schema.ts` is authoritative.

Learning data is owner-scoped through `users` and `userId` relationships. Personal documents, reading sessions, writing tasks, submissions, errors, micro-drills, vocabulary state, attempts, speaking sessions, and settings must be read and written only for the authenticated owner. Shared knowledge such as rules, grammar points, and public TCF content is maintained separately.

## Authentication

Development has an explicit local identity. Production authentication is fail-closed and expects Azure Easy Auth with a configured Google or Microsoft Entra provider. The current implementation intentionally permits a single allowlisted administrator until every production data path has completed the multi-user migration.

Authentication at a page boundary is insufficient: server actions, route handlers, and data queries must enforce ownership themselves.

## AI and speech

OpenAI is used for contextual vocabulary lookup, enrichment, writing-task generation, structured feedback, cloze selection, transcription, and speaking-script generation. Structured outputs are preferred for generated application data.

Azure Speech supports pronunciation assessment. The application must remain usable when Azure Speech credentials are absent; speaking assessment is then unavailable rather than silently degraded.

Conjugation answers come from deterministic French-verb data, not AI generation.

## Operational constraints

- Keep secrets server-side. Do not place credentials or server authorization decisions in `NEXT_PUBLIC_*` variables.
- Bound uploads, parsing, remote-content access, and paid AI operations before production exposure.
- Preserve database and media backups before destructive imports or ownership migrations.
- Treat the schema, application code, and deployment configuration as the final verification source when documentation disagrees.
