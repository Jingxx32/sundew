CREATE TYPE "public"."review_availability" AS ENUM('ready', 'feedback_pending', 'disputed', 'source_missing', 'unsupported');--> statement-breakpoint
CREATE TYPE "public"."review_learning" AS ENUM('needs_practice', 'consolidating', 'stable');--> statement-breakpoint
CREATE TYPE "public"."review_management" AS ENUM('active', 'paused', 'archived');--> statement-breakpoint
CREATE TYPE "public"."review_source" AS ENUM('tcf', 'quiz', 'writing', 'vocabulary', 'conjugation');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "practice_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"request_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"command" text NOT NULL,
	"item_id" uuid,
	"revision" integer NOT NULL,
	CONSTRAINT "practice_request_once" UNIQUE("user_id","request_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "practice_run_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"review_item_id" uuid,
	"position" integer NOT NULL,
	"snapshot" jsonb,
	"state" text DEFAULT 'pending' NOT NULL,
	"draft" jsonb,
	"draft_revision" integer DEFAULT 0 NOT NULL,
	"revealed_at" timestamp with time zone,
	"attempt_type" text,
	"attempt_id" text,
	"correct" boolean,
	"uncertain" boolean DEFAULT false NOT NULL,
	"submitted_at" timestamp with time zone,
	CONSTRAINT "practice_item_position" UNIQUE("run_id","position"),
	CONSTRAINT "practice_item_target" UNIQUE("run_id","review_item_id"),
	CONSTRAINT "practice_items_owner_id" UNIQUE("user_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "practice_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"count" integer NOT NULL,
	"request_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "practice_runs_owner_id" UNIQUE("user_id","id"),
	CONSTRAINT "practice_runs_request" UNIQUE("user_id","request_key"),
	CONSTRAINT "practice_run_count" CHECK ("practice_runs"."count" between 1 and 20)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "review_backfill_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" "review_source" NOT NULL,
	"cursor" text DEFAULT '' NOT NULL,
	"cutoff" timestamp with time zone DEFAULT now() NOT NULL,
	"fingerprint" text NOT NULL,
	"processed" integer DEFAULT 0 NOT NULL,
	"unresolved" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "review_item_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"command" text NOT NULL,
	"request_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"revision" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_changes_request" UNIQUE("user_id","request_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "review_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"attempt_id" text NOT NULL,
	"attempt_type" text NOT NULL,
	"answered_at" timestamp with time zone NOT NULL,
	"correct" boolean,
	"uncertain" boolean DEFAULT false NOT NULL,
	"valid" boolean NOT NULL,
	"independent" boolean DEFAULT false NOT NULL,
	"permitted" boolean DEFAULT true NOT NULL,
	"revealed_at" timestamp with time zone,
	"provenance" text NOT NULL,
	CONSTRAINT "review_evidence_once" UNIQUE("user_id","item_id","attempt_type","attempt_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "review_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" "review_source" NOT NULL,
	"source_key" text NOT NULL,
	"tcf_question_id" uuid,
	"quiz_question_id" text,
	"error_id" text,
	"gap_id" uuid,
	"title" text NOT NULL,
	"skill" text NOT NULL,
	"href" text NOT NULL,
	"management" "review_management" DEFAULT 'active' NOT NULL,
	"pause_until" timestamp with time zone,
	"note" text DEFAULT '' NOT NULL,
	"disputed_at" timestamp with time zone,
	"dispute_reason" text,
	"availability" "review_availability" DEFAULT 'ready' NOT NULL,
	"learning_state" "review_learning" DEFAULT 'needs_practice' NOT NULL,
	"due_at" timestamp with time zone,
	"eligible_after" timestamp with time zone,
	"success_count" integer DEFAULT 0 NOT NULL,
	"policy_version" integer DEFAULT 1 NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"content_hash" text NOT NULL,
	"first_observed_at" timestamp with time zone NOT NULL,
	"last_observed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "review_items_owner_source" UNIQUE("user_id","source","source_key"),
	CONSTRAINT "review_items_owner_id" UNIQUE("user_id","id"),
	CONSTRAINT "review_note_bound" CHECK (length("review_items"."note") <= 2000)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "practice_requests" ADD CONSTRAINT "practice_request_owner_run" FOREIGN KEY ("user_id","run_id") REFERENCES "public"."practice_runs"("user_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "practice_requests" ADD CONSTRAINT "practice_request_owner_item" FOREIGN KEY ("user_id","item_id") REFERENCES "public"."practice_run_items"("user_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "practice_run_items" ADD CONSTRAINT "practice_run_items_review_item_id_review_items_id_fk" FOREIGN KEY ("review_item_id") REFERENCES "public"."review_items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "practice_run_items" ADD CONSTRAINT "practice_items_owner_run" FOREIGN KEY ("user_id","run_id") REFERENCES "public"."practice_runs"("user_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "practice_run_items" ADD CONSTRAINT "practice_items_owner_review" FOREIGN KEY ("user_id","review_item_id") REFERENCES "public"."review_items"("user_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "practice_runs" ADD CONSTRAINT "practice_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "review_backfill_jobs" ADD CONSTRAINT "review_backfill_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "review_item_changes" ADD CONSTRAINT "review_changes_owner_item" FOREIGN KEY ("user_id","item_id") REFERENCES "public"."review_items"("user_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "review_evidence" ADD CONSTRAINT "review_evidence_owner_item" FOREIGN KEY ("user_id","item_id") REFERENCES "public"."review_items"("user_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "review_items" ADD CONSTRAINT "review_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "review_items" ADD CONSTRAINT "review_items_tcf_question_id_tcf_questions_id_fk" FOREIGN KEY ("tcf_question_id") REFERENCES "public"."tcf_questions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "review_items" ADD CONSTRAINT "review_items_quiz_question_id_quiz_questions_id_fk" FOREIGN KEY ("quiz_question_id") REFERENCES "public"."quiz_questions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "review_items" ADD CONSTRAINT "review_items_error_id_errors_id_fk" FOREIGN KEY ("error_id") REFERENCES "public"."errors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "review_items" ADD CONSTRAINT "review_items_gap_id_vocabulary_gaps_id_fk" FOREIGN KEY ("gap_id") REFERENCES "public"."vocabulary_gaps"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "review_items" ADD CONSTRAINT "review_items_owner_error" FOREIGN KEY ("user_id","error_id") REFERENCES "public"."errors"("user_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "review_items" ADD CONSTRAINT "review_items_owner_gap" FOREIGN KEY ("user_id","gap_id") REFERENCES "public"."vocabulary_gaps"("user_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_evidence_history" ON "review_evidence" USING btree ("user_id","item_id","answered_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_items_due" ON "review_items" USING btree ("user_id","management","availability","due_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_items_recent" ON "review_items" USING btree ("user_id","last_observed_at","id");