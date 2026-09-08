ALTER TABLE "conjugation_attempts" ADD COLUMN "user_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD COLUMN "user_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "quiz_sets" ADD COLUMN "user_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "speaking_scripts" ADD COLUMN "user_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "speaking_sessions" ADD COLUMN "user_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "speaking_turns" ADD COLUMN "user_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "tcf_attempts" ADD COLUMN "user_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "tcf_question_attempts" ADD COLUMN "user_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conjugation_attempts" ADD CONSTRAINT "conjugation_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quiz_sets" ADD CONSTRAINT "quiz_sets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "speaking_scripts" ADD CONSTRAINT "speaking_scripts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "speaking_sessions" ADD CONSTRAINT "speaking_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "speaking_turns" ADD CONSTRAINT "speaking_turns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tcf_attempts" ADD CONSTRAINT "tcf_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tcf_question_attempts" ADD CONSTRAINT "tcf_question_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "conjugation_attempts" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "quiz_sets" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "speaking_scripts" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "speaking_sessions" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "speaking_turns" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "tcf_attempts" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "tcf_question_attempts" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conjugation_attempts_user_id_answered_at_idx" ON "conjugation_attempts" USING btree ("user_id","answered_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quiz_attempts_user_id_answered_at_idx" ON "quiz_attempts" USING btree ("user_id","answered_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quiz_sets_user_id_created_at_idx" ON "quiz_sets" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "speaking_scripts_user_id_prompt_id_idx" ON "speaking_scripts" USING btree ("user_id","prompt_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "speaking_sessions_user_id_started_at_idx" ON "speaking_sessions" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "speaking_turns_user_id_session_id_idx" ON "speaking_turns" USING btree ("user_id","session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tcf_attempts_user_id_answered_at_idx" ON "tcf_attempts" USING btree ("user_id","answered_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tcf_qa_user_id_answered_at_idx" ON "tcf_question_attempts" USING btree ("user_id","answered_at");
