# Decision 0041: Publish saved Media Library images directly to Instagram

Date: 2026-10-20
Status: Accepted

## Context

Hive's existing Instagram Post/Reel publishing is attached to a workflow run. Users also need a dedicated path to publish saved Media Library images without running a workflow, including multiple images in one Instagram post.

## Decision

- Add a protected **Publish** page in the left navigation. It composes from image artifacts owned by the signed-in user and saved to Media Library; unsaved run outputs must be saved to the library first.
- One image creates a normal photo post. Two to ten images create an Instagram carousel. The selected order is persisted and sent to Instagram; one caption applies to the entire post.
- Support standalone drafts, editing their media/order/caption/account before queueing, and explicit confirmation before publish-now. Scheduled publishing is out of scope.
- Store ordered publication items separately from the primary publication record. Standalone publications have no run or workflow node; workflow publications keep their existing run/node lifecycle and single-media behavior.
- Reuse the existing durable Instagram publication queue and signed media URL. Save each carousel child container ID before proceeding so the worker can resume after a restart. Wait for child and parent containers to finish before publishing the parent.
- Keep all account and media lookups owner-scoped. Accept only saved image artifacts. The signed Instagram media endpoint serves supported image artifacts as JPEG, including PNG/WebP library images, while video delivery for Reels remains unchanged.
- Draft deletion removes its publication and item references; once queued or published, the record remains as publication history and protects its referenced images from deletion.

## Consequences

- [Decision 0042](0042-publish-awaiting-runs-with-per-image-alt-text.md) extends this Library and composer flow to include image publications from runs awaiting publish.
- `instagram_publications.run_id` and `node_id` become nullable only for standalone posts. Existing run-backed rows and status transitions remain valid.
- Each publication can reference an ordered set of image artifacts. Artifact protection and deletion checks must include these item references.
- Users can publish a saved image or carousel independently of a workflow. Accounts and publication history remain subject to the existing single-professional-account and disconnect constraints.
- Instagram publishing still requires a connected professional account, valid Meta app credentials, and a public HTTPS API URL reachable by Meta.
