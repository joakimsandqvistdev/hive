# Hive Feature Queue

This file tracks the proposed feature backlog and keeps implementation specifications available for later work. Features remain proposals until explicitly selected. Remove a feature from this queue only after it has been implemented and pushed.

## Queue status

| Feature | Status |
| --- | --- |
| Run comparison and regression detection | Proposed |
| Workflow and Custom Node revision history | Proposed |
| Workflow test cases | Proposed |
| Model cache and download manager | Proposed |
| Media storage overview and safe cleanup planner | In progress |
| Portable workflow packages | Proposed |
| Instagram publishing outbox and recovery | Proposed |
| Multiple Instagram accounts and publishing calendar | Proposed |

---

This document proposes three additions that build on Hive's existing workflow, run, Custom Node, Job, and Media Library foundations. Each proposal is scoped so it can be reviewed independently and turned into an implementation plan after product decisions are settled.

## Project context considered

Hive already supports editable workflows and reusable Custom Nodes, snapshots a workflow definition when a run is queued, records per-node execution states in the run_nodes table, retains generated media in the Media Library when explicitly saved, schedules repeat Jobs, and records completion notifications. These proposals add capabilities around those existing flows rather than replacing them.

## Summary and suggested order

| Rank | Feature | Primary benefit | Likely effort |
| --- | --- | --- | --- |
| 1 | Run comparison and regression detection | Explains what changed between two executions of the same workflow | Medium; most run and output data already exists |
| 2 | Workflow and Custom Node revision history | Makes iterative graph editing safer and supports recovery from accidental changes | Medium to high; requires immutable revision storage and diffing |
| 3 | Workflow test cases | Lets users check reusable inputs and expected outcomes before relying on a workflow or Job | High; adds a distinct test-case and evaluation layer |

The first feature is the best initial implementation: it builds directly on persisted run snapshots, per-node states, outputs, and the existing Run details experience. Revision history is a strong next step because it protects valuable workflow and Custom Node definitions. Test cases are useful once users have stable workflows to validate, but need the most product decisions and evaluation logic.

---

## Feature 1 — Run comparison and regression detection

### Goal

Let users compare two runs of the same workflow to see what changed in inputs, per-node outputs, status, duration, and generated media. This is a read-only diagnostic tool: it helps users decide whether a workflow edit, changed prompt, model update, or different input caused an unexpected result. It does not claim semantic image quality or automatically label a result as a regression.

### User stories

- As a user, I can compare a run with another run from its details view or the Runs list.
- As a user, I can compare two runs even when the workflow has changed, with the definition differences made visible.
- As a user, I can quickly find nodes whose status, output, timing, or configuration differs.
- As a user, I can inspect two text outputs side by side and read a line-level text diff.
- As a user, I can view generated images/videos side by side and open their full previews.
- As a user, I can distinguish actual changes from missing data, deleted artifacts, and nodes that have no safe automatic match.

### UX and interaction

1. Add Compare with another run to the existing Run details inspector and a Compare action to each eligible Runs list row.
2. Run selection opens a searchable, paginated picker limited to the current user. Prefer runs from the same workflow, then allow other workflows only when the user explicitly switches the picker filter.
3. Default orientation: selected run is the baseline on the left; comparison run is on the right. Show both statuses, start times, durations, workflow names, and run IDs.
4. Show a compact summary of differences: changed inputs, changed nodes, added/removed nodes, status changes, changed outputs, and duration deltas only where both measurements exist.
5. Add a node-by-node comparison list. Each matched node shows:
   - status in both runs;
   - duration and delta, when measured;
   - configuration/parameter changes with sensitive values redacted;
   - output comparison state: same, changed, only in baseline, only in comparison, or unavailable.
6. Selecting a node opens a split detail area:
   - text outputs get a line-level diff with additions and removals labeled in text as well as color;
   - images and videos get side-by-side previews with independent playback/zoom, never an auto-generated quality score;
   - audio remains separately playable with file metadata and an explicit note that the comparison is playback-based;
   - non-media structured outputs display a safe, bounded key/value diff.
7. Show a workflow-definition notice when snapshots differ. The user can see graph, node configuration, model ID/version, and connector differences that may explain the output change.
8. Provide a switch to show only changed nodes. Keep the default concise while preserving a way to inspect identical steps.
9. Comparison is read-only. It cannot rerun, cancel, publish, delete, or modify either run.
10. On narrow screens, stack baseline and comparison values. Preserve labels and statuses without horizontal page overflow.

### Matching and comparison rules

- Match node instances by stable node ID when available.
- If IDs differ, do not silently treat nodes with the same display name as identical. Offer a suggested match using node type and normalized name, and require confirmation before comparing those records.
- Nodes with no match appear in Added to comparison or Removed from comparison groups.
- Compare text values exactly after normalizing only transport-level representations such as JSON key order; preserve whitespace and punctuation for actual text content.
- Compare artifact files using stored checksum and metadata when available. Matching checksums mean same file; differing checksums mean changed file. Missing files are marked unavailable, not changed.
- For images/video, present both previews and metadata such as dimensions, duration, media type, and size when recorded. Do not add computer vision or perceptual similarity in the first release.
- Duration delta is descriptive, not a performance alert. Exclude queued wait time unless both runs have consistent queue timestamps and the UI labels it separately.

### Data and API approach

- The run-details API already returns each run's snapshot, input JSON, node snapshots, resolved inputs, outputs, timestamps, artifacts, and status. Confirm it includes artifact checksum and metadata needed for safe comparison.
- Add a read-only endpoint that returns both run details in a single owner-scoped request, or reuse current endpoints if doing so does not create excessive duplicate downloads. Never trust a client-provided owner ID.
- Keep comparison in the client initially, as a pure derived view over the returned data. Add server-side comparison only if payload sizes or normalization make client work impractical.
- For large workflows, fetch the comparison run only after the user selects it, then render node differences incrementally if needed. Avoid loading artifact bytes until the user selects an output.
- Do not add a database table for the first version. Do not retain duplicate copies of run outputs; each run remains the source of truth.
- Use only safe, normalized output data in the UI. Do not render arbitrary HTML, expose local storage paths, or show access tokens/configuration secrets.

### Status and edge-case behavior

- Runs may be compared regardless of outcome, including queued, running, awaiting_publish, succeeded, failed, and cancelled states. For active runs, label the comparison as live and explain that values can change on refresh.
- Awaiting publication compares workflow-generation outputs separately from Instagram publication state; it must never trigger publishing.
- If the run's source workflow was deleted, compare using its stored workflow snapshot.
- If model metadata or artifact files are no longer available, preserve run metadata and mark those comparison fields unavailable.
- If a node failed in one run and succeeded in another, show both state and available errors; do not coerce missing output into an empty output.
- Runs from different workflow families are supported only with explicit selection and clear unmatched-node groups.
- If run deletion begins during comparison, show a refresh/unavailable state and do not cause the deletion to fail or restore data.

### Acceptance criteria

- Only runs owned by the signed-in user can be selected or compared.
- Comparison accurately represents stored statuses, inputs, snapshots, outputs, artifacts, and timings.
- Different snapshots are clearly identified; unmatched nodes are not mispaired by name alone.
- Text, artifact, and configuration differences are deterministic and bounded.
- Media previews remain authenticated and use the existing preview/download behavior.
- The comparison cannot modify or execute runs and leaves existing run actions untouched.
- The comparison works for large workflows and responsive layouts without requiring the whole artifact collection to download.

### Open questions for review

1. Should the picker allow any two runs, or default to the same workflow and hide cross-workflow comparison behind a filter? The proposal recommends same-workflow-first.
2. Should users be able to pin a baseline run for repeated comparisons, or is choosing both runs each time sufficient?
3. Should comparison include execution-time differences by default, or keep those in an optional details row to avoid overemphasizing variable model latency?
4. Should a node with a different ID but same type/name be automatically suggested for matching, or should the user choose matches manually?

---
## Feature 2 — Workflow and Custom Node revision history

### Goal

Let users inspect previous saved definitions, compare a prior definition with the current one, and restore an earlier version without losing the current state or rewriting run history. Apply the same concept to workflows and Custom Nodes because both are editable graph definitions.

### User stories

- As a user, I can see when a workflow or Custom Node was changed and inspect its earlier saved versions.
- As a user, I can compare two revisions and see added, removed, and changed nodes, connections, interface ports, and configuration fields.
- As a user, I can restore an older version while retaining a record of the restore as a new revision.
- As a user, I can see which definition a Job run used and why its graph differs from the current workflow.
- As a user, I can recover from accidental edits without manually reconstructing a graph.

### UX and interaction

1. Add History beside existing workflow/Custom Node editor actions and in the respective list row action menu.
2. Open a compact history panel or modal with newest-first revisions, author, timestamp, optional change note, and a short summary such as “2 nodes changed, 1 connection added”.
3. Selecting a revision opens a read-only preview of its graph and metadata. The preview must not mutate the editor's unsaved state.
4. Comparison view offers a two-revision selector and grouped changes:
   - nodes added or removed;
   - node configuration changed, with sensitive values redacted;
   - connections added or removed;
   - Custom Node exposed inputs/outputs changed;
   - title/description changes.
5. Restore this version opens a confirmation that names the selected revision. Restoring applies its definition as the new current definition and appends a new history entry. It does not delete newer revisions.
6. For Custom Nodes, restoration can affect dependent workflows and nested Custom Nodes. Show direct/transitive usage counts before confirmation and use existing Needs attention behavior when the interface no longer matches dependents.
7. Give users an optional short change note on save, but do not require it; an automatic summary remains the default.

### Revision semantics

- A revision is immutable and captures the full definition required to reopen the editor: graph nodes, connections, layout, workflow metadata, and Custom Node interface selection where applicable.
- Create a revision only after a successful save that changes the normalized definition. Opening/saving without changes must not create revision noise.
- A restore creates a fresh revision with a “Restored from revision …” note; the current revision is never overwritten or deleted.
- Runs continue to use their existing run-time workflow snapshots. Revision history does not change queued/running runs or alter historical outputs.
- Jobs continue to snapshot the workflow when a run is queued, consistent with current scheduling behavior.
- Saved Media Library artifact references remain references, not copies. Workflow-scoped uploads retain the same ownership rules as today.
- Revisions that reference a deleted Custom Node or model remain viewable. Restoring one with unavailable dependencies triggers existing validation and Needs attention handling instead of silently removing nodes.

### Data and API approach

- Add an immutable workflow_revisions table with revision ID, user ID, definition owner ID, owner kind (workflow/custom node), monotonically increasing revision number, full definition JSON, normalized-definition hash, optional note, creation timestamp, and actor ID if multi-user ownership is introduced later.
- Add uniqueness on (ownerId, ownerKind, revisionNumber) and an index for newest revisions by owner. Enforce tenant ownership in API queries, not only in UI.
- Store one canonical serialized document for a revision rather than duplicating graph data into many relational tables. Validate its shape with the same parser used for workflow/Custom Node saves.
- Proposed endpoints: list revisions for an owned definition, fetch a revision, compare two revisions, and restore a selected revision using the normal save/validation service.
- Consider a later retention policy only after expected storage growth is measured. The first version should not silently prune user history.
- Migration should backfill a single “History begins” revision per existing workflow and Custom Node, or deliberately begin versioning from the first subsequent save. Prefer backfill so newly enabled History does not appear empty.

### Security, performance, and data integrity

- Recheck owner identity for every list, fetch, compare, and restore request; UUIDs are not authorization.
- Redact credential-like configuration keys from displayed diff content. The underlying definition should not be allowed to contain server secrets in the first place.
- Large definitions should be paginated at the revision-list level and loaded on selection; do not ship all JSON blobs to the browser at once.
- Use a transaction to append the restore revision and update the current definition together.
- A restore must go through the same workflow validation, Custom Node dependency checks, and model/port normalization as an ordinary save.

### Acceptance criteria

- A changed save produces exactly one immutable revision; a no-op save produces none.
- Restoring revision N makes its definition current and creates a later revision; all prior revisions remain inspectable.
- Comparison identifies graph and interface changes without exposing credentials.
- Restore respects ownership, workflow validation, Custom Node dependency impact, and Needs attention rules.
- Run snapshots and Job queue semantics remain unchanged.
- Existing workflows and Custom Nodes remain editable after migration/backfill.

### Open questions for review

1. Should revision creation happen on every changed save, or only when the user explicitly creates a checkpoint? The proposal recommends every changed save for reliable recovery.
2. Should users be able to pin/name important revisions, or is an optional change note sufficient for the first version?
3. Should workflow and Custom Node history share one combined page, or remain in the editor/list for the definition being viewed?
4. Is a revision retention or export policy needed before implementation, given that graph definitions are likely small but may reference growing metadata?

---

## Feature 3 — Workflow test cases

### Goal

Allow a user to save reusable input sets and lightweight expectations for a workflow, run them on demand, and see which cases passed or failed. This gives Hive's graph workflows a repeatable verification loop before attaching them to recurring Jobs or enabling automatic Instagram publishing.

### User stories

- As a user, I can save an input fixture for a workflow, including text and references to saved media.
- As a user, I can run one case or a small suite against the current saved workflow definition.
- As a user, I can define simple assertions on outputs without writing code.
- As a user, I can see pass, fail, error, or not-evaluated status for each assertion and open the underlying run.
- As a user, I can rerun cases after changing a workflow and compare outcomes with the prior test execution.
- As a user, I can prevent tests from accidentally publishing real Instagram content.

### Scope for a minimal first release

- Cases belong to one workflow; no cross-workflow test library.
- A case stores a name, required workflow input values, optional output assertions, and timestamps.
- Cases use only media already saved in the Media Library. Workflow upload or URL import can be selected during case setup only if the imported/uploaded artifact is explicitly saved as a test fixture. Do not silently persist new user uploads.
- Test execution creates an ordinary run linked to a test execution record so existing worker, run status, cancellation, and artifact cleanup behavior is reused.
- Instagram publishing nodes execute in a protected test mode: generation may produce publication-ready media and caption, but the test run must not call Instagram publish APIs or create a live publication. Report that publishing was skipped by test policy.
- Cases run sequentially by default to avoid saturating local model resources. No cron scheduling for test cases in the first release.

### Assertions

Provide a fixed, safe assertion set instead of user-authored scripts:

- Output exists — a named output connector produced a value.
- Text is not empty — a text output contains non-whitespace content.
- Text contains — case-sensitive or case-insensitive substring check.
- Text length — minimum and/or maximum character count.
- Media type — output is an image, audio, or video artifact of the expected type.
- Media dimensions/duration — optional metadata assertion only when Hive already extracts and stores that metadata reliably.
- Assertions apply to a named node and connector or to workflow terminal outputs. If a node/connector is renamed or removed, mark the assertion invalid and ask the user to remap it.
- Do not support arbitrary JavaScript or regular expressions in the initial version; those introduce safety, complexity, and unpredictable runtime concerns.

### UX and interaction

1. Add a Tests tab or panel in the workflow editor, separate from the canvas and node inspector. Do not change the canvas styling.
2. The test-case list shows name, last result, timestamp, and Run action. Provide Create, Duplicate, Edit, Delete, and Run all actions.
3. Case editor mirrors the workflow's exposed inputs: required input errors are inline; image/audio/video inputs can select saved library media; text inputs support multiline text.
4. Assertion builder uses node/connector pickers from the saved workflow definition and a narrow set of assertion types listed above.
5. Running a case creates a linked run. Show a short “Test started” flash message and keep the user on the workflow editor. The test execution panel updates until completion.
6. A case result shows overall outcome plus each assertion result and a link to the detailed Run inspector.
7. Run all displays progress and allows cancelling remaining queued cases. A currently executing run uses the existing run cancellation path.
8. A test run must show a persistent Test badge in the Runs list and run details, and must be filterable separately from normal/manual/Job runs.

### Data and API approach

- Add workflow_test_cases with ID, user ID, workflow ID, name, input JSON, assertions JSON, created/updated timestamps, and a stable sort order.
- Add workflow_test_executions or an equivalent run association with case ID, run ID, workflow snapshot hash/revision, assertion results JSON, outcome, and completion timestamp. Reuse runs for execution lifecycle and run_nodes for node details; avoid a duplicate worker queue.
- Extend run creation with an origin kind/reference, for example manual, job, custom_node, or test_case; keep existing job IDs and Custom Node semantics intact. A small new column or association table should make a run traceable to its case without encoding meaning into input JSON.
- Capture the exact workflow snapshot when the test run is queued, matching existing run behavior. Evaluate assertions after successful workflow execution; execution failure is a test error/failure distinct from an assertion mismatch.
- Evaluate assertions server-side against persisted outputs. Never execute a user-provided script.
- For safe test mode, omit live publication side effects in the worker and persist an explicit skipped-publication result so users know what was not exercised.
- Test cases referencing saved library media should hold explicit references so media deletion can explain the dependency or invalidate the case. Apply the current Media Library deletion policy consistently.

### Outcomes and edge cases

- Passed: workflow run succeeded and every configured assertion passed. No assertions configured should yield Completed or No assertions, not a misleading pass.
- Failed: the workflow completed but at least one assertion failed.
- Error: workflow execution failed, was interrupted, or required dependencies were missing.
- Cancelled: user cancelled execution or stopped the remaining batch.
- A changed node or removed connector makes affected assertions Needs review; do not silently retarget an assertion by display name alone.
- Nondeterministic model output means exact-text assertions may be brittle. Encourage structural checks and allow an optional assertion to be marked informational rather than blocking the case.
- If a model is unavailable, fail preflight before consuming a queued run where possible and explain the missing model.
- Test runs follow normal artifact retention/deletion rules unless the user explicitly saves output media to the Media Library.

### Acceptance criteria

- A test case can be created, updated, duplicated, deleted, and run by an authorized owner.
- Running a case uses a workflow snapshot and the regular worker/run lifecycle; it does not change the saved workflow.
- Test execution never publishes an Instagram post or Reel.
- Assertion evaluation is deterministic for the same persisted outputs and stores a human-readable result per assertion.
- Required workflow inputs are validated before queueing; unavailable models and invalid media references are reported clearly.
- Test executions are distinguishable from normal runs and can be opened in the existing Run inspector.
- Deleting a case does not delete its runs or generated media unless the user separately deletes those runs; deleting test execution history follows existing run deletion policy.

### Open questions for review

1. Should cases support only saved library media, as proposed, or should they also preserve uploaded workflow fixtures outside the library?
2. Should Run all stop after the first failed case, or continue through every case? The proposal recommends continuing by default and offering cancel.
3. Should assertions be allowed to block a case result, or should every assertion be informational? The proposal supports both kinds.
4. Should test runs be kept in the ordinary Runs list with a Test badge, or have a separate test-run history view?
5. Should case results compare the latest execution only, or retain a compact history for every case execution?

---

## Shared implementation and product constraints

- Keep user and tenant ownership checks on every new API path. A guessed UUID must never reveal another user's workflow, revision, fixture, run, or artifact.
- Keep model downloads and workflow execution inside the existing worker/model-runner architecture; do not run model inference in the web process.
- Preserve the existing “run snapshots at queue time” and “Jobs schedule from workflow execution completion” decisions.
- Keep workflow canvas styling unchanged. New inspector or test UI belongs in surrounding panels/tabs and must reuse the Hive Mantine theme and list/header conventions.
- Update README and homepage capability copy when an approved feature is implemented, in line with AGENTS.md.
- Add migrations and focused tests for persistence, ownership, status transitions, cleanup, and error paths. Do not silently delete existing runs, media, revisions, or test data.

## Suggested implementation sequence

1. Run comparison: map two existing run-detail payloads, implement deterministic diffing and safe picker behavior, add UI and focused ownership/comparison tests; no schema changes expected.
2. Revision history: agree on save/checkpoint semantics, implement immutable snapshot table and backfill, list/fetch/diff/restore API, then editor/list surfaces.
3. Workflow test cases: settle artifact fixture retention and result-history decisions, implement saved cases and safe assertion evaluation, then protected test-run mode and UI.


---

# Additional proposals — Round 2

These proposals were chosen after checking the current Models, Media Library, artifact, and runner implementations. They target operational friction that is not covered by the first three proposals.

## Feature 4 — Model cache and download manager

### Goal

Give users clear control over model downloads and Docker cache storage so a large or concurrent download does not unexpectedly monopolize disk or make the host difficult to use. Hive already shows model download status and progress; this proposal adds a safe download queue, cache inventory, and explicit cleanup.

### User stories

- As a user, I can see which models are downloaded, downloading, queued, incomplete, or unavailable.
- As a user, I can see estimated model size, downloaded size, and remaining runner-cache disk space before I start a download.
- As a user, I can limit the number of simultaneous model downloads; the safe default is one active download.
- As a user, I can pause the queue or cancel one download without losing track of other downloads.
- As a user, I can remove a downloaded model's cache after seeing what workflows and Custom Nodes depend on it.
- As a user, I can distinguish deleting model weights from deleting a model definition or changing workflow data.

### UX and interaction

1. Keep the existing Models category/table layout. Add a compact storage summary above the table: runner reachable state, downloaded cache size, available cache volume space, and active/queued download count.
2. Add a Download queue section listing model, progress, current state, estimated remaining bytes, and per-item Cancel action.
3. Add a setting for maximum concurrent downloads with options 1, 2, or 3. Default to 1. Apply the limit to new downloads and let already-running downloads finish or cancel; never kill active model inference to enforce the setting.
4. Add Pause queue and Resume queue controls. Pause prevents queued downloads from starting but does not interrupt an active transfer.
5. Add a Manage cache action per downloaded model. Its confirmation shows approximate disk size, dependent workflow and Custom Node counts, and that those definitions remain but their next run will require a re-download.
6. Cache removal is disabled while that model is downloading or being used for inference. If currently in use, explain the blocking activity and offer retry after it finishes.
7. Show stale/partial cache data only when the runner can positively identify it as safe to remove. Do not infer cache ownership from filenames alone.
8. Keep model card and license links near the model detail panel. The cache manager must not imply that local downloaded weights grant rights beyond the model license.
9. In narrow layouts, keep queue actions reachable and display progress as text plus a bar.

### Runner and API approach

- Extend the internal runner model endpoint to report per-model cached byte size and overall model-cache filesystem free/total bytes. Do not expose host paths.
- Add a runner operation to remove only the selected allow-listed model's cache, using the model catalog's known repository/cache locations. Validate that the model is not active and that removal paths are contained under the configured cache directory.
- Add an API download queue with persisted status if downloads must survive API restarts. The runner already tracks progress and supports multiple concurrent model downloads; API-side scheduling should enforce the user-selected limit.
- Define queue ownership: downloads occur in a shared local runner/cache, but Hive auth/tenant boundaries are per user. If Hive remains single-user/local, mark queue controls as local workspace settings. If multi-user hosting is later added, use a server-wide concurrency policy rather than allowing each user to independently launch three downloads.
- Add a runner health/capacity response that reports only safe operational values: runner busy/idle, active model ID, cache volume bytes, and optionally container-visible RAM/GPU memory when reliably available. Label values as container-visible, not host-wide, and omit unsupported metrics instead of returning misleading zero.
- Re-check free disk space immediately before download when possible; treat catalog size as an estimate because shards and temporary files may need additional headroom.
- Removing a model deletes cache files only. It must not delete workflows, Custom Nodes, run snapshots, or artifacts.

### State transitions and edge cases

- Queued → downloading → downloaded or failed; cancellation records cancelled and removes incomplete transfer files only.
- Queue paused: active entries continue, queued entries remain queued.
- API or runner restart: persisted queued entries resume in FIFO order; an active transfer without a valid process/lease is marked interrupted and can be retried safely.
- Insufficient disk: do not start if known free space is below estimated size plus configured safety margin; if the download still runs out of space, mark failed and clean only its incomplete files.
- Cache removal failure: preserve the downloaded status if files remain; return a clear error and do not claim the model is removed.
- Active inference: reject cache deletion with conflict and include a retryable error code.
- Unknown files: leave them untouched and report that some cache usage could not be attributed to a catalog model.

### Acceptance criteria

- Default behavior permits one concurrent download and never starts queued downloads while the queue is paused.
- Progress and status remain accurate across UI refresh and API restart.
- Disk figures are explicitly identified as estimates or container-visible measurements.
- Cache deletion cannot escape the runner cache root and cannot run while the model is active.
- Deleting weights does not alter workflows or custom-node definitions; missing-model preflight continues to explain what users need to download.
- Existing model download cancellation and incomplete-cache cleanup continue to work.

### Open questions for review

1. Should the download concurrency limit be a workspace setting only, or should each user in a future multi-user server have an individual queue?
2. Should Hive prevent downloads whenever free space is below estimated size plus 10%, or should it only warn and let the user choose?
3. Should model cache cleanup allow removal of every unused model in one reviewed operation, or only one model at a time initially?
4. Should downloads support a true pause/resume protocol, or is queue pausing plus current cancel/retry behavior enough for v1?

---

## Feature 5 — Media storage overview and safe cleanup planner

### Goal

Make generated, uploaded, and library media storage understandable and controllable. Users should be able to see what consumes space, what is protected by a saved-library or active reference, and what a proposed cleanup will delete before confirming it.

This complements existing run deletion and the Media Library's saved/non-saved filter. It does not change their existing retention rules by default.

### Accepted v1 decisions

V1 is a manual cleanup planner with no automatic retention or quarantine period. The library uses one free-text search across file name, media format, workflow, node, and webhook names, with separate Type and Save state filters. Cleanup includes unsaved terminal-run outputs older than 30 days and unreferenced workflow uploads of any age. Incomplete uploads are omitted because they are not persisted in the current upload lifecycle. Protected bytes are an overlapping indicator. Confirmation is permanent; the worker rechecks eligibility and keeps run history. See [Decision 0032](docs/decisions/0032-media-storage-cleanup-planner.md).

### User stories

- As a user, I can see how much space is used by saved library media, unsaved run outputs, workflow uploads, profile images, and pending publications.
- As a user, I can inspect why an artifact is retained and which run, workflow, publication, or profile currently references it.
- As a user, I can preview a cleanup selection and see affected items, total estimated bytes freed, and protected items.
- As a user, I can safely remove eligible transient media without accidentally deleting saved library media or media required by an active publication.
- As a user, I can choose a future retention policy for eligible unsaved run outputs, with the default being no automatic cleanup until I opt in.

### UX and interaction

1. Add a Storage section within Media Library rather than another top-level navigation link. Keep the existing media table and detail preview as the primary browsing experience.
2. The summary shows total known artifact bytes divided into:
   - Saved to Media Library;
   - Run output not saved;
   - Workflow-scoped upload/import;
   - Protected by an active reference.
3. Each asset detail view includes a compact “Used by” list: run, workflow, Instagram publication, profile image, or test fixture once that proposal exists.
4. Add Cleanup planner with explicit scopes: old unsaved run outputs, orphaned workflow uploads, and failed/incomplete uploads that the server can verify are not referenced.
5. Preview step lists every selected item with name, media type, size, age, owner context, and retain/protected reason. Show estimated freed bytes and distinguish known file sizes from unknown/unreadable files.
6. Saved library media is excluded from all automated cleanup scopes unless the user separately selects that asset in the current deletion flow and confirms its name/count.
7. Active/reviewable Instagram publications, connected account profile images, workflow inputs, and any future test fixtures are protected. Provide a link to the reference instead of a delete action.
8. Offer an optional retention rule for unsaved run outputs, such as keep indefinitely, keep for 7 days, 30 days, or 90 days. The default is “Keep indefinitely.” Show exactly when the next cleanup will run and provide a dry-run preview before enabling the rule.
9. Automatic cleanup must never delete run records; it removes eligible media only and records the cleanup result on the run/media detail.
10. Use the existing Hive confirmation and flash-message patterns; destructive confirmation names the scope and item count. Make cleanup reversible only if a future trash/quarantine policy is approved; v1 deletion is explicit and irreversible.

### Data and API approach

- Build a usage query from existing artifact ownership and references: artifacts.runId/runNodeId/savedToLibrary/sourceWorkflowId, run_nodes.inputArtifactId, Instagram publication artifactId, and Instagram account profile references. Add joins for future reference types as those features are approved.
- Add a storage summary API returning aggregate byte totals and counts for the signed-in owner. Avoid returning container paths or raw storage keys.
- Add a cleanup preview endpoint that calculates a snapshot of eligible artifact IDs, reasons, bytes, and protected references. Confirmation submits the preview token or selected IDs; the server revalidates all rows in a transaction immediately before queuing cleanup.
- Reuse the existing run-deletion cleanup worker/storage functions where the artifact is run-owned. For media-only cleanup, add a dedicated deletion queue or generalized artifact-cleanup task that records retries and errors without deleting the run.
- For an automatic retention rule, add user/workspace policy fields and a scheduled cleanup worker. Require the policy to remain disabled by default. The worker must apply the same protection checks as manual cleanup.
- Record per-item cleanup outcome and stable reason codes so users can see what succeeded, was skipped, or needs retry. Avoid persisting sensitive file paths in UI-facing errors.
- If the storage provider cannot report actual disk allocation, present the sum of artifact byteSize values as “tracked media size,” not “free disk space.”

### Safety and lifecycle behavior

- Saved media is never included in unsaved-run cleanup.
- Deleting a run continues to remove only run-owned unsaved media and keeps saved library items, consistent with current behavior.
- Workflow-scoped uploads/imports cannot be removed while referenced by a workflow definition, queued/running run snapshot, or custom-node expansion.
- Media attached to queued, running, awaiting-review, or publishing Instagram work is protected as appropriate to publication state.
- A cleanup preview may become stale between preview and confirmation; the server recalculates eligibility and reports changed/protected items before any deletion.
- Worker failure does not make the asset disappear from the UI; show “Cleanup pending/failed” with a retryable state.
- Pagination and aggregate counts must account for items beyond the current table page.

### Acceptance criteria

- Every cleanup preview item has a specific eligibility or protection reason.
- The server rechecks ownership, reference status, and current lifecycle before deleting each artifact.
- An explicitly saved asset cannot be selected by an unsaved-output retention rule.
- Cleanup outcomes and freed-byte estimates are reported accurately; estimated values are labeled.
- Existing run deletion and media-save behavior is unchanged.
- Retention is opt-in, disabled by default, and tested against races with run deletion, publication, and workflow edits.

### Open questions for review

1. Should the first version include a configurable automatic retention rule, or only a manual cleanup planner with no background deletion?
2. Which default age filters are useful for unsaved run outputs: 7, 30, or 90 days? The proposal leaves the default as no cleanup.
3. Should deleting a workflow automatically offer to delete unreferenced workflow uploads, or should media cleanup remain an explicit separate operation?
4. Would a short-lived quarantine/trash period be worth the storage cost before permanent deletion?

---

## Feature 6 — Portable workflow packages

### Goal

Allow users to export a workflow or Custom Node as a portable package and import it into another Hive installation. The package should contain the graph definition and a dependency manifest, while clearly separating portable definition data from machine-specific settings, connected accounts, secrets, and media files.

### User stories

- As a user, I can export a saved workflow or Custom Node to a local file.
- As a user, I can import that file into another Hive instance without Git access to the original installation.
- As a user, I can see missing models, missing Custom Nodes, incompatible node types, and unresolved media references before import.
- As a user, I can choose whether to include explicitly selected media files in the package.
- As a user, I can review and change workflow name, Custom Node mappings, and media mappings before creating the imported definition.
- As a user, I can share a workflow without leaking Instagram credentials, user IDs, local paths, or hidden machine configuration.

### Package format

- Use a versioned ZIP package with a manifest and separate canonical JSON definitions. A human-readable manifest describes package format version, Hive feature/API compatibility range, exported item kind, name, creation time, required ionodes/Hive node capabilities, model IDs, Custom Node dependencies, and optional media manifest.
- Do not export user IDs, session IDs, OAuth tokens, Instagram account IDs, encryption keys, local paths, database URLs, job schedules, run history, or notification history.
- Do not include downloaded model weights. Record model IDs and minimum/known compatibility metadata only.
- Do not include media by default. Saved Media Library references are exported as unresolved logical references containing safe display name, data type, and optional checksum; they are not assumed to exist in the destination instance.
- When the user explicitly selects media inclusion, package only the checked artifacts, enforce existing per-type upload limits plus a total package-size limit, and show the package size before export.
- Include nested Custom Node definitions only when the user selects “Bundle dependencies.” Otherwise list them as required dependencies that must already exist or be mapped at import.
- Signatures are not required for local export/import in v1. Treat every imported file as untrusted input and validate it as strictly as normal API input.

### UX and interaction

1. Add Export package to the Workflow and Custom Nodes list actions and editor menu. Keep current in-application duplication/import behavior unchanged.
2. Export wizard steps:
   - choose target definition(s);
   - review direct and nested Custom Node dependencies;
   - optionally include media after seeing each item's name, type, and size;
   - scan summary of models, node capabilities, and account-specific settings that will be omitted;
   - download package.
3. Add Import package in workflow/custom-node list views. Browser file selection accepts only the supported package extension and bounded size.
4. Before import, show a preflight report:
   - compatible and unsupported node types;
   - available/missing model definitions;
   - dependency Custom Nodes found, missing, or name-conflicting;
   - included media and unresolved external media references;
   - any node configuration fields that were omitted or reset.
5. Let user map included Custom Nodes to existing definitions or create bundled definitions as new independent copies. Never silently substitute a dependency with a different Custom Node.
6. Let user map missing media references to existing library files or leave them unresolved with the existing Needs attention behavior.
7. Create new IDs for every imported workflow/node/edge/Custom Node to avoid collision with current records. Keep internal references consistent.
8. Import creates a new workflow or Custom Node and does not open its editor automatically; offer an explicit Open after import action, matching current duplicate behavior.
9. Show a concise completion summary with the new definition link and any remaining Needs attention items.

### Data and API approach

- Add export serialization service that works from the current saved definition, not a stale frontend-only graph. If exporting unsaved edits, require an explicit Save or Export current draft flow and state which definition is used.
- Implement package inspection/extraction with strict archive limits: maximum compressed and uncompressed bytes, maximum file count, no absolute paths, no traversal entries, no symlinks, no duplicate manifest keys, and an allow-list of package paths.
- Parse manifest and definitions with schema validation before creating database rows. Reject unsupported major format versions and report supported feature compatibility.
- Run the same node/connection validation, Custom Node cycle detection, ownership checks, model validation, and artifact-reference checks used by normal saves/imports.
- Import all definitions and optional media metadata in a database transaction; store media bytes through the artifact storage API with cleanup rollback if the transaction fails.
- Use an idempotent import operation token or request key so retrying a network-failed import cannot create duplicate graphs.
- Keep package schema independent from raw database column names where possible, so database refactors do not invalidate exported files.
- Record package format version and exporter version in the manifest. Maintain migration adapters for supported prior package versions.

### Security and compatibility

- Treat packages as untrusted: prevent zip bombs, traversal, symlink extraction, MIME spoofing, oversized media, and malformed JSON.
- Validate media content using the same decoder/magic checks as uploads; never trust manifest-provided media type or size.
- Enforce signed-in user ownership for importing and exporting. Do not allow a package to claim another user's database ownership.
- Do not rehydrate Instagram account connections from a package. Publishing nodes should import with the selected account cleared and require the destination user to choose one.
- Imported workflows with unsupported node types remain blocked with explicit Needs attention; never silently replace model/processing behavior.
- If nested Custom Nodes are bundled, rewrite references to the new imported IDs and run cycle checks on the resulting dependency graph.
- Do not auto-download required models during import. Offer links to Models and explain the disk/network requirements.

### Acceptance criteria

- Exported packages contain a valid manifest and complete selected graph definitions.
- No secrets, user IDs, run history, job schedules, or model weight files are included.
- Import rejects malicious archive paths, oversized packages, invalid JSON, unsupported versions, and unsafe media.
- Import preflight shows missing dependencies before writing any records.
- Successful import creates independent IDs and does not change the source definition.
- Partial failure leaves no orphaned DB records or media files.
- Existing within-instance workflow import, subgraph export, duplication, and Custom Node import flows continue to behave as before.

### Open questions for review

1. Should v1 export one workflow/Custom Node at a time, or allow a batch package containing multiple top-level definitions?
2. What total package-size limit is suitable for local installs if users opt to embed media: 100 MB, 500 MB, or a configurable limit?
3. Should bundled Custom Nodes always import as new copies, or can users opt to link a bundle dependency to an existing node after reviewing a definition diff?
4. Should packages be intended only for private backup/transfer, or should Hive eventually support a public template catalog with signing and moderation?

---

## Feature 7 — Instagram publishing outbox and recovery

### Goal

Make automatic and manual Instagram publishing observable and recoverable across API timeouts, tunnel interruptions, worker restarts, and ambiguous responses. Hive already stores publication rows, Instagram container IDs, media IDs, and publication states. This proposal strengthens the state machine and retry rules so an uncertain response never leads Hive to blindly create a duplicate post.

Meta's API uses a media-container flow: create a container, check its processing status, then publish it. The official Meta Postman collection documents checking a container's status and using the publish endpoint. See the [Instagram API collection](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api) and its [container-status request](https://www.postman.com/meta/instagram/request/munmruq/get-ig-container-status).

### User stories

- As a user, I can see which Instagram publishing stage is active for each generated post or Reel.
- As a user, I can tell whether a failure happened before Instagram accepted a publish request or whether the result is uncertain.
- As a user, I can safely recover from transient container processing, media URL, or network errors.
- As a user, I am never asked to blindly retry an ambiguous publish request.
- As a user, I can see a durable history of publication attempts and the final outcome.
- As a user, I can delete a run or discard a publication while respecting the existing in-progress publication protections.

### Proposed publication state machine

Separate workflow generation status from Instagram delivery state. A Job can continue after workflow generation completes, regardless of whether a publication is still pending.

Suggested publication states:

- Awaiting review — manual publication is waiting for caption/media approval.
- Queued — automatic publication is ready for background handling.
- Creating container — Hive has submitted the media container request.
- Processing media — Instagram is processing the container; Hive polls its status.
- Ready to publish — container status indicates it can be published.
- Publishing — Hive submitted the publish request and is waiting for a definitive response/reconciliation.
- Published — Hive confirmed publication or reconciled the container as published; media ID may be unavailable.
- Failed — Hive knows the operation failed and it is safe to retry.
- Needs review — the remote outcome is ambiguous; automatic retries are stopped.
- Discarded — the user explicitly cancelled a pending manual publication.

Store the exact remote status code and a short sanitized explanation where available. Do not show raw tokens, request headers, signed URLs, or full upstream response bodies to users.

### UX and interaction

1. Add a compact Publishing queue view within Accounts or Runs. The default should show only pending, failed, and needs-review publications; history can be expanded or filtered.
2. Each row shows media preview, account name, post/Reel type, workflow/run, caption excerpt, current stage, last update, and any next scheduled retry time.
3. Selecting a row shows the publication timeline: media URL check, container creation, processing status checks, publish request, and reconciliation. Include timestamps and attempt counts.
4. For automatic publishing, transient safe-to-retry failures show Retry scheduled and a countdown. Users can choose Retry now or pause retries for that publication.
5. For manual publishing, retain the existing review and caption edit flow. After approval, show progress in the same publication detail.
6. Needs review shows a strong warning: Hive could not confirm whether Instagram accepted the request. Present:
   - Check Instagram status, which performs only safe read operations;
   - Mark as published, if the user confirms the post is visible (media ID may remain unknown);
   - Retry anyway, only after a separate confirmation that explains a duplicate may appear if the first request was accepted.
7. Failed rows show Copy diagnostic details with publication ID, run ID, stage, sanitized error code, timestamps, retry count, and remote container ID when present.
8. Offer Retry safe failures and Discard for eligible pending states. Do not offer discard while a publish request is actively being sent or reconciliation is in progress.
9. Keep publication history attached to Run details and make the same stage/outcome visible in the notification bell where useful.
10. Responsive layout should preserve preview, account, stage, and actions without a dense wide table.

### Retry, idempotency, and reconciliation rules

- Use the existing unique publication identity for one workflow node per run. Enqueueing or retrying a worker must not insert a second logical publication row for the same run/node.
- Persist the container ID immediately after successful container creation and before polling or publishing.
- Poll container processing with bounded exponential backoff and jitter; honor API rate limits and a finite maximum elapsed time. Return the publication to a recoverable state rather than polling indefinitely.
- Retry safe GET/status checks after network errors. Retry container creation only when Hive has definitive evidence the request was not accepted. If the response was lost and no container ID was received, stop in Needs review instead of issuing another create request automatically.
- Before publish, confirm the existing container is ready. Persist the Publishing state and attempt identifier before calling the publish endpoint.
- If a publish request has an ambiguous timeout or connection loss, do not repeat it automatically. Reconcile by checking the known container status and any supported account media lookup. If Hive cannot determine the outcome, stop in Needs review.
- If the container is confirmed PUBLISHED but the media ID is missing, record Published with “Instagram confirmed publication; media link unavailable.” Do not publish that container again.
- Only retry a publish operation automatically when a definitive response establishes that Instagram did not accept it and the failure class is retryable. For uncertain errors, require explicit user action.
- Keep all retries idempotent at the Hive job level using a durable publication ID, per-stage operation key, lease, and attempt count. Do not assume Instagram guarantees a client-supplied idempotency key unless the relevant endpoint explicitly supports one.
- User-selected Retry anyway after an ambiguous outcome must show and log the duplicate-post risk; do not describe this action as safe.

### Data and API approach

- Extend the existing instagram_publications row with durable stage, attempt count, last attempt time, next retry time, lease owner/expiry, sanitized last error code, remote status code, and published-without-media-ID indicator as needed.
- Keep the API publication worker separate from workflow execution. A publishing outage must not change a successful workflow run back to failed or prevent the next Job occurrence.
- Use row locking or a claim-and-lease pattern so only one worker performs a publication transition at a time. A stale lease should trigger reconciliation, not blindly reissue POST operations.
- Add owner-scoped endpoints for queue listing, publication detail, safe status refresh, safe retry, explicit risky retry, and discard where allowed.
- Store attempt transitions in a small append-only publication-attempt table if users need full history; otherwise keep only current state plus a bounded event history JSON if update volume is low. Prefer a table if every operation needs auditability.
- Use structured provider errors mapped to stable Hive codes. Sanitize upstream messages and redact access tokens, signed URLs, and user content where not required.
- Keep publication status distinct from run status and job status. A workflow can succeed while its publication is in Needs review.
- Update notifications so publication problems can be opened directly from the bell; avoid generating repeated unread notifications for every poll/retry.

### Edge cases

- Tunnel/public media URL outage before media fetch: fail the media-access preflight or container processing with a clear retryable error; do not attempt publish.
- Container processing remains in progress past the normal timeout: move to Needs review or retry-scheduled status with a clear timeout, rather than holding a worker slot indefinitely.
- Worker restarts after a transition: resume based on persisted stage and known remote IDs. If the last remote POST might have succeeded, reconcile before any repeat.
- Access token expires or is revoked: stop automatic retries, mark action required, and direct the user to reconnect the account.
- User deletes the run during publication: preserve the existing rule that actively publishing blocks deletion; discard pending/reviewable publication and clean unsaved media only after safe state transition.
- Job creates another workflow run: scheduling remains tied to workflow generation completion and does not wait for Instagram publication.
- Container or media ID is lost after success: show a confirmed/uncertain status accurately and never invent an ID.
- Rate limit response: honor retry timing where available, cap retry count, and present a clear next action when the cap is reached.

### Acceptance criteria

- Each run/node publishing action maps to at most one logical publication record.
- Stage and retry state survive API/worker restart.
- No ambiguous media-container or publish POST is retried automatically.
- Known-safe transient failures retry with bounded backoff and stop at the configured limit.
- A published container without returned media ID is not published a second time.
- User-visible diagnostics are actionable and contain no secrets or signed URLs.
- Publishing never delays Job recurrence after workflow execution completes.
- Discard/delete behavior remains race-safe and respects active publication protection.

### Open questions for review

1. Should automatic publications retry safe transient failures up to 3 attempts or use a time-based window such as 30 minutes?
2. For an ambiguous publish, should “Retry anyway” be available to all users or require a typed confirmation such as the publication name?
3. Should the queue live under Accounts, Runs, or a new Publishing navigation view?
4. How long should detailed publication-attempt history be retained?
5. Should a confirmed published state without a media ID be sufficient for success notifications, or should it create a separate “published, link unavailable” notification?

---
## Round 2 recommendation

The **Model cache and download manager** is the most immediate operational improvement because Hive currently permits parallel downloads and model files live in a persistent Docker volume. The **Media storage overview** is the strongest safety and disk-usage improvement because it makes the existing save/protection/cleanup rules visible before deletion. **Publishing outbox and recovery** directly addresses ambiguous Instagram outcomes and duplicate-post risk. **Portable workflow packages** are the best sharing and migration feature, but require the strictest security and compatibility work.

Suggested order: model download queue/cache controls first, media inventory/cleanup preview second, publishing outbox/recovery third, portable package format fourth. The artifact cleanup policy should remain opt-in and non-destructive until retention behavior is reviewed.

---

# Additional proposals — Round 3

## Feature 8 — Multiple Instagram accounts and a publishing calendar

### Goal

Support multiple connected professional Instagram accounts and provide one place to review and schedule posts across them. The current one-account-per-user relationship means this requires a deliberate schema and OAuth migration.

### UX and behavior

1. Change Accounts to an inventory showing username, account type, connection health, last refresh, and per-account disconnect/reconnect actions.
2. Add a publishing agenda under Accounts, filterable by account, post/Reel kind, and status. Default to agenda on narrow screens.
3. Each item shows media preview, caption, account, source run/workflow, scheduled time, and status. Manual-review items can edit caption, choose an allowed account, schedule/reschedule, publish now, or discard.
4. Publishing nodes select an account for automatic publishing. Only usable accounts are selectable. A revoked account marks dependent workflows as needing attention and blocks automatic publishing.
5. Show the target account in node configuration, Run details, Job details, and confirmations to prevent accidental cross-posting.
6. Store scheduled times in UTC and retain the timezone used for input. Detect ambiguous/nonexistent daylight-saving times.
7. Pending or scheduled publications never block workflow Job recurrence. A publication outbox handles due items independently.

### Data and safety

- Remove the one-account-per-user uniqueness constraint while retaining uniqueness for provider account identity.
- Keep encrypted OAuth credentials per account, never in node configuration, run inputs, or workflow snapshots. Snapshots store only the selected account reference.
- Add scheduled time and scheduling timezone to publication records or a dedicated schedule row, with an index for due work.
- Reconnecting an existing account updates its token rather than creating a duplicate row.
- Disconnecting an account explains effects on pending publications; preserve publication history and generated artifacts.
- Migrate the existing account and credentials without loss or forced reauthorization when possible.
- Serialize due publication submissions per account and use outbox reconciliation to avoid overlapping or duplicate requests.
- If a due publish fails because credentials expired, retain the scheduled item as action-required; never silently discard it.

### Acceptance criteria

- Multiple accounts can be connected without overwriting each other's credentials.
- Every automatic and manual publication identifies its target account.
- Account ownership and permissions are checked at selection, queue, and publish time.
- Scheduling is transactional and timezone-safe, and never delays a Job's next run.
- Disconnecting an account has explicit effects on scheduled items.

### Open questions

1. Should account choice be fixed in the node, or may manual-review runs choose another connected account?
2. Should v1 schedule only manual-review publications, or also automatic posts for a specified future time?
3. Should two Hive users be allowed to connect the same Instagram account independently?

### Round 3 recommendation

Multiple-account management and a publishing calendar are a natural next step after the current single-account publishing path is stable. Build account lifecycle and scheduling with clear ownership checks, and keep delayed publishing independent from workflow job recurrence.
