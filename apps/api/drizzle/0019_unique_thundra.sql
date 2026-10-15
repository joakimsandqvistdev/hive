CREATE TABLE "run_deletions" (
	"run_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"storage_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"claimed_by" text,
	"lease_expires_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "run_deletions" ADD CONSTRAINT "run_deletions_run_owner_fk" FOREIGN KEY ("run_id","user_id") REFERENCES "public"."runs"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "run_deletions_queue_idx" ON "run_deletions" USING btree ("next_attempt_at","lease_expires_at");