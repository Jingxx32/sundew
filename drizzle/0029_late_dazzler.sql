CREATE TABLE IF NOT EXISTS "quiz_question_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"attempt_id" text NOT NULL,
	"question_id" text NOT NULL,
	"answer" jsonb NOT NULL,
	"correct" boolean NOT NULL,
	"uncertain" boolean DEFAULT false NOT NULL,
	"grader_version" integer DEFAULT 1 NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD COLUMN "request_key" text;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD COLUMN "request_hash" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quiz_question_attempts" ADD CONSTRAINT "quiz_question_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quiz_question_attempts" ADD CONSTRAINT "quiz_question_attempts_attempt_id_quiz_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."quiz_attempts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quiz_question_attempts" ADD CONSTRAINT "quiz_question_attempts_question_id_quiz_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."quiz_questions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "quiz_question_attempts_attempt_question" ON "quiz_question_attempts" USING btree ("attempt_id","question_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quiz_question_attempts_user_question_time" ON "quiz_question_attempts" USING btree ("user_id","question_id","answered_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "quiz_attempts_user_request_key" ON "quiz_attempts" USING btree ("user_id","request_key");