# Current workflow definition

- **Status:** Accepted
- **Date:** 2026-10-10
- **Supersedes:** [0001-workflow-graph-storage.md](0001-workflow-graph-storage.md)

## Decision

Each workflow stores one current definition. The `workflow_nodes` and `workflow_edges` tables are keyed directly by workflow ID. Saving replaces the current graph transactionally. There is no workflow version counter, version history, or historical graph storage.

Runs may capture a snapshot of the current workflow and its agent settings when execution begins. That snapshot belongs to the run and does not create workflow history.

## Context

The workflow editor already supports editing a saved flow, and the user clarified that only the most recently saved state should persist. The graph still needs relational storage so connections, agent assignments, and node settings are queryable and constrained in the database.

## Consequences

- Editing a workflow replaces its current nodes and edges in one transaction.
- A migration preserves the highest saved workflow version for each workflow, then removes version tables and the workflow version counter.
- Agent deletion is blocked only while a current workflow uses that agent.
- Previous workflow states cannot be recovered unless a future run snapshot contains them.
