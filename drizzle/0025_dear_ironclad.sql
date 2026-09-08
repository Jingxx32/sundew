CREATE TABLE IF NOT EXISTS "user_vocabulary_aliases" (
	"user_id" uuid NOT NULL,
	"surface" text NOT NULL,
	"lemma" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_vocabulary_aliases_user_id_surface_pk" PRIMARY KEY("user_id","surface")
);
--> statement-breakpoint
INSERT INTO "user_vocabulary_aliases" ("user_id", "surface", "lemma", "created_at")
SELECT '00000000-0000-4000-8000-000000000001', "surface", "lemma", "created_at"
FROM "vocabulary_aliases"
ON CONFLICT DO NOTHING;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_vocabulary_aliases" ADD CONSTRAINT "user_vocabulary_aliases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_vocabulary_aliases" ADD CONSTRAINT "user_vocab_alias_user_lemma_fk" FOREIGN KEY ("user_id","lemma") REFERENCES "public"."user_vocabulary"("user_id","lemma") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_vocab_alias_user_lemma_idx" ON "user_vocabulary_aliases" USING btree ("user_id","lemma");
