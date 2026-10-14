import { z } from "zod";
import { imageModelIdSchema, imageModelParametersSchema } from "./modelParameters.js";
import { videoModelParametersSchema } from "./videoModelParameters.js";
import type { ModelIoContract } from "./modelContracts.js";

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
  sourceHandle: z.string().max(40).nullable().optional(),
  target: z.string().min(1).max(100),
  targetHandle: z.string().max(40).nullable().optional(),
});

export const workflowDefinitionSchema = z.object({ nodes: z.array(nodeSchema).max(100), edges: z.array(edgeSchema).max(300) })
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
export const createWorkflowSchema = metadataSchema;
export const saveWorkflowSchema = metadataSchema.extend({ definition: workflowDefinitionSchema });
export const startRunSchema = z.object({});

export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;
export type WorkflowNodeRecord = WorkflowDefinition["nodes"][number] & { prompt: string; parameters: Record<string, unknown> };
export type WorkflowEdgeRecord = WorkflowDefinition["edges"][number] & { sourceHandle: string; targetHandle: string };
export type WorkflowAgentRecord = { id: string; prompt: string; modality: string; parameters: Record<string, unknown> };

export type DefinitionValidation =
  | { ok: true; nodes: WorkflowNodeRecord[]; edges: WorkflowEdgeRecord[] }
  | { ok: false; error: "invalid_agents" | "invalid_parameters" | "invalid_model_contract" | "incompatible_data_types" | "invalid_input_counts" };

/** Validate workflow edges against the current model I/O catalog and normalize single-port legacy edges. */
export function validateWorkflowDefinition(definition: WorkflowDefinition, agentRows: WorkflowAgentRecord[], catalog: ModelIoContract[]): DefinitionValidation {
  const referencedAgentIds = new Set(definition.nodes.map((node) => node.agentId));
  const agentsById = new Map(agentRows.map((agent) => [agent.id, agent]));
  const contractsById = new Map(catalog.map((model) => [model.modelId, model]));
  if (agentsById.size !== referencedAgentIds.size) return { ok: false, error: "invalid_agents" };

  const contractByNodeId = new Map<string, ModelIoContract>();
  const nodes: WorkflowNodeRecord[] = [];
  for (const node of definition.nodes) {
    const agent = agentsById.get(node.agentId)!;
    let parameters: Record<string, unknown> = {};
    if (agent.modality === "image") {
      const agentModelId = agent.parameters.modelId;
      const parsed = imageModelParametersSchema.safeParse({
        ...agent.parameters,
        ...node.parameters,
        ...(imageModelIdSchema.safeParse(agentModelId).success ? { modelId: agentModelId } : {}),
      });
      if (!parsed.success) return { ok: false, error: "invalid_parameters" };
      parameters = parsed.data;
    } else if (agent.modality === "video") {
      const parsed = videoModelParametersSchema.safeParse({ ...agent.parameters, ...node.parameters });
      if (!parsed.success) return { ok: false, error: "invalid_parameters" };
      parameters = parsed.data;
    }
    const modelId = typeof parameters.modelId === "string" ? parameters.modelId : "";
    const contract = contractsById.get(modelId);
    if (!contract || contract.modality !== agent.modality || contract.inputs.length === 0 || !contract.outputs.some((port) => port.minCount > 0)) {
      return { ok: false, error: "invalid_model_contract" };
    }
    contractByNodeId.set(node.id, contract);
    nodes.push({ ...node, prompt: node.prompt ?? agent.prompt ?? "", parameters });
  }

  const incomingCounts = new Map<string, Map<string, number>>();
  const edges: WorkflowEdgeRecord[] = [];
  for (const edge of definition.edges) {
    const sourceContract = contractByNodeId.get(edge.source)!;
    const targetContract = contractByNodeId.get(edge.target)!;
    const sourceCandidates = sourceContract.outputs.filter((port) => !edge.sourceHandle || port.portKey === edge.sourceHandle);
    if (sourceCandidates.length !== 1) return { ok: false, error: "invalid_model_contract" };
    const sourcePort = sourceCandidates[0]!;
    const targetCandidates = targetContract.inputs.filter((port) => port.transport === "connection" && (!edge.targetHandle || port.portKey === edge.targetHandle));
    const compatible = targetCandidates.filter((port) => port.dataTypeId === sourcePort.dataTypeId);
    if (compatible.length === 0) return { ok: false, error: "incompatible_data_types" };
    const targetCounts = incomingCounts.get(edge.target) ?? new Map<string, number>();
    const targetPort = edge.targetHandle
      ? compatible[0]
      : compatible.find((port) => (targetCounts.get(port.portKey) ?? 0) < port.minCount && (targetCounts.get(port.portKey) ?? 0) < port.maxCount)
        ?? compatible.find((port) => (targetCounts.get(port.portKey) ?? 0) < port.maxCount);
    if (!targetPort) return { ok: false, error: "invalid_input_counts" };
    const count = targetCounts.get(targetPort.portKey) ?? 0;
    if (count >= targetPort.maxCount) return { ok: false, error: "invalid_input_counts" };
    targetCounts.set(targetPort.portKey, count + 1);
    incomingCounts.set(edge.target, targetCounts);
    edges.push({ ...edge, sourceHandle: sourcePort.portKey, targetHandle: targetPort.portKey });
  }

  for (const node of nodes) {
    const contract = contractByNodeId.get(node.id)!;
    const counts = incomingCounts.get(node.id) ?? new Map<string, number>();
    for (const port of contract.inputs) {
      const count = port.transport === "prompt" ? Number(node.prompt.trim().length > 0) : counts.get(port.portKey) ?? 0;
      if (count < port.minCount || count > port.maxCount) return { ok: false, error: "invalid_input_counts" };
      counts.set(port.portKey, count);
    }
    for (const group of contract.inputGroups) {
      const count = group.portKeys.reduce((total, portKey) => total + (counts.get(portKey) ?? 0), 0);
      if (count < group.minCount || count > group.maxCount) return { ok: false, error: "invalid_input_counts" };
    }
  }
  return { ok: true, nodes, edges };
}
