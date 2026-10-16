ALTER TABLE "workflow_nodes" DROP CONSTRAINT "workflow_nodes_kind_check";--> statement-breakpoint
ALTER TABLE "workflows" ADD COLUMN "is_custom_node" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workflows" ADD COLUMN "needs_attention" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_nodes" ADD CONSTRAINT "workflow_nodes_kind_check" CHECK (kind in ('input', 'model', 'processing', 'publishing', 'custom'));