import { and, eq } from "drizzle-orm";
import { Router } from "express";
import { readArtifact } from "./artifactStore.js";
import { db } from "./db.js";
import { artifacts } from "./schema.js";

const router = Router();
router.get("/:id/preview", async (req, res, next) => {
  try {
    const [artifact] = await db.select().from(artifacts).where(and(eq(artifacts.id, req.params.id), eq(artifacts.userId, res.locals.userId as string))).limit(1);
    if (!artifact || !artifact.mediaType.startsWith("image/")) { res.status(404).json({ error: "artifact_not_found" }); return; }
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
