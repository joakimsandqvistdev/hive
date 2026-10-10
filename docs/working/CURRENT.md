# Current work

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
