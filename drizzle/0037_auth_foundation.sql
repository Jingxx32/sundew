-- Auth foundation (Better Auth). Hand-edited to be IDEMPOTENT: the shared database
-- is still at 0025 (0026–0036 deferred), so this file is applied out of band by
-- scripts/apply-auth-migration.mts and NOT recorded in drizzle.__drizzle_migrations.
-- It runs again, in order, when the deferred chain is applied. Keep every statement re-runnable.
ALTER TABLE "users" ALTER COLUMN "auth_issuer" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "auth_subject" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "image" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "banned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ban_reason" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ban_expires" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "users" GROUP BY lower("email") HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'auth foundation: duplicate user emails must be resolved first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_email_unique') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE ("email");
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"impersonated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_key" UNIQUE("token")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_provider_account_key" UNIQUE("provider_id","account_id")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rate_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limits_key_key" UNIQUE("key")
);--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_user_id_users_id_fk') THEN
    ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_impersonated_by_users_id_fk') THEN
    ALTER TABLE "sessions" ADD CONSTRAINT "sessions_impersonated_by_users_id_fk" FOREIGN KEY ("impersonated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_user_id_users_id_fk') THEN
    ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
-- Data: only ever raises flags, so a re-run cannot undo a later admin action.
UPDATE "users" SET "email_verified" = true WHERE "auth_issuer" IS NOT NULL AND "email_verified" = false;--> statement-breakpoint
UPDATE "users" SET "banned" = true WHERE "status" = 'disabled' AND "banned" = false;--> statement-breakpoint
-- The owner's Easy Auth subject is their Google `sub`; Better Auth finds Google users by it.
INSERT INTO "accounts" ("user_id", "account_id", "provider_id")
SELECT "id", "auth_subject", 'google' FROM "users"
WHERE "id" = '00000000-0000-4000-8000-000000000001' AND "auth_issuer" = 'google' AND "auth_subject" IS NOT NULL
ON CONFLICT ("provider_id", "account_id") DO NOTHING;--> statement-breakpoint
-- Synthetic local identities are obsolete. A row that still owns data is kept.
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT "id" FROM "users" WHERE "auth_issuer" = 'development' LOOP
    BEGIN
      DELETE FROM "users" WHERE "id" = r."id";
    EXCEPTION WHEN foreign_key_violation THEN
      RAISE NOTICE 'auth foundation: kept development user % (owns data)', r."id";
    END;
  END LOOP;
END $$;
