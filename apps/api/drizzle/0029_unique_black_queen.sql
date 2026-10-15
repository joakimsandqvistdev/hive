ALTER TABLE "artifacts" ADD COLUMN "saved_to_library" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN "source_workflow_id" uuid;