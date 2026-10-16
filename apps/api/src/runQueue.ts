import { pool } from "./db.js";

export type ClaimedRun = {
  id: string;
  user_id: string;
  workflow_id: string | null;
  input_json: Record<string, unknown>;
  workflow_snapshot_json: Record<string, unknown>;
  attempt_count: number;
};

export type ClaimedRunDeletion = {
  run_id: string;
  user_id: string;
  candidate_upload_ids: string[];
  attempt_count: number;
};

/** Claim one run-artifact cleanup task with a lease so crashes can be retried safely. */
export async function claimNextRunDeletion(workerId: string, leaseSeconds = 120): Promise<ClaimedRunDeletion | null> {
  const result = await pool.query<ClaimedRunDeletion>(`
    WITH candidate AS (
      SELECT run_id FROM run_deletions
      WHERE next_attempt_at <= now() AND (claimed_by IS NULL OR lease_expires_at < now())
      ORDER BY created_at, run_id
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE run_deletions AS deletion
    SET claimed_by=$1, attempt_count=deletion.attempt_count+1,
        lease_expires_at=now()+($2 * interval '1 second'), last_error=NULL
    FROM candidate
    WHERE deletion.run_id=candidate.run_id
    RETURNING deletion.run_id, deletion.user_id, deletion.candidate_upload_ids, deletion.attempt_count
  `, [workerId, leaseSeconds]);
  return result.rows[0] ?? null;
}

/** Release a failed cleanup task with a retry delay. Removing files is idempotent. */
export async function retryRunDeletion(runId: string, workerId: string): Promise<void> {
  await pool.query(`UPDATE run_deletions
    SET claimed_by=NULL, lease_expires_at=NULL, last_error='artifact_cleanup_failed',
        next_attempt_at=now()+CASE WHEN attempt_count < 6 THEN interval '15 seconds' ELSE interval '1 minute' END
    WHERE run_id=$1 AND claimed_by=$2`, [runId, workerId]);
}

/** Atomically claim one queued run, or recover a running run whose lease expired. */
export async function claimNextRun(workerId: string, leaseSeconds = 120): Promise<ClaimedRun | null> {
  if (!workerId.trim() || workerId.length > 100) throw new Error("workerId must contain 1 to 100 characters.");
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 10 || leaseSeconds > 3600) {
    throw new Error("leaseSeconds must be an integer from 10 to 3600.");
  }

  await pool.query(`WITH abandoned_cancellations AS (
      UPDATE runs SET status='cancelled', error_summary='Run stopped by user.', finished_at=now(), claimed_by=NULL, lease_expires_at=NULL
      WHERE status='cancel_requested' AND lease_expires_at < now()
      RETURNING id
    )
    UPDATE run_nodes AS node
    SET status='cancelled', error_code='run_cancelled',
        error_summary='Step cancelled because the run was stopped.', finished_at=COALESCE(node.finished_at, now())
    FROM abandoned_cancellations AS run
    WHERE node.run_id=run.id AND node.status IN ('queued','running')`);
  await pool.query(`WITH exhausted_runs AS (
      UPDATE runs SET status = 'failed', error_summary = 'Run exceeded the retry limit after worker interruption.', finished_at = now(), claimed_by = NULL, lease_expires_at = NULL
      WHERE status = 'running' AND lease_expires_at < now() AND attempt_count >= 3
      RETURNING id
    )
    UPDATE run_nodes AS node
    SET status = CASE WHEN node.status = 'running' THEN 'failed'::run_node_status ELSE 'skipped'::run_node_status END,
        error_code = CASE WHEN node.status = 'running' THEN 'worker_interrupted' ELSE 'run_failed' END,
        error_summary = CASE WHEN node.status = 'running'
          THEN 'Worker was interrupted too many times; the step did not complete.'
          ELSE 'Not run because worker retries were exhausted.' END,
        finished_at = now()
    FROM exhausted_runs AS run
    WHERE node.run_id = run.id AND node.status IN ('running', 'queued')`);
  const result = await pool.query<ClaimedRun>(`
    WITH candidate AS (
      SELECT id
      FROM runs
      WHERE status = 'queued'
         OR (status = 'running' AND lease_expires_at < now())
      ORDER BY created_at, id
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE runs AS claimed
    SET status = 'running',
        claimed_by = $1,
        attempt_count = claimed.attempt_count + 1,
        heartbeat_at = now(),
        lease_expires_at = now() + ($2 * interval '1 second'),
        started_at = COALESCE(claimed.started_at, now())
    FROM candidate
    WHERE claimed.id = candidate.id
    RETURNING claimed.id, claimed.user_id, claimed.workflow_id,
              claimed.input_json, claimed.workflow_snapshot_json, claimed.attempt_count
  `, [workerId, leaseSeconds]);
  const claimed = result.rows[0] ?? null;
  if (claimed) await pool.query("UPDATE run_nodes SET status='queued' WHERE run_id=$1 AND status='running'", [claimed.id]);
  return claimed;
}

export async function setRunNodeRunning(runId: string, nodeId: string, workerId: string, resolvedInput: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const result = await pool.query<{ resolved_input_json: Record<string, unknown> }>(`UPDATE run_nodes n SET status='running', attempt_count=n.attempt_count+1,
      resolved_input_json=COALESCE(n.resolved_input_json,$4), started_at=COALESCE(n.started_at,now()), error_code=NULL, error_summary=NULL
    FROM runs r WHERE n.run_id=$1 AND n.node_id=$2 AND n.status='queued' AND r.id=n.run_id AND r.claimed_by=$3 AND r.status='running'
    RETURNING n.resolved_input_json`, [runId,nodeId,workerId,resolvedInput]);
  return result.rows[0]?.resolved_input_json ?? null;
}

export async function finishRunNode(runId: string, nodeId: string, workerId: string, output: Record<string, unknown>): Promise<boolean> {
  const result = await pool.query(`UPDATE run_nodes n SET status='succeeded', output_json=$4, finished_at=now()
    FROM runs r WHERE n.run_id=$1 AND n.node_id=$2 AND r.id=n.run_id AND r.claimed_by=$3 AND r.status='running'`, [runId,nodeId,workerId,output]);
  return result.rowCount === 1;
}

export async function failRun(runId: string, workerId: string, code: string, summary: string, nodeId?: string): Promise<void> {
  const client = await pool.connect();
  await client.query("BEGIN");
  try {
    const ownership = await client.query("SELECT id FROM runs WHERE id=$1 AND claimed_by=$2 AND status='running' FOR UPDATE", [runId, workerId]);
    if (ownership.rowCount !== 1) { await client.query("ROLLBACK"); return; }
    if (nodeId) await client.query(`UPDATE run_nodes SET status='failed',error_code=$3,error_summary=$4,finished_at=now()
      WHERE run_id=$1 AND node_id=$2 AND status <> 'succeeded'`, [runId,nodeId,code,summary]);
    else await client.query(`UPDATE run_nodes SET status='failed',error_code=$2,error_summary=$3,finished_at=now()
      WHERE run_id=$1 AND status='running'`, [runId,code,summary]);
    await client.query(`UPDATE run_nodes SET status='skipped',error_code='run_failed',error_summary='Not run because another node failed.',finished_at=now()
      WHERE run_id=$1 AND status='queued'`, [runId]);
    await client.query(`UPDATE runs SET status='failed',error_summary=$3,finished_at=now(),claimed_by=NULL,lease_expires_at=NULL
      WHERE id=$1 AND claimed_by=$2 AND status='running'`, [runId,workerId,summary]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export async function finishRun(runId: string, workerId: string): Promise<boolean> {
  const result = await pool.query(`UPDATE runs SET status=CASE WHEN EXISTS (SELECT 1 FROM instagram_publications p WHERE p.run_id=runs.id AND p.status IN ('awaiting_review','queued','publishing')) THEN 'awaiting_publish' ELSE 'succeeded' END,
    finished_at=CASE WHEN EXISTS (SELECT 1 FROM instagram_publications p WHERE p.run_id=runs.id AND p.status IN ('awaiting_review','queued','publishing')) THEN NULL ELSE now() END, claimed_by=NULL,lease_expires_at=NULL
    WHERE id=$1 AND claimed_by=$2 AND status='running'`, [runId,workerId]);
  return result.rowCount === 1;
}

/** Finalize a cooperative cancellation after the active runner request has been aborted and reaped. */
export async function finishCancelledRun(runId: string, workerId: string): Promise<void> {
  const client = await pool.connect();
  await client.query("BEGIN");
  try {
    const ownership = await client.query("SELECT id FROM runs WHERE id=$1 AND claimed_by=$2 AND status='cancel_requested' FOR UPDATE", [runId, workerId]);
    if (ownership.rowCount !== 1) { await client.query("ROLLBACK"); return; }
    await client.query(`UPDATE run_nodes SET status='cancelled',error_code='run_cancelled',error_summary='Step cancelled because the run was stopped.',finished_at=COALESCE(finished_at,now())
      WHERE run_id=$1 AND status IN ('queued','running')`, [runId]);
    await client.query(`UPDATE runs SET status='cancelled',error_summary='Run stopped by user.',finished_at=now(),claimed_by=NULL,lease_expires_at=NULL
      WHERE id=$1 AND claimed_by=$2 AND status='cancel_requested'`, [runId,workerId]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

/** Extend a worker's lease. False means the lease was lost or the run is no longer active. */
export async function heartbeatRun(runId: string, workerId: string, leaseSeconds = 120): Promise<boolean> {
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 10 || leaseSeconds > 3600) {
    throw new Error("leaseSeconds must be an integer from 10 to 3600.");
  }
  const result = await pool.query(
    `UPDATE runs
     SET heartbeat_at = now(), lease_expires_at = now() + ($3 * interval '1 second')
     WHERE id = $1 AND claimed_by = $2 AND status = 'running'`,
    [runId, workerId, leaseSeconds],
  );
  return result.rowCount === 1;
}

export async function runCancellationRequested(runId: string, workerId: string): Promise<boolean> {
  const result = await pool.query<{ status: string }>(
    "SELECT status FROM runs WHERE id=$1 AND claimed_by=$2",
    [runId, workerId],
  );
  return result.rows[0]?.status === "cancel_requested";
}
