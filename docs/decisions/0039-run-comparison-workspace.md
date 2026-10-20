# Decision 0039: Add a read-only run comparison workspace

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

Users need to understand whether workflow edits, input changes, or model settings changed a run's behavior. Runs already retain their workflow snapshots, per-node execution state, inputs, outputs, and artifact metadata. Comparison should use those records without changing run execution or claiming to judge media quality.

## Decision

- Provide a dedicated Run comparison workspace, opened from Run details or a Runs list row. The selected run is the baseline; the user chooses the comparison run.
- Limit both run pickers to the signed-in user's runs. Default to the same workflow and make cross-workflow selection explicit. For runs whose workflow was deleted, use the stored snapshot name as the default picker scope and label that fallback.
- Compare client-side using the two existing owner-scoped run-detail responses. Extend the paginated Runs list with owner-scoped search and optional workflow scope. Do not add a comparison table or retain duplicate run data.
- Match nodes by stable ID. Suggest a match by node type and normalized name only when it is unique on each side; require the user to confirm it. Keep unmatched nodes separate.
- Compare text exactly, JSON deterministically after key ordering, and artifacts by checksum when available. Show authenticated media previews and only metadata already stored by Hive. Mark unavailable data as unavailable.
- Show timing deltas in collapsed details. Timing is descriptive and is not a performance alert.
- Redact credential-like configuration values, bound displayed text/JSON, and render all compared content as text. The comparison view is read-only and cannot execute, publish, cancel, delete, or modify runs.
- Keep v1 diagnostic only. Do not label a difference as a regression or score image, video, or audio quality.
- Compare workflow-generation output separately from Instagram publication state. Comparison never initiates publication.

## Consequences

- The Runs API remains the authorization boundary for both picker and detail requests. Client-provided user identity is never used.
- Active run details can change; the workspace labels live comparisons and refreshes selected run data on request.
- Cross-workflow comparisons remain available but can contain unmatched nodes. Suggested node matches require confirmation to avoid silently pairing unrelated steps.
- Artifact preview availability can differ from stored metadata if file bytes are no longer present; the preview reports that state without changing either run.
