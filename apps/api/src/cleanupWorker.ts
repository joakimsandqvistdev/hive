import { hostname } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { pool } from "./db.js";
import { removeArtifact } from "./artifactStore.js";
import { claimNextRunDeletion, retryRunDeletion } from "./runQueue.js";

const workerId = `${hostname()}:cleanup:${process.pid}`;

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
      if (await processNextRunDeletion()) continue;
    } catch (error) {
      console.error("Run cleanup worker failed", error instanceof Error ? error.name : "UnknownError");
    }
    await delay(1000);
  }
} finally {
  await pool.end();
}
