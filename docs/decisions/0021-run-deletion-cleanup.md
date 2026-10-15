# Decision 0021: Delete runs and clean up generated artifacts

## Context

Runs own generated output artifacts, while uploaded input artifacts and model weights are shared beyond a single run. File removal and PostgreSQL updates cannot be committed in one transaction, so deleting the run row first could orphan generated files.

## Decision

- Allow owners to request deletion only after a run is terminal. Active runs must be stopped and allowed to finish cancellation first.
- Record deletion requests, run-owned output storage keys, and candidate uploaded-input IDs in a PostgreSQL outbox in one transaction.
- Have the existing worker delete opaque-key files idempotently, then remove the run row so foreign keys cascade run nodes and generated-artifact metadata. Delete uploaded inputs only when no remaining workflow or other run references them.
- Lease cleanup tasks and retry failures with backoff; expose progress and an owner-scoped retry action in Runs.
- Preserve workflow definitions, uploaded inputs still referenced by a workflow or another run, and model cache files.

## Consequences

Deletion is asynchronous. Runs remain visible as removing until file cleanup and database cleanup finish. Uploaded inputs that become unreferenced as a result are cleaned up as part of that operation. A worker restart can resume expired cleanup leases. The API and worker use the existing shared artifact directory; the model runner does not need access to it.
