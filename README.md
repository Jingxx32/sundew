# Sundew

> **Read French. Write French. See your blind spots fade.**
>
> A personal training ground for output-driven French learning.

**Live demo: [sundew.jingxuanxu.com](https://sundew.jingxuanxu.com)** — one click, no sign-up.
Guests get a sample workspace (an A2 learner's writing feedback, error profile, vocabulary
and conjugation history) that is deleted after 7 days. TCF exam content, speaking and other
paid-AI features stay with invited members.

Sundew is built around one belief: **language sticks when you produce it, not when you consume it**. Tools like NotebookLM are great at making French *easier to understand* — but in doing so they remove the very friction that drives real acquisition. Sundew flips that around.

The core loop:

```
Read your own French material
        ↓
AI generates a writing task anchored to what you just read
        ↓
You write
        ↓
AI gives structured, classified feedback (in English, with French examples)
        ↓
Every error flows into your persistent learner profile
        ↓
Your trends and weak spots feed the next task
```

## Status

| Area | Scope | Status |
|------|-------|--------|
| **Core loop** | Library + Reader, click-to-define lookup, writing tasks, **structured writing feedback**, errors archive, progress dashboard, learner profile | ✅ |
| **Practice** | Quiz engine, podcast cloze dictation (Whisper word timestamps), conjugation drills (LEFFF, deterministic), vocabulary gaps with Leitner review | ✅ |
| **TCF Canada** | Listening/reading bank (drill + timed exam; private content excluded), per-question history, scheduled re-checks and a review queue | ✅ |
| **Learning home** | Today plan, Training by skill, a Review center across TCF, writing, vocabulary, conjugation and quiz | ✅ |
| **Accounts** | Better Auth (Google, email code), invite-only sign-up, one-click guests with a seeded sample workspace, admin invites | ✅ |
| **Speaking** | Read-aloud with Azure pronunciation assessment | ✅ |
| In development | TCF Task 2 speaking simulation; unified review state and resumable review sessions (both behind feature flags) | 🚧 |

## Quick start

Use the Node.js version pinned in `.nvmrc` (also used by CI). Use a separate
development database; do not point setup or seed scripts at personal production data.

```bash
# 1. install
nvm use
npm ci

# 2. point DATABASE_URL at a PostgreSQL database and apply migrations
#    copy .env.example: DATABASE_URL, BETTER_AUTH_URL, BETTER_AUTH_SECRET and
#    OPENAI_API_KEY at minimum (AZURE_SPEECH_KEY/REGION for speaking)
npm run db:init

# 3. verify the source checkout (no database or API keys required)
npm run typecheck
npm run lint
npm test

# 4. run the dev server
npm run dev
```

Open <http://localhost:3000> for the landing page. Start a guest session, or sign in
with an email code (in development the code is printed to the server console).

The existing seed scripts are development utilities, not public-demo seeds.
Review their content and target database before use. Production runs on Vercel
(Montréal) with PostgreSQL on Azure and private media on Cloudflare R2; see
[guest access](docs/operations/guest-access.md) for how guests and the sample
workspace work.

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| Styling | Tailwind CSS v4 + semantic design tokens (soft-glow theme) |
| Database | PostgreSQL (Azure) via `postgres` (postgres.js) + Drizzle ORM |
| AI | OpenAI API (GPT-4o/4o-mini, Whisper) — structured outputs with Zod; Azure Speech for pronunciation |
| Auth | Better Auth — Google, email one-time codes, anonymous guests, admin roles |
| Hosting | Vercel + Azure PostgreSQL + Cloudflare R2 (private media) |
| UI primitives | Radix UI (Dialog, Popover, Slot) — minimal, owned components |
| Icons | Lucide |
| Fonts | Geist (UI) + Plus Jakarta Sans (display) + Source Serif 4 (reading) |

## Project layout

```
src/
├── app/
│   ├── (main)/                 # Sidebar shell: today, training, review, library,
│   │                           #   documents, practice, quiz, vocabulary,
│   │                           #   conjugation, speaking, progress, settings
│   ├── tcf/                    # Standalone TCF layout: drill, exam, review
│   ├── api/                    # Auth, guest cleanup cron, signed media URLs,
│   │                           #   speaking uploads
│   ├── login/                  # Sign-in
│   └── page.tsx                # Public landing page with a sample question
├── components/                 # Sidebar, lookup popover, ui/ primitives
├── hooks/
└── lib/
    ├── db/schema.ts            # Database schema, single source of truth
    ├── actions/                # ALL db access (server actions, no API layer)
    ├── ai/                     # OpenAI wrappers (lookup, feedback, task, …)
    ├── speech/azure.ts         # Azure pronunciation assessment
    ├── taxonomy.ts             # ★ Error taxonomy (the soul) ★
    └── tcf/, vocabulary/, conjugation/, pdf/ …

drizzle/                        # Generated migration SQL
scripts/                        # db-init/seed + TCF import & TTS pipeline
docs/                           # PRDs, audits, superpowers/{specs,plans}
```

## The error taxonomy

The single most important design decision in Sundew is the
[`ERROR_TAXONOMY`](src/lib/taxonomy.ts) — a flat-but-categorised set of
error subcategories tuned for **A2-B1 learners**. It is:

1. The schema the AI must conform to when emitting structured feedback
2. The index used by every dashboard, drill, and learner-profile decision
3. Deliberately weighted toward foundational issues (tense, gender, articles)
   over stylistic ones (register, idiom)

If you change levels later (e.g. become B2+), this is the file to revisit.

## Database scripts

```bash
npm run db:init       # Apply pending migrations (safe, idempotent)
npm run db:generate   # Generate a new migration after schema change
npm run db:studio     # Open Drizzle Studio at https://local.drizzle.studio
npm run db:seed       # Insert sample French documents
```

## License

Copyright © 2026 Jingxuan Xu. All rights reserved. Source is available for
portfolio and recruitment evaluation under [LICENSE](LICENSE); this is not an
open-source license.

Third-party dependencies and resources retain their own licenses. Private exam
materials, recordings, and personal learning data are excluded from the public
demo. Public demo content must be original or have confirmed permission for
public use; access controls do not establish content permission. See the
[content source register](docs/demo-content-sources.md) for review status.
