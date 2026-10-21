-- Custom SQL migration file, put your code below! --
CREATE OR REPLACE FUNCTION "notify_run_status_change"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	notification_type text;
	workflow_name text;
	notification_message text;
BEGIN
	IF NEW.status = 'succeeded' AND OLD.status = 'awaiting_publish'
		AND current_setting('hive.suppress_run_success_notification', true) = 'on' THEN
		RETURN NEW;
	END IF;

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
