# Decision 0035: Retain image models for queued use

Date: 2026-10-17

## Context

Decision 0034 keeps an image pipeline resident after successful inference, but that can retain host and GPU memory after the run queue no longer needs the model. Sequential queued runs using the same model should reuse the warm pipeline.

## Decision

- Before an image request, the API worker checks queued/running run-node rows against each run's immutable workflow snapshot for another pending model node with the same model ID. The current node is excluded.
- The worker passes the result to the private runner as `keep_model_cached`. The runner retains its image process after success only when that flag is true; otherwise it terminates the process and releases the pipeline.
- Cancellation, timeout, inference failure, non-image generation, and runner shutdown continue to terminate the image process.

## Consequences

Sequential matching image steps in the current run or other queued runs can reuse the loaded pipeline. Once no matching queued step remains, successful inference returns memory to the system. A model first used after it was no longer queued will load normally.
