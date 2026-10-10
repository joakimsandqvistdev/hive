# Workflow graph persistence

- **Status:** Superseded by [0002-current-workflow-definition.md](0002-current-workflow-definition.md)
- **Date:** 2026-10-10

## Decision

Persist each workflow version in two forms: an immutable JSONB definition snapshot and relational node/edge rows. This decision was replaced before workflow history became a product requirement.

The implementation stored graph rows under a version identifier. The current decision stores one graph directly under the workflow identifier.

## Context

The user subsequently clarified that workflows should not be versioned and only the latest saved workflow should persist.

## Consequences

- Superseded; see decision 0002 for current storage behavior.
