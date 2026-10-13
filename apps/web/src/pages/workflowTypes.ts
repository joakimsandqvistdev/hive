import type { Node } from "@xyflow/react";
import type { AgentModality } from "../agentModality";
import type { ImageModelParameters } from "../components/ImageModelParametersFields";

export type Workflow = { id: string; name: string; description: string; nodeCount: number; activeRunCount?: number; createdAt: string; updatedAt: string };
export type Agent = { id: string; name: string; modality: AgentModality; prompt: string; parameters: Record<string, unknown> };
export type AgentNodeData = { agentId: string; agentName: string; modality: string; agentPrompt: string; prompt: string; parameters: ImageModelParameters };
export type WorkflowNode = Node<AgentNodeData, "agent">;
export type Definition = {
  nodes: Array<{ id: string; agentId: string; prompt: string; parameters?: ImageModelParameters; position: { x: number; y: number } }>;
  edges: Array<{ id: string; source: string; target: string }>;
};
export type WorkflowForm = { name: string; description: string };
export const emptyWorkflowForm: WorkflowForm = { name: "", description: "" };
