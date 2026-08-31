CREATE TYPE "public"."vocab_gap_source" AS ENUM('lookup', 'feedback', 'manual');--> statement-breakpoint
CREATE TYPE "public"."vocab_gap_status" AS ENUM('active', 'mastered', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."vocab_gap_type" AS ENUM('listening', 'recognition', 'production');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vocabulary_gaps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lemma" text NOT NULL,
	"gap_type" "vocab_gap_type" NOT NULL,
	"source" "vocab_gap_source" NOT NULL,
	"status" "vocab_gap_status" DEFAULT 'active' NOT NULL,
	"box" integer DEFAULT 1 NOT NULL,
	"due_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vocab_gaps_lemma_type_key" UNIQUE("lemma","gap_type")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vocabulary_gaps" ADD CONSTRAINT "vocabulary_gaps_lemma_vocabulary_lookups_lemma_fk" FOREIGN KEY ("lemma") REFERENCES "public"."vocabulary_lookups"("lemma") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vocab_gaps_status_due_idx" ON "vocabulary_gaps" USING btree ("status","due_at");