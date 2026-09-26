ALTER TABLE "quiz_question_attempts" ALTER COLUMN "attempt_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "conjugation_attempts" ADD COLUMN "run_item_id" uuid;--> statement-breakpoint
ALTER TABLE "micro_drills" ADD COLUMN "run_item_id" uuid;--> statement-breakpoint
ALTER TABLE "quiz_question_attempts" ADD COLUMN "run_item_id" uuid;--> statement-breakpoint
ALTER TABLE "tcf_question_attempts" ADD COLUMN "run_item_id" uuid;--> statement-breakpoint
ALTER TABLE "vocabulary_review_attempts" ADD COLUMN "run_item_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conjugation_attempts" ADD CONSTRAINT "conjugation_attempts_run_item_id_practice_run_items_id_fk" FOREIGN KEY ("run_item_id") REFERENCES "public"."practice_run_items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "micro_drills" ADD CONSTRAINT "micro_drills_run_item_id_practice_run_items_id_fk" FOREIGN KEY ("run_item_id") REFERENCES "public"."practice_run_items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quiz_question_attempts" ADD CONSTRAINT "quiz_question_attempts_run_item_id_practice_run_items_id_fk" FOREIGN KEY ("run_item_id") REFERENCES "public"."practice_run_items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tcf_question_attempts" ADD CONSTRAINT "tcf_question_attempts_run_item_id_practice_run_items_id_fk" FOREIGN KEY ("run_item_id") REFERENCES "public"."practice_run_items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vocabulary_review_attempts" ADD CONSTRAINT "vocabulary_review_attempts_run_item_id_practice_run_items_id_fk" FOREIGN KEY ("run_item_id") REFERENCES "public"."practice_run_items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "conjugation_attempts" ADD CONSTRAINT "conjugation_attempts_run_item_id_unique" UNIQUE("run_item_id");--> statement-breakpoint
ALTER TABLE "micro_drills" ADD CONSTRAINT "micro_drills_run_item_id_unique" UNIQUE("run_item_id");--> statement-breakpoint
ALTER TABLE "quiz_question_attempts" ADD CONSTRAINT "quiz_question_attempts_run_item_id_unique" UNIQUE("run_item_id");--> statement-breakpoint
ALTER TABLE "tcf_question_attempts" ADD CONSTRAINT "tcf_question_attempts_run_item_id_unique" UNIQUE("run_item_id");--> statement-breakpoint
ALTER TABLE "vocabulary_review_attempts" ADD CONSTRAINT "vocabulary_review_attempts_run_item_id_unique" UNIQUE("run_item_id");
--> statement-breakpoint
-- Revoke copied private content before its source disappears, including cascades.
CREATE FUNCTION review_scrub_deleted_item() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE practice_runs SET state = CASE WHEN state = 'cancelled' THEN state ELSE 'paused' END,
    completed_at = NULL, revision = revision + 1
    WHERE id IN (SELECT run_id FROM practice_run_items WHERE review_item_id = OLD.id);
  UPDATE practice_run_items SET snapshot = NULL, draft = NULL, attempt_id = NULL,
    attempt_type = NULL, correct = NULL, submitted_at = NULL, revealed_at = NULL,
    review_item_id = NULL, state = 'blocked' WHERE review_item_id = OLD.id;
  RETURN OLD;
END $$;
--> statement-breakpoint
CREATE TRIGGER review_scrub_deleted_item BEFORE DELETE ON review_items
FOR EACH ROW EXECUTE FUNCTION review_scrub_deleted_item();
--> statement-breakpoint
CREATE FUNCTION review_attempt_deleted() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_type text;
BEGIN
  source_type := CASE TG_TABLE_NAME WHEN 'tcf_question_attempts' THEN 'tcf_question'
    WHEN 'quiz_question_attempts' THEN 'quiz_question' WHEN 'micro_drills' THEN 'micro_drill'
    WHEN 'conjugation_attempts' THEN 'conjugation' ELSE 'vocabulary_review' END;
  UPDATE review_items SET learning_state = 'needs_practice', success_count = 0,
    due_at = now(), eligible_after = now(), revision = revision + 1
    WHERE user_id = OLD.user_id AND id IN (SELECT item_id FROM review_evidence
      WHERE user_id = OLD.user_id AND attempt_type = source_type AND attempt_id = OLD.id::text);
  DELETE FROM review_evidence WHERE user_id = OLD.user_id AND attempt_type = source_type AND attempt_id = OLD.id::text;
  IF OLD.run_item_id IS NOT NULL THEN
    UPDATE practice_runs SET state = CASE WHEN state = 'cancelled' THEN state ELSE 'paused' END,
      completed_at = NULL, revision = revision + 1 WHERE id IN (SELECT run_id FROM practice_run_items WHERE id = OLD.run_item_id);
    UPDATE practice_run_items SET snapshot = NULL, draft = NULL, attempt_id = NULL,
      attempt_type = NULL, correct = NULL, submitted_at = NULL, revealed_at = NULL,
      state = 'blocked' WHERE id = OLD.run_item_id;
  END IF;
  RETURN OLD;
END $$;
--> statement-breakpoint
CREATE FUNCTION review_attempt_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.run_item_id IS NOT NULL AND NOT EXISTS
    (SELECT 1 FROM practice_run_items WHERE id = NEW.run_item_id AND user_id = NEW.user_id) THEN
    RAISE foreign_key_violation USING MESSAGE = 'Practice response owner mismatch';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
DO $$ DECLARE target text; BEGIN
  FOREACH target IN ARRAY ARRAY['tcf_question_attempts','quiz_question_attempts','micro_drills','conjugation_attempts','vocabulary_review_attempts'] LOOP
    EXECUTE format('CREATE TRIGGER review_attempt_deleted BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION review_attempt_deleted()',target);
    EXECUTE format('CREATE TRIGGER review_attempt_owner BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION review_attempt_owner()',target);
  END LOOP;
END $$;
