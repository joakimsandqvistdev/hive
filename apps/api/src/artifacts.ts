import { and, eq, sql } from "drizzle-orm";
import { Router, raw } from "express";
import { readArtifact, removeArtifact, saveUpload } from "./artifactStore.js";
import { db } from "./db.js";
import { artifacts, workflowNodes, runNodes } from "./schema.js";

const router = Router();
router.delete("/:id", async (req, res, next) => {
  if (req.get("origin") !== (process.env.WEB_ORIGIN ?? "http://localhost:5173")) { res.status(403).json({ error: "invalid_origin" }); return; }
  try {
    const result = await db.transaction(async (tx) => {
      const [file] = await tx.select().from(artifacts).where(and(eq(artifacts.id, req.params.id), eq(artifacts.userId, res.locals.userId as string))).limit(1).for("update");
      if (!file || file.runId !== null) return { status: 404 as const };
      const workflowUse = await tx.select({ count: sql<number>`count(*)` }).from(workflowNodes).where(eq(workflowNodes.artifactId, file.id));
      const runUse = await tx.select({ count: sql<number>`count(*)` }).from(runNodes).where(eq(runNodes.inputArtifactId, file.id));
      if (Number(workflowUse[0]?.count) || Number(runUse[0]?.count)) return { status: 409 as const };
      await tx.delete(artifacts).where(eq(artifacts.id, file.id));
      return { status: 204 as const, storageKey: file.storageKey };
    });
    if (result.status === 204) { await removeArtifact(result.storageKey!); res.status(204).end(); }
    else res.status(result.status).json({ error: result.status === 409 ? "input_in_use" : "artifact_not_found" });
  } catch (error) { next(error); }
});
router.post("/upload", (req, res, next) => {
  if (req.get("origin") !== (process.env.WEB_ORIGIN ?? "http://localhost:5173")) { res.status(403).json({ error: "invalid_origin" }); return; }
  next();
}, raw({ type: "application/octet-stream", limit: "25mb" }), async (req, res, next) => {
  const dataTypeId = String(req.query.dataTypeId ?? "");
  if (!["image", "audio"].includes(dataTypeId) || !Buffer.isBuffer(req.body)) { res.status(400).json({ error: "invalid_upload" }); return; }
  let stored: Awaited<ReturnType<typeof saveUpload>>;
  try { stored = await saveUpload(req.body, dataTypeId); }
  catch (error) { res.status(400).json({ error: "invalid_upload", message: error instanceof Error ? error.message : "Invalid upload." }); return; }
  try {
    const displayName = String(req.query.name ?? "upload").replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 120) || "upload";
    const [artifact] = await db.insert(artifacts).values({ ...stored, dataTypeId, userId: res.locals.userId as string, displayName, runId: null, runNodeId: null }).returning();
    res.status(201).json({ artifact });
  } catch (error) { await removeArtifact(stored.storageKey); next(error); }
});
router.get("/:id/preview", async (req, res, next) => {
  try {
    const [artifact] = await db.select().from(artifacts).where(and(eq(artifacts.id, req.params.id), eq(artifacts.userId, res.locals.userId as string))).limit(1);
    if (!artifact || !(artifact.mediaType.startsWith("image/") || artifact.mediaType.startsWith("audio/") || artifact.mediaType === "video/mp4")) { res.status(404).json({ error: "artifact_not_found" }); return; }
    const content = await readArtifact(artifact.storageKey);
    res.setHeader("Content-Type", artifact.mediaType);
    res.setHeader("Content-Length", String(artifact.byteSize));
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", "inline");
    res.send(content);
  } catch (error) { next(error); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const [artifact] = await db.select().from(artifacts).where(and(eq(artifacts.id, req.params.id), eq(artifacts.userId, res.locals.userId as string))).limit(1);
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
