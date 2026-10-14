import { z } from "zod";
import { imageModelIdSchema, imageModelParametersSchema } from "./modelParameters.js";

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
  targetHandle: z.string().max(40).optional(),
});

export const workflowDefinitionSchema = z.object({ nodes: z.array(nodeSchema).max(100), edges: z.array(edgeSchema).max(300) })
  .superRefine((definition, context) => {
    const nodeIds = new Set<string>();
    definition.nodes.forEach((node, index) => {
      if (nodeIds.has(node.id)) context.addIssue({ code: "custom", path: ["nodes", index, "id"], message: "Node IDs must be unique." });
      nodeIds.add(node.id);
    });
    definition.edges.forEach((edge, index) => {
      if (edge.targetHandle && edge.targetHandle !== "image" && edge.targetHandle !== "mask") {
        context.addIssue({ code: "custom", path: ["edges", index, "targetHandle"], message: "Connections must use a supported image input." });
      }
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
export type WorkflowAgentRecord = { id: string; prompt: string; modality: string; parameters: Record<string, unknown> };

export type DefinitionValidation =
  | { ok: true; nodes: WorkflowNodeRecord[] }
  | { ok: false; error: "invalid_agents" | "invalid_parameters" | "unsupported_image_connections" | "invalid_reference_count" };

/** Check owner-scoped agents and model-specific connection rules, and normalize node settings for persistence. */
export function validateWorkflowDefinition(definition: WorkflowDefinition, agentRows: WorkflowAgentRecord[]): DefinitionValidation {
  const referencedAgentIds = new Set(definition.nodes.map((node) => node.agentId));
  const agentsById = new Map(agentRows.map((agent) => [agent.id, agent]));
  if (agentsById.size !== referencedAgentIds.size) return { ok: false, error: "invalid_agents" };

  const nodeModelById = new Map<string, string>();
  const nodeModalityById = new Map<string, string>();
  const nodes: WorkflowNodeRecord[] = [];
  for (const node of definition.nodes) {
    const agent = agentsById.get(node.agentId)!;
    nodeModalityById.set(node.id, agent.modality);
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
      nodeModelById.set(node.id, parsed.data.modelId);
    } else {
      nodeModelById.set(node.id, "");
    }
    nodes.push({ ...node, prompt: node.prompt ?? agent.prompt ?? "", parameters });
  }

  for (const edge of definition.edges) {
    if (nodeModalityById.get(edge.source) !== "image" || !["qwen-image-edit-2511", "instruct-pix2pix", "sd15-inpainting", "longcat-image-edit-turbo", "flux2-klein-4b"].includes(nodeModelById.get(edge.target) ?? "")) {
      return { ok: false, error: "unsupported_image_connections" };
    }
  }
  for (const node of definition.nodes) {
    const modelId = nodeModelById.get(node.id);
    const incoming = definition.edges.filter((edge) => edge.target === node.id);
    const images = incoming.filter((edge) => (edge.targetHandle ?? "image") === "image").length;
    const masks = incoming.filter((edge) => edge.targetHandle === "mask").length;
    const valid = modelId === "qwen-image-edit-2511" ? images >= 1 && images <= 10 && masks === 0
      : modelId === "instruct-pix2pix" || modelId === "longcat-image-edit-turbo" ? images === 1 && masks === 0
        : modelId === "sd15-inpainting" ? images === 1 && masks === 1 && incoming.length === 2
          : modelId === "flux2-klein-4b" ? images <= 4 && masks === 0
            : incoming.length === 0;
    if (!valid) return { ok: false, error: "invalid_reference_count" };
  }
  return { ok: true, nodes };
}
