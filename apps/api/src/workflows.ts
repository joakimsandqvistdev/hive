import { and, count, eq, inArray, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { db } from "./db.js";
import { agents, workflowEdges, workflowNodes, workflows } from "./schema.js";

const router = Router();
const nodeSchema = z.object({
  id: z.string().min(1).max(100),
  agentId: z.string().uuid(),
  instructions: z.string().max(2000).default(""),
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
      db.select().from(workflowEdges).where(eq(workflowEdges.workflowId, workflow.id)),
    ]);
    res.json({ workflow, definition: {
      nodes: nodes.map((node) => ({ id: node.nodeId, agentId: node.agentId, instructions: node.instructions, position: { x: node.positionX, y: node.positionY } })),
      edges: edges.map((edge) => ({ id: edge.edgeId, source: edge.sourceNodeId, target: edge.targetNodeId })),
    } });
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
      if (referencedAgentIds.length) {
        const ownedAgents = await tx.select({ id: agents.id }).from(agents)
          .where(and(eq(agents.userId, ownerId), inArray(agents.id, referencedAgentIds)));
        if (ownedAgents.length !== referencedAgentIds.length) return "invalid_agents" as const;
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
          instructions: node.instructions,
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
