CREATE TYPE "public"."tcf_note_kind" AS ENUM('vocabulary', 'grammar', 'hearing', 'comprehension');--> statement-breakpoint
CREATE TYPE "public"."tcf_note_status" AS ENUM('active', 'mastered', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."tcf_tutor_role" AS ENUM('user', 'assistant');--> statement-breakpoint
ALTER TYPE "public"."vocab_gap_source" ADD VALUE 'tutor';--> statement-breakpoint
CREATE TABLE "tcf_note_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"generated" jsonb,
	"chosen" integer,
	"correct" boolean NOT NULL,
	"box_before" integer NOT NULL,
	"box_after" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tcf_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "tcf_note_kind" NOT NULL,
	"lemma" text,
	"by_ear" boolean DEFAULT false NOT NULL,
	"vocabulary_gap_id" uuid,
	"comprehension_tag" text,
	"point" text NOT NULL,
	"front" text NOT NULL,
	"back" text NOT NULL,
	"source_question_id" uuid,
	"source_locator" text,
	"source_message_id" uuid,
	"status" "tcf_note_status" DEFAULT 'active' NOT NULL,
	"box" integer DEFAULT 1 NOT NULL,
	"due_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tcf_tutor_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"role" "tcf_tutor_role" NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tcf_note_reviews" ADD CONSTRAINT "tcf_note_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tcf_note_reviews" ADD CONSTRAINT "tcf_note_reviews_note_id_tcf_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."tcf_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tcf_notes" ADD CONSTRAINT "tcf_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tcf_notes" ADD CONSTRAINT "tcf_notes_vocabulary_gap_id_vocabulary_gaps_id_fk" FOREIGN KEY ("vocabulary_gap_id") REFERENCES "public"."vocabulary_gaps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tcf_notes" ADD CONSTRAINT "tcf_notes_source_question_id_tcf_questions_id_fk" FOREIGN KEY ("source_question_id") REFERENCES "public"."tcf_questions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tcf_notes" ADD CONSTRAINT "tcf_notes_source_message_id_tcf_tutor_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."tcf_tutor_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tcf_tutor_messages" ADD CONSTRAINT "tcf_tutor_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tcf_tutor_messages" ADD CONSTRAINT "tcf_tutor_messages_question_id_tcf_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."tcf_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tcf_note_reviews_user_time" ON "tcf_note_reviews" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "tcf_notes_user_status_due" ON "tcf_notes" USING btree ("user_id","status","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tcf_notes_user_source_message" ON "tcf_notes" USING btree ("user_id","source_message_id");--> statement-breakpoint
CREATE INDEX "tcf_tutor_messages_user_question_time" ON "tcf_tutor_messages" USING btree ("user_id","question_id","created_at");