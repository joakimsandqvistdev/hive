import { and, count, desc, eq } from "drizzle-orm";
import { Router } from "express";
import { db, pool } from "./db.js";
import { artifacts, instagramPublications, runDeletions, runNodes, runs } from "./schema.js";
import { workflowExecutionOrder } from "./workflowExecutionOrder.js";
import { parsePagination, totalPages } from "./pagination.js";

const router = Router();

router.post("/:id/cancel", async (req, res, next) => {
  if (req.get("origin") !== (process.env.WEB_ORIGIN ?? "http://localhost:5173")) { res.status(403).json({ error: "invalid_origin" }); return; }
  const ownerId = res.locals.userId as string;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const selected = await client.query<{ status: string }>(
      "SELECT status FROM runs WHERE id=$1 AND user_id=$2 FOR UPDATE", [req.params.id, ownerId],
    );
    const status = selected.rows[0]?.status;
    if (!status) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "run_not_found" });
      return;
    }
    if (status === "queued") {
      await client.query("UPDATE runs SET status='cancelled',cancel_requested_at=now(),finished_at=now(),error_summary='Run stopped by user.' WHERE id=$1", [req.params.id]);
      await client.query("UPDATE run_nodes SET status='cancelled',error_code='run_cancelled',error_summary='Step cancelled because the run was stopped.',finished_at=now() WHERE run_id=$1 AND status='queued'", [req.params.id]);
    } else if (status === "running") {
      await client.query("UPDATE runs SET status='cancel_requested',cancel_requested_at=now() WHERE id=$1", [req.params.id]);
    }
    await client.query("COMMIT");
    res.json({ status: status === "queued" ? "cancelled" : status === "running" ? "cancel_requested" : status });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally { client.release(); }
});

router.delete("/:id", async (req, res, next) => {
  if (req.get("origin") !== (process.env.WEB_ORIGIN ?? "http://localhost:5173")) { res.status(403).json({ error: "invalid_origin" }); return; }
  const ownerId = res.locals.userId as string;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const selected = await client.query<{ status: string }>("SELECT status FROM runs WHERE id=$1 AND user_id=$2 FOR UPDATE", [req.params.id, ownerId]);
    const status = selected.rows[0]?.status;
    if (!status) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "run_not_found" });
      return;
    }
    const protectedProfilePhoto = await client.query("SELECT 1 FROM artifacts a JOIN instagram_accounts i ON i.profile_image_artifact_id=a.id WHERE a.run_id=$1 AND i.user_id=$2 LIMIT 1", [req.params.id, ownerId]);
    if (protectedProfilePhoto.rowCount) { await client.query("ROLLBACK"); res.status(409).json({ error: "profile_asset_in_use" }); return; }
    if (status === "queued") {
      // Cancel under the same row lock as deletion so the worker cannot claim this run
      // between a separate cancel request and the cleanup request.
      await client.query("UPDATE runs SET status='cancelled',cancel_requested_at=COALESCE(cancel_requested_at,now()),finished_at=now(),error_summary='Run stopped by user.' WHERE id=$1 AND status='queued'", [req.params.id]);
      await client.query("UPDATE run_nodes SET status='cancelled',error_code='run_cancelled',error_summary='Step cancelled because the run was stopped.',finished_at=COALESCE(finished_at,now()) WHERE run_id=$1 AND status='queued'", [req.params.id]);
    } else if (["running", "cancel_requested", "awaiting_publish"].includes(status)) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "run_active" });
      return;
    }
    await client.query("INSERT INTO run_deletions (run_id, user_id, storage_keys, candidate_upload_ids) " +
      "SELECT $1, $2, " +
      "COALESCE((SELECT array_agg(storage_key) FROM artifacts WHERE run_id=$1 AND user_id=$2), ARRAY[]::text[]), " +
      "COALESCE((SELECT array_agg(DISTINCT input_artifact_id) FROM run_nodes WHERE run_id=$1 AND user_id=$2 AND input_artifact_id IS NOT NULL), ARRAY[]::uuid[]) " +
      "ON CONFLICT (run_id) DO NOTHING", [req.params.id, ownerId]);
    await client.query("COMMIT");
    res.status(202).json({ status: "deleting" });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally { client.release(); }
});

router.post("/:id/delete/retry", async (req, res, next) => {
  if (req.get("origin") !== (process.env.WEB_ORIGIN ?? "http://localhost:5173")) { res.status(403).json({ error: "invalid_origin" }); return; }
  const ownerId = res.locals.userId as string;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const selected = await client.query<{ processing: boolean }>(
      "SELECT claimed_by IS NOT NULL AND lease_expires_at > now() AS processing FROM run_deletions WHERE run_id=$1 AND user_id=$2 FOR UPDATE", [req.params.id, ownerId],
    );
    if (!selected.rows.length) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "deletion_not_found" });
      return;
    }
    if (selected.rows[0]!.processing) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "cleanup_in_progress" });
      return;
    }
    await client.query("UPDATE run_deletions SET claimed_by=NULL, lease_expires_at=NULL, last_error=NULL, next_attempt_at=now() WHERE run_id=$1 AND user_id=$2", [req.params.id, ownerId]);
    await client.query("COMMIT");
    res.status(202).json({ status: "deleting" });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally { client.release(); }
});

router.get("/", async (req, res, next) => {
  const ownerId = res.locals.userId as string;
  const { page, pageSize, offset } = parsePagination(req);
  try {
    const [rows, totals] = await Promise.all([
      db.select({ run: runs, deletion: runDeletions }).from(runs)
        .leftJoin(runDeletions, eq(runDeletions.runId, runs.id))
        .where(eq(runs.userId, ownerId))
        .orderBy(desc(runs.createdAt), desc(runs.id)).limit(pageSize).offset(offset),
      db.select({ total: count() }).from(runs).where(eq(runs.userId, ownerId)),
    ]);
    const total = totals[0]?.total ?? 0;
    const items = rows.map(({ run, deletion }) => ({
      ...run,
      deletion: deletion ? { attemptCount: deletion.attemptCount, lastError: deletion.lastError, processing: Boolean(deletion.claimedBy && deletion.leaseExpiresAt && deletion.leaseExpiresAt > new Date()) } : null,
    }));
    res.json({ items, page, pageSize, total, totalPages: totalPages(total, pageSize) });
  } catch (error) { next(error); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const [deletion] = await db.select({ runId: runDeletions.runId }).from(runDeletions).where(and(eq(runDeletions.runId, req.params.id), eq(runDeletions.userId, res.locals.userId as string))).limit(1);
    if (deletion) { res.status(404).json({ error: "run_not_found" }); return; }
    const [run] = await db.select().from(runs)
      .where(and(eq(runs.id, req.params.id), eq(runs.userId, res.locals.userId as string))).limit(1);
    if (!run) { res.status(404).json({ error: "run_not_found" }); return; }
    const snapshot = run.workflowSnapshotJson as unknown as {
      nodes?: Array<{ id: string }>;
      edges?: Array<{ source: string; target: string }>;
    };
    const executionOrder = workflowExecutionOrder(snapshot.nodes ?? [], snapshot.edges ?? []);
    const executionRank = new Map(executionOrder.map((node, index) => [node.id, index]));
    const rank = (nodeId: string) => executionRank.get(nodeId) ?? Number.MAX_SAFE_INTEGER;
    const nodes = (await db.select().from(runNodes).where(and(eq(runNodes.runId, run.id), eq(runNodes.userId, run.userId))))
      .sort((left, right) => rank(left.nodeId) - rank(right.nodeId));
    const outputs = (await db.select().from(artifacts).where(and(eq(artifacts.runId, run.id), eq(artifacts.userId, run.userId))))
      .sort((left, right) => rank(left.runNodeId ?? "") - rank(right.runNodeId ?? ""));
    const [publication] = await db.select().from(instagramPublications).where(and(eq(instagramPublications.runId, run.id), eq(instagramPublications.userId, run.userId))).limit(1);
    res.json({ run, nodes, artifacts: outputs, publication: publication ?? null });
  } catch (error) { next(error); }
});

export { router as runsRouter };
