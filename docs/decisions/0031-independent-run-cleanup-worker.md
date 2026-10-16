# Decision 0031: Process run cleanup independently

- **Status:** Accepted
- **Date:** 2026-10-16

## Context

Run deletion is recorded in the leased `run_deletions` queue, but the workflow worker previously processed that queue in its main sequential loop. While a long model inference was running, cleanup requests for other eligible runs could remain queued until inference returned.

## Decision

Run artifact cleanup is handled by a dedicated lightweight worker process/container. It uses the existing PostgreSQL queue, leases, retry schedule, and cleanup logic. Workflow execution and Jobs scheduling remain in the workflow worker. The cleanup worker mounts the same artifact directory and does not depend on the model runner.

## Consequences

- Deleting a queued or completed run can finish while another run is waiting on model inference.
- Existing safeguards remain: active runs are not eligible for deletion, saved library media is retained, and failed cleanup can be retried.
- Local development requires `npm run cleanup:dev -w @hive/api` alongside the workflow worker to process deletions.
- No schema migration or additional package dependency is required.
- Cleanup still shares PostgreSQL and artifact storage resources with Hive, so storage or database outages can delay completion.
