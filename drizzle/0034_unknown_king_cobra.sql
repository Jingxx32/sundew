ALTER TABLE "conjugation_attempts" ADD COLUMN "request_key" text;--> statement-breakpoint
ALTER TABLE "conjugation_attempts" ADD COLUMN "request_hash" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "conjugation_attempts_user_request_key" ON "conjugation_attempts" USING btree ("user_id","request_key");