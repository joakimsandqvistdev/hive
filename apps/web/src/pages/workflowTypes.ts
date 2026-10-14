import type { ModelIoContract, ModelIoPort } from "../modelIoTypes";
export type Workflow = { id: string; name: string; description: string; nodeCount: number; activeRunCount?: number; createdAt: string; updatedAt: string };
export type DataType = { id: string; label: string; mediaType: string };
export type NodeDefinition = { id: string; kind: "input" | "model"; label: string; modelId?: string | null; dataTypeId?: string | null; inputText: string; artifactId?: string | null; parameters: Record<string, unknown>; position: { x: number; y: number } };
export type WorkflowNodeData = Omit<NodeDefinition, "id" | "position"> & { inputPorts: ModelIoPort[]; outputPorts: ModelIoPort[]; contract?: ModelIoContract };
export type WorkflowNode = { id: string; position: NodeDefinition["position"]; data: WorkflowNodeData };
export type Definition = { nodes: NodeDefinition[]; edges: Array<{ id: string; source: string; sourceHandle?: string | null; target: string; targetHandle?: string | null }> };
export type WorkflowForm = { name: string; description: string };
export const emptyWorkflowForm: WorkflowForm = { name: "", description: "" };
