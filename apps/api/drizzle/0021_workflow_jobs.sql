CREATE TYPE "public"."workflow_job_status" AS ENUM('active', 'paused', 'completed', 'failed', 'removed');--> statement-breakpoint
CREATE TABLE "workflow_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "workflow_job_status" DEFAULT 'active' NOT NULL,
	"first_run_at" timestamp with time zone NOT NULL,
	"interval_seconds" integer,
	"repeat_count" integer,
	"completed_runs" integer DEFAULT 0 NOT NULL,
	"next_run_at" timestamp with time zone,
	"current_run_id" uuid,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_jobs_repeat_check" CHECK (repeat_count IS NULL OR repeat_count >= 1),
	CONSTRAINT "workflow_jobs_interval_check" CHECK ((repeat_count = 1 AND interval_seconds IS NULL) OR ((repeat_count IS NULL OR repeat_count > 1) AND interval_seconds IS NOT NULL AND interval_seconds BETWEEN 60 AND 31536000))
);
--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "job_id" uuid;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "scheduled_for" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workflow_jobs" ADD CONSTRAINT "workflow_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_jobs" ADD CONSTRAINT "workflow_jobs_workflow_owner_fk" FOREIGN KEY ("workflow_id","user_id") REFERENCES "public"."workflows"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workflow_jobs_due_idx" ON "workflow_jobs" USING btree ("status","next_run_at");--> statement-breakpoint
CREATE INDEX "workflow_jobs_owner_idx" ON "workflow_jobs" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_job_id_workflow_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."workflow_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "runs_job_scheduled_unique" ON "runs" USING btree ("job_id","scheduled_for") WHERE "runs"."job_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "runs_one_active_job_run_unique" ON "runs" USING btree ("job_id") WHERE "runs"."job_id" IS NOT NULL AND status IN ('queued', 'running', 'cancel_requested');
