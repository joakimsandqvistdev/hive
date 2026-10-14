## AI orchestration architecture

The original MVP architecture and storage trade-offs are documented in [ORCHESTRATION_MVP_DESIGN.md](ORCHESTRATION_MVP_DESIGN.md). The application now implements local image and text-to-video inference using the worker and private model runner.

The application uses authenticated owner-scoped agent and workflow CRUD, durable run snapshots, a PostgreSQL-backed queue, a separate worker, and a private local model runner. Workflow saves replace the current node and edge rows; no workflow history is retained. Agent deletion is rejected while a current workflow references it, and PostgreSQL enforces the same rule. Image and text-to-video inference run locally; video outputs are stored as MP4 artifacts.

Model I/O is described by a seeded PostgreSQL catalog (`models`, `data_types`, `model_data_types`) rather than workflow-specific model conditionals. Port minimum/maximum counts define required and repeated inputs; normalized input groups express cross-port alternatives. Prompt text is a model input supplied through node configuration, while image references are workflow connections. Workflow edges persist both port keys, the API validates them against the catalog, the editor renders typed ports dynamically, and run snapshots preserve the contract used when a run was queued.
