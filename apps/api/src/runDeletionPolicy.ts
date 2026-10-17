const safePublicationStates = new Set(["awaiting_review", "queued", "published", "discarded"]);
export const bulkDeleteRunStatuses = ["queued", "failed", "succeeded", "cancelled", "awaiting_publish"] as const;

export function isBulkDeleteRunStatus(status: unknown): status is typeof bulkDeleteRunStatuses[number] {
  return typeof status === "string" && (bulkDeleteRunStatuses as readonly string[]).includes(status);
}

export function canDeleteAwaitingPublishRun(publicationStatuses: readonly string[]): boolean {
  return publicationStatuses.every((status) => safePublicationStates.has(status));
}
