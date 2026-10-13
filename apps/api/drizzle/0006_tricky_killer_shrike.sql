CREATE TYPE "public"."run_node_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancel_requested', 'cancelled');--> statement-breakpoint
CREATE TABLE "run_nodes" (
	"run_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"agent_id" uuid NOT NULL,
	"status" "run_node_status" DEFAULT 'queued' NOT NULL,
	"agent_snapshot_json" jsonb NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"resolved_input_json" jsonb,
	"output_json" jsonb,
	"error_code" text,
	"error_summary" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "run_nodes_pk" PRIMARY KEY("run_id","node_id")
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workflow_id" uuid,
	"status" "run_status" DEFAULT 'queued' NOT NULL,
	"input_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"workflow_snapshot_json" jsonb NOT NULL,
	"error_summary" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"claimed_by" text,
	"lease_expires_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"cancel_requested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "runs_id_user_unique" ON "runs" USING btree ("id","user_id");--> statement-breakpoint
ALTER TABLE "run_nodes" ADD CONSTRAINT "run_nodes_run_owner_fk" FOREIGN KEY ("run_id","user_id") REFERENCES "public"."runs"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "run_nodes_user_run_idx" ON "run_nodes" USING btree ("user_id","run_id");--> statement-breakpoint
CREATE INDEX "runs_user_created_idx" ON "runs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "runs_queue_idx" ON "runs" USING btree ("status","created_at","lease_expires_at");--> statement-breakpoint
