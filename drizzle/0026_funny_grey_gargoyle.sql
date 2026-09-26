CREATE TABLE IF NOT EXISTS "speaking_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"transcript_revision" integer NOT NULL,
	"rubric_version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"result" jsonb,
	"failure" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "speaking_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"turn_id" uuid,
	"object_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_length" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "speaking_assets_object_key_unique" UNIQUE("object_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "speaking_follow_ups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"assessment_id" uuid NOT NULL,
	"issue_id" text NOT NULL,
	"drill_id" text NOT NULL,
	"prompt" text NOT NULL,
	"transcript" text,
	"audio_path" text,
	"feedback" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "speaking_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid,
	"kind" text NOT NULL,
	"request_key" uuid NOT NULL,
	"request_hash" text,
	"status" text DEFAULT 'reserved' NOT NULL,
	"reserved_cents" integer NOT NULL,
	"actual_cents" integer,
	"usage" jsonb,
	"lease_expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "speaking_simulations" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"start_request_key" uuid NOT NULL,
	"scenario_version" integer NOT NULL,
	"scenario_snapshot" jsonb NOT NULL,
	"phase" text DEFAULT 'preparing' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"preparation_ends_at" timestamp with time zone NOT NULL,
	"conversation_started_at" timestamp with time zone,
	"conversation_ends_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"finish_reason" text,
	"excluded_wait_ms" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "speaking_turns" ADD COLUMN "request_key" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "speaking_assessments" ADD CONSTRAINT "speaking_assessments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "speaking_assessments" ADD CONSTRAINT "speaking_assessments_session_id_speaking_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."speaking_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "speaking_assets" ADD CONSTRAINT "speaking_assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "speaking_assets" ADD CONSTRAINT "speaking_assets_session_id_speaking_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."speaking_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "speaking_assets" ADD CONSTRAINT "speaking_assets_turn_id_speaking_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."speaking_turns"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "speaking_follow_ups" ADD CONSTRAINT "speaking_follow_ups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "speaking_follow_ups" ADD CONSTRAINT "speaking_follow_ups_assessment_id_speaking_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."speaking_assessments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "speaking_operations" ADD CONSTRAINT "speaking_operations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "speaking_operations" ADD CONSTRAINT "speaking_operations_session_id_speaking_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."speaking_sessions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "speaking_simulations" ADD CONSTRAINT "speaking_simulations_session_id_speaking_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."speaking_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "speaking_simulations" ADD CONSTRAINT "speaking_simulations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "speaking_assessments_session_revision_idx" ON "speaking_assessments" USING btree ("session_id","transcript_revision");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "speaking_assets_user_session_idx" ON "speaking_assets" USING btree ("user_id","session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "speaking_follow_ups_assessment_idx" ON "speaking_follow_ups" USING btree ("assessment_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "speaking_follow_ups_issue_idx" ON "speaking_follow_ups" USING btree ("assessment_id","issue_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "speaking_operations_request_idx" ON "speaking_operations" USING btree ("session_id","kind","request_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "speaking_operations_user_created_idx" ON "speaking_operations" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "speaking_simulations_user_id_idx" ON "speaking_simulations" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "speaking_simulations_user_start_key_idx" ON "speaking_simulations" USING btree ("user_id","start_request_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "speaking_turns_session_request_key_idx" ON "speaking_turns" USING btree ("session_id","request_key");
