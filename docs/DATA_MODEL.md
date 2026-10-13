## Database entities and relationships

- Use `/apps/api/src/schema.ts` as reference to the current database entities and relationships.

Implemented agent records use the `agents` table in `/apps/api/src/schema.ts`. Each agent belongs to one user and currently has the `image` modality, with a name, prompt, and model parameters. Image agents can use only a model that has been downloaded to the local runner. A case-insensitive unique index prevents duplicate names within one user's library; a user/creation-time index supports paginated listing. The unused legacy `tasks` table is removed by migration `0013_free_charles_xavier`.

Workflows store one current definition. `workflow_nodes` contains the current node and agent configuration rows, and `workflow_edges` contains their directed connections. Saving replaces these rows transactionally; there is no workflow version history. Owner-scoped foreign keys ensure workflow nodes and edges belong to the workflow owner, connections stay within one workflow, and restrictive agent references prevent deleting agents used by a current workflow.

The proposed orchestration entities and relationships are described in [ORCHESTRATION_MVP_DESIGN.md](ORCHESTRATION_MVP_DESIGN.md#data-model-proposal). They have not yet been implemented in the Drizzle schema.
