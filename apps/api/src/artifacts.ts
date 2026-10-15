import { and, eq, sql } from "drizzle-orm";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Router, raw } from "express";
import { artifactPath, readArtifact, removeArtifact, saveUpload } from "./artifactStore.js";
import { parseArtifactByteRange } from "./artifactRange.js";
import { db } from "./db.js";
import { artifacts, instagramAccounts, runDeletions, workflowNodes, runNodes } from "./schema.js";

const router = Router();
router.get("/", async (_req, res, next) => {
  try {
    const items = await db.select({ id: artifacts.id, displayName: artifacts.displayName, mediaType: artifacts.mediaType, createdAt: artifacts.createdAt, runId: artifacts.runId }).from(artifacts)
      .where(and(eq(artifacts.userId, res.locals.userId as string), eq(artifacts.dataTypeId, "image"))).orderBy(sql`${artifacts.createdAt} desc`).limit(200);
    res.json({ items });
  } catch (error) { next(error); }
});
router.delete("/:id", async (req, res, next) => {
  if (req.get("origin") !== (process.env.WEB_ORIGIN ?? "http://localhost:5173")) { res.status(403).json({ error: "invalid_origin" }); return; }
  try {
    const result = await db.transaction(async (tx) => {
      const [file] = await tx.select().from(artifacts).where(and(eq(artifacts.id, req.params.id), eq(artifacts.userId, res.locals.userId as string))).limit(1).for("update");
      if (!file || file.runId !== null) return { status: 404 as const };
      const workflowUse = await tx.select({ count: sql<number>`count(*)` }).from(workflowNodes).where(eq(workflowNodes.artifactId, file.id));
      const runUse = await tx.select({ count: sql<number>`count(*)` }).from(runNodes).where(eq(runNodes.inputArtifactId, file.id));
      const profileUse = await tx.select({ count: sql<number>`count(*)` }).from(instagramAccounts).where(eq(instagramAccounts.profileImageArtifactId, file.id));
      if (Number(workflowUse[0]?.count) || Number(runUse[0]?.count) || Number(profileUse[0]?.count)) return { status: 409 as const };
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
