import { and, eq, sql } from "drizzle-orm";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Router, raw } from "express";
import { Agent, fetch as undiciFetch } from "undici";
import { artifactPath, readArtifact, removeArtifact, saveUpload } from "./artifactStore.js";
import { parseArtifactByteRange } from "./artifactRange.js";
import { db } from "./db.js";
import { artifacts, instagramAccounts, instagramPublications, runDeletions, runNodes, workflowNodes, workflows, runs } from "./schema.js";

const router = Router();
function isPublicAddress(address: string) {
  if (isIP(address) === 4) {
    const octets = address.split(".").map(Number);
    const [a, b] = octets;
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b! >= 16 && b! <= 31) || (a === 192 && b === 168) || (a === 100 && b! >= 64 && b! <= 127));
  }
  const normalized = address.toLowerCase();
  return isIP(normalized) === 6 && normalized !== "::1" && !normalized.startsWith("fe8") && !normalized.startsWith("fe9") && !normalized.startsWith("fea") && !normalized.startsWith("feb") && !normalized.startsWith("fc") && !normalized.startsWith("fd") && !normalized.startsWith("::ffff:127.");
}
router.get("/", async (_req, res, next) => {
  try {
    const items = await db.select({ id: artifacts.id, displayName: artifacts.displayName, dataTypeId: artifacts.dataTypeId, mediaType: artifacts.mediaType, byteSize: artifacts.byteSize, createdAt: artifacts.createdAt, runId: artifacts.runId, savedToLibrary: artifacts.savedToLibrary }).from(artifacts)
      .where(eq(artifacts.userId, res.locals.userId as string)).orderBy(sql`${artifacts.createdAt} desc`).limit(500);
    res.json({ items });
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
      if (Number(workflowUse[0]?.count) || Number(runUse[0]?.count) || Number(profileUse[0]?.count) || Number(publicationUse[0]?.count)) return { status: 409 as const };
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
}, raw({ type: "application/octet-stream", limit: "50mb" }), async (req, res, next) => {
  const dataTypeId = String(req.query.dataTypeId ?? "");
  const sourceWorkflowId = typeof req.query.workflowId === "string" ? req.query.workflowId : null;
  const savedToLibrary = req.query.scope === "library";
  if (!["image", "audio", "video"].includes(dataTypeId) || !Buffer.isBuffer(req.body) || (savedToLibrary && sourceWorkflowId)) { res.status(400).json({ error: "invalid_upload" }); return; }
  if (sourceWorkflowId) {
    const [workflow] = await db.select({ id: workflows.id }).from(workflows).where(and(eq(workflows.id, sourceWorkflowId), eq(workflows.userId, res.locals.userId as string))).limit(1);
    if (!workflow) { res.status(404).json({ error: "workflow_not_found" }); return; }
  }
  let stored: Awaited<ReturnType<typeof saveUpload>>;
  try { stored = await saveUpload(req.body, dataTypeId); }
  catch (error) { res.status(400).json({ error: "invalid_upload", message: error instanceof Error ? error.message : "Invalid upload." }); return; }
  try {
    const displayName = String(req.query.name ?? "upload").replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 120) || "upload";
    const [artifact] = await db.insert(artifacts).values({ ...stored, dataTypeId, userId: res.locals.userId as string, displayName, runId: null, runNodeId: null, savedToLibrary, sourceWorkflowId }).returning();
    res.status(201).json({ artifact });
  } catch (error) { await removeArtifact(stored.storageKey); next(error); }
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
      const stored = await saveUpload(Buffer.concat(chunks), dataTypeId);
      try {
        const displayName = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).at(-1) ?? "imported-media").replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 120) || "imported-media";
        const [artifact] = await db.insert(artifacts).values({ ...stored, dataTypeId, userId: ownerId, displayName, runId: null, runNodeId: null, savedToLibrary: false, sourceWorkflowId: workflowId ?? null }).returning();
        res.status(201).json({ artifact });
      } catch (error) { await removeArtifact(stored.storageKey); throw error; }
    } finally { await dispatcher.close(); }
  } catch (error) {
    if (error instanceof TypeError) { res.status(400).json({ error: "media_import_failed" }); return; }
    next(error);
  }
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
    if (artifact.mediaType === "video/mp4") {
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
