ALTER TABLE "tcf_attempts" ADD COLUMN "request_key" text;--> statement-breakpoint
ALTER TABLE "tcf_attempts" ADD COLUMN "request_hash" text;--> statement-breakpoint
ALTER TABLE "tcf_question_attempts" ADD COLUMN "grade_version" integer;--> statement-breakpoint
ALTER TABLE "tcf_question_attempts" ADD COLUMN "request_key" text;--> statement-breakpoint
ALTER TABLE "tcf_question_attempts" ADD COLUMN "request_hash" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tcf_attempts_user_request_key" ON "tcf_attempts" USING btree ("user_id","request_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tcf_qa_user_request_key" ON "tcf_question_attempts" USING btree ("user_id","request_key");