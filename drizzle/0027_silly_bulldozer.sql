ALTER TABLE "speaking_sessions" DROP CONSTRAINT "speaking_sessions_prompt_id_speaking_prompts_id_fk";
--> statement-breakpoint
ALTER TABLE "speaking_sessions" ALTER COLUMN "prompt_id" DROP NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "speaking_sessions" ADD CONSTRAINT "speaking_sessions_prompt_id_speaking_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."speaking_prompts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
