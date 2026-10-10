ALTER TABLE "workflow_version_agents" DROP CONSTRAINT "workflow_version_agents_workflow_version_id_workflow_versions_id_fk";
--> statement-breakpoint
ALTER TABLE "workflow_version_agents" DROP CONSTRAINT "workflow_version_agents_agent_id_agents_id_fk";
--> statement-breakpoint
ALTER TABLE "workflow_versions" DROP CONSTRAINT "workflow_versions_workflow_id_workflows_id_fk";
--> statement-breakpoint
ALTER TABLE "workflow_version_agents" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_versions" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "agents_id_user_unique" ON "agents" USING btree ("id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_versions_id_user_unique" ON "workflow_versions" USING btree ("id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflows_id_user_unique" ON "workflows" USING btree ("id","user_id");--> statement-breakpoint
ALTER TABLE "workflow_version_agents" ADD CONSTRAINT "workflow_version_agents_version_owner_fk" FOREIGN KEY ("workflow_version_id","user_id") REFERENCES "public"."workflow_versions"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_version_agents" ADD CONSTRAINT "workflow_version_agents_agent_owner_fk" FOREIGN KEY ("agent_id","user_id") REFERENCES "public"."agents"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_workflow_owner_fk" FOREIGN KEY ("workflow_id","user_id") REFERENCES "public"."workflows"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
