CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"type" text NOT NULL,
	"workflow_name" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "notifications_type_check" CHECK ("notifications"."type" in ('run_failed', 'run_succeeded', 'run_awaiting_publish'))
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_run_owner_fk" FOREIGN KEY ("run_id","user_id") REFERENCES "public"."runs"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_run_type_unique" ON "notifications" USING btree ("run_id","type");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE FUNCTION "notify_run_status_change"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	notification_type text;
	workflow_name text;
	notification_message text;
BEGIN
	IF NEW.status = 'failed' THEN
		notification_type := 'run_failed';
		workflow_name := COALESCE(NEW.workflow_snapshot_json->>'name', 'Workflow');
		notification_message := '“' || workflow_name || '” failed.';
		IF NULLIF(NEW.error_summary, '') IS NOT NULL THEN
			notification_message := notification_message || ' ' || NEW.error_summary;
		END IF;
	ELSIF NEW.status = 'succeeded' THEN
		notification_type := 'run_succeeded';
		workflow_name := COALESCE(NEW.workflow_snapshot_json->>'name', 'Workflow');
		notification_message := '“' || workflow_name || '” completed successfully.';
	ELSIF NEW.status = 'awaiting_publish' THEN
		notification_type := 'run_awaiting_publish';
		workflow_name := COALESCE(NEW.workflow_snapshot_json->>'name', 'Workflow');
		notification_message := '“' || workflow_name || '” finished and is waiting for publishing.';
	ELSE
		RETURN NEW;
	END IF;

	INSERT INTO "notifications" ("user_id", "run_id", "type", "workflow_name", "message")
	VALUES (NEW.user_id, NEW.id, notification_type, workflow_name, notification_message)
	ON CONFLICT ("run_id", "type") DO NOTHING;
	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "runs_notify_status_change"
AFTER UPDATE OF "status" ON "runs"
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION "notify_run_status_change"();
