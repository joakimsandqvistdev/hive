## AI orchestration architecture

The original MVP architecture and storage trade-offs are documented in [ORCHESTRATION_MVP_DESIGN.md](ORCHESTRATION_MVP_DESIGN.md). The application now implements local image and text-to-video inference using the worker and private model runner.

The application uses authenticated owner-scoped agent and workflow CRUD, durable run snapshots, a PostgreSQL-backed queue, a separate worker, and a private local model runner. Workflow saves replace the current node and edge rows; no workflow history is retained. Agent deletion is rejected while a current workflow references it, and PostgreSQL enforces the same rule. Image and text-to-video inference run locally; video outputs are stored as MP4 artifacts.
