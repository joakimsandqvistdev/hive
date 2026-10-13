import { and, count, eq, inArray, sql, asc } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { db } from "./db.js";
import { agents, runNodes, runs, workflowEdges, workflowNodes, workflows } from "./schema.js";
import { imageModelParametersSchema } from "./modelParameters.js";

const router = Router();
const nodeSchema = z.object({
  id: z.string().min(1).max(100),
  agentId: z.string().uuid(),
  prompt: z.string().max(2000).optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  position: z.object({ x: z.number().finite().min(-1_000_000).max(1_000_000), y: z.number().finite().min(-1_000_000).max(1_000_000) }),
});
const edgeSchema = z.object({
  id: z.string().min(1).max(120),
  source: z.string().min(1).max(100),
  target: z.string().min(1).max(100),
});
const definitionSchema = z.object({ nodes: z.array(nodeSchema).max(100), edges: z.array(edgeSchema).max(300) })
  .superRefine((definition, context) => {
    const nodeIds = new Set<string>();
    definition.nodes.forEach((node, index) => {
      if (nodeIds.has(node.id)) context.addIssue({ code: "custom", path: ["nodes", index, "id"], message: "Node IDs must be unique." });
      nodeIds.add(node.id);
    });
    definition.edges.forEach((edge, index) => {
      if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
        context.addIssue({ code: "custom", path: ["edges", index], message: "Edges must connect existing nodes." });
      }
      if (edge.source === edge.target) context.addIssue({ code: "custom", path: ["edges", index], message: "A node cannot connect to itself." });
    });
    const edgeIds = new Set<string>();
    definition.edges.forEach((edge, index) => {
      if (edgeIds.has(edge.id)) context.addIssue({ code: "custom", path: ["edges", index, "id"], message: "Edge IDs must be unique." });
      edgeIds.add(edge.id);
    });
    const indegree = new Map([...nodeIds].map((id) => [id, 0]));
    const outgoing = new Map([...nodeIds].map((id) => [id, [] as string[]]));
    for (const edge of definition.edges) {
      if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
      outgoing.get(edge.source)?.push(edge.target);
      indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    }
    const ready = [...indegree].filter(([, degree]) => degree === 0).map(([id]) => id);
    let visited = 0;
    while (ready.length) {
      const id = ready.pop()!;
      visited += 1;
      for (const target of outgoing.get(id) ?? []) {
        const nextDegree = (indegree.get(target) ?? 1) - 1;
        indegree.set(target, nextDegree);
        if (nextDegree === 0) ready.push(target);
      }
    }
    if (visited !== nodeIds.size) context.addIssue({ code: "custom", path: ["edges"], message: "Workflow connections cannot contain cycles." });
  });
const metadataSchema = z.object({ name: z.string().trim().min(1).max(100), description: z.string().trim().max(1000).default("") });
const createSchema = metadataSchema;
const saveSchema = metadataSchema.extend({ definition: definitionSchema });
const startRunSchema = z.object({});
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
    res.json({ items: items.map((workflow) => ({ ...workflow, nodeCount: counts.get(workflow.id) ?? 0 })), page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
  } catch (error) { next(error); }
});

router.post("/", async (req, res, next) => {
  if (req.get("origin") !== (process.env.WEB_ORIGIN ?? "http://localhost:5173")) { res.status(403).json({ error: "invalid_origin" }); return; }
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_workflow", details: parsed.error.flatten() }); return; }
  try {
    const workflow = await db.transaction(async (tx) => {
      const [created] = await tx.insert(workflows).values({ ...parsed.data, userId: userId(res) }).returning();
      return created;
    });
    res.status(201).json({ workflow });
  } catch (error) { next(error); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const [workflow] = await db.select().from(workflows)
      .where(and(eq(workflows.id, req.params.id), eq(workflows.userId, userId(res)), sql`${workflows.archivedAt} is null`)).limit(1);
    if (!workflow) { res.status(404).json({ error: "workflow_not_found" }); return; }
    const [nodes, edges] = await Promise.all([
      db.select().from(workflowNodes).where(eq(workflowNodes.workflowId, workflow.id)),
      db.select().from(workflowEdges).where(eq(workflowEdges.workflowId, workflow.id)).orderBy(asc(workflowEdges.edgeId)),
    ]);
    res.json({ workflow, definition: {
      nodes: nodes.map((node) => ({ id: node.nodeId, agentId: node.agentId, prompt: node.prompt, parameters: node.parameters, position: { x: node.positionX, y: node.positionY } })),
      edges: edges.map((edge) => ({ id: edge.edgeId, source: edge.sourceNodeId, target: edge.targetNodeId })),
    } });
  } catch (error) { next(error); }
});

router.post("/:id/runs", async (req, res, next) => {
  if (req.get("origin") !== (process.env.WEB_ORIGIN ?? "http://localhost:5173")) { res.status(403).json({ error: "invalid_origin" }); return; }
  const parsed = startRunSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_run_input", details: parsed.error.flatten() }); return; }
  const ownerId = userId(res);
  try {
    const result = await db.transaction(async (tx) => {
      const [workflow] = await tx.select().from(workflows)
        .where(and(eq(workflows.id, req.params.id), eq(workflows.userId, ownerId), sql`${workflows.archivedAt} is null`))
        .limit(1).for("share");
      if (!workflow) return null;

      const rows = await tx.select({
        nodeId: workflowNodes.nodeId,
        agentId: agents.id,
        agentName: agents.name,
        modality: agents.modality,
        agentPrompt: agents.prompt,
        agentParameters: agents.parameters,
        prompt: workflowNodes.prompt,
        parameters: workflowNodes.parameters,
        positionX: workflowNodes.positionX,
        positionY: workflowNodes.positionY,
      }).from(workflowNodes)
        .innerJoin(agents, and(eq(agents.id, workflowNodes.agentId), eq(agents.userId, ownerId)))
        .where(eq(workflowNodes.workflowId, workflow.id));
      if (rows.length === 0) return "empty_workflow" as const;

      const edges = await tx.select({ id: workflowEdges.edgeId, source: workflowEdges.sourceNodeId, target: workflowEdges.targetNodeId })
        .from(workflowEdges).where(eq(workflowEdges.workflowId, workflow.id)).orderBy(asc(workflowEdges.edgeId));
      const workflowSnapshot = {
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        nodes: rows.map((node) => ({
          id: node.nodeId,
          agentId: node.agentId,
          agent: { id: node.agentId, name: node.agentName, modality: node.modality, prompt: node.agentPrompt, parameters: node.agentParameters },
          prompt: node.prompt,
          parameters: node.modality === "image" && Object.keys(node.parameters).length === 0 ? node.agentParameters : node.parameters,
          position: { x: node.positionX, y: node.positionY },
        })),
        edges,
      };
      const [run] = await tx.insert(runs).values({
        userId: ownerId,
        workflowId: workflow.id,
        status: "queued",
        inputJson: {},
        workflowSnapshotJson: workflowSnapshot,
      }).returning();
      await tx.insert(runNodes).values(rows.map((node) => ({
        runId: run.id,
        userId: ownerId,
        nodeId: node.nodeId,
        agentId: node.agentId,
        status: "queued" as const,
        agentSnapshotJson: { id: node.agentId, name: node.agentName, modality: node.modality, prompt: node.agentPrompt, parameters: node.agentParameters },
        prompt: node.prompt,
        parameters: node.modality === "image" && Object.keys(node.parameters).length === 0 ? node.agentParameters : node.parameters,
      })));
      return run;
    });
    if (result === null) { res.status(404).json({ error: "workflow_not_found" }); return; }
    if (result === "empty_workflow") { res.status(400).json({ error: "workflow_has_no_nodes" }); return; }
    res.status(202).json({ run: result });
  } catch (error) { next(error); }
});

router.put("/:id", async (req, res, next) => {
  if (req.get("origin") !== (process.env.WEB_ORIGIN ?? "http://localhost:5173")) { res.status(403).json({ error: "invalid_origin" }); return; }
  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_workflow", details: parsed.error.flatten() }); return; }
  const ownerId = userId(res);
  const referencedAgentIds = [...new Set(parsed.data.definition.nodes.map((node) => node.agentId))];
  try {
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(workflows)
        .where(and(eq(workflows.id, req.params.id), eq(workflows.userId, ownerId), sql`${workflows.archivedAt} is null`)).limit(1).for("update");
      if (!existing) return null;
      const agentRows = referencedAgentIds.length
        ? await tx.select({ id: agents.id, prompt: agents.prompt, modality: agents.modality, parameters: agents.parameters }).from(agents)
          .where(and(eq(agents.userId, ownerId), inArray(agents.id, referencedAgentIds)))
        : [];
      if (agentRows.length !== referencedAgentIds.length) return "invalid_agents" as const;
      const agentById = new Map(agentRows.map((agent) => [agent.id, agent]));
      const nodeParameters = new Map<string, Record<string, unknown>>();
      const nodeModelById = new Map<string, string>();
      const nodeModalityById = new Map<string, string>();
      for (const node of parsed.data.definition.nodes) {
        const agent = agentById.get(node.agentId)!;
        nodeModalityById.set(node.id, agent.modality);
        if (agent.modality === "image") {
          const suppliedParameters = { ...agent.parameters, ...node.parameters };
          const parameters = imageModelParametersSchema.safeParse(suppliedParameters);
          if (!parameters.success) return "invalid_parameters" as const;
          nodeParameters.set(node.id, parameters.data);
          nodeModelById.set(node.id, parameters.data.modelId);
        } else {
          nodeParameters.set(node.id, {});
          nodeModelById.set(node.id, "");
        }
      }
      const incomingReferences = new Map<string, Set<string>>();
      for (const edge of parsed.data.definition.edges) {
        if (nodeModalityById.get(edge.source) !== "image" || nodeModelById.get(edge.target) !== "qwen-image-edit-2511") {
          return "unsupported_image_connections" as const;
        }
        const sourceIds = incomingReferences.get(edge.target) ?? new Set<string>();
        sourceIds.add(edge.source);
        incomingReferences.set(edge.target, sourceIds);
      }
      for (const node of parsed.data.definition.nodes) {
        if (nodeModelById.get(node.id) === "qwen-image-edit-2511") {
          const referenceCount = incomingReferences.get(node.id)?.size ?? 0;
          if (referenceCount < 1 || referenceCount > 10) return "invalid_reference_count" as const;
        }
      }
      const [updated] = await tx.update(workflows).set({ name: parsed.data.name, description: parsed.data.description, updatedAt: new Date() })
        .where(and(eq(workflows.id, existing.id), eq(workflows.userId, ownerId))).returning();
      await tx.delete(workflowEdges).where(eq(workflowEdges.workflowId, existing.id));
      await tx.delete(workflowNodes).where(eq(workflowNodes.workflowId, existing.id));
      if (parsed.data.definition.nodes.length) {
        await tx.insert(workflowNodes).values(parsed.data.definition.nodes.map((node) => ({
          workflowId: existing.id,
          nodeId: node.id,
          userId: ownerId,
          agentId: node.agentId,
          prompt: node.prompt ?? agentById.get(node.agentId)?.prompt ?? "",
          parameters: nodeParameters.get(node.id) ?? {},
          positionX: node.position.x,
          positionY: node.position.y,
        })));
      }
      if (parsed.data.definition.edges.length) {
        await tx.insert(workflowEdges).values(parsed.data.definition.edges.map((edge) => ({
          workflowId: existing.id,
          edgeId: edge.id,
          userId: ownerId,
          sourceNodeId: edge.source,
          targetNodeId: edge.target,
        })));
      }
      return updated;
    });
    if (result === null) { res.status(404).json({ error: "workflow_not_found" }); return; }
    if (result === "invalid_agents") { res.status(400).json({ error: "invalid_workflow_agents" }); return; }
    if (result === "invalid_parameters") { res.status(400).json({ error: "invalid_model_parameters" }); return; }
    if (result === "unsupported_image_connections") { res.status(400).json({ error: "unsupported_image_connections" }); return; }
    if (result === "invalid_reference_count") { res.status(400).json({ error: "invalid_reference_count" }); return; }
    res.json({ workflow: result });
  } catch (error) {
    if (isUniqueViolation(error)) { res.status(409).json({ error: "duplicate_name" }); return; }
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  if (req.get("origin") !== (process.env.WEB_ORIGIN ?? "http://localhost:5173")) { res.status(403).json({ error: "invalid_origin" }); return; }
  try {
    const [deleted] = await db.delete(workflows).where(and(eq(workflows.id, req.params.id), eq(workflows.userId, userId(res)))).returning({ id: workflows.id });
    if (!deleted) { res.status(404).json({ error: "workflow_not_found" }); return; }
    res.status(204).end();
  } catch (error) { next(error); }
});

export { router as workflowsRouter };
