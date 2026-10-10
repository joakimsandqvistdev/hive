CREATE TABLE "workflow_edges" (
	"workflow_id" uuid NOT NULL,
	"edge_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"source_node_id" text NOT NULL,
	"target_node_id" text NOT NULL,
	CONSTRAINT "workflow_edges_pk" PRIMARY KEY("workflow_id","edge_id")
);
--> statement-breakpoint
CREATE TABLE "workflow_nodes" (
	"workflow_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"position_x" real DEFAULT 0 NOT NULL,
	"position_y" real DEFAULT 0 NOT NULL,
	CONSTRAINT "workflow_nodes_pk" PRIMARY KEY("workflow_id","node_id")
);
--> statement-breakpoint
WITH latest_versions AS (
	SELECT DISTINCT ON (workflow_id) id, workflow_id, user_id
	FROM workflow_versions
	ORDER BY workflow_id, version DESC
)
INSERT INTO "workflow_nodes" ("workflow_id", "node_id", "user_id", "agent_id", "instructions", "position_x", "position_y")
SELECT latest.workflow_id, node.node_id, latest.user_id, node.agent_id, node.instructions, node.position_x, node.position_y
FROM latest_versions AS latest
JOIN workflow_version_nodes AS node ON node.workflow_version_id = latest.id;
--> statement-breakpoint
WITH latest_versions AS (
	SELECT DISTINCT ON (workflow_id) id, workflow_id, user_id
	FROM workflow_versions
	ORDER BY workflow_id, version DESC
)
INSERT INTO "workflow_edges" ("workflow_id", "edge_id", "user_id", "source_node_id", "target_node_id")
SELECT latest.workflow_id, edge.edge_id, latest.user_id, edge.source_node_id, edge.target_node_id
FROM latest_versions AS latest
JOIN workflow_version_edges AS edge ON edge.workflow_version_id = latest.id;
--> statement-breakpoint
DROP TABLE "workflow_version_agents" CASCADE;--> statement-breakpoint
DROP TABLE "workflow_version_edges" CASCADE;--> statement-breakpoint
DROP TABLE "workflow_version_nodes" CASCADE;--> statement-breakpoint
DROP TABLE "workflow_versions" CASCADE;--> statement-breakpoint
ALTER TABLE "workflow_edges" ADD CONSTRAINT "workflow_edges_workflow_owner_fk" FOREIGN KEY ("workflow_id","user_id") REFERENCES "public"."workflows"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_edges" ADD CONSTRAINT "workflow_edges_source_node_fk" FOREIGN KEY ("workflow_id","source_node_id") REFERENCES "public"."workflow_nodes"("workflow_id","node_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_edges" ADD CONSTRAINT "workflow_edges_target_node_fk" FOREIGN KEY ("workflow_id","target_node_id") REFERENCES "public"."workflow_nodes"("workflow_id","node_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_nodes" ADD CONSTRAINT "workflow_nodes_workflow_owner_fk" FOREIGN KEY ("workflow_id","user_id") REFERENCES "public"."workflows"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_nodes" ADD CONSTRAINT "workflow_nodes_agent_owner_fk" FOREIGN KEY ("agent_id","user_id") REFERENCES "public"."agents"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workflow_nodes_agent_id_idx" ON "workflow_nodes" USING btree ("agent_id");--> statement-breakpoint
ALTER TABLE "workflows" DROP COLUMN "current_version";
