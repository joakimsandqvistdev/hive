import { hostname } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { pool } from "./db.js";
import { removeArtifact } from "./artifactStore.js";
import { canCleanupArtifact } from "./artifactCleanupPolicy.js";
import { claimNextRunDeletion, retryRunDeletion } from "./runQueue.js";

const workerId = `${hostname()}:cleanup:${process.pid}`;

async function processNextArtifactCleanup(): Promise<boolean> {
  const claim = await pool.query<{ id: string; user_id: string }>(`WITH candidate AS (
    SELECT id FROM artifact_cleanup_jobs WHERE status IN ('queued','running') AND next_attempt_at<=now()
      AND (claimed_by IS NULL OR lease_expires_at<now()) ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE artifact_cleanup_jobs j SET status='running',claimed_by=$1,attempt_count=j.attempt_count+1,lease_expires_at=now()+interval '2 minutes',last_error=NULL
      FROM candidate WHERE j.id=candidate.id RETURNING j.id,j.user_id`, [workerId]);
  const job = claim.rows[0];
  if (!job) return false;
  const client = await pool.connect();
  try {
    const pending = await client.query<{ id: string; artifact_id: string; storage_key: string; status: string }>("SELECT id,artifact_id,storage_key,status FROM artifact_cleanup_items WHERE job_id=$1 AND status IN ('queued','failed') ORDER BY created_at", [job.id]);
    for (const item of pending.rows) {
      let allowed = false;
      await client.query("BEGIN");
      try {
        const result = await client.query<{ id: string | null; run_id: string | null; source_workflow_id: string | null; saved_to_library: boolean | null; created_at: Date | null; run_status: string | null; scope: string[] }>(`SELECT a.id,a.run_id,a.source_workflow_id,a.saved_to_library,a.created_at,j.scopes AS scope,
          (SELECT r.status FROM runs r WHERE r.id=a.run_id AND r.user_id=j.user_id) run_status
          FROM artifact_cleanup_items i JOIN artifact_cleanup_jobs j ON j.id=i.job_id LEFT JOIN artifacts a ON a.id=i.artifact_id AND a.user_id=j.user_id
          WHERE i.id=$1 AND j.id=$2 AND j.claimed_by=$3 FOR UPDATE OF i,j`, [item.id,job.id,workerId]);
        const current = result.rows[0];
        if (!current) { await client.query("ROLLBACK"); continue; }
        const ref = await client.query(`SELECT
          EXISTS(SELECT 1 FROM workflow_nodes n WHERE n.artifact_id=$1 AND n.user_id=$2) OR
          EXISTS(SELECT 1 FROM workflow_triggers t, LATERAL jsonb_array_elements(t.input_mappings) mapping WHERE t.user_id=$2 AND mapping->>'artifactId'=$1::text) OR
          EXISTS(SELECT 1 FROM run_nodes n WHERE n.input_artifact_id=$1 AND n.user_id=$2) OR
          EXISTS(SELECT 1 FROM instagram_accounts i WHERE i.profile_image_artifact_id=$1 AND i.user_id=$2) OR
          EXISTS(SELECT 1 FROM instagram_publications p WHERE p.user_id=$2 AND (p.artifact_id=$1 OR EXISTS(SELECT 1 FROM instagram_publication_media pm WHERE pm.publication_id=p.id AND pm.artifact_id=$1))) AS referenced,
          EXISTS(SELECT 1 FROM runs r WHERE r.id=$3 AND r.user_id=$2 AND r.status IN ('queued','running','awaiting_publish','cancel_requested')) AS active`, [item.artifact_id,job.user_id,current.run_id]);
        const candidateAllowed = current.id && canCleanupArtifact({
          runId: current.run_id,
          sourceWorkflowId: current.source_workflow_id,
          savedToLibrary: current.saved_to_library ?? false,
          createdAt: current.created_at ?? new Date(0),
          runStatus: current.run_status,
          protected: Boolean(ref.rows[0]?.referenced || ref.rows[0]?.active),
        }, current.scope.filter((scope): scope is "old-run-outputs" | "orphaned-workflow-uploads" => scope === "old-run-outputs" || scope === "orphaned-workflow-uploads"));
        allowed = !current.id || Boolean(candidateAllowed);
        if (current.id && allowed) {
          await client.query("UPDATE run_nodes SET output_json=NULL WHERE user_id=$1 AND run_id=$2 AND output_json->>'artifactId'=$3", [job.user_id,current.run_id,item.artifact_id]);
          await client.query("DELETE FROM artifacts WHERE id=$1 AND user_id=$2", [item.artifact_id,job.user_id]);
        }
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
      if (allowed) {
        try {
          await removeArtifact(item.storage_key);
          await pool.query("UPDATE artifact_cleanup_items SET status='deleted',result_code='deleted',attempt_count=attempt_count+1,finished_at=now(),last_error=NULL WHERE id=$1", [item.id]);
        } catch { await pool.query("UPDATE artifact_cleanup_items SET status='failed',result_code='file_removal_failed',attempt_count=attempt_count+1,last_error='file_removal_failed',finished_at=now() WHERE id=$1", [item.id]); }
      } else {
        await pool.query("UPDATE artifact_cleanup_items SET status='skipped',result_code='no_longer_eligible',attempt_count=attempt_count+1,finished_at=now() WHERE id=$1", [item.id]);
      }
    }
    await pool.query(`UPDATE artifact_cleanup_jobs j SET status=CASE WHEN EXISTS(SELECT 1 FROM artifact_cleanup_items i WHERE i.job_id=j.id AND i.status='failed') THEN 'completed_with_skips' WHEN EXISTS(SELECT 1 FROM artifact_cleanup_items i WHERE i.job_id=j.id AND i.status='skipped') THEN 'completed_with_skips' ELSE 'completed' END,claimed_by=NULL,lease_expires_at=NULL,finished_at=now() WHERE id=$1 AND claimed_by=$2 AND NOT EXISTS(SELECT 1 FROM artifact_cleanup_items i WHERE i.job_id=j.id AND i.status='queued')`, [job.id,workerId]);
  } catch (error) {
    await pool.query("UPDATE artifact_cleanup_jobs SET status='queued',claimed_by=NULL,lease_expires_at=NULL,next_attempt_at=now()+interval '15 seconds',last_error='cleanup_worker_failed' WHERE id=$1 AND claimed_by=$2", [job.id,workerId]);
    console.error("Media cleanup failed", error instanceof Error ? error.name : "UnknownError");
  } finally { client.release(); }
  return true;
}

async function processNextRunDeletion(): Promise<boolean> {
  const deletion = await claimNextRunDeletion(workerId, 120);
  if (!deletion) return false;
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query("BEGIN");
    transactionOpen = true;
    const outputArtifacts = await client.query<{ id: string; storage_key: string; saved_to_library: boolean }>(
      "SELECT id, storage_key, saved_to_library FROM artifacts WHERE run_id=$1 AND user_id=$2 FOR UPDATE",
      [deletion.run_id, deletion.user_id],
    );
    const savedOutputIds = outputArtifacts.rows.filter((artifact) => artifact.saved_to_library).map((artifact) => artifact.id);
    const outputStorageKeys = outputArtifacts.rows.filter((artifact) => !artifact.saved_to_library).map((artifact) => artifact.storage_key);
    if (savedOutputIds.length) {
      await client.query(
        "UPDATE artifacts SET run_id=NULL, run_node_id=NULL, source_workflow_id=NULL WHERE id=ANY($1::uuid[]) AND user_id=$2",
        [savedOutputIds, deletion.user_id],
      );
    }
    const uploads = await client.query<{ id: string; storage_key: string }>(
      "SELECT artifact.id, artifact.storage_key FROM artifacts AS artifact " +
      "WHERE artifact.id = ANY($1::uuid[]) AND artifact.user_id=$2 AND artifact.run_id IS NULL " +
      "AND NOT EXISTS (SELECT 1 FROM workflow_nodes AS node WHERE node.artifact_id=artifact.id) " +
      "AND NOT EXISTS (SELECT 1 FROM run_nodes AS node WHERE node.input_artifact_id=artifact.id AND node.run_id<>$3) " +
      "FOR UPDATE OF artifact",
      [deletion.candidate_upload_ids, deletion.user_id, deletion.run_id],
    );
    for (const storageKey of [...outputStorageKeys, ...uploads.rows.map((upload) => upload.storage_key)]) await removeArtifact(storageKey);
    await client.query("DELETE FROM instagram_publications WHERE run_id=$1 AND user_id=$2", [deletion.run_id, deletion.user_id]);
    await client.query("DELETE FROM runs WHERE id=$1 AND user_id=$2", [deletion.run_id, deletion.user_id]);
    if (uploads.rows.length) await client.query("DELETE FROM artifacts WHERE id=ANY($1::uuid[]) AND user_id=$2", [uploads.rows.map((upload) => upload.id), deletion.user_id]);
    await client.query("COMMIT");
    transactionOpen = false;
  } catch (error) {
    if (transactionOpen) await client.query("ROLLBACK").catch(() => undefined);
    console.error("Run artifact cleanup failed", error instanceof Error ? error.name : "UnknownError");
    await retryRunDeletion(deletion.run_id, workerId);
  } finally {
    client.release();
  }
  return true;
}

let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });
console.log(`Hive run cleanup worker ${workerId} polling PostgreSQL.`);
try {
  while (!stopping) {
    try {
      if (await processNextArtifactCleanup()) continue;
      if (await processNextRunDeletion()) continue;
    } catch (error) {
      console.error("Run cleanup worker failed", error instanceof Error ? error.name : "UnknownError");
    }
    await delay(1000);
  }
} finally {
  await pool.end();
}
