# Durable workflow jobs

- **Status:** Accepted
- **Date:** 2026-10-15

## Decision

Store workflow job definitions and their recurrence state in PostgreSQL. Reuse the durable run queue and the same workflow validation and snapshot path as manual execution. Support one-time jobs and interval-based repetitions with a finite total run count or no limit.

Only materialize the current occurrence as a run. A job holds at most one queued or active run. Once that run reaches a terminal state, compute the next eligible time from its finish time plus the configured interval. Do not pre-create future run records and do not overlap runs from the same job.

## Consequences

- The worker polls and materializes due jobs; the database remains authoritative across process restarts.
- Pausing prevents future queueing and allows an existing run to finish. Removing a job cancels its queued run, allows an active run to finish, prevents future occurrences, and preserves run history.
- Each run snapshots the workflow at queue time. Failed and cancelled executions count toward a finite repetition limit.
- A workflow that cannot be validated or whose models are unavailable at queue time puts the job into a failed state. Resuming retries queueing after the issue is fixed.
- Jobs are interval based. Wall-clock cron expressions, misfire catch-up, notifications, and retry policies beyond existing worker retries are out of scope.
