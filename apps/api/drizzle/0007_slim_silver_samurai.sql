CREATE TABLE "artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"run_node_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"media_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"checksum" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artifacts_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_run_owner_fk" FOREIGN KEY ("run_id","user_id") REFERENCES "public"."runs"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_run_node_fk" FOREIGN KEY ("run_id","run_node_id") REFERENCES "public"."run_nodes"("run_id","node_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artifacts_user_created_idx" ON "artifacts" USING btree ("user_id","created_at");