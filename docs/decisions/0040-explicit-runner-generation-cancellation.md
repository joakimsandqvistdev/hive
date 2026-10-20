# Decision 0040: Explicitly cancel runner generations

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

Hive's worker cancels a model request when a run is stopped or its lease is lost. The runner previously relied on detecting the HTTP client disconnect to stop the corresponding generation process. A runner operation can otherwise retain the shared inference lock and GPU/CPU resources after it is no longer represented by an active Hive run.

## Decision

- Give every worker-to-runner generation request a unique request ID.
- Add an authenticated runner endpoint that cancels only the in-flight generation registered under that ID.
- When the worker's request aborts or fails at the transport layer, send a separate best-effort cancellation request to the runner. Do not reuse the aborted signal for this control request.
- Cancelling a tracked request cancels its runner task. Existing `finally` cleanup must terminate and reap the matching child process, including when it is waiting for the shared inference lock.
- Cancellation arriving just before inference registration is retained for up to two minutes, preventing an aborted upload/request from starting generation after its cancellation was handled. Expired IDs are discarded; duplicate active request IDs are rejected. Requests without an ID still retain disconnect-based cleanup.
- Keep prompts, parameters, and user-provided content out of cancellation diagnostics.

## Consequences

- Run cancellation and lease loss explicitly release the matching runner operation instead of depending only on transport disconnect detection.
- A cancelled request waiting for the runner lock cannot begin generation later.
- A cancellation racing ahead of multipart parsing cannot be lost before the inference handler registers the request.
- Runner cancellation remains bounded to one request and cannot stop an unrelated generation.
- Direct runner callers that do not send request IDs continue to use disconnect and timeout cleanup.
