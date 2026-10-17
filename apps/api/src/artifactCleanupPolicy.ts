export type ArtifactCleanupScope = "old-run-outputs" | "orphaned-workflow-uploads";

export type ArtifactCleanupCandidate = {
  runId: string | null;
  sourceWorkflowId: string | null;
  savedToLibrary: boolean;
  createdAt: Date;
  runStatus: string | null;
  protected: boolean;
};

const terminalRunStatuses = new Set(["succeeded", "failed", "cancelled"]);

/** Shared v1 deletion policy. The API preview is advisory; the worker must apply this again. */
export function canCleanupArtifact(candidate: ArtifactCleanupCandidate, scopes: readonly ArtifactCleanupScope[], now = new Date()): boolean {
  if (candidate.savedToLibrary || candidate.protected) return false;
  const orphanedWorkflowUpload = scopes.includes("orphaned-workflow-uploads")
    && candidate.runId === null
    && candidate.sourceWorkflowId !== null;
  const oldTerminalRunOutput = scopes.includes("old-run-outputs")
    && candidate.runId !== null
    && candidate.createdAt.getTime() <= now.getTime() - 30 * 24 * 60 * 60 * 1000
    && candidate.runStatus !== null
    && terminalRunStatuses.has(candidate.runStatus);
  return orphanedWorkflowUpload || oldTerminalRunOutput;
}
