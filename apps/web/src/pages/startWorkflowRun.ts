import { apiFetch } from "../apiClient";
import { notifyNavigationSummaryChanged } from "../navigation/navigationSummary";

const runErrors: Record<string, string> = {
  model_not_downloaded: "Download every model used by this workflow from Models before running.",
  invalid_input_counts: "Connect all required model inputs and check connection limits.",
  invalid_input: "Fill every text input and upload a file for each media input.",
  workflow_has_no_nodes: "Add at least one node before running this workflow.",
  custom_node_requires_no_inputs: "This Custom Node has exposed inputs. Add it to a workflow and connect its inputs before running.",
};

async function startRun(path: string): Promise<void> {
  const response = await apiFetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (response.ok) { notifyNavigationSummaryChanged(); return; }
  const body = await response.json().catch(() => ({})) as { error?: string };
  throw new Error(runErrors[body.error ?? ""] ?? "Could not start workflow.");
}

export function startWorkflowRun(workflowId: string): Promise<void> {
  return startRun(`/api/workflows/${workflowId}/runs`);
}

export function startCustomNodeRun(customNodeId: string): Promise<void> {
  return startRun(`/api/custom-nodes/${customNodeId}/runs`);
}
