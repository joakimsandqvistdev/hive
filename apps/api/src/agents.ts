import { and, count, eq, inArray, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { db } from "./db.js";
import { agents, workflowNodes } from "./schema.js";
import { defaultImageModelParameters, imageModelParametersSchema } from "./modelParameters.js";
import { videoModelParametersSchema } from "./videoModelParameters.js";
import { forwardRunnerRequest } from "./models.js";

const router = Router();
const agentFields = {
  name: z.string().trim().min(1).max(80),
  prompt: z.string().trim().max(500).default(""),
};
const agentInput = z.discriminatedUnion("modality", [
  z.object({ ...agentFields, modality: z.literal("image"), parameters: imageModelParametersSchema.default(defaultImageModelParameters) }),
  z.object({ ...agentFields, modality: z.literal("video"), parameters: videoModelParametersSchema }),
]);

function userId(res: import("express").Response) {
  return res.locals.userId as string;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

async function modelAvailability(modelId: string): Promise<"available" | "not_downloaded" | "runner_unavailable"> {
  try {
    const { response, body } = await forwardRunnerRequest("/models");
    const models = typeof body === "object" && body !== null && "models" in body ? body.models : undefined;
    if (!response.ok || !Array.isArray(models)) return "runner_unavailable";
    return models.some((model) => typeof model === "object" && model !== null &&
      "id" in model && model.id === modelId && "status" in model && model.status === "downloaded")
      ? "available" : "not_downloaded";
  } catch {
    return "runner_unavailable";
  }
}

function requestedModel(data: z.infer<typeof agentInput>): string {
  return data.parameters.modelId;
}

async function rejectUnavailableModel(modelId: string, res: import("express").Response): Promise<boolean> {
  const availability = await modelAvailability(modelId);
  if (availability === "available") return false;
  if (availability === "runner_unavailable") res.status(503).json({ error: "model_runner_unavailable" });
  else res.status(409).json({ error: "model_not_downloaded", modelId });
  return true;
}

router.get("/", async (req, res, next) => {
  const page = Math.min(1_000_000, Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1));
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(String(req.query.pageSize ?? "10"), 10) || 10));
  const offset = (page - 1) * pageSize;
  try {
    const [rows, totalRows] = await Promise.all([
      db.select().from(agents).where(eq(agents.userId, userId(res)))
        .orderBy(sql`${agents.createdAt} desc`, sql`${agents.id} desc`).limit(pageSize).offset(offset),
      db.select({ total: count() }).from(agents).where(eq(agents.userId, userId(res))),
    ]);
    const total = totalRows[0]?.total ?? 0;
    const usageRows = rows.length ? await db.select({ agentId: workflowNodes.agentId, usageCount: sql<number>`count(distinct ${workflowNodes.workflowId})` })
      .from(workflowNodes).where(inArray(workflowNodes.agentId, rows.map((agent) => agent.id)))
      .groupBy(workflowNodes.agentId) : [];
    const usage = new Map(usageRows.map((row) => [row.agentId, row.usageCount]));
    res.json({ items: rows.map((agent) => ({ ...agent, workflowUsageCount: usage.get(agent.id) ?? 0 })), page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
  } catch (error) { next(error); }
});

router.post("/", async (req, res, next) => {
  if (req.get("origin") !== (process.env.WEB_ORIGIN ?? "http://localhost:5173")) {
    res.status(403).json({ error: "invalid_origin" });
    return;
  }
  const parsed = agentInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_agent", details: parsed.error.flatten() });
    return;
  }
  try {
    if (await rejectUnavailableModel(requestedModel(parsed.data), res)) return;
    const [agent] = await db.insert(agents).values({ ...parsed.data, userId: userId(res) }).returning();
    res.status(201).json({ agent });
  } catch (error) {
    if (isUniqueViolation(error)) { res.status(409).json({ error: "duplicate_name" }); return; }
    next(error);
  }
});

router.patch("/:id", async (req, res, next) => {
  if (req.get("origin") !== (process.env.WEB_ORIGIN ?? "http://localhost:5173")) {
    res.status(403).json({ error: "invalid_origin" });
    return;
  }
  const parsed = agentInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_agent", details: parsed.error.flatten() });
    return;
  }
  try {
    const [current] = await db.select({ modality: agents.modality, parameters: agents.parameters }).from(agents)
      .where(and(eq(agents.id, req.params.id), eq(agents.userId, userId(res)))).limit(1);
    if (!current) { res.status(404).json({ error: "agent_not_found" }); return; }
    const modelId = requestedModel(parsed.data);
    const currentModelId = typeof current.parameters.modelId === "string" ? current.parameters.modelId : null;
    if (modelId !== currentModelId && await rejectUnavailableModel(modelId, res)) return;
    const [agent] = await db.update(agents)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(agents.id, req.params.id), eq(agents.userId, userId(res))))
      .returning();
    if (!agent) { res.status(404).json({ error: "agent_not_found" }); return; }
    res.json({ agent });
  } catch (error) {
    if (isUniqueViolation(error)) { res.status(409).json({ error: "duplicate_name" }); return; }
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  if (req.get("origin") !== (process.env.WEB_ORIGIN ?? "http://localhost:5173")) {
    res.status(403).json({ error: "invalid_origin" });
    return;
  }
  try {
    const [agent] = await db.select({ id: agents.id }).from(agents)
      .where(and(eq(agents.id, req.params.id), eq(agents.userId, userId(res)))).limit(1);
    if (!agent) { res.status(404).json({ error: "agent_not_found" }); return; }

    const [usage] = await db.select({ total: sql<number>`count(distinct ${workflowNodes.workflowId})` }).from(workflowNodes)
      .where(eq(workflowNodes.agentId, agent.id));
    if ((usage?.total ?? 0) > 0) {
      res.status(409).json({ error: "agent_in_use", workflowUsageCount: usage.total });
      return;
    }

    await db.delete(agents).where(and(eq(agents.id, agent.id), eq(agents.userId, userId(res))));
    res.status(204).end();
  } catch (error) {
    // The FK is the final guard if a workflow starts referencing the agent after the count check.
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23503") {
      res.status(409).json({ error: "agent_in_use" });
      return;
    }
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const [agent] = await db.select().from(agents)
      .where(and(eq(agents.id, req.params.id), eq(agents.userId, userId(res)))).limit(1);
    if (!agent) { res.status(404).json({ error: "agent_not_found" }); return; }
    res.json({ agent });
  } catch (error) { next(error); }
});

export { router as agentsRouter };
