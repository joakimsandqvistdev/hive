type WorkflowIdentity = { id: string; name: string; description: string };

export type WorkflowRunNodeSource = {
  nodeId: string;
  agentId: string;
  agentName: string;
  modality: string;
  agentPrompt: string;
  agentParameters: Record<string, unknown>;
  prompt: string;
  parameters: Record<string, unknown>;
  positionX: number;
  positionY: number;
};

export type WorkflowSnapshotEdge = { id: string; source: string; target: string };

/** Build the immutable graph snapshot and per-node run rows from the transaction's owner-scoped query results. */
export function buildWorkflowRunSnapshot(workflow: WorkflowIdentity, nodes: WorkflowRunNodeSource[], edges: WorkflowSnapshotEdge[]) {
  const snapshotNodes = nodes.map((node) => ({
    id: node.nodeId,
    agentId: node.agentId,
    agent: { id: node.agentId, name: node.agentName, modality: node.modality, prompt: node.agentPrompt, parameters: node.agentParameters },
    prompt: node.prompt,
    parameters: effectiveNodeParameters(node),
    position: { x: node.positionX, y: node.positionY },
  }));

  return {
    workflowSnapshot: { id: workflow.id, name: workflow.name, description: workflow.description, nodes: snapshotNodes, edges },
    runNodes: nodes.map((node) => ({
      nodeId: node.nodeId,
      agentId: node.agentId,
      agentSnapshotJson: { id: node.agentId, name: node.agentName, modality: node.modality, prompt: node.agentPrompt, parameters: node.agentParameters },
      prompt: node.prompt,
      parameters: effectiveNodeParameters(node),
    })),
  };
}

function effectiveNodeParameters(node: WorkflowRunNodeSource) {
  if (node.modality !== "image") return node.parameters;
  const modelId = node.agentParameters.modelId ?? node.parameters.modelId;
  return { ...node.agentParameters, ...node.parameters, modelId };
}
