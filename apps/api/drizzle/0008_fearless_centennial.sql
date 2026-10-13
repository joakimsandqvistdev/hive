ALTER TABLE "agents" RENAME COLUMN "description" TO "prompt";--> statement-breakpoint
ALTER TABLE "run_nodes" RENAME COLUMN "instructions" TO "prompt";--> statement-breakpoint
ALTER TABLE "workflow_nodes" RENAME COLUMN "instructions" TO "prompt";
--> statement-breakpoint
UPDATE "workflow_nodes" AS node
SET "prompt" = agent."prompt"
FROM "agents" AS agent
WHERE node."agent_id" = agent."id" AND node."prompt" = '';
