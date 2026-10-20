# Decision 0042: Compose Instagram posts from runs awaiting publish

Date: 2026-10-20
Status: Accepted

## Context

The Library and composer Publish page needs to combine saved Media Library images with workflow images whose runs are waiting for manual publication review. Each image also needs an independent accessibility description, and users need direct drag-and-drop ordering for carousel slides.

## Decision

- The Publish composer may select owner-scoped saved Media Library images and image publications from runs in `awaiting_publish`.
- Instagram photo posts and carousel slides accept per-image alt text, up to 1,000 characters per image. The worker sends the value when creating the image container. Reels and Stories remain outside this alt-text workflow.
- When a selected image has an associated Instagram post caption, use that caption as the slide's initial alt text. Users can edit the alt text independently.
- Users can drag carousel slides to set their order; the existing move-up and move-down controls remain available for keyboard and pointer access.
- Selecting a workflow publication reserves its source publication while a standalone draft or post references it. A reserved source cannot be published or discarded separately, and its run cannot be deleted. Deleting the standalone draft restores the source publication to review.
- After Instagram confirms the composed post, the worker marks its reserved source publications as published and changes their runs from `awaiting_publish` to `succeeded`. A failed or uncertain publish leaves the runs awaiting publish and the source publications reserved for review/retry.

## Consequences

- Ordered publication media rows store alt text and an optional source workflow publication reference.
- The publication API validates that every selected source image belongs to an owner-scoped run still awaiting publish, and prevents the same workflow publication from being reserved by multiple posts.
- Run deletion safety treats reserved source publications as in progress.
- Instagram supports `alt_text` on image media containers, including the per-image carousel child containers; unsupported media types do not receive this field.
