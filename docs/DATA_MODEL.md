# Database entities and relationships

Use `apps/api/src/schema.ts` as the implemented schema reference.

- `users` and `sessions`: existing identities and authenticated sessions.
- `models`, `data_types`, `model_data_types`: enabled model catalog and canonical Text/Image/Audio/Video datatypes. Named model ports carry direction, datatype, label, connection transport, cardinality, and display order. Masks use Image with the `mask` role.
- `model_input_groups` and `model_input_group_ports`: cross-port constraints such as alternatives, in addition to per-port counts.
- `workflows`: owner-scoped metadata for one current saved definition.
- `workflow_jobs`: owner-scoped one-time or interval-repeat instructions for a workflow. Stores the first and next eligible times, repeat limit, completed occurrence count, pause/failure state, and the current run ID. A job is soft-removed to stop future runs while preserving run attribution.
- `instagram_accounts`: one owner-scoped Instagram professional account per Hive user, with encrypted OAuth access token, expiry, and an optional selected Hive image asset for manual profile-picture preparation.
- `instagram_oauth_states`: hashed, expiring, one-use OAuth state values associated with the initiating user.
- `workflow_nodes`: kind (`input`, `model`, `processing`, or `publishing`), label, model ID or input datatype, input text or uploaded-artifact ID, node settings, and canvas position. Composite foreign keys preserve workflow and upload ownership.
- `workflow_edges`: explicit source and target node/port keys. Both nodes must belong to the same workflow.
- `runs`: durable queue status, immutable workflow snapshot, optional originating job and scheduled occurrence time, attempt counts, worker lease/heartbeat, and cancellation state. A partial unique index allows at most one queued or active run per job.
- `instagram_publications`: owner/run/node/account/artifact references, Instagram Post/Reel mode, caption, automatic/manual mode, publish status, container/media IDs, and error/timestamps. Pending publication keeps its run in `awaiting_publish`, which is non-terminal for Jobs. Publication rows are explicitly removed during run cleanup; run deletion is disallowed while a publication remains unresolved.
- `run_nodes`: node snapshots, input-file reference, resolved inference parameters, typed output JSON, status/errors/timestamps. There are no reusable-definition references or inline model prompts.
- `artifacts`: immutable uploaded inputs or generated outputs with canonical datatype, owner, media type, byte count, checksum, display name, and opaque storage key. Uploads have null run/node references; generated outputs reference their producing run node. Workflow and run-node references protect uploads still in use.
- `run_deletions`: durable cleanup outbox containing the owner, run-generated artifact keys, candidate input uploads, retry state, and worker lease. Run deletion removes run-owned outputs and uploaded inputs that no workflow or other run still references; shared inputs and model caches are preserved.

Current model modalities include image, video, and audio. Kokoro-82M has one required text input on its `prompt` port and one audio output. Audio is also available for uploaded inputs and future models.

`GET /api/models/contracts` returns the model contracts and canonical datatype catalog. Built-in processing contracts are defined by the API and do not appear in the downloadable model catalog. Save/run validation requires compatible port datatypes, cardinalities, no cycles, configured inputs, and owner-accessible uploads. Download state is checked before model execution is queued.

The worker also polls due workflow jobs. It creates only the current run and snapshots the workflow at queue time. After that run reaches a terminal state, it sets the next eligible time to the finish time plus the configured interval. An Instagram publication holds the run open until it is published or discarded; errors return the publication to review rather than releasing the Job. Repeating jobs therefore do not overlap or populate the run queue with future runs.

Instagram media publishing requires a public HTTPS API URL because Meta fetches media from Hive. OAuth tokens use AES-256-GCM with the configured base64 encryption key. Account profile changes are locally prepared drafts only, not API updates.

Migration `0016_model_input_workflows` performs the explicitly authorized discard of old workflow/run data and begins the current workflow schema. Later migrations add model contracts, audio support, media cleanup, and catalog updates. Existing users, sessions, model catalog, and weight cache are preserved. Binary files from discarded historical runs are not served through the API after their metadata is removed.
