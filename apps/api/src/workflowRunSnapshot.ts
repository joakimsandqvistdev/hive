import type { ModelIoContract } from "./modelContracts.js";
import type { WorkflowDefinition } from "./workflowDefinition.js";
import { processingContract } from "./processingNodes.js";

export function buildWorkflowRunSnapshot(workflow: { id: string; name: string; description: string }, definition: WorkflowDefinition, contracts: ModelIoContract[]) {
  const byId = new Map(contracts.map((model) => [model.modelId, model]));
  const nodes = definition.nodes.map((node) => ({ ...node, modelIoContract: node.kind === "model" ? byId.get(node.modelId ?? "") : node.kind === "processing" ? processingContract(node.parameters ?? {}) ?? null : null }));
  return {
    workflowSnapshot: { ...workflow, nodes, edges: definition.edges },
    runNodes: nodes.map((node) => ({ nodeId: node.id, nodeSnapshotJson: { ...node, name: node.label, modality: node.modelIoContract?.modality ?? node.dataTypeId },
      inputArtifactId: node.artifactId ?? null, parameters: node.parameters ?? {} })),
  };
}
