CREATE TABLE IF NOT EXISTS "user_vocabulary" (
	"user_id" uuid NOT NULL,
	"lemma" text NOT NULL,
	"surface" text NOT NULL,
	"pos" text,
	"translation" text,
	"cefr_level" text,
	"in_context" text,
	"examples" jsonb,
	"conjugation" text,
	"sentence_context" text,
	"rich_entry" jsonb,
	"enriched_at" timestamp,
	"looked_up_at" timestamp DEFAULT now() NOT NULL,
	"saved_at" timestamp,
	CONSTRAINT "user_vocabulary_user_id_lemma_pk" PRIMARY KEY("user_id","lemma")
);
--> statement-breakpoint
-- Preserve every legacy vocabulary row as private data for the existing owner.
-- The old contextual columns stay in place for one recovery window, but the
-- application switches to user_vocabulary immediately after this migration.
INSERT INTO "user_vocabulary" (
	"user_id", "lemma", "surface", "pos", "translation", "cefr_level",
	"in_context", "examples", "conjugation", "sentence_context",
	"rich_entry", "enriched_at", "looked_up_at", "saved_at"
)
SELECT
	'00000000-0000-4000-8000-000000000001', "lemma", "surface", "pos",
	"translation", "cefr_level", "in_context", "examples", "conjugation",
	"sentence_context", "rich_entry", "enriched_at", "looked_up_at", "saved_at"
FROM "vocabulary_lookups"
ON CONFLICT DO NOTHING;--> statement-breakpoint
ALTER TABLE "vocabulary_gaps" DROP CONSTRAINT "vocab_gaps_lemma_type_key";--> statement-breakpoint
ALTER TABLE "vocabulary_occurrences" DROP CONSTRAINT "vocab_occ_unique_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "vocab_gaps_status_due_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "vocab_occ_lemma_idx";--> statement-breakpoint
ALTER TABLE "vocabulary_gaps" ADD COLUMN "user_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "vocabulary_occurrences" ADD COLUMN "user_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_vocabulary" ADD CONSTRAINT "user_vocabulary_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_vocabulary" ADD CONSTRAINT "user_vocabulary_lemma_vocabulary_lookups_lemma_fk" FOREIGN KEY ("lemma") REFERENCES "public"."vocabulary_lookups"("lemma") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_vocabulary_user_saved_idx" ON "user_vocabulary" USING btree ("user_id","saved_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_vocabulary_user_looked_up_idx" ON "user_vocabulary" USING btree ("user_id","looked_up_at");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vocabulary_gaps" ADD CONSTRAINT "vocabulary_gaps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vocabulary_gaps" ADD CONSTRAINT "vocab_gaps_user_lemma_fk" FOREIGN KEY ("user_id","lemma") REFERENCES "public"."user_vocabulary"("user_id","lemma") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vocabulary_occurrences" ADD CONSTRAINT "vocabulary_occurrences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vocabulary_occurrences" ADD CONSTRAINT "vocab_occ_user_lemma_fk" FOREIGN KEY ("user_id","lemma") REFERENCES "public"."user_vocabulary"("user_id","lemma") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "vocabulary_gaps" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "vocabulary_occurrences" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vocab_gaps_user_status_due_idx" ON "vocabulary_gaps" USING btree ("user_id","status","due_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vocab_occ_user_lemma_idx" ON "vocabulary_occurrences" USING btree ("user_id","lemma");--> statement-breakpoint
ALTER TABLE "vocabulary_gaps" ADD CONSTRAINT "vocab_gaps_user_lemma_type_key" UNIQUE("user_id","lemma","gap_type");--> statement-breakpoint
ALTER TABLE "vocabulary_occurrences" ADD CONSTRAINT "vocab_occ_unique_idx" UNIQUE NULLS NOT DISTINCT("user_id","lemma","source_type","document_id","tcf_question_id");
