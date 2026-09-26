CREATE TABLE IF NOT EXISTS "vocabulary_review_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"gap_id" uuid NOT NULL,
	"answer" text,
	"correct" boolean NOT NULL,
	"grading_method" text NOT NULL,
	"box_before" integer NOT NULL,
	"box_after" integer NOT NULL,
	"status_after" "vocab_gap_status" NOT NULL,
	"request_key" text,
	"request_hash" text,
	"policy_version" integer DEFAULT 1 NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vocabulary_review_attempts" ADD CONSTRAINT "vocabulary_review_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vocabulary_review_attempts" ADD CONSTRAINT "vocabulary_review_attempts_gap_id_vocabulary_gaps_id_fk" FOREIGN KEY ("gap_id") REFERENCES "public"."vocabulary_gaps"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vocab_review_attempts_user_gap_time" ON "vocabulary_review_attempts" USING btree ("user_id","gap_id","answered_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vocab_review_attempts_user_request_key" ON "vocabulary_review_attempts" USING btree ("user_id","request_key");