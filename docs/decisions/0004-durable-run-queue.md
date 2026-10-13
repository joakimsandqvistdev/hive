# Durable run queue

- **Status:** Accepted
- **Date:** 2026-10-13

## Decision

Use PostgreSQL `runs` rows as the durable run queue. A run stores its owner, optional workflow reference, input, immutable workflow/agent snapshot, status, attempt count, and worker lease/heartbeat timestamps. Store one `run_nodes` row per snapshotted workflow node for execution state and eventual output metadata.

Queue consumers claim jobs with an atomic `SELECT ... FOR UPDATE SKIP LOCKED` plus update, and extend ownership with a lease heartbeat. Expired `running` leases can be reclaimed after a worker crash. Run creation and node snapshot creation happen in one transaction after locking the workflow row for a consistent snapshot.

## Context

Workflow execution is long-running and must not depend on an HTTP request remaining open. A separate queue table or Redis broker would duplicate data or add operations for the single-host POC. The `runs` row already represents the job and its user-visible lifecycle.

## Consequences

- Runs remain queued across API or worker restarts because PostgreSQL is the source of truth.
- The queue, polling worker, Z-Image image-node adapter, and worker-owned state transitions are implemented. Current execution supports disconnected image nodes; connected graphs and text, audio, or video execution fail explicitly.
- PNG outputs live in an opaque-key local artifact directory; metadata and ownership are stored in PostgreSQL. The API streams artifacts only to their owner.
- A heartbeat lease allows interrupted runs to be reclaimed up to three attempts. Cancellation remains unimplemented; process/runner failures are recorded as failed runs.
