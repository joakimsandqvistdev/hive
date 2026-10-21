import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { Router } from "express";
import { db, pool } from "./db.js";
import { artifacts, instagramPublications, runDeletions, runNodes, runs, workflowTriggers } from "./schema.js";
import { workflowExecutionOrder } from "./workflowExecutionOrder.js";
import { parsePagination, totalPages } from "./pagination.js";
import { bulkDeleteRunStatuses, canDeleteAwaitingPublishRun, isBulkDeleteRunStatus } from "./runDeletionPolicy.js";

const router = Router();

router.get("/runner-control", async (_req, res, next) => {
  const ownerId = res.locals.userId as string;
  try {
    await pool.query(`UPDATE users SET runner_status='paused' WHERE id=$1 AND runner_status='pausing'
      AND NOT EXISTS (SELECT 1 FROM runs WHERE user_id=$1 AND claimed_by IS NOT NULL AND lease_expires_at>now())`, [ownerId]);
    const result = await pool.query<{ runnerStatus: string; queuedRuns: string; runningRuns: string }>(`SELECT u.runner_status AS "runnerStatus",
      (SELECT count(*)::text FROM runs WHERE user_id=u.id AND status='queued') AS "queuedRuns",
      (SELECT count(*)::text FROM runs WHERE user_id=u.id AND status IN ('running','cancel_requested')) AS "runningRuns"
      FROM users u WHERE u.id=$1`, [ownerId]);
    const state = result.rows[0];
    if (!state) { res.status(404).json({ error: "user_not_found" }); return; }
    res.json({ runnerStatus: state.runnerStatus, queuedRuns: Number(state.queuedRuns), runningRuns: Number(state.runningRuns) });
  } catch (error) { next(error); }
});

router.put("/runner-control", async (req, res, next) => {
  if (req.get("origin") !== (process.env.WEB_ORIGIN ?? "http://localhost:5173")) { res.status(403).json({ error: "invalid_origin" }); return; }
  const ownerId = res.locals.userId as string;
  const requestedStatus = req.body?.status;
  if (requestedStatus !== "active" && requestedStatus !== "paused") { res.status(400).json({ error: "invalid_runner_status" }); return; }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const user = await client.query<{ runner_status: string }>("SELECT runner_status FROM users WHERE id=$1 FOR UPDATE", [ownerId]);
    if (!user.rowCount) { await client.query("ROLLBACK"); res.status(404).json({ error: "user_not_found" }); return; }
    let status: string = requestedStatus;
    if (requestedStatus === "paused" && user.rows[0]?.runner_status === "active") {
      const running = await client.query("SELECT 1 FROM runs WHERE user_id=$1 AND claimed_by IS NOT NULL AND lease_expires_at>now() LIMIT 1", [ownerId]);
      status = running.rowCount ? "pausing" : "paused";
    } else if (requestedStatus === "paused" && user.rows[0]?.runner_status === "pausing") {
      status = "pausing";
    }
    await client.query("UPDATE users SET runner_status=$2,updated_at=now() WHERE id=$1", [ownerId, status]);
    await client.query("COMMIT");
    res.json({ runnerStatus: status });
  } catch (error) { await client.query("ROLLBACK"); next(error); }
  finally { client.release(); }
});

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
    } else if (status === "awaiting_publish") {
      const publications = await client.query<{ status: string }>(
        "SELECT status FROM instagram_publications WHERE run_id=$1 AND user_id=$2 FOR UPDATE",
        [req.params.id, ownerId],
      );
      if (!canDeleteAwaitingPublishRun(publications.rows.map((publication) => publication.status))) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "publication_in_progress" });
        return;
      }
      // Locking and changing queued publications prevents the publisher from claiming
      // them after this request commits but before asynchronous run cleanup begins.
      await client.query(
        "UPDATE instagram_publications SET status='discarded',updated_at=now() WHERE run_id=$1 AND user_id=$2 AND status IN ('queued','awaiting_review')",
        [req.params.id, ownerId],
      );
    } else if (["running", "cancel_requested"].includes(status)) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "run_active" });
      return;
    }
    await client.query("INSERT INTO run_deletions (run_id, user_id, storage_keys, candidate_upload_ids) " +
      "SELECT $1, $2, " +
      "COALESCE((SELECT array_agg(storage_key) FROM artifacts WHERE run_id=$1 AND user_id=$2 AND saved_to_library=false), ARRAY[]::text[]), " +
      "COALESCE((SELECT array_agg(DISTINCT input_artifact_id) FROM run_nodes WHERE run_id=$1 AND user_id=$2 AND input_artifact_id IS NOT NULL), ARRAY[]::uuid[]) " +
      "ON CONFLICT (run_id) DO NOTHING", [req.params.id, ownerId]);
    await client.query("COMMIT");
    res.status(202).json({ status: "deleting" });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally { client.release(); }
});

router.post("/bulk-delete", async (req, res, next) => {
  if (req.get("origin") !== (process.env.WEB_ORIGIN ?? "http://localhost:5173")) { res.status(403).json({ error: "invalid_origin" }); return; }
  const statuses = req.body?.statuses;
  if (!Array.isArray(statuses) || statuses.length === 0 || statuses.some((status: unknown) => !isBulkDeleteRunStatus(status))) {
    res.status(400).json({ error: "invalid_statuses" }); return;
  }
  const ownerId = res.locals.userId as string;
  const selectedStatuses = [...new Set(statuses as Array<typeof bulkDeleteRunStatuses[number]>)];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const matching = await client.query<{ id: string; status: string }>(`
        SELECT run.id, run.status::text AS status FROM runs AS run
        WHERE run.user_id=$1 AND run.status::text = ANY($2::text[])
        ORDER BY run.created_at, run.id
        FOR UPDATE
    `, [ownerId, selectedStatuses]);
    const matchedIds = matching.rows.map((run) => run.id);
    const queuedIds = matching.rows.filter((run) => run.status === "queued").map((run) => run.id);
    const awaitingIds = matching.rows.filter((run) => run.status === "awaiting_publish").map((run) => run.id);
    const protectedIds = matchedIds.length ? await client.query<{ id: string }>(`
      SELECT DISTINCT artifact.run_id AS id FROM artifacts AS artifact
      JOIN instagram_accounts AS account ON account.profile_image_artifact_id=artifact.id
      WHERE artifact.run_id=ANY($1::uuid[]) AND account.user_id=$2
    `, [matchedIds, ownerId]) : { rows: [] };
    const protectedSet = new Set(protectedIds.rows.map((row) => row.id));
    const publicationStatuses = awaitingIds.length ? await client.query<{ run_id: string; status: string }>(
      "SELECT run_id, status FROM instagram_publications WHERE run_id=ANY($1::uuid[]) AND user_id=$2 FOR UPDATE",
      [awaitingIds, ownerId],
    ) : { rows: [] };
    const statusesByRun = new Map<string, string[]>();
    for (const publication of publicationStatuses.rows) {
      const statuses = statusesByRun.get(publication.run_id) ?? [];
      statuses.push(publication.status);
      statusesByRun.set(publication.run_id, statuses);
    }
    const publicationBusyIds = awaitingIds.filter((id) =>
      !protectedSet.has(id) && !canDeleteAwaitingPublishRun(statusesByRun.get(id) ?? []),
    );
    const publicationSafeIds = awaitingIds.filter((id) =>
      !protectedSet.has(id) && canDeleteAwaitingPublishRun(statusesByRun.get(id) ?? []),
    );
    if (publicationSafeIds.length) {
      await client.query(
        "UPDATE instagram_publications SET status='discarded',updated_at=now() WHERE run_id=ANY($1::uuid[]) AND user_id=$2 AND status IN ('queued','awaiting_review')",
        [publicationSafeIds, ownerId],
      );
    }
    if (queuedIds.length) {
      // Cancel queued runs under their row locks before scheduling cleanup so a worker
      // cannot claim them between selection and deletion.
      await client.query(
        "UPDATE runs SET status='cancelled',cancel_requested_at=COALESCE(cancel_requested_at,now()),finished_at=now(),error_summary='Run stopped by user.' WHERE id=ANY($1::uuid[]) AND user_id=$2 AND status='queued'",
        [queuedIds, ownerId],
      );
      await client.query(
        "UPDATE run_nodes SET status='cancelled',error_code='run_cancelled',error_summary='Step cancelled because the run was stopped.',finished_at=COALESCE(finished_at,now()) WHERE run_id=ANY($1::uuid[]) AND user_id=$2 AND status='queued'",
        [queuedIds, ownerId],
      );
    }
    const eligibleIds = matching.rows
      .filter((run) => !protectedSet.has(run.id) && (run.status !== "awaiting_publish" || publicationSafeIds.includes(run.id)))
      .map((run) => run.id);
    const inserted = eligibleIds.length ? await client.query<{ run_id: string }>(`
        INSERT INTO run_deletions (run_id, user_id, storage_keys, candidate_upload_ids)
        SELECT run.id, $1,
          COALESCE((SELECT array_agg(artifact.storage_key) FROM artifacts AS artifact WHERE artifact.run_id=run.id AND artifact.user_id=$1 AND artifact.saved_to_library=false), ARRAY[]::text[]),
          COALESCE((SELECT array_agg(DISTINCT node.input_artifact_id) FROM run_nodes AS node WHERE node.run_id=run.id AND node.user_id=$1 AND node.input_artifact_id IS NOT NULL), ARRAY[]::uuid[])
        FROM runs AS run
        WHERE run.id=ANY($2::uuid[]) AND run.user_id=$1
        ON CONFLICT (run_id) DO NOTHING
        RETURNING run_id
    `, [ownerId, eligibleIds]) : { rows: [] };
    await client.query("COMMIT");
    res.status(202).json({
      matched_count: matching.rows.length,
      queued_count: inserted.rows.length,
      skipped_profile_count: protectedSet.size,
      skipped_publication_count: publicationBusyIds.length,
      already_deleting_count: eligibleIds.length - inserted.rows.length,
    });
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
  const workflowId = typeof req.query.workflowId === "string" ? req.query.workflowId : undefined;
  const workflowName = typeof req.query.workflowName === "string" ? req.query.workflowName.trim().slice(0, 120) : undefined;
  const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 120) : "";
  if (workflowId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(workflowId)) {
    res.status(400).json({ error: "invalid_workflow_id" }); return;
  }
  const filters = [eq(runs.userId, ownerId)];
  if (workflowId) filters.push(eq(runs.workflowId, workflowId));
  else if (workflowName) filters.push(sql`${runs.workflowSnapshotJson}->>'name' = ${workflowName}`);
  if (search) {
    const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
    filters.push(or(ilike(sql`${runs.id}::text`, pattern), sql`${runs.workflowSnapshotJson}->>'name' ILIKE ${pattern} ESCAPE E'\\\\'`)!);
  }
  const where = and(...filters);
  try {
    const [rows, totals] = await Promise.all([
      db.select({ run: runs, deletion: runDeletions, triggerName: workflowTriggers.name }).from(runs)
        .leftJoin(runDeletions, eq(runDeletions.runId, runs.id))
        .leftJoin(workflowTriggers, eq(workflowTriggers.id, runs.triggerId))
        .where(where)
        .orderBy(desc(runs.createdAt), desc(runs.id)).limit(pageSize).offset(offset),
      db.select({ total: count() }).from(runs).where(where),
    ]);
    const total = totals[0]?.total ?? 0;
    const runIds = rows.map(({ run }) => run.id);
    let pageNodes: typeof runNodes.$inferSelect[] = [];
    let pageArtifacts: typeof artifacts.$inferSelect[] = [];
    if (runIds.length) {
      pageNodes = await db.select().from(runNodes).where(and(inArray(runNodes.runId, runIds), eq(runNodes.userId, ownerId)));
      const outputIds = pageNodes.flatMap((node) => {
        const output = node.outputJson as { artifactId?: unknown } | null;
        return typeof output?.artifactId === "string" ? [output.artifactId] : [];
      });
      const artifactScope = outputIds.length
        ? or(inArray(artifacts.runId, runIds), inArray(artifacts.id, outputIds))!
        : inArray(artifacts.runId, runIds);
      pageArtifacts = await db.select().from(artifacts).where(and(artifactScope, eq(artifacts.userId, ownerId)));
    }
    const previewByRun = new Map<string, { artifactId?: string; dataTypeId: string }>();
    for (const { run } of rows) {
      const snapshot = run.workflowSnapshotJson as unknown as { nodes?: Array<{ id: string }>; edges?: Array<{ source: string; target: string }> };
      const order = workflowExecutionOrder(snapshot.nodes ?? [], snapshot.edges ?? []);
      const rank = new Map(order.map((node, index) => [node.id, index]));
      const nodeRows = pageNodes.filter((node) => node.runId === run.id)
        .sort((left, right) => (rank.get(left.nodeId) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right.nodeId) ?? Number.MAX_SAFE_INTEGER));
      const runArtifacts = pageArtifacts.filter((artifact) => artifact.runId === run.id);
      const images = nodeRows.slice().reverse().flatMap((node) => {
        const image = runArtifacts.find((artifact) => artifact.runNodeId === node.nodeId && artifact.mediaType.startsWith("image/"));
        return image ? [{ artifactId: image.id, dataTypeId: "image" }] : [];
      });
      if (images[0]) { previewByRun.set(run.id, images[0]); continue; }
      const fallback = nodeRows.slice().reverse().map((node) => {
        const output = node.outputJson as { dataTypeId?: unknown; text?: unknown; artifactId?: unknown } | null;
        const snapshot = node.nodeSnapshotJson as { modality?: unknown; dataTypeId?: unknown };
        const artifact = runArtifacts.find((item) => item.runNodeId === node.nodeId);
        const value = artifact?.mediaType.split("/")[0] ?? output?.dataTypeId ?? snapshot.modality ?? snapshot.dataTypeId;
        return { value, hasOutput: Boolean(artifact || typeof output?.text === "string" || output?.artifactId) };
      }).find((item) => item.hasOutput && ["audio", "video", "text"].includes(String(item.value)))
        ?? nodeRows.slice().reverse().map((node) => {
          const snapshot = node.nodeSnapshotJson as { modality?: unknown; dataTypeId?: unknown };
          return { value: snapshot.modality ?? snapshot.dataTypeId };
        }).find((item) => ["audio", "video", "text"].includes(String(item.value)));
      previewByRun.set(run.id, { dataTypeId: String(fallback?.value ?? "media") });
    }
    const items = rows.map(({ run, deletion, triggerName }) => ({
      ...run,
      preview: previewByRun.get(run.id) ?? { dataTypeId: "media" },
      triggerName,
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
    const outputIds = nodes.flatMap((node) => {
      const output = node.outputJson as { artifactId?: unknown } | null;
      return typeof output?.artifactId === "string" ? [output.artifactId] : [];
    });
    const outputScope = outputIds.length
      ? or(eq(artifacts.runId, run.id), inArray(artifacts.id, outputIds))
      : eq(artifacts.runId, run.id);
    const outputs = (await db.select().from(artifacts).where(and(outputScope, eq(artifacts.userId, run.userId))))
      .sort((left, right) => rank(left.runNodeId ?? "") - rank(right.runNodeId ?? ""));
    const [publication] = await db.select().from(instagramPublications).where(and(eq(instagramPublications.runId, run.id), eq(instagramPublications.userId, run.userId))).limit(1);
    const [trigger] = run.triggerId ? await db.select({ name: workflowTriggers.name }).from(workflowTriggers).where(and(eq(workflowTriggers.id, run.triggerId), eq(workflowTriggers.userId, run.userId))).limit(1) : [];
    res.json({ run, triggerName: trigger?.name ?? null, nodes, artifacts: outputs, publication: publication ?? null });
  } catch (error) { next(error); }
});

export { router as runsRouter };
