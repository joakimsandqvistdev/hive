# Database entities and relationships

Use `apps/api/src/schema.ts` as the implemented schema reference.

- `users` and `sessions`: existing identities and authenticated sessions.
- `models`, `data_types`, `model_data_types`: enabled model catalog and canonical Text/Image/Audio/Video datatypes. Named model ports carry direction, datatype, label, connection transport, cardinality, and display order. Masks use Image with the `mask` role.
- `model_input_groups` and `model_input_group_ports`: cross-port constraints such as alternatives, in addition to per-port counts.
- `workflows`: owner-scoped metadata for one current saved definition.
- `workflow_nodes`: kind, label, model ID or input datatype, input text or uploaded-artifact ID, inference parameters, and canvas position. Composite foreign keys preserve workflow and upload ownership.
- `workflow_edges`: explicit source and target node/port keys. Both nodes must belong to the same workflow.
- `runs`: durable queue status, immutable workflow snapshot, attempt counts, worker lease/heartbeat, and cancellation state.
- `run_nodes`: node snapshots, input-file reference, resolved inference parameters, typed output JSON, status/errors/timestamps. There are no reusable-definition references or inline model prompts.
- `artifacts`: immutable uploaded inputs or generated outputs with canonical datatype, owner, media type, byte count, checksum, display name, and opaque storage key. Uploads have null run/node references; generated outputs reference their producing run node. Workflow and run-node references protect uploads still in use.
- `run_deletions`: durable cleanup outbox containing the owner, run-generated artifact keys, candidate input uploads, retry state, and worker lease. Run deletion removes run-owned outputs and uploaded inputs that no workflow or other run still references; shared inputs and model caches are preserved.

Current model modalities include image, video, and audio. Kokoro-82M has one required text input on its `prompt` port and one audio output. Audio is also available for uploaded inputs and future models.

`GET /api/models/contracts` returns the model contracts and canonical datatype catalog. Save/run validation requires compatible port datatypes, cardinalities, no cycles, configured inputs, and owner-accessible uploads. Download state is checked before model execution is queued.

Migration `0016_model_input_workflows` performs the explicitly authorized discard of old workflow/run data and installs this schema. Existing users, sessions, model catalog, and weight cache are preserved. Binary files from discarded historical runs are not served through the API after their metadata is removed.
