import { Router } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "./db.js";
import { models, workflowNodes, workflows } from "./schema.js";
import { loadDataTypes, loadModelIoContracts } from "./modelContracts.js";
import { loadCustomNodeCatalog } from "./customNodeCatalog.js";

const router = Router();
const modelRunnerUrl = (process.env.MODEL_RUNNER_URL ?? "http://127.0.0.1:8188").replace(/\/$/, "");
async function isEnabledModel(modelId: string) {
  const [model] = await db.select({ id: models.id }).from(models).where(and(eq(models.id, modelId), eq(models.enabled, true))).limit(1);
  return Boolean(model);
}

export async function forwardRunnerRequest(path: string, method = "GET", timeoutMs = 15_000) {
  const token = process.env.RUNNER_API_TOKEN;
  if (!token) throw new Error("Model runner authentication is not configured");
  const response = await fetch(`${modelRunnerUrl}${path}`, { method, headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(timeoutMs) });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

router.get("/", async (_req, res) => {
  try {
    const { response, body } = await forwardRunnerRequest("/models");
    if (!response.ok) { res.status(502).json({ error: "model_runner_unavailable" }); return; }
    const modelIds = Array.isArray((body as { models?: unknown[] }).models)
      ? ((body as { models: Array<{ id?: unknown }> }).models).map((item) => String(item.id ?? "")).filter(Boolean)
      : [];
    const usageRows = modelIds.length ? await db.select({ modelId: workflowNodes.modelId, workflowId: workflows.id, isCustomNode: workflows.isCustomNode })
      .from(workflowNodes).innerJoin(workflows, and(eq(workflowNodes.workflowId, workflows.id), eq(workflowNodes.userId, workflows.userId)))
      .where(and(eq(workflowNodes.userId, res.locals.userId as string), inArray(workflowNodes.modelId, modelIds))) : [];
    const usage = new Map<string, { workflowIds: Set<string>; customNodeIds: Set<string> }>();
    for (const row of usageRows) {
      if (!row.modelId) continue;
      const counts = usage.get(row.modelId) ?? { workflowIds: new Set<string>(), customNodeIds: new Set<string>() };
      (row.isCustomNode ? counts.customNodeIds : counts.workflowIds).add(row.workflowId);
      usage.set(row.modelId, counts);
    }
    const runnerBody = body as { models?: Array<Record<string, unknown>> };
    res.json({
      ...runnerBody,
      models: (runnerBody.models ?? []).map((model) => {
        const counts = usage.get(String(model.id));
        return { ...model, usage: { workflowCount: counts?.workflowIds.size ?? 0, customNodeCount: counts?.customNodeIds.size ?? 0 } };
      }),
    });
  } catch {
    res.status(503).json({ error: "model_runner_unavailable" });
  }
});

router.get("/contracts", async (_req, res, next) => {
  try {
    const [models, dataTypes, customNodes] = await Promise.all([loadModelIoContracts(), loadDataTypes(), loadCustomNodeCatalog(res.locals.userId as string)]);
    res.json({ models, dataTypes, customNodes: customNodes.map(({ id, name, description, needsAttention, interface: nodeInterface, contract }) => ({ id, name, description, needsAttention, interface: nodeInterface, contract })) });
  }
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

router.post("/:id/download/pause", async (req, res) => {
  if (req.get("origin") !== (process.env.WEB_ORIGIN ?? "http://localhost:5173")) { res.status(403).json({ error: "invalid_origin" }); return; }
  try {
    if (!await isEnabledModel(req.params.id)) { res.status(404).json({ error: "unknown_model" }); return; }
    const { response, body } = await forwardRunnerRequest(`/models/${req.params.id}/download/pause`, "POST", 180_000);
    res.status(response.status).json(body);
  } catch { res.status(503).json({ error: "model_runner_unavailable" }); }
});

router.post("/:id/download/resume", async (req, res) => {
  if (req.get("origin") !== (process.env.WEB_ORIGIN ?? "http://localhost:5173")) { res.status(403).json({ error: "invalid_origin" }); return; }
  try {
    if (!await isEnabledModel(req.params.id)) { res.status(404).json({ error: "unknown_model" }); return; }
    const { response, body } = await forwardRunnerRequest(`/models/${req.params.id}/download/resume`, "POST");
    res.status(response.status).json(body);
  } catch { res.status(503).json({ error: "model_runner_unavailable" }); }
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

router.delete("/:id/cache", async (req, res) => {
  if (req.get("origin") !== (process.env.WEB_ORIGIN ?? "http://localhost:5173")) { res.status(403).json({ error: "invalid_origin" }); return; }
  try {
    if (!await isEnabledModel(req.params.id)) { res.status(404).json({ error: "unknown_model" }); return; }
    const { response, body } = await forwardRunnerRequest(`/models/${req.params.id}/cache`, "DELETE", 180_000);
    res.status(response.status).json(body);
  } catch { res.status(503).json({ error: "model_runner_unavailable" }); }
});

export const modelsRouter = router;
