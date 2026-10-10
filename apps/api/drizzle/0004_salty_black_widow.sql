CREATE TABLE "workflow_version_edges" (
	"workflow_version_id" uuid NOT NULL,
	"edge_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"source_node_id" text NOT NULL,
	"target_node_id" text NOT NULL,
	CONSTRAINT "workflow_version_edges_pk" PRIMARY KEY("workflow_version_id","edge_id")
);
--> statement-breakpoint
CREATE TABLE "workflow_version_nodes" (
	"workflow_version_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"position_x" real DEFAULT 0 NOT NULL,
	"position_y" real DEFAULT 0 NOT NULL,
	CONSTRAINT "workflow_version_nodes_pk" PRIMARY KEY("workflow_version_id","node_id")
);
--> statement-breakpoint
ALTER TABLE "workflow_version_edges" ADD CONSTRAINT "workflow_version_edges_version_owner_fk" FOREIGN KEY ("workflow_version_id","user_id") REFERENCES "public"."workflow_versions"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_version_edges" ADD CONSTRAINT "workflow_version_edges_source_node_fk" FOREIGN KEY ("workflow_version_id","source_node_id") REFERENCES "public"."workflow_version_nodes"("workflow_version_id","node_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_version_edges" ADD CONSTRAINT "workflow_version_edges_target_node_fk" FOREIGN KEY ("workflow_version_id","target_node_id") REFERENCES "public"."workflow_version_nodes"("workflow_version_id","node_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_version_nodes" ADD CONSTRAINT "workflow_version_nodes_version_owner_fk" FOREIGN KEY ("workflow_version_id","user_id") REFERENCES "public"."workflow_versions"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_version_nodes" ADD CONSTRAINT "workflow_version_nodes_agent_owner_fk" FOREIGN KEY ("agent_id","user_id") REFERENCES "public"."agents"("id","user_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "workflow_version_nodes" ("workflow_version_id", "node_id", "user_id", "agent_id", "instructions", "position_x", "position_y")
SELECT version."id", node.value->>'id', version."user_id", (node.value->>'agentId')::uuid,
	COALESCE(node.value->>'instructions', ''),
	COALESCE(NULLIF(node.value#>>'{position,x}', '')::real, 0),
	COALESCE(NULLIF(node.value#>>'{position,y}', '')::real, 0)
FROM "workflow_versions" AS version
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(version."definition_json"->'nodes') = 'array' THEN version."definition_json"->'nodes' ELSE '[]'::jsonb END) AS node(value)
WHERE node.value->>'id' IS NOT NULL AND node.value->>'agentId' IS NOT NULL;
--> statement-breakpoint
INSERT INTO "workflow_version_edges" ("workflow_version_id", "edge_id", "user_id", "source_node_id", "target_node_id")
SELECT version."id", edge.value->>'id', version."user_id", edge.value->>'source', edge.value->>'target'
FROM "workflow_versions" AS version
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(version."definition_json"->'edges') = 'array' THEN version."definition_json"->'edges' ELSE '[]'::jsonb END) AS edge(value)
WHERE edge.value->>'id' IS NOT NULL
	AND EXISTS (SELECT 1 FROM "workflow_version_nodes" node WHERE node."workflow_version_id" = version."id" AND node."node_id" = edge.value->>'source')
	AND EXISTS (SELECT 1 FROM "workflow_version_nodes" node WHERE node."workflow_version_id" = version."id" AND node."node_id" = edge.value->>'target');
