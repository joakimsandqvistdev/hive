# Current work

## 2026-10-13 — Preserve workflow execution order in run details

- Confirmed that the worker executes nodes serially in topological order. A node becomes ready only after all incoming edges have been satisfied, so all direct predecessors finish before their shared downstream node starts; a failure stops the run before dependent nodes execute.
- Extracted the worker's stable topological ordering into shared API logic and use the same ordering for run-detail agent steps and generated output previews. No database migration was needed.
- API/web typechecks, API build, and `git diff --check` passed. Automated tests were not run.

## 2026-10-13 — Fix multipart numeric dimension validation

- The remaining 422 was caused by declaring multipart `width`/`height` values as numeric `Literal` types; multipart values arrive as strings, so Pydantic rejected even valid values such as 512. Changed them to parsed integers and explicitly allow only the five supported resolution pairs.
- Rebuilt the runner with the NVIDIA Compose override. Health reports CUDA and 8 GiB GPU memory; a non-generating invalid-dimension probe reaches the intended `Unsupported image dimensions` validation, confirming numeric form parsing. API/web typechecks, API build, Python syntax validation, and `git diff --check` passed. No inference request was made; the workflow should now be rerun.

## 2026-10-13 — Diagnose repeated image-runner 422 responses

- Confirmed the rebuilt runner is healthy, sees CUDA, and advertises multipart form fields; the latest failed run still reaches it and fails on a Z-Image-Turbo node. Persisted node values inspected so far (512×512, 9 steps, short prompt) satisfy the published field constraints, so the precise invalid field is not retained in the old run record.
- Updated the worker to retain only safe FastAPI validation locations/messages in run errors, excluding submitted values and prompts. The watched worker should reload automatically; rerun once and inspect the node error for the specific rejected field if the 422 persists.

## 2026-10-13 — Rebuild stale image runner after request validation failure

- Diagnosed HTTP 422: the running local runner advertised the legacy JSON `/generate` schema, while the current worker sends multipart form data. Rebuilt/recreated the runner and restored the existing NVIDIA Compose override.
- Verified `/generate` now advertises `multipart/form-data`; `/health` reports ready with CUDA available and the RTX 2080's 8 GiB detected. No inference request was made; rerun the failed workflow from the UI to confirm its generation.

## 2026-10-13 — Preview workflow node outputs in run details

- Added an authenticated, owner-scoped inline image preview endpoint and image previews in the run detail modal, grouped and labeled by the producing workflow node. Existing download actions remain available.
- API/web typechecks and builds plus `git diff --check` passed. Automated tests were not run.

## 2026-10-13 — Add Qwen-Image-Edit-2511 workflow support

- Added Qwen-Image-Edit-2511 as an image model choice for agents and workflow nodes. Model-specific settings reuse the existing JSON parameters; no additional database migration was needed for this integration.
- Connected image-node outputs now become one to ten references to a Qwen edit node, ordered top-to-bottom then left-to-right on the canvas. The local runner switches between the Qwen and Z-Image-Turbo pipelines and validates uploaded references before loading/switching the model.
- Added the model's Apache 2.0 attribution to Licenses and recorded decision 0006. The model files are about 57.7 GB. Typechecks and `git diff --check` passed. Automated tests and Qwen inference were not run; the current host's ability to load/run this checkpoint remains unverified.

## 2026-10-13 — Configure image model parameters on agents and workflow nodes

- Added agent and per-node image settings for resolution, seed/randomize-seed, and inference steps. Workflow nodes initialize from selected agent settings; runs snapshot settings and persist a randomized seed before execution so retries reuse it.
- Updated the Z-Image-Turbo runner to accept the configured inference steps and added migrations `0009_chilly_iron_patriot` (agent/workflow settings and existing-image defaults) and `0010_lazy_miss_america` (run-node settings). Both migrations applied successfully to the configured local database.
- Recorded the parameter policy in decision 0005 and updated the orchestration data model. API/web typechecks and API/web production builds passed; Vite reports its existing >500 kB bundle advisory. `git diff --check` passed. Automated tests were not run. Docker Compose could not reach the Docker Desktop engine, so the updated runner container was not rebuilt; rebuild it before using custom step counts, and then run an image workflow to verify inference end to end.

## 2026-10-13 — Build run prompts from agent and node prompts

- Removed the prompt dialog from the workflow Run action; it now queues the saved workflow directly.
- The worker now composes model input from the agent prompt and workflow-node prompt, avoids duplicating identical defaults, and still accepts legacy run-level prompt snapshots.
- Run creation no longer requires a user prompt. Updated the orchestration design accordingly.
- API/web typechecks and builds passed; `git diff --check` passed. The existing Vite >500 kB bundle advisory remains. Automated tests were not run.

## 2026-10-13 — Use only the saved workflow-node prompt at execution

- Updated the worker to send only the saved workflow-node prompt to the model. The agent prompt remains the editor's initial value for a node and is not appended at execution.
- Legacy workflow snapshots still read their pre-rename `instructions` field as the node prompt.
- API typecheck/build and `git diff --check` passed. Automated tests were not run.

## 2026-10-13 — Show the selected model in agent modality labels

- Added a shared modality-label map so image agents display `Image (Z-Image-Turbo)` in the agent type selector, agent list, workflow agent picker/configuration/node, and run details.
- Kept stored modality values unchanged (`image`) to preserve API and database compatibility. Other modalities retain their generic names because no concrete runner model is configured for them yet.
- Web typecheck, production build, and `git diff --check` passed. Vite continues to report its known >500 kB bundle advisory.

## 2026-10-13 — Rename agent and workflow-node descriptions to prompts

- Renamed the reusable agent text to `prompt` in the database, API, and Agents UI. Renamed workflow node `instructions` and run-node snapshot text to `prompt`.
- Newly selected workflow agents initialize that node's prompt from the agent prompt; API saves also use the selected agent prompt when a node prompt is omitted. Migration `0008_fearless_centennial` preserves existing text and fills previously empty workflow-node prompts from their agent.
- Kept workflow metadata `description` as-is. Worker parsing remains compatible with snapshots created before this rename.
- API/web typechecks and builds passed; Drizzle reported no schema differences after migration generation; migration `0008_fearless_centennial` applied successfully to the configured local database. Confirmed the three prompt columns exist and existing agent/workflow-node prompt text was retained. `git diff --check` passed. Vite still reports the known >500 kB bundle advisory; automated tests were not run.

## 2026-10-13 — Launch and inspect workflow runs in the UI

- Added a saved-workflow Run workflow action with a prompt dialog, then queues the run through the existing owner-scoped workflow run API and navigates to Runs.
- Replaced the Runs placeholder with a paginated run history, polling for active runs, and a detail modal with per-node states, errors, and authenticated artifact downloads.
- Updated the orchestration design to reflect the initial run UI. API contracts and schema were unchanged.
- Web typecheck, production build, and `git diff --check` passed. The known Vite >500 kB bundle advisory remains. No automated tests were run. Next: connected input binding, modality adapters, cancellation, and run/artifact cleanup UX.

## 2026-10-13 — Execute image runs and store artifacts locally

- Added an API workspace worker that polls and claims durable runs, renews leases, resumes interrupted work, and limits worker-crash retries to three claims. The current runner adapter executes disconnected image nodes only; unsupported modalities and connected graphs fail clearly.
- Added an `artifacts` table and migration `0007_slim_silver_samurai`. The worker validates and stores PNG output under `.data/artifacts` (or `ARTIFACT_ROOT`), with 25 MB limit, checksum, and opaque keys. Authenticated artifact downloads and run-detail artifact metadata are available.
- Added `worker:dev` and production worker scripts. Updated the orchestration design and decision 0004.
- API typecheck/build, migration application, and `git diff --check` passed. Automated tests and a live model-generation run were not performed in this slice. Remaining: run submission/progress/artifact UI, graph input binding, more modality adapters, cancellation, and orphan-file cleanup.

## 2026-10-13 — Add durable run records and PostgreSQL queue foundation

- Added `runs` and `run_nodes` with owner constraints, queued/running/final statuses, workflow/agent snapshots, node states, attempt counts, and worker lease fields. Generated migration `0006_tricky_killer_shrike` and applied it to the configured local `hive` database.
- Added authenticated, owner-scoped run create/list/detail APIs. Creating a run locks and snapshots the saved workflow and agent metadata, then inserts its run and queued node rows in one transaction.
- Added atomic PostgreSQL queue claim and lease-heartbeat primitives using `FOR UPDATE SKIP LOCKED`; the actual polling worker and model execution handlers are still outstanding.
- Updated the orchestration design and recorded the database-backed queue decision in decision 0004. The Runs page remains a placeholder and artifacts are not implemented.
- API typecheck, API build, Drizzle schema-diff check, and `git diff --check` passed. Migration generation initially exposed an index/foreign-key ordering issue; the migration was corrected and applied successfully.

## 2026-10-13 — Add Z-Image-Turbo local runner proof of concept

- Added a standalone FastAPI/Diffusers runner with health and image generation endpoints, Dockerfile, dependency list, usage guide, a persistent Hugging Face cache volume, and an optional NVIDIA GPU Compose override.
- Confirmed Docker GPU passthrough on the development host (NVIDIA RTX 2080, 8 GiB). The runner automatically enables sequential CPU offload below 16 GiB and a 512x512 PNG generation request succeeded; the response was 322 KB.
- Initial model cache download used about 31 GB. The PyTorch/CUDA base layer was about 3.7 GB. Initial setup is therefore storage- and download-heavy.
- Recorded the runner architecture and local-development security boundaries in decision 0003. Workflow worker/queue integration is still outstanding.
- Validated CPU and NVIDIA GPU Compose configurations and `git diff --check`. Full Hive build/typecheck were not run because this change adds an independent Python inference service.

## 2026-10-10 — Add behavior checks and extract navigation state

- Added a root `npm test` command with navigation-state unit tests and workflow API integration coverage for graph save/load/replacement, cycle validation, database edge storage, and agent deletion constraints.
- Extracted hash routing and sidebar persistence/transitions into `src/navigation/navigationState.ts` and `useAppNavigation.ts`; `App.tsx` now composes the navigation hook with the view shell.
- Navigation tests, API integration tests, API/web typechecks, production build, and `git diff --check` passed. Integration tests use temporary records in the configured development database and clean them up. Vite continues to report its >500 kB bundle-size advisory.

## 2026-10-10 — Keep only the current workflow definition

- Replaced version-scoped graph storage with workflow-scoped node and edge tables. Workflow saves now replace the current graph transactionally, and the editor no longer shows version status.
- Added migration `0005_lush_toad_men` to preserve the latest saved graph for each workflow and remove workflow version tables and the counter. Updated agent usage checks and architecture/data-model documentation.
- API/web typechecks, production build, schema generation check, and migration application passed. Vite still reports the known bundle-size advisory above 500 kB.

## 2026-10-10 — Persist workflow node connections relationally

- Added `workflow_version_nodes` and `workflow_version_edges` alongside the existing immutable JSONB definition. Workflow saves now insert node settings, agent references, and source/target edges in the same transaction as each version.
- Added ownership and same-version endpoint foreign keys, plus a migration that backfills graph data from existing JSONB versions. Updated the data model and orchestration design and recorded the storage decision.
- API/web production build and `git diff --check` passed; migration `0004_salty_black_widow` applied successfully to the configured development database. Vite reports the existing >500 kB bundle-size advisory.

## 2026-10-10 — Persist sidebar collapse across workflow editor navigation

- Moved desktop sidebar state to the top-level app and made editor collapse temporary: the state is saved before entering a workflow editor, the editor opens collapsed, and the latest state selected in the editor is restored after leaving.
- Verified with the API/web production build and `git diff --check`. The build passes with Vite's >500 kB bundle-size advisory.

## 2026-10-10 — Workflow canvas and open-source notices

- Added `@xyflow/react` and replaced the Workflows placeholder with an interactive canvas preview: users can add, drag, connect, and delete agent nodes. Workflow persistence and agent binding remain unimplemented; the page identifies this clearly. The external starter-kit repository is a full app rather than an installable package, so its source was not copied.
- Added a public Licenses view linked quietly at the bottom of the side navigation. It includes MIT notices for the Chatbot Flow Builder Starter Kit reference and React Flow dependency, plus upstream source links, providing a pattern for future third-party entries.
- Added hash navigation for Licenses and kept it accessible while signed out.
- Verified with `npm --cache .npm-cache run build` and `git diff --check`. The build passes with Vite's existing >500 kB bundle-size advisory.

## 2026-10-10 — Workflow CRUD and node editor

- Replaced the single workflow canvas with a paginated, owner-scoped workflow library and a separate editing route. Users can create named/description workflows, edit details, and remove workflows with confirmation.
- Added authenticated workflow API endpoints to list, create, load, version-save, and delete workflows using the existing workflow and version tables. Saved graph definitions validate node/edge references, reject cycles, and record restrictive user-owned agent references.
- The editor collapses the side navigation and stores that preference locally. The full-width canvas includes add-node and confirmed remove-node actions; the right configuration pane selects an existing agent and stores per-node instructions. Agent name, modality, and description appear on each node.
- No schema migration was required because the workflow tables and ownership constraints already existed. Existing version references intentionally continue to prevent removal of an agent used in a saved workflow version.
- API/web production build passes; Vite reports its >500 kB bundle-size advisory. `git diff --check` verified. No automated tests were run.

## 2026-10-10 — Prevent deleting agents used by workflows

- Added workflow, immutable workflow-version, and workflow-version-agent reference tables. The agent foreign key uses `ON DELETE RESTRICT` so the database blocks deletion while any saved workflow version uses the agent.
- Added workflow-use counts to the agent list API and a `DELETE /api/agents/:id` route that rejects referenced agents with HTTP 409; the database constraint remains the race-safe final guard.
- Added remove icons to each agent row and the edit modal. Both show confirmation and disable removal when the agent is in use; the table shows workflow-use counts.
- Generated and applied migrations `0002_workflow_agent_references` and `0003_workflow_agent_ownership`. Composite foreign keys also prevent references across users.
- API/web typechecks, production build, and `git diff --check` passed. Vite reports its existing-style bundle-size advisory above 500 kB; no tests were run.

## 2026-10-10 — Separate agent removal confirmation

- Agent-list removal now opens only the dedicated confirmation modal; it no longer opens the create/edit modal first.
- The edit modal’s remove icon opens the same confirmation modal, stacked above the editor.
- Verified with the production build and `git diff --check`.

## 2026-10-10 — Preserve selected workspace view

- Synced Home, Agents, Workflows, and Runs to URL hash navigation so refresh restores the active view and browser history can move between views.
- Verified with the production build and `git diff --check`.

## 2026-10-10 — Public home and sign-in gated workspace

- Updated Home with a concise description of Hive’s AI orchestration purpose and a clear note about which capabilities are available versus planned.
- Hid workspace navigation and shortcuts while signed out. Direct links to Agents, Workflows, or Runs now render a sign-in gate instead of protected views.
- Added a sign-in CTA on Home and protected-view gates, reusing the header’s login modal.
- Verified with the production build and `git diff --check`.

## 2026-10-10 — Fix agent form input crash

- Capture name and description input values synchronously before updating React state, avoiding access to a cleared `currentTarget` inside deferred state updater callbacks.
- Verified with the production build and `git diff --check`.

## 2026-10-10 — Agent library CRUD

- Added an owner-scoped `agents` table with modality enum, name, description, timestamps, a per-user case-insensitive unique name index, and a pagination index; applied migration `0001_agents` to the local database.
- Added authenticated paginated list, create, read, and update API routes. Mutations require the configured web origin; duplicate names return a conflict response.
- Replaced the Agents placeholder with a paginated table and a shared create/edit modal. The UI supports Text, Image, Audio, and Video agents, and reports sign-in, duplicate-name, validation, and connection errors.
- Added an idempotent, account-scoped sample seed command and seeded one sample per modality for the sole existing local user. New users remain empty unless the seed command is run for them.
- Preserved the legacy `tasks` table discovered in the initial migration rather than allowing Drizzle to drop it.
- Verified API/web typechecks, the production build, migration application, and one seeded agent per modality in the local database. Vite reports a bundle-size advisory above 500 kB; no test suite was run.

## 2026-10-10 — Orchestration workspace navigation

- Added app navigation for Agents, Workflows, and Runs, with working Home shortcuts and cross-links between the workspace views.
- Added initial empty-state views that explain the planned agent catalog, versioned workflow graph, run progress, and artifact history.
- Added explicit Home shortcut buttons and cross-view buttons so Agents, Workflows, and Runs are reachable from related views.
- Creation actions remain disabled until the agent/workflow APIs, local model catalog, and run execution are implemented; no persistence is implied by these screens.
- Verified with `npm --cache .npm-cache run build` and `git diff --check`.

## 2026-10-10 — AI orchestration MVP design

- Added `docs/ORCHESTRATION_MVP_DESIGN.md` describing a proposed MVP architecture, data model, local inference options, artifact storage, execution, security, and delivery sequence.
- Recommended a browser control plane with an authenticated API, durable worker queue, isolated allow-listed local model runners, PostgreSQL metadata, and persistent local artifact storage for a single-host POC.
- This is design only; no runtime, schema, or product behavior has been implemented. Hardware target and model/license selection remain open.

## 2026-10-10 — Slate Sky visual theme

- Applied Slate Sky as the app's dark Mantine theme, with lighter developer-tool surfaces and a restrained sky-blue accent.
- Centralized palette, typography, spacing, radii, shadows, and shared component defaults in `apps/web/src/theme.ts`.
- Simplified Home into a flatter, more compact layout; preserved AppShell navigation and Google authentication behavior.
- Verify with the web production build and inspect the running browser view.
