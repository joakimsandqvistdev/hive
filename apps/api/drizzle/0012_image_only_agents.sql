DO $$
DECLARE
  has_workflow_node_reference boolean := false;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM agents a
    JOIN workflow_nodes n ON n.agent_id = a.id
    WHERE a.modality::text <> 'image'
  ) THEN
    RAISE EXCEPTION 'Cannot remove unsupported agent types while workflows still reference them. Remove those agent nodes from workflows, then retry the migration.';
  END IF;

  IF to_regclass('public.workflow_version_agents') IS NOT NULL THEN
    EXECUTE $query$
      SELECT EXISTS (
        SELECT 1
        FROM workflow_version_agents wva
        JOIN agents a ON a.id = wva.agent_id
        WHERE a.modality::text <> 'image'
      )
    $query$ INTO has_workflow_node_reference;
    IF has_workflow_node_reference THEN
      RAISE EXCEPTION 'Cannot remove unsupported agent types while saved workflow versions still reference them. Remove those agent references, then retry the migration.';
    END IF;
  END IF;
END $$;
--> statement-breakpoint
DELETE FROM agents WHERE modality::text <> 'image';
--> statement-breakpoint
CREATE TYPE "public"."agent_modality_new" AS ENUM('image');
--> statement-breakpoint
ALTER TABLE "agents" ALTER COLUMN "modality" TYPE "public"."agent_modality_new" USING "modality"::text::"public"."agent_modality_new";
--> statement-breakpoint
DROP TYPE "public"."agent_modality";
--> statement-breakpoint
ALTER TYPE "public"."agent_modality_new" RENAME TO "agent_modality";
