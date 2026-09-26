-- Referenced owner/id keys must exist before their composite foreign keys.
ALTER TABLE "errors" ADD CONSTRAINT "errors_user_id_id_key" UNIQUE("user_id","id");
--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_user_id_id_key" UNIQUE("user_id","id");
--> statement-breakpoint
ALTER TABLE "quiz_sets" ADD CONSTRAINT "quiz_sets_user_id_id_key" UNIQUE("user_id","id");
--> statement-breakpoint
ALTER TABLE "tcf_attempts" ADD CONSTRAINT "tcf_attempts_user_id_id_key" UNIQUE("user_id","id");
--> statement-breakpoint
ALTER TABLE "vocabulary_gaps" ADD CONSTRAINT "vocab_gaps_user_id_id_key" UNIQUE("user_id","id");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "micro_drills" ADD CONSTRAINT "micro_drills_user_error_fk" FOREIGN KEY ("user_id","error_id") REFERENCES "public"."errors"("user_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_user_set_fk" FOREIGN KEY ("user_id","set_id") REFERENCES "public"."quiz_sets"("user_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quiz_question_attempts" ADD CONSTRAINT "quiz_question_attempts_user_attempt_fk" FOREIGN KEY ("user_id","attempt_id") REFERENCES "public"."quiz_attempts"("user_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tcf_question_attempts" ADD CONSTRAINT "tcf_qa_user_exam_fk" FOREIGN KEY ("user_id","exam_attempt_id") REFERENCES "public"."tcf_attempts"("user_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vocabulary_review_attempts" ADD CONSTRAINT "vocab_review_attempts_user_gap_fk" FOREIGN KEY ("user_id","gap_id") REFERENCES "public"."vocabulary_gaps"("user_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
