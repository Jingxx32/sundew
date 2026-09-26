ALTER TABLE "micro_drills" ADD COLUMN "feedback_status" text DEFAULT 'ready' NOT NULL;--> statement-breakpoint
ALTER TABLE "micro_drills" ADD COLUMN "feedback_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "micro_drills" ADD COLUMN "feedback_lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "micro_drills" ADD COLUMN "request_key" text;--> statement-breakpoint
ALTER TABLE "micro_drills" ADD COLUMN "request_hash" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "micro_drills_user_request_key" ON "micro_drills" USING btree ("user_id","request_key");