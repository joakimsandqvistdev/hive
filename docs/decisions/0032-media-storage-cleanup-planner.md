# Decision 0032: Add a manual media storage cleanup planner

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

The Media Library lists the first 500 artifacts and offers individual deletion, but does not expose aggregate tracked storage or a searchable inventory across related workflow context. Cleanup must preserve artifacts still needed by a workflow, run, account, webhook, or publication.

## Decision

- Keep cleanup manual and within the Media Library Storage tab. Do not add automatic retention or a trash period in v1.
- Search the paginated library by one free-text query across filename, media format, workflow name, node name, and webhook name. Keep Type and Save state as separate filters.
- Show tracked artifact byte totals for saved library media, unsaved run outputs, and workflow uploads. Show protected bytes as a separate overlapping indicator.
- V1 cleanup scopes are unsaved outputs from terminal runs older than 30 days and unreferenced workflow uploads of any age. Incomplete uploads are excluded because uploads are persisted only after successful validation and storage.
- Preview the eligible and protected files before confirmation. Revalidate owner, scope, age, run state, and references before queueing and again for each item in the worker. Delete media metadata and bytes only; preserve run history. Record per-item outcomes and allow failed file removal to be retried.
- Deletion is permanent after explicit confirmation.

## Consequences

- The API uses server-side pagination and returns search context and protection reasons without exposing storage keys.
- Durable cleanup job and item tables let the existing independent cleanup worker process media deletion after an API restart.
- Local development requires the existing cleanup worker process for queued media jobs to finish.
