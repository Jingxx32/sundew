CREATE INDEX IF NOT EXISTS "documents_user_id_idx" ON "documents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "errors_user_id_idx" ON "errors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "micro_drills_user_id_idx" ON "micro_drills" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reading_sessions_user_id_idx" ON "reading_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submissions_user_id_idx" ON "submissions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "writing_tasks_user_id_idx" ON "writing_tasks" USING btree ("user_id");