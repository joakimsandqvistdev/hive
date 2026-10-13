# AI orchestration MVP design

## Purpose

Define a proof-of-concept architecture for creating reusable AI agents, composing them into workflows, and executing workflows whose later agents consume earlier agents' outputs. The example workflow creates a character image, a background image, and speech audio, then passes those artifacts and a description to a video-generation agent.

This design describes the target MVP and distinguishes implemented pieces from planned behavior. The repository has a React 19/Vite/Mantine web app, an Express 5 TypeScript API, PostgreSQL 17 with Drizzle, and Google sign-in. Agent and workflow CRUD are implemented. A local Z-Image-Turbo runner, durable run queue, worker execution loop, local artifact storage, authenticated artifact downloads, and initial run launch/history/progress UI are implemented. Connected multi-agent execution and cancellation remain outstanding. Docker Compose runs PostgreSQL and includes the optional local image runner profile.

## MVP goals and boundaries

The MVP should demonstrate that a signed-in user can:

1. Create, edit, list, and delete reusable agent definitions.
2. Assemble a directed workflow from those agents, connect typed outputs to typed inputs, and save/edit/reuse it.
3. Start a run from a saved workflow, observe its state and per-agent progress, and inspect/download generated outputs. Each model prompt is assembled from its reusable agent prompt and workflow-node prompt.
4. Run supported inference locally, without per-request hosted-model API charges.

Keep the first release to one deployment host, one user-owned workflow space per account, a small allow-listed set of local model runtimes, sequential dependency execution, and common text/image/audio/file inputs and outputs. It is acceptable to execute independent ready nodes concurrently if capacity permits, but concurrency is not a user-facing tuning surface in the first cut.

Out of scope: arbitrary user code or plugins, public workflow sharing, collaborative editing, billing/quotas, autoscaling, distributed GPU scheduling, production-grade video generation, model training/fine-tuning, and guarantees that any particular model can produce every modality. Validate one end-to-end workflow with models and hardware actually available before promising the video example.

## Recommended architecture

Use the browser as the workflow editor and run viewer, the existing API as the authenticated control plane, PostgreSQL as the durable metadata store, a background worker as the orchestrator, and separately isolated local model runner containers as inference backends.

```mermaid
flowchart LR
  U[Browser: agent and workflow editor] -->|HTTPS, session cookie| API[Express API / control plane]
  API --> DB[(PostgreSQL: definitions, runs, events)]
  API --> Q[Durable run queue]
  Q --> W[Orchestrator worker]
  W --> DB
  W --> S[(Artifact store: local volume in MVP)]
  W --> R[Model runner service]
  R -->|local model files and inference| W
  U -->|authorized artifact requests| API
  API --> S
```

### Components and responsibilities

- **Web app:** Agent management forms, visual workflow builder, validation feedback, run history and live status. Do not send model weights or inference requests directly from the browser in the default design.
- **API/control plane:** Existing Express app. Enforce session authentication and ownership on every agent, workflow, run, and artifact request. Validate workflow structure and runner configuration. Capture the workflow's current definition in a run snapshot and enqueue the run transactionally.
- **Queue and worker:** A queue decouples potentially long GPU/CPU work from HTTP request lifetimes. The POC stores queued jobs in `runs`; a separate TypeScript worker claims jobs with PostgreSQL `SKIP LOCKED` leases and polls for work. It can reclaim interrupted jobs up to three attempts. Avoid an in-memory queue because restarts would lose queued work. One worker process is sufficient initially.
- **Orchestrator:** Validates the graph, schedules nodes whose dependencies are satisfied, resolves their input bindings, calls the appropriate runner adapter, stores output artifacts, and records node/run state. Retries only transient failures with a small bounded policy; never retry a node indefinitely.
- **Prompt handling:** The workflow editor initializes a node's prompt from its selected agent. Once saved, execution uses only the workflow-node prompt; later changes to the reusable agent do not change that workflow node. Starting a run does not ask for a separate run-level prompt.
- **Model runners:** Containerized, allow-listed inference services with explicit model/runtime adapters. Keep runners off the public network and expose only to the worker on a private Compose network. Runners should not access the database or have credentials to the artifact store. The worker transfers input files through a controlled local interface and validates output paths and sizes.
- **Artifact store:** The worker writes generated PNG files to an opaque-key local directory (`.data/artifacts` by default, configurable with `ARTIFACT_ROOT`). PostgreSQL stores owner, run/node references, MIME type, byte count, checksum, and display name. Authenticated API downloads enforce ownership. For Docker deployments, mount a persistent volume at the configured root. Do not put large binary payloads in database rows.

The worker is started separately with `npm run worker:dev -w @hive/api`; configure `ZIMAGE_RUNNER_URL` when the runner is not at its local default. For local development, add worker/runner services behind Compose profiles or provide documented host-run alternatives. Do not assume Docker Compose on an arbitrary laptop can expose a GPU: GPU passthrough and driver/runtime support depend on OS and hardware. Begin with CPU-capable small models or a verified GPU development environment.

### Workflow execution model

Represent a workflow as a directed acyclic graph (DAG). Each node references an agent definition and has a stable node ID. Each edge/binding maps one node output (or run input) to one declared input on another node. Validate that:

- all references belong to the workflow and are available to the current user;
- there are no cycles, missing required inputs, incompatible media types, or unsupported settings;
- the selected runner/model supports the declared task and modalities;
- input and output limits fit configured resource constraints.

At run creation, copy the workflow definition, agent configuration, and relevant runner/model identifiers into a versioned run snapshot. Later edits to an agent or workflow must not change an already queued or running job. Execution states should be explicit: `queued`, `running`, `succeeded`, `failed`, `cancel_requested`, and `cancelled`; node states should also include `skipped`. Persist transitions and user-readable error summaries. A browser can poll a run endpoint at modest intervals for MVP; add server-sent events when polling becomes noticeably wasteful. Cancellation is cooperative: stop scheduling new nodes, signal the active runner if supported, then mark the run cancelled.

Initial node execution can be sequential topological order. Independent nodes may be run concurrently later, but enforce a worker-wide concurrency limit and per-run/resource limit so a graph cannot exhaust local memory or GPU VRAM.

### Local inference and the browser alternative

**Recommended MVP: worker-to-local-runner containers.** This keeps model execution independent from browser lifecycle, works when the user closes the tab, provides a predictable API contract, and makes model files reusable across runs. “No API cost” means no hosted inference fee; it does not mean zero operating cost. Local inference still uses electricity, CPU/GPU/RAM/storage, model downloads, and may have license or redistribution conditions. Model licenses and acceptable commercial use must be checked before selecting models.

**Browser inference is an optional experiment, not the main execution target.** WebGPU/WebAssembly-based inference can avoid server hardware and may suit small text or image models on supported clients. However, it shifts compute and model downloads to each user's device, has browser/device compatibility and memory constraints, can be slow for large generative models, and cannot reliably finish after the tab closes. Large video models are especially unsuitable as a baseline browser requirement. If prototyped later, treat the browser as a runner adapter that reports capabilities and sends result artifacts to the API; keep workflow definitions and orchestration server-side so graphs remain portable.

**Do not execute arbitrary agent-supplied code in a container.** Agents in this MVP are declarative configurations selecting a supported task, model, and bounded parameters. Container isolation is defense in depth, not a substitute for allow-listing. Do not mount the Docker socket, host home directory, or secrets into inference runners. Set CPU/memory limits, network policy, timeouts, file-size limits, and non-root users where supported.

### Storage choice

Amazon S3 is not required for a single-host POC. Use a storage abstraction and local persistent volume first; define artifact IDs and metadata so the backend can later switch to S3-compatible object storage without changing workflow semantics. Keep an artifact's generated opaque key separate from its original display name. Serve downloads through authenticated API routes (or short-lived signed URLs after migration), never expose the storage volume as a public static directory.

Move to S3 or an equivalent object store when deploying multiple API/worker hosts, needing durable off-host backups, retaining large outputs, or serving artifacts independently of the application host. Plan retention and deletion from the beginning: workflow deletion should not silently erase run history, while an explicit data-retention process can remove artifact bytes and mark metadata expired. Configure size caps and free-space monitoring even on a local volume.

## Data model proposal

Use UUID primary keys, `created_at`/`updated_at` timestamps, foreign keys, and indexes on owner and status fields. The existing `users` table is the ownership root. The table names below are conceptual; adapt Drizzle naming to the codebase conventions.

| Table | Important fields | Purpose |
|---|---|---|
| `agents` | `id`, `user_id`, `name`, `prompt`, `modality`, `created_at`, `updated_at` | Reusable, declarative agent configuration. Keep secrets out of JSON. Model IDs must refer to allow-listed locally installed/downloaded models. |
| `workflows` | `id`, `user_id`, `name`, `description`, `created_at`, `updated_at`, `archived_at` | Stable workflow identity and ownership; one current definition per workflow. |
| `workflow_nodes` | `workflow_id`, `node_id`, `user_id`, `agent_id`, `prompt`, `position_x`, `position_y` | Current workflow nodes. Node prompts default to the selected agent's prompt and may be edited for that workflow. Composite owner references prevent cross-user agent use. Saving a workflow replaces its node rows. |
| `workflow_edges` | `workflow_id`, `edge_id`, `user_id`, `source_node_id`, `target_node_id` | Current directed node connections. Foreign keys ensure both endpoints exist in the same workflow. |
| `runs` | `id`, `user_id`, `workflow_id`, `status`, `input_json`, `workflow_snapshot_json`, `error_summary`, queue lease fields, `started_at`, `finished_at`, `created_at`, `cancel_requested_at` | Durable queue item and execution instance tied to a snapshot of the workflow definition and agent settings captured when the run starts. |
| `run_nodes` | `run_id`, `user_id`, `node_id`, `agent_id`, `status`, `agent_snapshot_json`, `resolved_input_json`, `output_json`, `attempt_count`, `error_code`, `error_summary`, `started_at`, `finished_at` | Per-agent execution state and typed references to outputs. Unique `(run_id, node_id)`. Avoid storing binary output data inline. |
| `artifacts` | `id`, `user_id`, `run_id`, `run_node_id`, `storage_key`, `media_type`, `byte_size`, `checksum`, `display_name`, `created_at` | Metadata for generated files. Use opaque storage keys; validate media type and size. Add nullable run references for user-uploaded inputs. |
| `run_events` (optional for first cut) | `id`, `run_id`, `sequence`, `event_type`, `payload_json`, `created_at` | Durable progress/event history if node state alone is insufficient for UI updates or recovery. Can be deferred until event details are required. |

Use cascading deletes for user-owned definitions only where semantics are clear. Prefer archiving agents/workflows so historical runs remain readable. Agent deletion must be rejected when a current workflow references it; enforce this in both the API and a restrictive foreign key. Workflow edits replace the current definition. Run snapshots preserve the definition used by an execution without creating workflow history. Enforce ownership in API queries and, if the product becomes multi-tenant beyond individual user ownership, consider PostgreSQL row-level security as an additional safeguard. Do not rely on unguessable UUIDs as authorization.

### Suggested API surface

- `GET/POST /api/agents`, `GET/PATCH/DELETE /api/agents/:id`
- `GET/POST /api/workflows`, `GET/PATCH/DELETE /api/workflows/:id`
- `POST /api/workflows/:id/validate` returns graph and model capability errors
- `POST /api/workflows/:id/runs` captures the current workflow definition and returns run ID and queued state. Future run-level inputs can be passed separately from the agent/node prompts.
- `GET /api/runs`, `GET /api/runs/:id`, `POST /api/runs/:id/cancel`
- `GET /api/runs/:id/events` or status polling for progress
- `GET /api/artifacts/:id` streams bytes after ownership authorization

Validate request and persisted JSON with Zod schemas. Set request body and upload limits. For uploads, use multipart streaming or a separate upload endpoint rather than large base64 JSON payloads.

## Reliability, security, and operational scope

- Create the run record and durable queue item atomically, preferably in one PostgreSQL transaction. Use a lease/heartbeat so a worker crash allows a stuck job to be reclaimed.
- Make node calls idempotent where feasible. Record attempt numbers and avoid creating duplicate artifact metadata on retry.
- Add a hard maximum run duration, per-node timeout, output byte cap, and a user-level limit on queued/running runs.
- Do not log prompts, uploaded content, cookies, session IDs, or secrets by default. Provide useful redacted error messages and operational logs.
- Authenticate API calls with the existing HTTP-only session. Apply ownership checks to workflow, run, and artifact reads as well as writes. Protect cookie-authenticated mutations against CSRF (same-site policy plus origin/CSRF validation appropriate to deployment).
- Validate uploads by byte size and detected content type, use generated filenames, and prevent path traversal. Consider malware scanning before accepting untrusted shared files; public sharing is out of MVP scope.
- Keep internal runner endpoints private, authenticated with short-lived internal credentials if they cross a trust boundary, and never let model output select arbitrary filesystem paths or network destinations.
- Back up PostgreSQL and the artifact volume together. A database-only backup cannot restore usable runs if the corresponding bytes are lost.
- Expose health checks for database, worker queue/heartbeat, artifact storage capacity, and runner readiness. Record model/runtime versions to aid reproducibility.

## MVP delivery sequence

1. **Feasibility spike:** Pick one local model/runtime per needed modality, verify license, hardware footprint, container support, latency, and artifact transfer. A Z-Image-Turbo runner has generated a 512x512 image on the current 8 GiB NVIDIA development GPU using sequential CPU offload. Do not make video a launch dependency until a locally runnable model is proven on target hardware.
2. **Definitions:** Add agent CRUD, workflow DAG editor/serialization, schemas, and graph validation. Persist one current workflow definition and replace it on save.
3. **Execution:** The durable run/queue schema, workflow snapshot creation, owner-scoped run APIs, queue worker, Z-Image image adapter, run launch, history, and polling progress UI are implemented. Connected graphs and non-image modalities fail explicitly until adapters and input binding are implemented. Add cancellation request handling.
4. **Artifacts:** Generated PNG storage, authenticated download, 25 MB output limits, and checksums are implemented for local development. Add upload handling, retention, orphan cleanup, and persistent-volume deployment configuration.
5. **Representative chain:** Connect two or more agents with an image/audio artifact to a downstream supported model; document resource requirements and known model limitations.

## Decisions to revisit after the POC

- PostgreSQL polling queue versus Redis/other broker based on throughput and worker reliability needs.
- Local volume versus S3-compatible object storage based on deployment topology, backup, and artifact volume.
- Whether browser WebGPU is worth a separate runner adapter for small models.
- Whether workflow editing needs history or collaborative editing after the MVP; the initial model intentionally keeps only the current saved definition.
- Whether deployments require per-user resource quotas, multiple workers, GPU scheduling, or paid hosted-model fallbacks.

## Assumptions and open questions

- Assumption: “offline agents” means models run on hardware controlled by the deployment, not that model files are available without an initial download.
- Assumption: the MVP is deployed as a single-host POC and prioritizes zero hosted inference fees over high availability.
- Open question: what hardware is the initial target (CPU only, NVIDIA GPU, Apple Silicon, or mixed)? This determines the viable model set and whether GPU-enabled containers are realistic.
- Open question: which model families and commercial/license requirements are acceptable? Run a model and license feasibility spike before committing to image/audio/video scope.
- Open question: are agents strictly reusable prompt/model configurations, or should users eventually provide external credentials/tools? The MVP design excludes user code and arbitrary tools.
