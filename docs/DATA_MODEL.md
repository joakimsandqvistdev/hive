## Database entities and relationships

- Use `/apps/api/src/schema.ts` as reference to the current database entities and relationships.

Implemented agent records use the `agents` table in `/apps/api/src/schema.ts`. Each agent belongs to one user, has a `text`, `image`, `audio`, or `video` modality, and stores a name and description. A case-insensitive unique index prevents duplicate names within one user's library; a user/creation-time index supports paginated listing. The legacy `tasks` table from the initial migration is retained to avoid dropping existing data.

Workflow identity/version tables and `workflow_version_agents` are present to support deletion safety. Composite owner foreign keys ensure a workflow version and each referenced agent belong to the same user; the agent reference uses `ON DELETE RESTRICT`. The workflow authoring UI and APIs are still planned; future workflow save paths must populate this reference table for every agent in an immutable version.

The proposed orchestration entities and relationships are described in [ORCHESTRATION_MVP_DESIGN.md](ORCHESTRATION_MVP_DESIGN.md#data-model-proposal). They have not yet been implemented in the Drizzle schema.
