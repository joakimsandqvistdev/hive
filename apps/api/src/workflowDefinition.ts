import { z } from "zod";
import { imageModelParametersSchema } from "./modelParameters.js";
import { videoModelParametersSchema } from "./videoModelParameters.js";
import { audioModelParametersSchema } from "./audioModelParameters.js";
import { textModelParametersSchema } from "./textModelParameters.js";
import type { ModelIoContract } from "./modelContracts.js";
import { instagramPublishingContract, instagramPublishingSettingsSchema, processingContract, textOverlaySettingsSchema } from "./processingNodes.js";

const nodeSchema = z.object({
  id: z.string().min(1).max(100),
  kind: z.enum(["input", "model", "processing", "publishing"]),
  label: z.string().trim().min(1).max(100),
  modelId: z.string().max(100).nullable().optional(),
  dataTypeId: z.enum(["text", "image", "audio"]).nullable().optional(),
  inputText: z.string().max(8000).default(""),
  artifactId: z.string().uuid().nullable().optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  position: z.object({ x: z.number().finite().min(-1_000_000).max(1_000_000), y: z.number().finite().min(-1_000_000).max(1_000_000) }),
}).strict();
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
export type WorkflowNodeRecord = WorkflowDefinition["nodes"][number] & { parameters: Record<string, unknown> };
export type WorkflowEdgeRecord = WorkflowDefinition["edges"][number] & { sourceHandle: string; targetHandle: string };
type UploadedInput = { id: string; dataTypeId: string; runId: string | null };
export type DefinitionValidation = { ok: true; nodes: WorkflowNodeRecord[]; edges: WorkflowEdgeRecord[] }
  | { ok: false; error: "invalid_parameters" | "invalid_model_contract" | "invalid_input" | "incompatible_data_types" | "invalid_input_counts" };

export function validateWorkflowDefinition(definition: WorkflowDefinition, catalog: ModelIoContract[], uploads: UploadedInput[] = [], dataTypeIds = ["text", "image", "audio"]) : DefinitionValidation {
  const catalogById = new Map(catalog.map((model) => [model.modelId, model]));
  const uploadsById = new Map(uploads.map((input) => [input.id, input]));
  const contracts = new Map<string, ModelIoContract>();
  const nodes: WorkflowNodeRecord[] = [];
  for (const node of definition.nodes) {
    let parameters: Record<string, unknown> = {};
    if (node.kind === "input") {
      const type = node.dataTypeId;
      if (!type || !dataTypeIds.includes(type) || node.modelId) return { ok: false, error: "invalid_input" };
      if (type === "text") {
        if (!node.inputText.trim() || node.artifactId) return { ok: false, error: "invalid_input" };
      } else {
        const upload = uploadsById.get(node.artifactId ?? "");
        if (!upload || upload.dataTypeId !== type || upload.runId !== null || node.inputText) return { ok: false, error: "invalid_input" };
      }
      contracts.set(node.id, { modelId: "", name: node.label, modality: "image", inputs: [], inputGroups: [],
        outputs: [{ direction: "output", portKey: "output", dataTypeId: type, dataTypeLabel: type, mediaType: type === "text" ? "text/plain" : `${type}/*`, label: type, transport: null, minCount: 1, maxCount: 1, sortOrder: 0 }] });
    } else if (node.kind === "model") {
      const contract = catalogById.get(node.modelId ?? "");
      if (!contract || node.dataTypeId || node.artifactId || node.inputText) return { ok: false, error: "invalid_model_contract" };
      const parameterSchema = contract.modality === "text" ? textModelParametersSchema : contract.modality === "video" ? videoModelParametersSchema : contract.modality === "audio" ? audioModelParametersSchema : imageModelParametersSchema;
      const parsed = parameterSchema.safeParse({ ...node.parameters, modelId: node.modelId });
      if (!parsed.success) return { ok: false, error: "invalid_parameters" };
      parameters = parsed.data;
      contracts.set(node.id, contract);
    } else if (node.kind === "processing") {
      const contract = processingContract(node.parameters ?? {});
      if (!contract || node.modelId || node.dataTypeId || node.artifactId || node.inputText) return { ok: false, error: "invalid_model_contract" };
      const parsed = textOverlaySettingsSchema.safeParse(node.parameters ?? {});
      if (!parsed.success) return { ok: false, error: "invalid_parameters" };
      parameters = parsed.data;
      contracts.set(node.id, contract);
    } else {
      const contract = instagramPublishingContract(node.parameters ?? {});
      const parsed = instagramPublishingSettingsSchema.safeParse(node.parameters ?? {});
      if (!contract || !parsed.success || node.modelId || node.dataTypeId || node.artifactId || node.inputText) return { ok: false, error: "invalid_model_contract" };
      if (definition.nodes.filter((item) => item.kind === "publishing").length > 1) return { ok: false, error: "invalid_input_counts" };
      parameters = parsed.data;
      contracts.set(node.id, contract);
    }
    nodes.push({ ...node, parameters });
  }
  const counts = new Map<string, Map<string, number>>();
  const edges: WorkflowEdgeRecord[] = [];
  for (const edge of definition.edges) {
    const source = contracts.get(edge.source);
    const target = contracts.get(edge.target);
    if (!source || !target) return { ok: false, error: "invalid_model_contract" };
    const output = source.outputs.filter((port) => !edge.sourceHandle || port.portKey === edge.sourceHandle);
    if (output.length !== 1) return { ok: false, error: "invalid_model_contract" };
    const inputs = target.inputs.filter((port) => (!edge.targetHandle || port.portKey === edge.targetHandle) && port.dataTypeId === output[0]!.dataTypeId);
    if (inputs.length !== 1) return { ok: false, error: "incompatible_data_types" };
    const port = inputs[0]!;
    const nodeCounts = counts.get(edge.target) ?? new Map<string, number>();
    const count = (nodeCounts.get(port.portKey) ?? 0) + 1;
    if (count > port.maxCount) return { ok: false, error: "invalid_input_counts" };
    nodeCounts.set(port.portKey, count); counts.set(edge.target, nodeCounts);
    edges.push({ ...edge, sourceHandle: output[0]!.portKey, targetHandle: port.portKey });
  }
  for (const node of nodes) {
    const contract = contracts.get(node.id)!;
    const nodeCounts = counts.get(node.id) ?? new Map<string, number>();
    for (const port of contract.inputs) {
      const count = nodeCounts.get(port.portKey) ?? 0;
      if (count < port.minCount || count > port.maxCount) return { ok: false, error: "invalid_input_counts" };
    }
    for (const group of contract.inputGroups) {
      const count = group.portKeys.reduce((total, key) => total + (nodeCounts.get(key) ?? 0), 0);
      if (count < group.minCount || count > group.maxCount) return { ok: false, error: "invalid_input_counts" };
    }
  }
  return { ok: true, nodes, edges };
}
