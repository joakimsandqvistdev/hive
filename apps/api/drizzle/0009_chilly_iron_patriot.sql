ALTER TABLE "agents" ADD COLUMN "parameters_json" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_nodes" ADD COLUMN "parameters_json" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
UPDATE "agents"
SET "parameters_json" = '{"resolution":"512x512","seed":42,"randomizeSeed":true,"steps":9}'::jsonb
WHERE "modality" = 'image' AND "parameters_json" = '{}'::jsonb;
--> statement-breakpoint
UPDATE "workflow_nodes" AS node
SET "parameters_json" = agent."parameters_json"
FROM "agents" AS agent
WHERE node."agent_id" = agent."id" AND node."parameters_json" = '{}'::jsonb AND agent."modality" = 'image';
