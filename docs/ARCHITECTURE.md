## AI orchestration proposal

The proposed MVP architecture, execution model, local inference options, artifact storage, security considerations, and delivery sequence are documented in [ORCHESTRATION_MVP_DESIGN.md](ORCHESTRATION_MVP_DESIGN.md). This is a proposal; it does not describe implemented functionality.

The current slice includes authenticated owner-scoped agent and workflow CRUD. Workflow saves replace the current node and edge rows; no workflow history is retained. Agent deletion is rejected while a current workflow references it, and PostgreSQL enforces the same rule. Model inference remains unimplemented.
