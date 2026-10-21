# Decision 0043: Review workflow publications before composing

Date: 2026-10-21
Status: Accepted

## Context

Manual Instagram workflow publications can wait in `awaiting_publish` while users prepare a standalone post. Users need a focused place to inspect each post's generated image and caption before deciding whether it should remain available for publishing.

## Decision

- Add a Review tab to Publish with an owner-scoped queue of unreviewed image publications whose runs are `awaiting_publish`.
- Show one current run with a large image preview and its caption. Skip marks that run's activity notifications as read and advances without persisting review state; skipped items return the next time Review is opened.
- Approve records `reviewed_at` and leaves the publication in `awaiting_review` and its run in `awaiting_publish`, so it remains available in the Publish composer.
- Discard uses the existing workflow-publication discard transition: record `reviewed_at`, set the publication to `discarded`, and move its awaiting-publish run to `succeeded`. The post is no longer available as an awaiting-publish source; generated media and separately saved Media Library copies remain available.
- Discard does not emit a second Succeeded activity notification for the awaiting-publish run; other run success notifications keep their existing behavior.
- Do not show reviewed or discarded workflow publications in the Review queue. Existing reservations continue to exclude a source publication from Review and the composer.

## Consequences

- `instagram_publications.reviewed_at` records a review decision independently from publication status.
- The API exposes a separate owner-scoped unreviewed queue; the existing awaiting-publish composer source continues to include approved publications.
- Review actions mark all unread activity notifications for the associated run as read, including the succeeded notification created by discard. The notification bell refreshes immediately.
- Skips are client-session state and do not persist across leaving and reopening the Review tab.
