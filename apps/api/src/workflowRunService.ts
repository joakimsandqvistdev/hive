import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "./db.js";
import { artifacts, instagramAccounts, runNodes, runs, workflowEdges, workflowNodes, workflows } from "./schema.js";
import { forwardRunnerRequest } from "./models.js";
import { loadDataTypes, loadModelIoContracts } from "./modelContracts.js";
import { buildWorkflowRunSnapshot } from "./workflowRunSnapshot.js";
import { validateWorkflowDefinition } from "./workflowDefinition.js";
import { expandCustomNodes } from "./customNodeExecution.js";
import { hasOutdatedCustomNodeReferences, loadCustomNodeCatalog, snapshotCustomNodeReferences } from "./customNodeCatalog.js";

export type WorkflowDbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type WorkflowRunCreation = { ok: true; run: typeof runs.$inferSelect } | { ok: false; error: string };

export function definitionFor(nodes: typeof workflowNodes.$inferSelect[], edges: typeof workflowEdges.$inferSelect[]) {
  return { nodes: nodes.map(({ nodeId, kind, label, modelId, dataTypeId, inputText, artifactId, parameters, positionX, positionY }) => ({
    id: nodeId, kind: kind as "input" | "model" | "processing" | "publishing" | "custom", label, modelId, dataTypeId: dataTypeId as "text" | "image" | "audio" | "video" | null,
    inputText, artifactId, parameters, position: { x: positionX, y: positionY } })),
    edges: edges.map((edge) => ({ id: edge.edgeId, source: edge.sourceNodeId, target: edge.targetNodeId, sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle })) };
}

export async function createWorkflowRunInTransaction(
  tx: WorkflowDbTransaction,
  workflowId: string,
  ownerId: string,
  contracts: Awaited<ReturnType<typeof loadModelIoContracts>>,
  dataTypes: Awaited<ReturnType<typeof loadDataTypes>>,
  job?: { id: string; scheduledFor: Date },
): Promise<WorkflowRunCreation> {
  const [workflow] = await tx.select().from(workflows).where(and(eq(workflows.id, workflowId), eq(workflows.userId, ownerId))).limit(1).for("share");
  if (!workflow || workflow.archivedAt) return { ok: false, error: "workflow_not_found" };
  if (workflow.isCustomNode) return { ok: false, error: "custom_node_cannot_run" };
  if (workflow.needsAttention) return { ok: false, error: "workflow_needs_attention" };
  const nodes = await tx.select().from(workflowNodes).where(eq(workflowNodes.workflowId, workflow.id));
  if (!nodes.length) return { ok: false, error: "workflow_has_no_nodes" };
  const edges = await tx.select().from(workflowEdges).where(eq(workflowEdges.workflowId, workflow.id)).orderBy(asc(workflowEdges.edgeId));
  const ids = nodes.flatMap((node) => node.artifactId ? [node.artifactId] : []);
  const uploads = ids.length ? await tx.select().from(artifacts).where(and(eq(artifacts.userId, ownerId), inArray(artifacts.id, ids))) : [];
  const catalog = await loadCustomNodeCatalog(ownerId);
  const definition = snapshotCustomNodeReferences(definitionFor(nodes, edges), catalog);
  if (hasOutdatedCustomNodeReferences(definition, catalog)) return { ok: false, error: "workflow_needs_attention" };
  const customContracts = catalog.map((item) => item.contract);
  const validation = validateWorkflowDefinition(definition, contracts, uploads, dataTypes.map((type) => type.id), workflow.id, customContracts);
  if (!validation.ok) return { ok: false, error: validation.error };
  let expanded: ReturnType<typeof expandCustomNodes>;
  try { expanded = expandCustomNodes({ nodes: validation.nodes, edges: validation.edges }, contracts, catalog); }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "custom_node_missing" }; }
  const customArtifactIds = new Set(catalog.flatMap((item) => item.definition.nodes.flatMap((node) => node.artifactId ? [String(node.artifactId)] : [])));
  const expandedArtifactIds = [...new Set(expanded.nodes.flatMap((node) => node.artifactId ? [node.artifactId] : []))];
  const expandedUploads = expandedArtifactIds.length
    ? await tx.select().from(artifacts).where(and(eq(artifacts.userId, ownerId), inArray(artifacts.id, expandedArtifactIds)))
    : [];
  const uploadById = new Map(expandedUploads.map((item) => [item.id, item]));
  const validationUploads = expandedUploads.map((item) => customArtifactIds.has(item.id) ? { ...item, sourceWorkflowId: workflow.id } : item);
  const executionValidation = validateWorkflowDefinition(expanded, contracts, validationUploads, dataTypes.map((type) => type.id), workflow.id);
  if (!executionValidation.ok) return { ok: false, error: executionValidation.error };
  // Ensure a custom node's saved workflow-owned input still exists and belongs to this user.
  if (expandedArtifactIds.some((id) => !uploadById.has(id))) return { ok: false, error: "invalid_input" };
  for (const node of executionValidation.nodes.filter((item) => item.kind === "publishing")) {
    const [account] = await tx.select({ id: instagramAccounts.id }).from(instagramAccounts)
      .where(and(eq(instagramAccounts.id, String(node.parameters.accountId)), eq(instagramAccounts.userId, ownerId))).limit(1);
    if (!account) return { ok: false, error: "instagram_account_not_connected" };
  }
  if (executionValidation.nodes.some((item) => item.kind === "publishing")) {
    const encryptionKey = Buffer.from(process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY ?? "", "base64");
    const publicApiUrl = process.env.INSTAGRAM_PUBLIC_API_URL ?? "";
    if (!process.env.INSTAGRAM_APP_ID || !process.env.INSTAGRAM_APP_SECRET || encryptionKey.length !== 32 || !publicApiUrl.startsWith("https://")) return { ok: false, error: "instagram_not_configured" };
  }
  if (executionValidation.nodes.some((node) => node.kind === "model")) {
    const { response, body } = await forwardRunnerRequest("/models");
    const available = new Set(((body as { models?: Array<{ id: string; status: string }> }).models ?? []).filter((model) => model.status === "downloaded").map((model) => model.id));
    if (!response.ok || executionValidation.nodes.some((node) => node.kind === "model" && !available.has(node.modelId ?? ""))) return { ok: false, error: "model_not_downloaded" };
  }
  const snapshot = buildWorkflowRunSnapshot(workflow, { nodes: executionValidation.nodes, edges: executionValidation.edges }, contracts);
  const [run] = await tx.insert(runs).values({
    userId: ownerId, workflowId: workflow.id, jobId: job?.id ?? null, scheduledFor: job?.scheduledFor ?? null,
    status: "queued", inputJson: {}, workflowSnapshotJson: snapshot.workflowSnapshot,
  }).returning();
  await tx.insert(runNodes).values(snapshot.runNodes.map((node) => ({ ...node, runId: run!.id, userId: ownerId, status: "queued" as const })));
  return { ok: true, run: run! };
}

export async function createWorkflowRun(workflowId: string, ownerId: string): Promise<WorkflowRunCreation> {
  const [contracts, dataTypes] = await Promise.all([loadModelIoContracts(), loadDataTypes()]);
  return db.transaction((tx) => createWorkflowRunInTransaction(tx, workflowId, ownerId, contracts, dataTypes));
}

export function workflowRunErrorMessage(error: string): string {
  const messages: Record<string, string> = {
    workflow_not_found: "This workflow is unavailable.",
    workflow_needs_attention: "This workflow uses a custom node whose interface changed or is missing. Open the workflow, update or replace the custom node, and save before running.",
    custom_node_missing: "A custom node used by this workflow is missing. Replace or remove it before running.",
    custom_node_interface_outdated: "A custom node interface is out of date. Open the workflow, update the custom node interface, and save before running.",
    custom_node_cycle: "Custom nodes cannot contain circular references.",
    custom_node_graph_too_large: "This workflow expands beyond the supported size after including its custom nodes.",
    custom_node_cannot_run: "Custom nodes are reusable definitions. Add one to a workflow to run it.",
    workflow_has_no_nodes: "Add at least one node before running this workflow.",
    invalid_parameters: "Check the workflow’s model settings.",
    invalid_model_contract: "The workflow uses a model with an invalid input or output definition.",
    invalid_input: "Fill every text input and upload a file for each media input.",
    invalid_input_counts: "Connect all required model inputs and check connection limits.",
    incompatible_data_types: "Connect ports with matching datatypes.",
    model_not_downloaded: "Download every model used by this workflow from Models before running.",
    instagram_account_not_connected: "Connect the Instagram account selected by the publishing node before saving or running this workflow.",
    instagram_not_configured: "Configure Instagram app credentials, token encryption, and a public HTTPS API URL before running this workflow.",
  };
  return messages[error] ?? "Could not start workflow.";
}
