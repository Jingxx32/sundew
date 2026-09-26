# Stage 2 speaking pilot operations

Status: Code implementation in progress; pilot disabled by default. Updated 2026-09-18.

## Scope and configuration

The private Task 2 flow is at `/speaking/task-2`. It requires an authenticated app identity, the Stage 2 database migration, Azure Speech recognition, OpenAI dialogue and speech generation, and private recording storage. The public demo must remain on its separate, precomputed path.

Configure the following in the **private** environment only:

- `DATABASE_URL` for the explicitly chosen database.
- `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION`.
- `OPENAI_API_KEY`; existing `OPENAI_MODEL_SPEAKING` and `OPENAI_MODEL_FEEDBACK` may be set after quality checks.
- In production, `CLOUDFLARE_R2_ACCOUNT_ID`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, and `CLOUDFLARE_R2_BUCKET` for a non-public bucket.
- `SPEAKING_TURN_RESERVE_CENTS`, `SPEAKING_ASSESSMENT_RESERVE_CENTS`, and `SPEAKING_FOLLOWUP_RESERVE_CENTS`: **integer worst-case reservation amounts** chosen from measured provider usage and current pricing, including retries. They are required to enable the pilot. The code does not infer prices or report provider billing as exact cost.
- `SPEAKING_SIMULATION_ENABLED=true` only after the migration, private media, reservation settings, access tests, and browser checks pass. Set it to `false` to stop new paid simulation operations while preserving reads and deletion.

Current hard ceilings: 100 reserved cents per session, 500 per owner per UTC day, and 2,500 cumulative reserved cents for the pilot, with at most two in-flight paid operations. Unknown outcomes retain their reservation. These limits are intentionally conservative and may stop a session before the turn count. Set reservation amounts so a representative full session fits; if that is impossible, revise the pilot design and document the new cap before enabling it. This ledger is an exposure ceiling, not a provider invoice. Actual provider usage reconciliation remains a pilot prerequisite.

Development without R2 uses `.private-media/` outside `public/`; it is Git-ignored. Do not use this local directory for a deployed instance with ephemeral storage.

## Migration and verification sequence

1. Identify the target database and take a restorable database backup. Check the existing Drizzle migration journal before applying anything.
2. Apply `drizzle/0026_funny_grey_gargoyle.sql`, `drizzle/0027_silly_bulldozer.sql`, and `drizzle/0028_purple_wong.sql` in order through the repository migration process against that target. The second preserves session history when a prompt is deleted; the third records disputed transcriptions. No migration was run as part of the code change.
3. Inventory `public/media/speaking` on every deployed host or shared media volume. The current development workspace contains no such files. If deployment files exist, copy them to an authorized private store, update corresponding `speaking_turns.audio_path` references and `speaking_assets` rows, verify owner-scoped playback, then remove public copies and confirm direct public URLs return 404. Keep a backup until verified. Do not enable the pilot while old files remain publicly reachable.
4. Verify the generic `/api/media-url` route rejects speaking recording paths and `/api/speaking/recordings/[assetId]` returns 404 for another identity, expired media, and nonexistent assets.
5. Test one synthetic session end to end in the private environment. Record per-step latency, failure behavior, and conservative usage before enabling more learners.

Expired recordings are found by `scripts/cleanup-speaking-recordings.ts`. Run it without flags for a dry run; after checking the target, run `npx tsx scripts/cleanup-speaking-recordings.ts --apply --expect-host=<database-host>` on a scheduled private runner. It deletes at most 100 objects per invocation and marks them deleted in the database. Schedule it at least daily and monitor failures. Transcript and feedback remain until the learner deletes the session; deletion keeps a sanitized spending ledger so erasing history does not reset pilot limits. Backups and provider-side retention must be documented separately for the deployed environment.

## Current validation and open gates

Type checking, lint, the automated test suite, and a production build passed on 2026-09-18. The build needed network access to fetch the project's existing Google Fonts. No database migration, live Azure/OpenAI voice call, real browser microphone test, cross-identity integration test, or private pilot has been run. The available `.env` points at an Azure database and does not provide Azure Speech or R2 settings; it was deliberately not used for a migration or live test.

Before release, complete the Stage 2 plan's isolated database tests, live provider and browser checks, data retention job, public recording inventory, competent French feedback review, and pilot metrics. Keep the feature switch off until those gates pass.
