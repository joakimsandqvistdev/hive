const safePublicationStates = new Set(["awaiting_review", "queued", "published", "discarded"]);

export function canDeleteAwaitingPublishRun(publicationStatuses: readonly string[]): boolean {
  return publicationStatuses.every((status) => safePublicationStates.has(status));
}
