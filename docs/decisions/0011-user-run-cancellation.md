# Decision 0011: Stop runs and release inference memory

## Context

Users need to stop queued or active workflows from the Runs view. An active image generation runs in a dedicated child process because process exit is the reliable boundary for releasing its host and CUDA allocations.

## Decision

- Provide an owner-scoped run cancellation endpoint and a Stop action in Runs.
- Cancel queued runs immediately. For claimed runs, record `cancel_requested`; the owning worker observes it through its lease heartbeat and aborts execution.
- Aborting the worker's runner request disconnects it from the image runner. The runner terminates and reaps the generation child process before finishing request cleanup, releasing per-step process memory and CUDA allocations.
- Mark unfinished run nodes `cancelled`, and finalize the run as `cancelled` after the worker has stopped the active request. Keep successful prior steps and their artifacts.

## Consequences

Cancellation is cooperative and may take up to the worker's one-second control poll plus process termination time. A disconnected worker that loses its lease is not allowed to finalize another worker's run. Model files in the persistent Hugging Face cache are unaffected.
