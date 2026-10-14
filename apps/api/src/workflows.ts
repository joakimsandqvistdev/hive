import { and, count, eq, inArray, sql, asc } from "drizzle-orm";
import { Router } from "express";
import { db } from "./db.js";
import { artifacts, runNodes, runs, workflowEdges, workflowNodes, workflows } from "./schema.js";
import { createWorkflowSchema, saveWorkflowSchema, startRunSchema, validateWorkflowDefinition } from "./workflowDefinition.js";
import { buildWorkflowRunSnapshot } from "./workflowRunSnapshot.js";
import { forwardRunnerRequest } from "./models.js";
import { loadDataTypes, loadModelIoContracts } from "./modelContracts.js";

const router = Router();
function userId(res: import("express").Response) { return res.locals.userId as string; }
function isUniqueViolation(error: unknown) { return typeof error === "object" && error !== null && "code" in error && error.code === "23505"; }
function parsePagination(req: import("express").Request) {
  const page = Math.min(1_000_000, Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1));
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(String(req.query.pageSize ?? "10"), 10) || 10));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

router.get("/", async (req, res, next) => {
  const ownerId = userId(res);
  const { page, pageSize, offset } = parsePagination(req);
  try {
    const [items, totalRows] = await Promise.all([
      db.select().from(workflows)
        .where(and(eq(workflows.userId, ownerId), sql`${workflows.archivedAt} is null`))
        .orderBy(sql`${workflows.updatedAt} desc`, sql`${workflows.id} desc`).limit(pageSize).offset(offset),
      db.select({ total: count() }).from(workflows).where(and(eq(workflows.userId, ownerId), sql`${workflows.archivedAt} is null`)),
    ]);
    const total = totalRows[0]?.total ?? 0;
    const nodeRows = items.length ? await db.select({ workflowId: workflowNodes.workflowId }).from(workflowNodes).where(inArray(workflowNodes.workflowId, items.map((workflow) => workflow.id))) : [];
    const counts = new Map<string, number>();
    for (const node of nodeRows) counts.set(node.workflowId, (counts.get(node.workflowId) ?? 0) + 1);
    const activeRunRows = items.length ? await db.select({ workflowId: runs.workflowId, runCount: sql<number>`count(*)` }).from(runs)
      .where(and(inArray(runs.workflowId, items.map((workflow) => workflow.id)), inArray(runs.status, ["queued", "running", "cancel_requested"])))
      .groupBy(runs.workflowId) : [];
    const activeRuns = new Map<string, number>();
    for (const run of activeRunRows) if (run.workflowId) activeRuns.set(run.workflowId, run.runCount);
    res.json({ items: items.map((workflow) => ({ ...workflow, nodeCount: counts.get(workflow.id) ?? 0, activeRunCount: activeRuns.get(workflow.id) ?? 0 })), page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
  } catch (error) { next(error); }
});

router.post("/", async (req, res, next) => {
  if (req.get("origin") !== (process.env.WEB_ORIGIN ?? "http://localhost:5173")) { res.status(403).json({ error: "invalid_origin" }); return; }
  const parsed = createWorkflowSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_workflow", details: parsed.error.flatten() }); return; }
  try {
    const workflow = await db.transaction(async (tx) => {
      const [created] = await tx.insert(workflows).values({ ...parsed.data, userId: userId(res) }).returning();
      return created;
    });
    res.status(201).json({ workflow });
  } catch (error) { next(error); }
});


function definitionFor(nodes: typeof workflowNodes.$inferSelect[], edges: typeof workflowEdges.$inferSelect[]) {
  return { nodes: nodes.map(({ nodeId, kind, label, modelId, dataTypeId, inputText, artifactId, parameters, positionX, positionY }) => ({
    id: nodeId, kind: kind as "input" | "model", label, modelId, dataTypeId: dataTypeId as "text" | "image" | "audio" | null,
    inputText, artifactId, parameters, position: { x: positionX, y: positionY } })),
    edges: edges.map((edge) => ({ id: edge.edgeId, source: edge.sourceNodeId, target: edge.targetNodeId, sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle })) };
}

router.get("/:id", async (req, res, next) => {
  try {
    const [workflow] = await db.select().from(workflows).where(and(eq(workflows.id, req.params.id), eq(workflows.userId, userId(res)))).limit(1);
    if (!workflow) { res.status(404).json({ error: "workflow_not_found" }); return; }
    const [nodes, edges] = await Promise.all([
      db.select().from(workflowNodes).where(eq(workflowNodes.workflowId, workflow.id)),
      db.select().from(workflowEdges).where(eq(workflowEdges.workflowId, workflow.id)).orderBy(asc(workflowEdges.edgeId)),
    ]);
    res.json({ workflow, definition: definitionFor(nodes, edges) });
  } catch (error) { next(error); }
});

router.put("/:id", async (req, res, next) => {
  if (req.get("origin") !== (process.env.WEB_ORIGIN ?? "http://localhost:5173")) { res.status(403).json({ error: "invalid_origin" }); return; }
  const parsed = saveWorkflowSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_workflow", details: parsed.error.flatten() }); return; }
  const ownerId = userId(res);
  try {
    const [contracts, types] = await Promise.all([loadModelIoContracts(), loadDataTypes()]);
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(workflows).where(and(eq(workflows.id, req.params.id), eq(workflows.userId, ownerId))).limit(1).for("update");
      if (!existing) return null;
      const ids = parsed.data.definition.nodes.flatMap((node) => node.artifactId ? [node.artifactId] : []);
      const uploads = ids.length ? await tx.select().from(artifacts).where(and(eq(artifacts.userId, ownerId), inArray(artifacts.id, ids))) : [];
      const validation = validateWorkflowDefinition(parsed.data.definition, contracts, uploads, types.map((type) => type.id));
      if (!validation.ok) return validation.error;
      const [updated] = await tx.update(workflows).set({ name: parsed.data.name, description: parsed.data.description, updatedAt: new Date() }).where(eq(workflows.id, existing.id)).returning();
      await tx.delete(workflowEdges).where(eq(workflowEdges.workflowId, existing.id));
      await tx.delete(workflowNodes).where(eq(workflowNodes.workflowId, existing.id));
      if (validation.nodes.length) await tx.insert(workflowNodes).values(validation.nodes.map((node) => ({
        workflowId: existing.id, userId: ownerId, nodeId: node.id, kind: node.kind, label: node.label,
        modelId: node.modelId ?? null, dataTypeId: node.dataTypeId ?? null, inputText: node.inputText, artifactId: node.artifactId ?? null,
        parameters: node.parameters, positionX: node.position.x, positionY: node.position.y,
      })));
      if (validation.edges.length) await tx.insert(workflowEdges).values(validation.edges.map((edge) => ({
        workflowId: existing.id, userId: ownerId, edgeId: edge.id, sourceNodeId: edge.source, targetNodeId: edge.target,
        sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle,
      })));
      return updated;
    });
    if (!result) { res.status(404).json({ error: "workflow_not_found" }); return; }
    if (typeof result === "string") { res.status(400).json({ error: result }); return; }
    res.json({ workflow: result });
  } catch (error) { next(error); }
});

router.post("/:id/runs", async (req, res, next) => {
  if (req.get("origin") !== (process.env.WEB_ORIGIN ?? "http://localhost:5173")) { res.status(403).json({ error: "invalid_origin" }); return; }
  const ownerId = userId(res);
  try {
    const [contracts, types] = await Promise.all([loadModelIoContracts(), loadDataTypes()]);
    const result = await db.transaction(async (tx) => {
      const [workflow] = await tx.select().from(workflows).where(and(eq(workflows.id, req.params.id), eq(workflows.userId, ownerId))).limit(1).for("share");
      if (!workflow) return null;
      const nodes = await tx.select().from(workflowNodes).where(eq(workflowNodes.workflowId, workflow.id));
      if (!nodes.length) return "workflow_has_no_nodes";
      const edges = await tx.select().from(workflowEdges).where(eq(workflowEdges.workflowId, workflow.id)).orderBy(asc(workflowEdges.edgeId));
      const ids = nodes.flatMap((node) => node.artifactId ? [node.artifactId] : []);
      const uploads = ids.length ? await tx.select().from(artifacts).where(and(eq(artifacts.userId, ownerId), inArray(artifacts.id, ids))) : [];
      const validation = validateWorkflowDefinition(definitionFor(nodes, edges), contracts, uploads, types.map((type) => type.id));
      if (!validation.ok) return validation.error;
      if (nodes.some((node) => node.kind === "model")) {
        const { response, body } = await forwardRunnerRequest("/models");
        const available = new Set(((body as { models?: Array<{ id: string; status: string }> }).models ?? []).filter((model) => model.status === "downloaded").map((model) => model.id));
        if (!response.ok || nodes.some((node) => node.kind === "model" && !available.has(node.modelId ?? ""))) return "model_not_downloaded";
      }
      const snapshot = buildWorkflowRunSnapshot(workflow, { nodes: validation.nodes, edges: validation.edges }, contracts);
      const [run] = await tx.insert(runs).values({ userId: ownerId, workflowId: workflow.id, status: "queued", inputJson: {}, workflowSnapshotJson: snapshot.workflowSnapshot }).returning();
      await tx.insert(runNodes).values(snapshot.runNodes.map((node) => ({ ...node, runId: run.id, userId: ownerId, status: "queued" as const })));
      return run;
    });
    if (!result) { res.status(404).json({ error: "workflow_not_found" }); return; }
    if (typeof result === "string") { res.status(result === "model_not_downloaded" ? 409 : 400).json({ error: result }); return; }
    res.status(202).json({ run: result });
  } catch (error) { next(error); }
});

router.delete("/:id", async (req, res, next) => {
  if (req.get("origin") !== (process.env.WEB_ORIGIN ?? "http://localhost:5173")) { res.status(403).json({ error: "invalid_origin" }); return; }
  try {
    const result = await db.transaction(async (tx) => {
      const [workflow] = await tx.select({ id: workflows.id }).from(workflows)
        .where(and(eq(workflows.id, req.params.id), eq(workflows.userId, userId(res)))).limit(1).for("update");
      if (!workflow) return { kind: "not_found" as const };
      const [usage] = await tx.select({ total: sql<number>`count(*)` }).from(runs)
        .where(and(eq(runs.workflowId, workflow.id), inArray(runs.status, ["queued", "running", "cancel_requested"])));
      if ((usage?.total ?? 0) > 0) return { kind: "in_use" as const, activeRunCount: usage.total };
      await tx.delete(workflows).where(and(eq(workflows.id, workflow.id), eq(workflows.userId, userId(res))));
      return { kind: "deleted" as const };
    });
    if (result.kind === "not_found") { res.status(404).json({ error: "workflow_not_found" }); return; }
    if (result.kind === "in_use") { res.status(409).json({ error: "workflow_in_use", activeRunCount: result.activeRunCount }); return; }
    res.status(204).end();
  } catch (error) { next(error); }
});

export { router as workflowsRouter };
