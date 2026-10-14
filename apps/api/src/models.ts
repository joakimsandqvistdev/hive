import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "./db.js";
import { models } from "./schema.js";
import { loadDataTypes, loadModelIoContracts } from "./modelContracts.js";

const router = Router();
const modelRunnerUrl = (process.env.MODEL_RUNNER_URL ?? process.env.IMAGE_RUNNER_URL ?? "http://127.0.0.1:8188").replace(/\/$/, "");
async function isEnabledModel(modelId: string) {
  const [model] = await db.select({ id: models.id }).from(models).where(and(eq(models.id, modelId), eq(models.enabled, true))).limit(1);
  return Boolean(model);
}

export async function forwardRunnerRequest(path: string, method = "GET", timeoutMs = 15_000) {
  const response = await fetch(`${modelRunnerUrl}${path}`, { method, signal: AbortSignal.timeout(timeoutMs) });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

router.get("/", async (_req, res) => {
  try {
    const { response, body } = await forwardRunnerRequest("/models");
    if (!response.ok) { res.status(502).json({ error: "model_runner_unavailable" }); return; }
    res.json(body);
  } catch {
    res.status(503).json({ error: "model_runner_unavailable" });
  }
});

router.get("/contracts", async (_req, res, next) => {
  try { res.json({ models: await loadModelIoContracts(), dataTypes: await loadDataTypes() }); }
  catch (error) { next(error); }
});

router.post("/:id/download", async (req, res) => {
  if (req.get("origin") !== (process.env.WEB_ORIGIN ?? "http://localhost:5173")) {
    res.status(403).json({ error: "invalid_origin" });
    return;
  }
  try {
    if (!await isEnabledModel(req.params.id)) { res.status(404).json({ error: "unknown_model" }); return; }
    const { response, body } = await forwardRunnerRequest(`/models/${req.params.id}/download`, "POST");
    res.status(response.status).json(body);
  } catch {
    res.status(503).json({ error: "model_runner_unavailable" });
  }
});

router.delete("/:id/download", async (req, res) => {
  if (req.get("origin") !== (process.env.WEB_ORIGIN ?? "http://localhost:5173")) {
    res.status(403).json({ error: "invalid_origin" });
    return;
  }
  try {
    if (!await isEnabledModel(req.params.id)) { res.status(404).json({ error: "unknown_model" }); return; }
    const { response, body } = await forwardRunnerRequest(`/models/${req.params.id}/download`, "DELETE", 180_000);
    res.status(response.status).json(body);
  } catch {
    res.status(503).json({ error: "model_runner_unavailable" });
  }
});

export const modelsRouter = router;
