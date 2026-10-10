## AI orchestration proposal

The proposed MVP architecture, execution model, local inference options, artifact storage, security considerations, and delivery sequence are documented in [ORCHESTRATION_MVP_DESIGN.md](ORCHESTRATION_MVP_DESIGN.md). This is a proposal; it does not describe implemented functionality.

The first vertical slice is implemented: authenticated owner-scoped agent listing, creation, editing, and deletion are available through `/api/agents`. Deletion is rejected when a workflow-version reference exists, and PostgreSQL enforces the same rule. Workflow authoring and model inference remain unimplemented.
