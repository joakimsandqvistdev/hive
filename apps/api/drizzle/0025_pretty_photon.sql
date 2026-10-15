CREATE TABLE "instagram_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"instagram_user_id" text NOT NULL,
	"username" text NOT NULL,
	"encrypted_access_token" text NOT NULL,
	"token_expires_at" timestamp with time zone,
	"bio_draft" text,
	"profile_image_artifact_id" uuid,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instagram_accounts_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "instagram_accounts_instagram_user_id_unique" UNIQUE("instagram_user_id")
);
--> statement-breakpoint
CREATE TABLE "instagram_oauth_states" (
	"state_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instagram_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"media_kind" text NOT NULL,
	"mode" text NOT NULL,
	"share_to_feed" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"caption" text NOT NULL,
	"container_id" text,
	"instagram_media_id" text,
	"error_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "workflow_nodes" DROP CONSTRAINT "workflow_nodes_kind_check";--> statement-breakpoint
DROP INDEX "runs_one_active_job_run_unique";--> statement-breakpoint
ALTER TABLE "runs" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "runs" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "runs" ALTER COLUMN "status" SET DEFAULT 'queued';--> statement-breakpoint
ALTER TABLE "instagram_accounts" ADD CONSTRAINT "instagram_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_oauth_states" ADD CONSTRAINT "instagram_oauth_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_publications" ADD CONSTRAINT "instagram_publications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_publications" ADD CONSTRAINT "instagram_publications_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_publications" ADD CONSTRAINT "instagram_publications_account_id_instagram_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."instagram_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_publications" ADD CONSTRAINT "instagram_publications_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "instagram_publications_run_node_unique" ON "instagram_publications" USING btree ("run_id","node_id");--> statement-breakpoint
CREATE INDEX "instagram_publications_queue_idx" ON "instagram_publications" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "runs_one_active_job_run_unique" ON "runs" USING btree ("job_id") WHERE "runs"."job_id" IS NOT NULL AND status IN ('queued', 'running', 'awaiting_publish', 'cancel_requested');--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_status_check" CHECK ("runs"."status" IN ('queued', 'running', 'awaiting_publish', 'succeeded', 'failed', 'cancel_requested', 'cancelled'));--> statement-breakpoint
ALTER TABLE "workflow_nodes" ADD CONSTRAINT "workflow_nodes_kind_check" CHECK (kind in ('input', 'model', 'processing', 'publishing'));--> statement-breakpoint
DROP TYPE "public"."run_status";
