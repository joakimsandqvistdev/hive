import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { Router } from "express";
import { db } from "./db.js";
import { loadDataTypes, loadModelIoContracts, type ModelIoContract } from "./modelContracts.js";
import { customNodeMetadataSchema, saveCustomNodeSchema, validateWorkflowDefinition } from "./workflowDefinition.js";
import { deriveCustomNodeInterface, hasOutdatedCustomNodeReferences, isCustomNodeInterfaceSelectionValid, loadCustomNodeCatalog, snapshotCustomNodeReferences, type CustomNodeCatalogItem } from "./customNodeCatalog.js";
import { definitionFor } from "./workflowRunService.js";
import { artifacts, instagramAccounts, workflowEdges, workflowNodes, workflows } from "./schema.js";
import { instagramPublishingContract } from "./processingNodes.js";
import { parsePagination, totalPages } from "./pagination.js";

const router = Router();
const userId = (res: import("express").Response) => res.locals.userId as string;

async function deletionImpact(id: string, ownerId: string, catalog: CustomNodeCatalogItem[]) {
  const rows = await db.select({ workflowId: workflowNodes.workflowId, isCustomNode: workflows.isCustomNode }).from(workflowNodes).innerJoin(workflows, eq(workflows.id, workflowNodes.workflowId)).where(and(eq(workflows.userId, ownerId), sql`${workflowNodes.parameters}->>'customNodeId' = ${id}`));
  const directWorkflowCount = new Set(rows.filter((row) => !row.isCustomNode).map((row) => row.workflowId)).size;
  const directCustomNodeCount = new Set(rows.filter((row) => row.isCustomNode).map((row) => row.workflowId)).size;
  const affectedIds = new Set<string>();
  const queue = [id];
  while (queue.length) {
    const current = queue.shift()!;
    const consumers = await db.select({ workflowId: workflowNodes.workflowId, isCustomNode: workflows.isCustomNode }).from(workflowNodes).innerJoin(workflows, eq(workflows.id, workflowNodes.workflowId)).where(and(eq(workflows.userId, ownerId), sql`${workflowNodes.parameters}->>'customNodeId' = ${current}`));
    for (const row of consumers) if (row.workflowId !== id && !affectedIds.has(row.workflowId)) {
      affectedIds.add(row.workflowId);
      if (row.isCustomNode) queue.push(row.workflowId);
    }
  }
  return { directWorkflowCount, directCustomNodeCount, affectedWorkflowCount: [...affectedIds].filter((value) => !catalog.some((item) => item.id === value)).length, affectedCustomNodeCount: [...affectedIds].filter((value) => catalog.some((item) => item.id === value)).length };
}

async function refreshAttention(ownerId: string) {
  const catalog = await loadCustomNodeCatalog(ownerId);
  const byId = new Map(catalog.map((item) => [item.id, item]));
  const attentionById = new Map<string, boolean>();
  const visiting = new Set<string>();
  const customNeedsAttention = (id: string): boolean => {
    if (attentionById.has(id)) return attentionById.get(id)!;
    const item = byId.get(id);
    if (!item) return true;
    if (visiting.has(id)) return true;
    visiting.add(id);
    for (const node of item.definition.nodes) {
      if (node.kind !== "custom") continue;
      const childId = String(node.parameters?.customNodeId ?? "");
      if (!byId.has(childId) || customNeedsAttention(childId)) {
        attentionById.set(id, true); visiting.delete(id); return true;
      }
    }
    const outdated = hasOutdatedCustomNodeReferences(item.definition as never, catalog, attentionById);
    visiting.delete(id);
    attentionById.set(id, outdated);
    return outdated;
  };
  for (const item of catalog) customNeedsAttention(item.id);
  await db.transaction(async (tx) => {
    for (const item of catalog) await tx.update(workflows).set({ needsAttention: attentionById.get(item.id) ?? false }).where(and(eq(workflows.id, item.id), eq(workflows.userId, ownerId)));
    const ordinary = await tx.select().from(workflows).where(and(eq(workflows.userId, ownerId), eq(workflows.isCustomNode, false)));
    if (ordinary.length) {
      const nodeRows = await tx.select().from(workflowNodes).where(inArray(workflowNodes.workflowId, ordinary.map((item) => item.id)));
      const edgeRows = await tx.select().from(workflowEdges).where(inArray(workflowEdges.workflowId, ordinary.map((item) => item.id)));
      for (const item of ordinary) {
        const definition = definitionFor(nodeRows.filter((node) => node.workflowId === item.id), edgeRows.filter((edge) => edge.workflowId === item.id));
        await tx.update(workflows).set({ needsAttention: hasOutdatedCustomNodeReferences(definition as never, catalog, attentionById) }).where(and(eq(workflows.id, item.id), eq(workflows.userId, ownerId)));
      }
    }
  });
}

async function propagateAttention(startIds: string[], ownerId: string) {
  const queue = [...startIds];
  const seen = new Set<string>();
  while (queue.length) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    const refs = await db.select({ workflowId: workflowNodes.workflowId, isCustomNode: workflows.isCustomNode })
      .from(workflowNodes).innerJoin(workflows, eq(workflows.id, workflowNodes.workflowId))
      .where(and(eq(workflows.userId, ownerId), sql`${workflowNodes.parameters}->>'customNodeId' = ${current}`));
    const consumers = [...new Set(refs.map((row) => row.workflowId))];
    if (consumers.length) {
      await db.update(workflows).set({ needsAttention: true }).where(and(eq(workflows.userId, ownerId), inArray(workflows.id, consumers)));
      for (const row of refs) if (row.isCustomNode && !seen.has(row.workflowId)) queue.push(row.workflowId);
    }
  }
}

router.get("/catalog", async (req, res, next) => {
  try {
    const all = await loadCustomNodeCatalog(userId(res));
    const excludeId = typeof req.query.excludeId === "string" ? req.query.excludeId : null;
    const forbidden = new Set<string>();
    if (excludeId) {
      const dependsOn = (id: string, target: string, seen = new Set<string>()): boolean => {
        if (id === target) return true;
        if (seen.has(id)) return false;
        seen.add(id);
        return (all.find((candidate) => candidate.id === id)?.definition.nodes ?? []).some((node) => node.kind === "custom" && dependsOn(String(node.parameters?.customNodeId ?? ""), target, seen));
      };
      for (const item of all) if (dependsOn(item.id, excludeId)) forbidden.add(item.id);
    }
    const items = all.filter((item) => !forbidden.has(item.id)).map(({ id, name, description, needsAttention, interface: nodeInterface, contract }) => ({ id, name, description, needsAttention, interface: nodeInterface, contract }));
    res.json({ items });
  } catch (error) { next(error); }
});

router.get("/", async (req, res, next) => {
  try {
    const ownerId = userId(res);
    const { page, pageSize, offset } = parsePagination(req);
    const conditions = and(eq(workflows.userId, ownerId), eq(workflows.isCustomNode, true), isNull(workflows.archivedAt));
    const [items, totalRows] = await Promise.all([
      db.select().from(workflows).where(conditions)
        .orderBy(sql`${workflows.updatedAt} desc`, sql`${workflows.id} desc`).limit(pageSize).offset(offset),
      db.select({ total: count() }).from(workflows).where(conditions),
    ]);
    const total = totalRows[0]?.total ?? 0;
    const ids = items.map((item) => item.id);
    const [nodeCounts, usageCounts] = await Promise.all([
      ids.length ? db.select({ workflowId: workflowNodes.workflowId, total: count() }).from(workflowNodes)
        .where(inArray(workflowNodes.workflowId, ids)).groupBy(workflowNodes.workflowId) : [],
      ids.length ? db.select({ customNodeId: sql<string>`${workflowNodes.parameters}->>'customNodeId'`, total: sql<number>`count(distinct ${workflowNodes.workflowId})` })
        .from(workflowNodes).innerJoin(workflows, eq(workflows.id, workflowNodes.workflowId))
        .where(and(eq(workflows.userId, ownerId), inArray(sql`${workflowNodes.parameters}->>'customNodeId'`, ids)))
        .groupBy(sql`${workflowNodes.parameters}->>'customNodeId'`) : [],
    ]);
    const nodesByWorkflow = new Map(nodeCounts.map((row) => [row.workflowId, row.total]));
    const usesByCustomNode = new Map(usageCounts.map((row) => [row.customNodeId, row.total]));
    res.json({ items: items.map((item) => ({ ...item, nodeCount: nodesByWorkflow.get(item.id) ?? 0, directUsageCount: usesByCustomNode.get(item.id) ?? 0 })), page, pageSize, total, totalPages: totalPages(total, pageSize) });
  } catch (error) { next(error); }
});

router.get("/:id/impact", async (req, res, next) => {
  try {
    const ownerId = userId(res);
    const catalog = await loadCustomNodeCatalog(ownerId);
    if (!catalog.some((item) => item.id === req.params.id)) { res.status(404).json({ error: "custom_node_not_found" }); return; }
    res.json(await deletionImpact(req.params.id, ownerId, catalog));
  } catch (error) { next(error); }
});

router.post("/", async (req, res, next) => {
  if (req.get("origin") !== (process.env.WEB_ORIGIN ?? "http://localhost:5173")) { res.status(403).json({ error: "invalid_origin" }); return; }
  const parsed = customNodeMetadataSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_custom_node", details: parsed.error.flatten() }); return; }
  try {
    const [customNode] = await db.insert(workflows).values({ ...parsed.data, userId: userId(res), isCustomNode: true }).returning();
    res.status(201).json({ customNode });
  } catch (error) { next(error); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const ownerId = userId(res);
    const [customNode] = await db.select().from(workflows).where(and(eq(workflows.id, req.params.id), eq(workflows.userId, ownerId), eq(workflows.isCustomNode, true))).limit(1);
    if (!customNode) { res.status(404).json({ error: "custom_node_not_found" }); return; }
    const [nodes, edges, catalog] = await Promise.all([
      db.select().from(workflowNodes).where(eq(workflowNodes.workflowId, customNode.id)),
      db.select().from(workflowEdges).where(eq(workflowEdges.workflowId, customNode.id)),
      loadCustomNodeCatalog(ownerId),
    ]);
    res.json({ customNode, definition: definitionFor(nodes, edges), interface: catalog.find((item) => item.id === customNode.id)?.interface ?? null, catalog: catalog.filter((item) => item.id !== customNode.id).map(({ id, name, description, interface: nodeInterface, contract }) => ({ id, name, description, interface: nodeInterface, contract })) });
  } catch (error) { next(error); }
});

router.put("/:id", async (req, res, next) => {
  if (req.get("origin") !== (process.env.WEB_ORIGIN ?? "http://localhost:5173")) { res.status(403).json({ error: "invalid_origin" }); return; }
  const parsed = saveCustomNodeSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_custom_node", details: parsed.error.flatten() }); return; }
  const ownerId = userId(res);
  try {
    const [models, dataTypes, catalog] = await Promise.all([loadModelIoContracts(), loadDataTypes(), loadCustomNodeCatalog(ownerId)]);
    const catalogById = new Map(catalog.map((item) => [item.id, item]));
    const id = req.params.id;
    const interfaceSelection = parsed.data.interfaceSelection ?? null;
    for (const node of parsed.data.definition.nodes.filter((item) => item.kind === "custom")) {
      const childId = String(node.parameters?.customNodeId ?? "");
      if (childId === id) { res.status(400).json({ error: "custom_node_cycle" }); return; }
      const visit = (current: string, seen = new Set<string>()): boolean => {
        if (current === id) return true;
        if (seen.has(current)) return false;
        seen.add(current);
        return (catalogById.get(current)?.definition.nodes ?? []).some((child) => child.kind === "custom" && visit(String(child.parameters?.customNodeId ?? ""), seen));
      };
      if (visit(childId)) { res.status(400).json({ error: "custom_node_cycle" }); return; }
    }
    const childContracts = new Map(catalog.map((item) => [item.id, item.contract]));
    if (interfaceSelection && !isCustomNodeInterfaceSelectionValid(parsed.data.definition, models, childContracts, interfaceSelection)) { res.status(400).json({ error: "invalid_custom_node_interface" }); return; }
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(workflows).where(and(eq(workflows.id, id), eq(workflows.userId, ownerId), eq(workflows.isCustomNode, true))).limit(1).for("update");
      if (!existing) return null;
      const definition = snapshotCustomNodeReferences(parsed.data.definition, catalog);
      const ids = definition.nodes.flatMap((node) => node.artifactId ? [node.artifactId] : []);
      const uploads = ids.length ? await tx.select().from(artifacts).where(and(eq(artifacts.userId, ownerId), inArray(artifacts.id, ids))) : [];
      const validation = validateWorkflowDefinition(definition, models, uploads, dataTypes.map((type) => type.id), existing.id, catalog.map((item) => item.contract), true);
      if (!validation.ok) return validation.error;
      for (const node of validation.nodes.filter((item) => item.kind === "publishing")) {
        const [account] = await tx.select({ id: instagramAccounts.id }).from(instagramAccounts).where(and(eq(instagramAccounts.id, String(node.parameters.accountId)), eq(instagramAccounts.userId, ownerId))).limit(1);
        if (!account) return "instagram_account_not_connected";
      }
      const [updated] = await tx.update(workflows).set({ name: parsed.data.name, description: parsed.data.description, interfaceSelection, needsAttention: hasOutdatedCustomNodeReferences(definition, catalog), updatedAt: new Date() }).where(eq(workflows.id, existing.id)).returning();
      await tx.delete(workflowEdges).where(eq(workflowEdges.workflowId, id));
      await tx.delete(workflowNodes).where(eq(workflowNodes.workflowId, id));
      if (validation.nodes.length) await tx.insert(workflowNodes).values(validation.nodes.map((node) => ({ workflowId: id, userId: ownerId, nodeId: node.id, kind: node.kind, label: node.label, modelId: node.modelId ?? null, dataTypeId: node.dataTypeId ?? null, inputText: node.inputText, artifactId: node.artifactId ?? null, parameters: node.parameters, positionX: node.position.x, positionY: node.position.y })));
      if (validation.edges.length) await tx.insert(workflowEdges).values(validation.edges.map((edge) => ({ workflowId: id, userId: ownerId, edgeId: edge.id, sourceNodeId: edge.source, targetNodeId: edge.target, sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle })));
      return updated;
    });
    if (!result) { res.status(404).json({ error: "custom_node_not_found" }); return; }
    if (typeof result === "string") { res.status(400).json({ error: result }); return; }
    const old = catalogById.get(id);
    const newInterface = deriveCustomNodeInterface(parsed.data.definition, models, childContracts, interfaceSelection);
    if (old && newInterface && old.interface.signature !== newInterface.signature) await propagateAttention([id], ownerId);
    await refreshAttention(ownerId);
    res.json({ customNode: result });
  } catch (error) { next(error); }
});

router.delete("/:id", async (req, res, next) => {
  if (req.get("origin") !== (process.env.WEB_ORIGIN ?? "http://localhost:5173")) { res.status(403).json({ error: "invalid_origin" }); return; }
  const ownerId = userId(res);
  try {
    const catalog = await loadCustomNodeCatalog(ownerId);
    const selected = catalog.find((item) => item.id === req.params.id);
    if (!selected) { res.status(404).json({ error: "custom_node_not_found" }); return; }
    const impact = await deletionImpact(selected.id, ownerId, catalog);
    const affectedIds = new Set<string>();
    const queue = [selected.id];
    while (queue.length) {
      const current = queue.shift()!;
      const consumers = await db.select({ workflowId: workflowNodes.workflowId, isCustomNode: workflows.isCustomNode }).from(workflowNodes).innerJoin(workflows, eq(workflows.id, workflowNodes.workflowId)).where(and(eq(workflows.userId, ownerId), sql`${workflowNodes.parameters}->>'customNodeId' = ${current}`));
      for (const row of consumers) if (row.workflowId !== selected.id && !affectedIds.has(row.workflowId)) {
        affectedIds.add(row.workflowId);
        if (row.isCustomNode) queue.push(row.workflowId);
      }
    }
    await db.transaction(async (tx) => {
      if (affectedIds.size) await tx.update(workflows).set({ needsAttention: true }).where(and(eq(workflows.userId, ownerId), inArray(workflows.id, [...affectedIds])));
      await tx.delete(workflows).where(and(eq(workflows.id, selected.id), eq(workflows.userId, ownerId), eq(workflows.isCustomNode, true)));
    });
    await refreshAttention(ownerId);
    res.json({ deleted: true, ...impact });
  } catch (error) { next(error); }
});

export { router as customNodesRouter };
