import { and, eq, sql } from "drizzle-orm";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Router, raw } from "express";
import sharp from "sharp";
import { Agent, fetch as undiciFetch } from "undici";
import { artifactPath, detectUpload, readArtifact, removeArtifact, saveUpload } from "./artifactStore.js";
import { ArtifactQuotaError, withArtifactQuota } from "./artifactQuota.js";
import { admitArtifactUpload } from "./artifactUploadAdmission.js";
import { parseArtifactByteRange } from "./artifactRange.js";
import { db, pool } from "./db.js";
import { isPublicAddress } from "./publicAddress.js";
import { artifacts, instagramAccounts, instagramPublicationMedia, instagramPublications, runDeletions, runNodes, workflowNodes, workflows, runs } from "./schema.js";

const router = Router();
const cleanupScopes = new Set(["old-run-outputs", "orphaned-workflow-uploads"]);
function parseScopes(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.some((scope) => typeof scope !== "string" || !cleanupScopes.has(scope))) return null;
  return [...new Set(value as string[])];
}
const protectionSql = `ARRAY_REMOVE(ARRAY[
  CASE WHEN EXISTS (SELECT 1 FROM workflow_nodes n WHERE n.artifact_id=a.id AND n.user_id=a.user_id) THEN 'Workflow input' END,
  CASE WHEN EXISTS (SELECT 1 FROM workflow_triggers t JOIN workflows w ON w.id=t.workflow_id AND w.user_id=t.user_id, LATERAL jsonb_array_elements(t.input_mappings) mapping WHERE t.user_id=a.user_id AND mapping->>'artifactId'=a.id::text) THEN 'Webhook input' END,
  CASE WHEN EXISTS (SELECT 1 FROM run_nodes n WHERE n.input_artifact_id=a.id AND n.user_id=a.user_id) THEN 'Run input' END,
  CASE WHEN EXISTS (SELECT 1 FROM instagram_accounts i WHERE i.profile_image_artifact_id=a.id AND i.user_id=a.user_id) THEN 'Account profile image' END,
  CASE WHEN EXISTS (SELECT 1 FROM instagram_publications p WHERE p.user_id=a.user_id AND (p.artifact_id=a.id OR EXISTS (SELECT 1 FROM instagram_publication_media pm WHERE pm.publication_id=p.id AND pm.artifact_id=a.id))) THEN 'Instagram publication' END,
  CASE WHEN EXISTS (SELECT 1 FROM runs r WHERE r.id=a.run_id AND r.user_id=a.user_id AND r.status IN ('queued','running','awaiting_publish','cancel_requested')) THEN 'Run is active' END,
  CASE WHEN EXISTS (SELECT 1 FROM artifact_cleanup_items ci JOIN artifact_cleanup_jobs cj ON cj.id=ci.job_id WHERE ci.artifact_id=a.id AND cj.user_id=a.user_id AND cj.status IN ('queued','running') AND ci.status='queued') THEN 'Cleanup pending' END
], NULL)::text[]`;
const eligibleRunOutputSql = `(a.run_id IS NOT NULL AND NOT a.saved_to_library AND a.created_at<=now()-interval '30 days'
  AND EXISTS(SELECT 1 FROM runs r WHERE r.id=a.run_id AND r.user_id=a.user_id AND r.status IN ('succeeded','failed','cancelled')))`;
const eligibleWorkflowUploadSql = `(a.run_id IS NULL AND a.source_workflow_id IS NOT NULL AND NOT a.saved_to_library)`;
const availabilityStateSql = `CASE
  WHEN cardinality(${protectionSql})>0 THEN 'protected'
  WHEN a.saved_to_library THEN 'retained'
  WHEN ${eligibleRunOutputSql} OR ${eligibleWorkflowUploadSql} THEN 'eligible'
  ELSE 'retained'
END`;
const availabilityReasonSql = `CASE
  WHEN cardinality(${protectionSql})>0 THEN array_to_string(${protectionSql}, ' · ')
  WHEN a.saved_to_library THEN 'Saved to the library'
  WHEN a.run_id IS NOT NULL AND a.created_at>now()-interval '30 days' THEN 'Output is younger than the 30-day cleanup threshold'
  WHEN a.run_id IS NOT NULL AND EXISTS(SELECT 1 FROM runs r WHERE r.id=a.run_id AND r.user_id=a.user_id AND r.status IN ('queued','running','awaiting_publish','cancel_requested')) THEN 'Run is still active'
  WHEN ${eligibleRunOutputSql} OR ${eligibleWorkflowUploadSql} THEN 'Meets the current cleanup rules'
  ELSE 'Outside the current cleanup scopes'
END`;
router.get("/", async (req, res, next) => {
  try {
    const owner = res.locals.userId as string;
    const page = Math.max(1, Math.min(100000, Number.parseInt(String(req.query.page ?? "1"), 10) || 1));
    const pageSize = Math.max(1, Math.min(100, Number.parseInt(String(req.query.pageSize ?? "10"), 10) || 10));
    const search = String(req.query.search ?? "").trim().slice(0, 200) || null;
    const mediaType = ["image", "audio", "video"].includes(String(req.query.type)) ? String(req.query.type) : null;
    const saveState = ["saved", "not-saved"].includes(String(req.query.saveState)) ? String(req.query.saveState) : null;
    const base = `WITH artifact_context AS (
      SELECT a.*, COALESCE(w.names,ARRAY[]::text[]) workflow_names, COALESCE(n.names,ARRAY[]::text[]) node_names, COALESCE(h.names,ARRAY[]::text[]) webhook_names,
        (SELECT p.caption FROM instagram_publications p WHERE p.user_id=a.user_id AND p.status='published'
          AND (p.artifact_id=a.id OR EXISTS (SELECT 1 FROM instagram_publication_media pm WHERE pm.publication_id=p.id AND pm.artifact_id=a.id))
          ORDER BY p.published_at DESC NULLS LAST,p.created_at DESC LIMIT 1) publication_caption, ${protectionSql} protected_by,
        ${availabilityStateSql} availability_state, ${availabilityReasonSql} availability_reason, now() evaluated_at
      FROM artifacts a
      LEFT JOIN LATERAL (SELECT array_agg(DISTINCT x.name) FILTER (WHERE x.name IS NOT NULL) names FROM (
        SELECT wf.name FROM workflows wf WHERE wf.id=a.source_workflow_id AND wf.user_id=a.user_id
        UNION ALL SELECT wf.name FROM workflow_nodes wn JOIN workflows wf ON wf.id=wn.workflow_id AND wf.user_id=wn.user_id WHERE wn.artifact_id=a.id AND wn.user_id=a.user_id
        UNION ALL SELECT wf.name FROM runs r JOIN workflows wf ON wf.id=r.workflow_id AND wf.user_id=r.user_id WHERE r.id=a.run_id AND r.user_id=a.user_id
      ) x) w ON true
      LEFT JOIN LATERAL (SELECT array_agg(DISTINCT x.name) FILTER (WHERE x.name IS NOT NULL) names FROM (
        SELECT wn.label name FROM workflow_nodes wn WHERE wn.artifact_id=a.id AND wn.user_id=a.user_id
        UNION ALL SELECT COALESCE(rn.node_snapshot_json->>'name',rn.node_snapshot_json->>'label') FROM run_nodes rn WHERE rn.input_artifact_id=a.id AND rn.user_id=a.user_id
        UNION ALL SELECT COALESCE(rn.node_snapshot_json->>'name',rn.node_snapshot_json->>'label') FROM run_nodes rn WHERE rn.run_id=a.run_id AND rn.node_id=a.run_node_id AND rn.user_id=a.user_id
      ) x) n ON true
      LEFT JOIN LATERAL (SELECT array_agg(DISTINCT x.name) names FROM (
        SELECT t.name FROM runs r JOIN workflow_triggers t ON t.id=r.trigger_id AND t.user_id=r.user_id WHERE r.id=a.run_id AND r.user_id=a.user_id
        UNION ALL SELECT t.name FROM workflow_triggers t, LATERAL jsonb_array_elements(t.input_mappings) mapping WHERE t.user_id=a.user_id AND mapping->>'artifactId'=a.id::text
      ) x) h ON true
      WHERE a.user_id=$1
    ), filtered AS (SELECT * FROM artifact_context c WHERE ($2::text IS NULL OR c.media_type LIKE $2 || '/%') AND ($3::text IS NULL OR ($3='saved' AND c.saved_to_library) OR ($3='not-saved' AND NOT c.saved_to_library)) AND ($4::text IS NULL OR strpos(lower(concat_ws(' ',c.display_name,c.media_type,c.data_type_id,array_to_string(c.workflow_names,' '),array_to_string(c.node_names,' '),array_to_string(c.webhook_names,' '))),lower($4))>0))`;
    const [countResult, pageResult] = await Promise.all([
      pool.query<{ total: string }>(`${base} SELECT count(*)::text total FROM filtered`, [owner, mediaType, saveState, search]),
      pool.query(`${base} SELECT id,display_name AS "displayName",data_type_id AS "dataTypeId",media_type AS "mediaType",byte_size AS "byteSize",created_at AS "createdAt",run_id AS "runId",saved_to_library AS "savedToLibrary",workflow_names AS "workflowNames",node_names AS "nodeNames",webhook_names AS "webhookNames",publication_caption AS "publicationCaption",protected_by AS "protectedBy",availability_state AS "availabilityState",availability_reason AS "availabilityReason",evaluated_at AS "evaluatedAt" FROM filtered ORDER BY created_at DESC,id LIMIT $5 OFFSET $6`, [owner, mediaType, saveState, search, pageSize, (page - 1) * pageSize]),
    ]);
    res.json({ items: pageResult.rows, total: Number(countResult.rows[0]?.total ?? 0), page, pageSize });
  } catch (error) { next(error); }
});
router.get("/storage-summary", async (_req, res, next) => {
  try {
    const result = await pool.query(`SELECT
      COALESCE(sum(byte_size),0)::bigint total_bytes, count(*)::int total_count,
      COALESCE(sum(byte_size) FILTER (WHERE saved_to_library),0)::bigint saved_bytes, count(*) FILTER (WHERE saved_to_library)::int saved_count,
      COALESCE(sum(byte_size) FILTER (WHERE run_id IS NOT NULL AND NOT saved_to_library),0)::bigint run_output_bytes, count(*) FILTER (WHERE run_id IS NOT NULL AND NOT saved_to_library)::int run_output_count,
      COALESCE(sum(byte_size) FILTER (WHERE run_id IS NULL AND source_workflow_id IS NOT NULL AND NOT saved_to_library),0)::bigint workflow_upload_bytes, count(*) FILTER (WHERE run_id IS NULL AND source_workflow_id IS NOT NULL AND NOT saved_to_library)::int workflow_upload_count,
      COALESCE(sum(byte_size) FILTER (WHERE cardinality(${protectionSql})>0),0)::bigint protected_bytes, count(*) FILTER (WHERE cardinality(${protectionSql})>0)::int protected_count,
      now() AS evaluated_at
      FROM artifacts a WHERE user_id=$1`, [res.locals.userId]);
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});
router.get("/storage-protected", async (_req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(String(_req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.max(1, Math.min(50, Number.parseInt(String(_req.query.pageSize ?? "10"), 10) || 10));
    const result = await pool.query(`SELECT a.id,a.display_name AS "displayName",a.data_type_id AS "dataTypeId",a.media_type AS "mediaType",a.byte_size AS "byteSize",a.created_at AS "createdAt",a.run_id AS "runId",a.saved_to_library AS "savedToLibrary",${protectionSql} AS "protectedBy"
      FROM artifacts a WHERE a.user_id=$1 AND cardinality(${protectionSql})>0 ORDER BY a.created_at DESC LIMIT $2 OFFSET $3`, [res.locals.userId,pageSize,(page-1)*pageSize]);
    const count = await pool.query(`SELECT count(*)::int total FROM artifacts a WHERE a.user_id=$1 AND cardinality(${protectionSql})>0`, [res.locals.userId]);
    res.json({ items: result.rows, total: count.rows[0]?.total ?? 0, page, pageSize });
  } catch (error) { next(error); }
});
router.get("/library-options", async (req, res, next) => {
  const dataTypeId = String(req.query.dataTypeId ?? "");
  if (!["image", "audio", "video"].includes(dataTypeId)) { res.status(400).json({ error: "invalid_media_type" }); return; }
  const search = String(req.query.search ?? "").trim().slice(0, 120);
  const artifactId = typeof req.query.artifactId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.query.artifactId) ? req.query.artifactId : null;
  try {
    const result = await pool.query(`SELECT a.id,a.data_type_id AS "dataTypeId",a.display_name AS "displayName",a.saved_to_library AS "savedToLibrary"
      FROM artifacts a WHERE a.user_id=$1 AND a.data_type_id=$2 AND (a.saved_to_library OR a.id=$4::uuid)
      AND (strpos(lower(a.display_name),lower($3))>0 OR a.id=$4::uuid)
      ORDER BY CASE WHEN a.id=$4::uuid THEN 0 ELSE 1 END,a.display_name,a.id LIMIT 100`, [res.locals.userId,dataTypeId,search,artifactId]);
    res.json({ items: result.rows });
  } catch (error) { next(error); }
});
router.get("/cleanup/preview", async (req, res, next) => {
  const scopes = String(req.query.scopes ?? "").split(",").filter(Boolean);
  if (!scopes.length || scopes.some((scope) => !cleanupScopes.has(scope))) { res.status(400).json({ error: "invalid_cleanup_scopes" }); return; }
  try {
    const result = await pool.query(`SELECT a.id,a.display_name AS "displayName",a.data_type_id AS "dataTypeId",a.media_type AS "mediaType",a.byte_size AS "byteSize",a.created_at AS "createdAt",a.run_id AS "runId",a.source_workflow_id AS "sourceWorkflowId",false AS "savedToLibrary",
      ARRAY_REMOVE(ARRAY[(SELECT w.name FROM workflows w WHERE w.id=a.source_workflow_id AND w.user_id=a.user_id LIMIT 1),(SELECT w.name FROM runs r JOIN workflows w ON w.id=r.workflow_id AND w.user_id=r.user_id WHERE r.id=a.run_id AND r.user_id=a.user_id LIMIT 1)],NULL)::text[] AS "workflowNames",
      COALESCE((SELECT array_agg(DISTINCT context.name) FROM (
        SELECT wn.label AS name FROM workflow_nodes wn WHERE wn.artifact_id=a.id AND wn.user_id=a.user_id
        UNION ALL SELECT COALESCE(rn.node_snapshot_json->>'name',rn.node_snapshot_json->>'label') FROM run_nodes rn WHERE (rn.input_artifact_id=a.id OR (rn.run_id=a.run_id AND rn.node_id=a.run_node_id)) AND rn.user_id=a.user_id
      ) context),ARRAY[]::text[]) AS "nodeNames",
      COALESCE((SELECT array_agg(DISTINCT t.name) FROM runs r JOIN workflow_triggers t ON t.id=r.trigger_id AND t.user_id=r.user_id WHERE r.id=a.run_id AND r.user_id=a.user_id),ARRAY[]::text[]) AS "webhookNames",
      ${protectionSql} AS "protectedBy",
      ${availabilityStateSql} AS "availabilityState",
      ${availabilityReasonSql} AS "availabilityReason",
      CASE WHEN a.run_id IS NOT NULL THEN a.created_at+interval '30 days' ELSE NULL END AS "eligibleAfter",
      (cardinality(${protectionSql})=0 AND ((a.run_id IS NOT NULL AND a.saved_to_library=false AND a.created_at<=now()-interval '30 days' AND EXISTS(SELECT 1 FROM runs r WHERE r.id=a.run_id AND r.user_id=a.user_id AND r.status IN ('succeeded','failed','cancelled') AND 'old-run-outputs'=ANY($2::text[]))) OR (a.run_id IS NULL AND a.source_workflow_id IS NOT NULL AND a.saved_to_library=false AND 'orphaned-workflow-uploads'=ANY($2::text[])))) AS eligible
      FROM artifacts a WHERE a.user_id=$1 AND ((a.run_id IS NOT NULL AND a.saved_to_library=false AND EXISTS(SELECT 1 FROM runs r WHERE r.id=a.run_id AND r.user_id=a.user_id) AND 'old-run-outputs'=ANY($2::text[])) OR (a.run_id IS NULL AND a.source_workflow_id IS NOT NULL AND a.saved_to_library=false AND 'orphaned-workflow-uploads'=ANY($2::text[]))) ORDER BY a.created_at`, [res.locals.userId, scopes]);
    const items = result.rows;
    const eligible = items.filter((item) => item.eligible);
    res.json({ items, evaluatedAt: new Date().toISOString(), eligibleCount: eligible.length, protectedCount: items.filter((item) => item.availabilityState === "protected").length, retainedCount: items.filter((item) => item.availabilityState === "retained").length, estimatedBytes: eligible.reduce((sum, item) => sum + Number(item.byteSize), 0) });
  } catch (error) { next(error); }
});
router.post("/cleanup", async (req, res, next) => {
  if (req.get("origin") !== (process.env.WEB_ORIGIN ?? "http://localhost:5173")) { res.status(403).json({ error: "invalid_origin" }); return; }
  const scopes = parseScopes(req.body?.scopes);
  const ids = Array.isArray(req.body?.artifactIds) && req.body.artifactIds.length <= 10000 && req.body.artifactIds.every((id: unknown) => typeof id === "string") ? [...new Set(req.body.artifactIds as string[])] : null;
  if (!scopes || !ids?.length) { res.status(400).json({ error: "invalid_cleanup_selection" }); return; }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const eligible = await client.query(`SELECT a.id,a.storage_key,a.display_name,a.byte_size FROM artifacts a WHERE a.user_id=$1 AND a.id=ANY($2::uuid[]) AND cardinality(${protectionSql})=0 AND ((a.run_id IS NOT NULL AND a.saved_to_library=false AND a.created_at<=now()-interval '30 days' AND EXISTS(SELECT 1 FROM runs r WHERE r.id=a.run_id AND r.user_id=a.user_id AND r.status IN ('succeeded','failed','cancelled')) AND 'old-run-outputs'=ANY($3::text[])) OR (a.run_id IS NULL AND a.source_workflow_id IS NOT NULL AND a.saved_to_library=false AND 'orphaned-workflow-uploads'=ANY($3::text[]))) FOR UPDATE OF a`, [res.locals.userId, ids, scopes]);
    if (!eligible.rowCount || eligible.rowCount !== ids.length) { await client.query("ROLLBACK"); res.status(409).json({ error: "cleanup_selection_stale" }); return; }
    const job = await client.query<{ id: string }>("INSERT INTO artifact_cleanup_jobs(user_id,scopes,estimated_bytes) VALUES($1,$2,$3) RETURNING id", [res.locals.userId, scopes, eligible.rows.reduce((sum, item) => sum + Number(item.byte_size), 0)]);
    const jobId = job.rows[0]!.id;
    for (const item of eligible.rows) await client.query("INSERT INTO artifact_cleanup_items(job_id,artifact_id,storage_key,display_name,byte_size) VALUES($1,$2,$3,$4,$5)", [jobId,item.id,item.storage_key,item.display_name,item.byte_size]);
    await client.query("COMMIT");
    res.status(202).json({ jobId, queuedCount: eligible.rowCount, skippedCount: ids.length - eligible.rowCount });
  } catch (error) { await client.query("ROLLBACK"); next(error); }
  finally { client.release(); }
});
router.get("/cleanup/:jobId", async (req, res, next) => {
  try {
    const job = await pool.query("SELECT id,status,scopes,estimated_bytes AS \"estimatedBytes\",last_error AS \"lastError\",created_at AS \"createdAt\",finished_at AS \"finishedAt\" FROM artifact_cleanup_jobs WHERE id=$1 AND user_id=$2", [req.params.jobId,res.locals.userId]);
    if (!job.rowCount) { res.status(404).json({ error: "cleanup_job_not_found" }); return; }
    const items = await pool.query("SELECT status,count(*)::int count,COALESCE(sum(byte_size),0)::bigint bytes FROM artifact_cleanup_items WHERE job_id=$1 GROUP BY status", [req.params.jobId]);
    res.json({ job: job.rows[0], outcomes: items.rows });
  } catch (error) { next(error); }
});
router.post("/cleanup/:jobId/retry", async (req, res, next) => {
  if (req.get("origin") !== (process.env.WEB_ORIGIN ?? "http://localhost:5173")) { res.status(403).json({ error: "invalid_origin" }); return; }
  try {
    const retried = await pool.query(`WITH items AS (UPDATE artifact_cleanup_items SET status='queued',last_error=NULL,finished_at=NULL WHERE job_id=$1 AND status='failed' RETURNING id), job AS (UPDATE artifact_cleanup_jobs SET status='queued',claimed_by=NULL,lease_expires_at=NULL,next_attempt_at=now(),finished_at=NULL,last_error=NULL WHERE id=$1 AND user_id=$2 AND EXISTS(SELECT 1 FROM items) RETURNING id) SELECT id FROM job`, [req.params.jobId,res.locals.userId]);
    if (!retried.rowCount) { res.status(404).json({ error: "cleanup_retry_unavailable" }); return; }
    res.status(202).json({ queued: true });
  } catch (error) { next(error); }
});
router.delete("/:id", async (req, res, next) => {
  if (req.get("origin") !== (process.env.WEB_ORIGIN ?? "http://localhost:5173")) { res.status(403).json({ error: "invalid_origin" }); return; }
  try {
    const result = await db.transaction(async (tx) => {
      const [file] = await tx.select().from(artifacts).where(and(eq(artifacts.id, req.params.id), eq(artifacts.userId, res.locals.userId as string))).limit(1).for("update");
      if (!file) return { status: 404 as const };
      if (file.runId) {
        const [run] = await tx.select({ status: runs.status }).from(runs).where(eq(runs.id, file.runId)).limit(1);
        if (!run || ["queued", "running", "awaiting_publish", "cancel_requested"].includes(run.status)) return { status: 409 as const };
      }
      const workflowUse = await tx.select({ count: sql<number>`count(*)` }).from(workflowNodes).where(eq(workflowNodes.artifactId, file.id));
      const runUse = await tx.select({ count: sql<number>`count(*)` }).from(runNodes).where(eq(runNodes.inputArtifactId, file.id));
      const profileUse = await tx.select({ count: sql<number>`count(*)` }).from(instagramAccounts).where(eq(instagramAccounts.profileImageArtifactId, file.id));
      const publicationUse = await tx.select({ count: sql<number>`count(*)` }).from(instagramPublications).where(eq(instagramPublications.artifactId, file.id));
      const publicationMediaUse = await tx.select({ count: sql<number>`count(*)` }).from(instagramPublicationMedia).where(eq(instagramPublicationMedia.artifactId, file.id));
      if (Number(workflowUse[0]?.count) || Number(runUse[0]?.count) || Number(profileUse[0]?.count) || Number(publicationUse[0]?.count) || Number(publicationMediaUse[0]?.count)) return { status: 409 as const };
      if (file.runId) await tx.update(runNodes).set({ outputJson: null }).where(sql`${runNodes.outputJson}->>'artifactId' = ${file.id}`);
      await tx.delete(artifacts).where(eq(artifacts.id, file.id));
      return { status: 204 as const, storageKey: file.storageKey };
    });
    if (result.status === 204) { await removeArtifact(result.storageKey!); res.status(204).end(); }
    else res.status(result.status).json({ error: result.status === 409 ? "media_in_use" : "artifact_not_found" });
  } catch (error) { next(error); }
});
router.post("/upload", (req, res, next) => {
  if (req.get("origin") !== (process.env.WEB_ORIGIN ?? "http://localhost:5173")) { res.status(403).json({ error: "invalid_origin" }); return; }
  next();
}, admitArtifactUpload, raw({ type: "application/octet-stream", limit: "50mb" }), async (req, res, next) => {
  const dataTypeId = String(req.query.dataTypeId ?? "");
  const sourceWorkflowId = typeof req.query.workflowId === "string" ? req.query.workflowId : null;
  const savedToLibrary = req.query.scope === "library";
  if (!["image", "audio", "video"].includes(dataTypeId) || !Buffer.isBuffer(req.body) || (savedToLibrary && sourceWorkflowId)) { res.status(400).json({ error: "invalid_upload" }); return; }
  if (sourceWorkflowId) {
    const [workflow] = await db.select({ id: workflows.id }).from(workflows).where(and(eq(workflows.id, sourceWorkflowId), eq(workflows.userId, res.locals.userId as string))).limit(1);
    if (!workflow) { res.status(404).json({ error: "workflow_not_found" }); return; }
  }
  try { detectUpload(req.body, dataTypeId); }
  catch (error) { res.status(400).json({ error: "invalid_upload", message: error instanceof Error ? error.message : "Invalid upload." }); return; }
  let stored: Awaited<ReturnType<typeof saveUpload>> | undefined;
  try {
    const displayName = String(req.query.name ?? "upload").replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 120) || "upload";
    const artifact = await withArtifactQuota(res.locals.userId as string, req.body.length, async (tx) => {
      stored = await saveUpload(req.body, dataTypeId);
      const [created] = await tx.insert(artifacts).values({ ...stored, dataTypeId, userId: res.locals.userId as string, displayName, runId: null, runNodeId: null, savedToLibrary, sourceWorkflowId }).returning();
      return created;
    });
    res.status(201).json({ artifact });
  } catch (error) {
    if (stored) { await db.delete(artifacts).where(eq(artifacts.id, stored.id)); await removeArtifact(stored.storageKey); }
    if (error instanceof ArtifactQuotaError) { res.status(429).json({ error: "storage_quota_exceeded", scope: error.scope, message: error.scope === "user" ? "Your media storage quota has been reached. Delete media or contact your administrator." : "Hive's shared media storage quota has been reached. Contact your administrator." }); return; }
    next(error);
  }
});
router.post("/import-url", async (req, res, next) => {
  if (req.get("origin") !== (process.env.WEB_ORIGIN ?? "http://localhost:5173")) { res.status(403).json({ error: "invalid_origin" }); return; }
  const { url: inputUrl, dataTypeId, workflowId } = req.body ?? {};
  if (typeof inputUrl !== "string" || !["image", "audio", "video"].includes(dataTypeId) || (workflowId !== undefined && (typeof workflowId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(workflowId)))) { res.status(400).json({ error: "invalid_import" }); return; }
  let parsed: URL;
  try { parsed = new URL(inputUrl); } catch { res.status(400).json({ error: "invalid_import" }); return; }
  if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.port && !["80", "443"].includes(parsed.port) || parsed.hostname.endsWith(".local")) { res.status(400).json({ error: "invalid_import_url" }); return; }
  const ownerId = res.locals.userId as string;
  try {
    if (workflowId) {
      const [workflow] = await db.select({ id: workflows.id }).from(workflows).where(and(eq(workflows.id, workflowId), eq(workflows.userId, ownerId))).limit(1);
      if (!workflow) { res.status(404).json({ error: "workflow_not_found" }); return; }
    }
    const addresses = isIP(parsed.hostname) ? [{ address: parsed.hostname }] : await lookup(parsed.hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) { res.status(400).json({ error: "invalid_import_url" }); return; }
    const approvedAddress = addresses[0]!.address;
    const dispatcher = new Agent({ connect: { lookup: (_hostname, _options, callback) => callback(null, approvedAddress, isIP(approvedAddress)) } });
    try {
      const response = await undiciFetch(parsed, { dispatcher, redirect: "error", signal: AbortSignal.timeout(30_000) });
      const maxBytes = dataTypeId === "video" ? 50 * 1024 * 1024 : dataTypeId === "image" ? 10 * 1024 * 1024 : 25 * 1024 * 1024;
      if (!response.ok || Number(response.headers.get("content-length") ?? 0) > maxBytes || !response.body) { res.status(400).json({ error: "media_import_failed" }); return; }
      const chunks: Buffer[] = []; let total = 0;
      for await (const chunk of response.body) { const bytes = Buffer.from(chunk); total += bytes.length; if (total > maxBytes) { res.status(413).json({ error: "request_too_large" }); return; } chunks.push(bytes); }
      const bytes = Buffer.concat(chunks);
      try { detectUpload(bytes, dataTypeId); }
      catch { res.status(400).json({ error: "media_import_failed" }); return; }
      let storedArtifact: Awaited<ReturnType<typeof saveUpload>> | undefined;
      try {
        const displayName = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).at(-1) ?? "imported-media").replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 120) || "imported-media";
        const artifact = await withArtifactQuota(ownerId, bytes.length, async (tx) => {
          const stored = await saveUpload(bytes, dataTypeId);
          storedArtifact = stored;
          const [created] = await tx.insert(artifacts).values({ ...stored, dataTypeId, userId: ownerId, displayName, runId: null, runNodeId: null, savedToLibrary: false, sourceWorkflowId: workflowId ?? null }).returning();
          return created;
        });
        res.status(201).json({ artifact });
      } catch (error) {
        if (storedArtifact) { await db.delete(artifacts).where(eq(artifacts.id, storedArtifact.id)); await removeArtifact(storedArtifact.storageKey); }
        if (error instanceof ArtifactQuotaError) { res.status(429).json({ error: "storage_quota_exceeded", scope: error.scope, message: error.scope === "user" ? "Your media storage quota has been reached. Delete media or contact your administrator." : "Hive's shared media storage quota has been reached. Contact your administrator." }); return; }
        throw error;
      }
    } finally { await dispatcher.close(); }
  } catch (error) {
    if (error instanceof TypeError) { res.status(400).json({ error: "media_import_failed" }); return; }
    next(error);
  }
});
router.patch("/:id/rename", async (req, res, next) => {
  if (req.get("origin") !== (process.env.WEB_ORIGIN ?? "http://localhost:5173")) { res.status(403).json({ error: "invalid_origin" }); return; }
  const displayName = typeof req.body?.displayName === "string" ? req.body.displayName.trim() : "";
  if (!displayName || displayName.length > 120 || /[\u0000-\u001f\u007f]/.test(displayName)) { res.status(400).json({ error: "invalid_display_name" }); return; }
  try {
    const [item] = await db.update(artifacts).set({ displayName })
      .where(and(eq(artifacts.id, req.params.id), eq(artifacts.userId, res.locals.userId as string), eq(artifacts.savedToLibrary, true)))
      .returning({ id: artifacts.id, displayName: artifacts.displayName });
    if (!item) {
      const [owned] = await db.select({ id: artifacts.id }).from(artifacts).where(and(eq(artifacts.id, req.params.id), eq(artifacts.userId, res.locals.userId as string))).limit(1);
      res.status(owned ? 409 : 404).json({ error: owned ? "media_not_saved" : "artifact_not_found" });
      return;
    }
    res.json({ item });
  } catch (error) { next(error); }
});
router.post("/:id/save-to-library", async (req, res, next) => {
  if (req.get("origin") !== (process.env.WEB_ORIGIN ?? "http://localhost:5173")) { res.status(403).json({ error: "invalid_origin" }); return; }
  try {
    const [item] = await db.update(artifacts).set({ savedToLibrary: true, runId: null, runNodeId: null, sourceWorkflowId: null })
      .where(and(eq(artifacts.id, req.params.id), eq(artifacts.userId, res.locals.userId as string))).returning({ id: artifacts.id });
    if (!item) { res.status(404).json({ error: "artifact_not_found" }); return; }
    res.json({ saved: true });
  } catch (error) { next(error); }
});
router.get("/:id/thumbnail", async (req, res, next) => {
  try {
    const [artifact] = await db.select().from(artifacts).where(and(eq(artifacts.id, req.params.id), eq(artifacts.userId, res.locals.userId as string))).limit(1);
    if (artifact?.runId) {
      const [deletion] = await db.select({ runId: runDeletions.runId }).from(runDeletions).where(eq(runDeletions.runId, artifact.runId)).limit(1);
      if (deletion) { res.status(404).json({ error: "artifact_not_found" }); return; }
    }
    if (!artifact || !artifact.mediaType.startsWith("image/")) { res.status(404).json({ error: "artifact_not_found" }); return; }
    const thumbnail = await sharp(await readArtifact(artifact.storageKey), { limitInputPixels: 40_000_000 }).resize(100, 100, { fit: "cover", position: "attention" }).webp({ quality: 72 }).toBuffer();
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", "inline");
    res.send(thumbnail);
  } catch (error) { next(error); }
});

router.get("/:id/preview", async (req, res, next) => {
  try {
    const [artifact] = await db.select().from(artifacts).where(and(eq(artifacts.id, req.params.id), eq(artifacts.userId, res.locals.userId as string))).limit(1);
    if (artifact?.runId) {
      const [deletion] = await db.select({ runId: runDeletions.runId }).from(runDeletions).where(eq(runDeletions.runId, artifact.runId)).limit(1);
      if (deletion) { res.status(404).json({ error: "artifact_not_found" }); return; }
    }
    if (!artifact || !(artifact.mediaType.startsWith("image/") || artifact.mediaType.startsWith("audio/") || artifact.mediaType === "video/mp4")) { res.status(404).json({ error: "artifact_not_found" }); return; }
    res.setHeader("Content-Type", artifact.mediaType);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", "inline");
    if (artifact.mediaType.startsWith("audio/") || artifact.mediaType === "video/mp4") {
      const path = artifactPath(artifact.storageKey);
      const size = (await stat(path)).size;
      const range = req.headers.range;
      let start = 0;
      let end = size - 1;
      if (range) {
        const parsedRange = parseArtifactByteRange(range, size);
        if (!parsedRange) {
          res.setHeader("Content-Range", `bytes */${size}`);
          res.status(416).end();
          return;
        }
        start = parsedRange.start;
        end = parsedRange.end;
        res.status(206);
        res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
      }
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Length", String(end - start + 1));
      const stream = createReadStream(path, { start, end });
      stream.on("error", (error) => {
        if (res.headersSent) res.destroy(error);
        else next(error);
      });
      stream.pipe(res);
      return;
    }
    const content = await readArtifact(artifact.storageKey);
    res.setHeader("Content-Length", String(content.length));
    res.send(content);
  } catch (error) { next(error); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const [artifact] = await db.select().from(artifacts).where(and(eq(artifacts.id, req.params.id), eq(artifacts.userId, res.locals.userId as string))).limit(1);
    if (artifact?.runId) {
      const [deletion] = await db.select({ runId: runDeletions.runId }).from(runDeletions).where(eq(runDeletions.runId, artifact.runId)).limit(1);
      if (deletion) { res.status(404).json({ error: "artifact_not_found" }); return; }
    }
    if (!artifact) { res.status(404).json({ error: "artifact_not_found" }); return; }
    const content = await readArtifact(artifact.storageKey);
    res.setHeader("Content-Type", artifact.mediaType);
    res.setHeader("Content-Length", String(artifact.byteSize));
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Disposition", `attachment; filename="${artifact.displayName.replace(/[^a-zA-Z0-9._-]/g, "_")}"`);
    res.send(content);
  } catch (error) { next(error); }
});
export { router as artifactsRouter };
