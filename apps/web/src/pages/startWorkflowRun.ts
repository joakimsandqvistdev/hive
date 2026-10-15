import { apiFetch } from "../apiClient";

const runErrors: Record<string, string> = {
  model_not_downloaded: "Download every model used by this workflow from Models before running.",
  invalid_input_counts: "Connect all required model inputs and check connection limits.",
  invalid_input: "Fill every text input and upload a file for each media input.",
  workflow_has_no_nodes: "Add at least one node before running this workflow.",
};

export async function startWorkflowRun(workflowId: string): Promise<void> {
  const response = await apiFetch(`/api/workflows/${workflowId}/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (response.ok) return;
  const body = await response.json().catch(() => ({})) as { error?: string };
  throw new Error(runErrors[body.error ?? ""] ?? "Could not start workflow.");
}
