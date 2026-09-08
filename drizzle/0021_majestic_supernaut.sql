CREATE TYPE "public"."user_role" AS ENUM('admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_issuer" text NOT NULL,
	"auth_subject" text NOT NULL,
	"email" text NOT NULL,
	"role" "user_role" DEFAULT 'member' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_auth_identity_key" UNIQUE("auth_issuer","auth_subject")
);
--> statement-breakpoint
-- A fixed holding identity makes the migration safe for existing single-user
-- data. The first allowlisted administrator claims this row in the application.
INSERT INTO "users" ("id", "auth_issuer", "auth_subject", "email", "role")
VALUES ('00000000-0000-4000-8000-000000000001', 'legacy', 'pending-owner', 'legacy-owner@invalid.local', 'admin')
ON CONFLICT DO NOTHING;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "user_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "errors" ADD COLUMN "user_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "micro_drills" ADD COLUMN "user_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "reading_sessions" ADD COLUMN "user_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "user_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "user_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "writing_tasks" ADD COLUMN "user_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" DROP CONSTRAINT "user_settings_pkey";--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_key_pk" PRIMARY KEY("user_id","key");--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "errors" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "micro_drills" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "reading_sessions" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "submissions" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "user_settings" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "writing_tasks" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "errors" ADD CONSTRAINT "errors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "micro_drills" ADD CONSTRAINT "micro_drills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reading_sessions" ADD CONSTRAINT "reading_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "submissions" ADD CONSTRAINT "submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "writing_tasks" ADD CONSTRAINT "writing_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
