-- Explicitly authorized clean cutover: discard legacy workflow/run definitions only.
DELETE FROM "artifacts";--> statement-breakpoint
DELETE FROM "runs";--> statement-breakpoint
DELETE FROM "workflows";--> statement-breakpoint
DELETE FROM "agents";--> statement-breakpoint
ALTER TYPE "public"."agent_modality" RENAME TO "model_modality";--> statement-breakpoint
ALTER TABLE "run_nodes" RENAME COLUMN "agent_snapshot_json" TO "node_snapshot_json";--> statement-breakpoint
ALTER TABLE "workflow_nodes" DROP CONSTRAINT "workflow_nodes_agent_owner_fk";--> statement-breakpoint
DROP TABLE "agents";
--> statement-breakpoint
DROP INDEX "workflow_nodes_agent_id_idx";--> statement-breakpoint
ALTER TABLE "artifacts" ALTER COLUMN "run_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "artifacts" ALTER COLUMN "run_node_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN "data_type_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "run_nodes" ADD COLUMN "input_artifact_id" uuid;--> statement-breakpoint
ALTER TABLE "workflow_nodes" ADD COLUMN "kind" text NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_nodes" ADD COLUMN "label" text NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_nodes" ADD COLUMN "model_id" text;--> statement-breakpoint
ALTER TABLE "workflow_nodes" ADD COLUMN "data_type_id" text;--> statement-breakpoint
ALTER TABLE "workflow_nodes" ADD COLUMN "input_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_nodes" ADD COLUMN "artifact_id" uuid;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_data_type_id_data_types_id_fk" FOREIGN KEY ("data_type_id") REFERENCES "public"."data_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "artifacts_id_user_unique" ON "artifacts" USING btree ("id","user_id");--> statement-breakpoint
ALTER TABLE "run_nodes" ADD CONSTRAINT "run_nodes_input_artifact_owner_fk" FOREIGN KEY ("input_artifact_id","user_id") REFERENCES "public"."artifacts"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_nodes" ADD CONSTRAINT "workflow_nodes_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_nodes" ADD CONSTRAINT "workflow_nodes_data_type_id_data_types_id_fk" FOREIGN KEY ("data_type_id") REFERENCES "public"."data_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_nodes" ADD CONSTRAINT "workflow_nodes_artifact_owner_fk" FOREIGN KEY ("artifact_id","user_id") REFERENCES "public"."artifacts"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_nodes" DROP COLUMN "agent_id";--> statement-breakpoint
ALTER TABLE "run_nodes" DROP COLUMN "prompt";--> statement-breakpoint
ALTER TABLE "workflow_nodes" DROP COLUMN "agent_id";--> statement-breakpoint
ALTER TABLE "workflow_nodes" DROP COLUMN "prompt";--> statement-breakpoint
ALTER TABLE "workflow_nodes" ADD CONSTRAINT "workflow_nodes_kind_check" CHECK (kind in ('input', 'model'));
--> statement-breakpoint
INSERT INTO "data_types" ("id","label","description","media_type") VALUES ('audio','Audio','Uploaded or generated audio content.','audio/*') ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
UPDATE "model_data_types" SET "transport"='connection' WHERE "direction"='input';
--> statement-breakpoint
INSERT INTO "model_data_types" ("model_id","direction","port_key","data_type_id","label","transport","min_count","max_count","sort_order") VALUES
('wan2.1-t2v-1.3b','input','negative_prompt','text','Negative prompt','connection',0,1,1),
('cogvideox-2b','input','negative_prompt','text','Negative prompt','connection',0,1,1);
