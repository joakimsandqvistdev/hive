import { and, count, eq, inArray, sql, asc, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { Router } from "express";
import { db } from "./db.js";
import { artifacts, instagramAccounts, runs, workflowEdges, workflowJobs, workflowNodes, workflowTriggers, workflows } from "./schema.js";
import { createWorkflowSchema, exportWorkflowSelectionSchema, saveWorkflowSchema, validateWorkflowDefinition } from "./workflowDefinition.js";
import { loadDataTypes, loadModelIoContracts } from "./modelContracts.js";
import { createWorkflowRunInTransaction, definitionFor, workflowRunErrorMessage } from "./workflowRunService.js";
import { parsePagination, totalPages } from "./pagination.js";
import { hasOutdatedCustomNodeReferences, loadCustomNodeCatalog, snapshotCustomNodeReferences } from "./customNodeCatalog.js";
import { collectWebhookTextInputs, webhookTextInputConflict, webhookTextInputContractChanged } from "./webhookInputMappings.js";

const router = Router();
function userId(res: import("express").Response) { return res.locals.userId as string; }
function isUniqueViolation(error: unknown) { return typeof error === "object" && error !== null && "code" in error && error.code === "23505"; }
router.get("/", async (req, res, next) => {
  const ownerId = userId(res);
  const { page, pageSize, offset } = parsePagination(req);
  try {
    const [items, totalRows] = await Promise.all([
      db.select().from(workflows)
        .where(and(eq(workflows.userId, ownerId), eq(workflows.isCustomNode, false), sql`${workflows.archivedAt} is null`))
        .orderBy(sql`${workflows.updatedAt} desc`, sql`${workflows.id} desc`).limit(pageSize).offset(offset),
      db.select({ total: count() }).from(workflows).where(and(eq(workflows.userId, ownerId), eq(workflows.isCustomNode, false), sql`${workflows.archivedAt} is null`)),
    ]);
    const total = totalRows[0]?.total ?? 0;
    const nodeRows = items.length ? await db.select({ workflowId: workflowNodes.workflowId }).from(workflowNodes).where(inArray(workflowNodes.workflowId, items.map((workflow) => workflow.id))) : [];
    const counts = new Map<string, number>();
    for (const node of nodeRows) counts.set(node.workflowId, (counts.get(node.workflowId) ?? 0) + 1);
    const activeRunRows = items.length ? await db.select({ workflowId: runs.workflowId, runCount: sql<number>`count(*)` }).from(runs)
        .where(and(inArray(runs.workflowId, items.map((workflow) => workflow.id)), inArray(runs.status, ["queued", "running", "awaiting_publish", "cancel_requested"])))
      .groupBy(runs.workflowId) : [];
    const activeRuns = new Map<string, number>();
    for (const run of activeRunRows) if (run.workflowId) activeRuns.set(run.workflowId, run.runCount);
    res.json({ items: items.map((workflow) => ({ ...workflow, nodeCount: counts.get(workflow.id) ?? 0, activeRunCount: activeRuns.get(workflow.id) ?? 0 })), page, pageSize, total, totalPages: totalPages(total, pageSize) });
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

router.post("/:id/duplicate", async (req, res, next) => {
  if (req.get("origin") !== (process.env.WEB_ORIGIN ?? "http://localhost:5173")) { res.status(403).json({ error: "invalid_origin" }); return; }
  const ownerId = userId(res);
  try {
    const duplicate = await db.transaction(async (tx) => {
      const [source] = await tx.select().from(workflows).where(and(eq(workflows.id, req.params.id), eq(workflows.userId, ownerId), eq(workflows.isCustomNode, false), isNull(workflows.archivedAt))).limit(1).for("share");
      if (!source) return null;
      const [copy] = await tx.insert(workflows).values({
        userId: ownerId,
        name: `${source.name.slice(0, 94)} copy`,
        description: source.description,
      }).returning();
      const [nodes, edges] = await Promise.all([
        tx.select().from(workflowNodes).where(eq(workflowNodes.workflowId, source.id)),
        tx.select().from(workflowEdges).where(eq(workflowEdges.workflowId, source.id)),
      ]);
      if (nodes.length) await tx.insert(workflowNodes).values(nodes.map((node) => ({ ...node, workflowId: copy!.id })));
      if (edges.length) await tx.insert(workflowEdges).values(edges.map((edge) => ({ ...edge, workflowId: copy!.id })));
      return { ...copy!, nodeCount: nodes.length, activeRunCount: 0 };
    });
    if (!duplicate) { res.status(404).json({ error: "workflow_not_found" }); return; }
    res.status(201).json({ workflow: duplicate });
  } catch (error) { next(error); }
});

router.post("/:id/export-selection", async (req, res, next) => {
  if (req.get("origin") !== (process.env.WEB_ORIGIN ?? "http://localhost:5173")) { res.status(403).json({ error: "invalid_origin" }); return; }
  const parsed = exportWorkflowSelectionSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_workflow_selection", details: parsed.error.flatten() }); return; }
  const ownerId = userId(res);
  try {
    const result = await db.transaction(async (tx) => {
      const [source] = await tx.select().from(workflows).where(and(eq(workflows.id, req.params.id), eq(workflows.userId, ownerId), eq(workflows.isCustomNode, false), isNull(workflows.archivedAt))).limit(1).for("share");
      if (!source) return null;
      const selectedNodes = parsed.data.definition.nodes;
      const selectedEdges = parsed.data.definition.edges;
      const artifactIds = selectedNodes.flatMap((node) => node.artifactId ? [node.artifactId] : []);
      const libraryArtifacts = artifactIds.length ? await tx.select({ id: artifacts.id }).from(artifacts).where(and(eq(artifacts.userId, ownerId), eq(artifacts.savedToLibrary, true), inArray(artifacts.id, artifactIds))) : [];
      const libraryArtifactIds = new Set(libraryArtifacts.map((artifact) => artifact.id));
      const [copy] = await tx.insert(workflows).values({ userId: ownerId, name: parsed.data.name, description: parsed.data.description }).returning();
      const nodeIds = new Map(selectedNodes.map((node) => [node.id, randomUUID()]));
      await tx.insert(workflowNodes).values(selectedNodes.map((node) => ({
        workflowId: copy!.id,
        userId: ownerId,
        nodeId: nodeIds.get(node.id)!,
        kind: node.kind,
        label: node.label,
        modelId: node.modelId ?? null,
        dataTypeId: node.dataTypeId ?? null,
        inputText: node.inputText,
        artifactId: node.artifactId && libraryArtifactIds.has(node.artifactId) ? node.artifactId : null,
        parameters: node.parameters ?? {},
        positionX: node.position.x,
        positionY: node.position.y,
      })));
      if (selectedEdges.length) await tx.insert(workflowEdges).values(selectedEdges.map((edge) => ({
        workflowId: copy!.id,
        userId: ownerId,
        edgeId: randomUUID(),
        sourceNodeId: nodeIds.get(edge.source)!,
        sourceHandle: edge.sourceHandle ?? null,
        targetNodeId: nodeIds.get(edge.target)!,
        targetHandle: edge.targetHandle ?? null,
      })));
      return { kind: "created" as const, workflow: { ...copy!, nodeCount: selectedNodes.length, connectionCount: selectedEdges.length }, clearedMediaCount: selectedNodes.filter((node) => node.artifactId && !libraryArtifactIds.has(node.artifactId)).length };
    });
    if (!result) { res.status(404).json({ error: "workflow_not_found" }); return; }
    res.status(201).json({ workflow: result.workflow, clearedMediaCount: result.clearedMediaCount });
  } catch (error) { next(error); }
});


router.get("/:id", async (req, res, next) => {
  try {
    const [workflow] = await db.select().from(workflows).where(and(eq(workflows.id, req.params.id), eq(workflows.userId, userId(res)), eq(workflows.isCustomNode, false))).limit(1);
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
    const [contracts, types, customCatalog] = await Promise.all([loadModelIoContracts(), loadDataTypes(), loadCustomNodeCatalog(ownerId)]);
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(workflows).where(and(eq(workflows.id, req.params.id), eq(workflows.userId, ownerId), eq(workflows.isCustomNode, false))).limit(1).for("update");
      if (!existing) return null;
      const webhookInputs = collectWebhookTextInputs(parsed.data.definition, customCatalog);
      const identifierConflict = webhookTextInputConflict(webhookInputs);
      if (identifierConflict) return { error: "webhook_identifier_conflict", message: identifierConflict } as const;
      const triggers = await tx.select({ inputMappings: workflowTriggers.inputMappings }).from(workflowTriggers)
        .where(and(eq(workflowTriggers.workflowId, existing.id), eq(workflowTriggers.userId, ownerId), isNull(workflowTriggers.deletedAt)));
      if (triggers.some((trigger) => webhookTextInputContractChanged(trigger.inputMappings, webhookInputs))) {
        return { error: "webhook_contract_in_use" } as const;
      }
      const definition = snapshotCustomNodeReferences(parsed.data.definition, customCatalog);
      const ids = definition.nodes.flatMap((node) => node.artifactId ? [node.artifactId] : []);
      const uploads = ids.length ? await tx.select().from(artifacts).where(and(eq(artifacts.userId, ownerId), inArray(artifacts.id, ids))) : [];
      const validation = validateWorkflowDefinition(definition, contracts, uploads, types.map((type) => type.id), existing.id, customCatalog.map((item) => item.contract), false, false, true);
      if (!validation.ok) return validation.error;
      for (const node of validation.nodes.filter((item) => item.kind === "publishing")) {
        const [account] = await tx.select({ id: instagramAccounts.id }).from(instagramAccounts)
          .where(and(eq(instagramAccounts.id, String(node.parameters.accountId)), eq(instagramAccounts.userId, ownerId))).limit(1);
        if (!account) return "instagram_account_not_connected";
      }
      const [updated] = await tx.update(workflows).set({ name: parsed.data.name, description: parsed.data.description, needsAttention: hasOutdatedCustomNodeReferences(definition, customCatalog), updatedAt: new Date() }).where(eq(workflows.id, existing.id)).returning();
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
    if (result && "error" in result) {
      const status = result.error === "webhook_contract_in_use" ? 409 : 400;
      res.status(status).json(result);
      return;
    }
    res.json({ workflow: result });
  } catch (error) { next(error); }
});

router.post("/:id/runs", async (req, res, next) => {
  if (req.get("origin") !== (process.env.WEB_ORIGIN ?? "http://localhost:5173")) { res.status(403).json({ error: "invalid_origin" }); return; }
  const ownerId = userId(res);
  try {
    const [contracts, types] = await Promise.all([loadModelIoContracts(), loadDataTypes()]);
    const result = await db.transaction((tx) => createWorkflowRunInTransaction(tx, req.params.id, ownerId, contracts, types));
    if (!result.ok) {
      const status = result.error === "workflow_not_found" ? 404 : result.error === "model_not_downloaded" ? 409 : 400;
      res.status(status).json({ error: result.error, message: workflowRunErrorMessage(result.error) }); return;
    }
    res.status(202).json({ run: result.run });
  } catch (error) { next(error); }
});

router.delete("/:id", async (req, res, next) => {
  if (req.get("origin") !== (process.env.WEB_ORIGIN ?? "http://localhost:5173")) { res.status(403).json({ error: "invalid_origin" }); return; }
  try {
    const result = await db.transaction(async (tx) => {
      const [workflow] = await tx.select({ id: workflows.id }).from(workflows)
        .where(and(eq(workflows.id, req.params.id), eq(workflows.userId, userId(res)), eq(workflows.isCustomNode, false))).limit(1).for("update");
      if (!workflow) return { kind: "not_found" as const };
      const [usage] = await tx.select({ total: sql<number>`count(*)` }).from(runs)
        .where(and(eq(runs.workflowId, workflow.id), inArray(runs.status, ["queued", "running", "cancel_requested"])));
      if ((usage?.total ?? 0) > 0) return { kind: "in_use" as const, activeRunCount: usage.total };
      const [jobUsage] = await tx.select({ total: sql<number>`count(*)` }).from(workflowJobs)
        .where(and(eq(workflowJobs.workflowId, workflow.id), inArray(workflowJobs.status, ["active", "paused"])));
      if ((jobUsage?.total ?? 0) > 0) return { kind: "jobs_in_use" as const, activeJobCount: jobUsage.total };
      await tx.delete(workflows).where(and(eq(workflows.id, workflow.id), eq(workflows.userId, userId(res))));
      return { kind: "deleted" as const };
    });
    if (result.kind === "not_found") { res.status(404).json({ error: "workflow_not_found" }); return; }
    if (result.kind === "in_use") { res.status(409).json({ error: "workflow_in_use", activeRunCount: result.activeRunCount }); return; }
    if (result.kind === "jobs_in_use") { res.status(409).json({ error: "workflow_has_jobs", activeJobCount: result.activeJobCount }); return; }
    res.status(204).end();
  } catch (error) { next(error); }
});

export { router as workflowsRouter };
