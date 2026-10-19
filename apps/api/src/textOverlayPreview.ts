import { and, eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { db } from "./db.js";
import { readArtifact } from "./artifactStore.js";
import { artifacts, users } from "./schema.js";
import { getGoogleFontBuffer, listGoogleFonts, resolveGoogleFont } from "./googleFonts.js";
import { textOverlaySettingsSchema } from "./processingNodes.js";
import { prepareTextOverlayPreviewSource, renderPreparedTextOverlayPreview } from "./textOverlayRenderer.js";

const sourceCacheLimit = 48 * 1024 * 1024;
const outputCacheLimit = 32 * 1024 * 1024;
const previewSourceCache = new Map<string, { value: { source: Buffer; scale: number }; bytes: number }>();
const previewOutputCache = new Map<string, { value: Buffer; bytes: number }>();
let previewSourceCacheBytes = 0;
let previewOutputCacheBytes = 0;

function getLru<T>(cache: Map<string, { value: T; bytes: number }>, key: string) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
}

function setLru<T>(cache: Map<string, { value: T; bytes: number }>, key: string, value: T, bytes: number, limit: number, getCacheBytes: () => number, onBytesChange: (delta: number) => void) {
  if (bytes > limit) return;
  const previous = cache.get(key);
  if (previous) { cache.delete(key); onBytesChange(-previous.bytes); }
  cache.set(key, { value, bytes });
  onBytesChange(bytes);
  while (cache.size > 1 && (cache.size > 32 || getCacheBytes() > limit)) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    const oldest = cache.get(oldestKey);
    cache.delete(oldestKey);
    if (oldest) onBytesChange(-oldest.bytes);
  }
}

async function getPreparedPreviewSource(artifactId: string, storageKey: string) {
  const cached = getLru(previewSourceCache, artifactId);
  if (cached) return cached;
  const prepared = await prepareTextOverlayPreviewSource(await readArtifact(storageKey));
  setLru(previewSourceCache, artifactId, prepared, prepared.source.byteLength, sourceCacheLimit, () => previewSourceCacheBytes, (delta) => { previewSourceCacheBytes += delta; });
  return prepared;
}

export const textOverlayPreviewRouter = Router();
textOverlayPreviewRouter.get("/fonts", (_req, res) => res.json({ items: listGoogleFonts() }));
textOverlayPreviewRouter.get("/fonts/:fontId/file", async (req, res, next) => {
  try {
    const input = z.object({ fontWeight: z.coerce.number().int().min(100).max(1000).default(400), fontStyle: z.enum(["normal", "italic"]).default("normal") }).safeParse(req.query);
    const font = resolveGoogleFont(req.params.fontId);
    if (!input.success || !font) { res.status(404).json({ error: "font_unavailable" }); return; }
    const buffer = await getGoogleFontBuffer(font, input.data);
    const isWoff2 = buffer.subarray(0, 4).toString("ascii") === "wOF2";
    const isOpenType = buffer.subarray(0, 4).toString("ascii") === "OTTO";
    res.type(isWoff2 ? "font/woff2" : isOpenType ? "font/otf" : "font/ttf").set("Cache-Control", "private, max-age=31536000, immutable").send(buffer);
  } catch (error) { next(error); }
});
textOverlayPreviewRouter.get("/defaults", async (_req, res, next) => {
  try {
    const [user] = await db.select({ defaults: users.textOverlayDefaults }).from(users).where(eq(users.id, res.locals.userId as string)).limit(1);
    res.json({ defaults: user?.defaults ?? null });
  } catch (error) { next(error); }
});
textOverlayPreviewRouter.put("/defaults", async (req, res, next) => {
  try {
    const parsed = textOverlaySettingsSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "invalid_settings" }); return; }
    const [user] = await db.update(users).set({ textOverlayDefaults: parsed.data, updatedAt: new Date() }).where(eq(users.id, res.locals.userId as string)).returning({ id: users.id });
    if (!user) { res.status(404).json({ error: "user_unavailable" }); return; }
    res.json({ defaults: parsed.data });
  } catch (error) { next(error); }
});
textOverlayPreviewRouter.post("/preview", async (req, res, next) => {
  try {
    const input = z.object({ artifactId: z.string().uuid(), text: z.string().trim().min(1).max(8000), settings: textOverlaySettingsSchema }).safeParse(req.body);
    if (!input.success) {
      res.status(400).json({
        error: "invalid_request",
        invalidFields: input.error.issues.map((issue) => issue.path.join(".")).filter(Boolean),
      });
      return;
    }
    const [artifact] = await db.select().from(artifacts).where(and(eq(artifacts.id, input.data.artifactId), eq(artifacts.userId, res.locals.userId as string))).limit(1);
    if (!artifact || artifact.dataTypeId !== "image" || !artifact.mediaType.startsWith("image/")) { res.status(404).json({ error: "image_unavailable" }); return; }
    const settingsKey = createHash("sha256").update(JSON.stringify(input.data.settings)).digest("hex");
    const outputKey = `${input.data.artifactId}:${createHash("sha256").update(input.data.text).digest("hex")}:${settingsKey}`;
    let output = getLru(previewOutputCache, outputKey);
    if (!output) {
      const prepared = await getPreparedPreviewSource(artifact.id, artifact.storageKey);
      if (req.aborted || res.destroyed) return;
      output = await renderPreparedTextOverlayPreview(prepared, input.data.text, input.data.settings);
      setLru(previewOutputCache, outputKey, output, output.byteLength, outputCacheLimit, () => previewOutputCacheBytes, (delta) => { previewOutputCacheBytes += delta; });
    }
    if (req.aborted || res.destroyed) return;
    res.type("image/png").set("Cache-Control", "no-store").send(output);
  } catch (error) { next(error); }
});
import { createHash } from "node:crypto";
