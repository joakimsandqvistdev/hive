CREATE TABLE "artifact_cleanup_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"display_name" text NOT NULL,
	"byte_size" integer NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"result_code" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "artifact_cleanup_items_status_check" CHECK ("artifact_cleanup_items"."status" IN ('queued', 'deleted', 'skipped', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "artifact_cleanup_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"scopes" text[] NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"estimated_bytes" bigint DEFAULT 0 NOT NULL,
	"claimed_by" text,
	"lease_expires_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "artifact_cleanup_jobs_status_check" CHECK ("artifact_cleanup_jobs"."status" IN ('queued', 'running', 'completed', 'completed_with_skips', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "artifact_cleanup_items" ADD CONSTRAINT "artifact_cleanup_items_job_id_artifact_cleanup_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."artifact_cleanup_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_cleanup_jobs" ADD CONSTRAINT "artifact_cleanup_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_cleanup_items_job_artifact_unique" ON "artifact_cleanup_items" USING btree ("job_id","artifact_id");--> statement-breakpoint
CREATE INDEX "artifact_cleanup_items_job_status_idx" ON "artifact_cleanup_items" USING btree ("job_id","status");--> statement-breakpoint
CREATE INDEX "artifact_cleanup_jobs_user_created_idx" ON "artifact_cleanup_jobs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "artifact_cleanup_jobs_queue_idx" ON "artifact_cleanup_jobs" USING btree ("status","next_attempt_at","lease_expires_at");