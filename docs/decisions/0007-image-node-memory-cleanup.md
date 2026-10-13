# Decision 0007: Release image pipelines between workflow nodes

Date: 2026-10-13

## Context

The development host has an 8 GiB GPU. Qwen failed during its first inference step and retained substantial GPU memory afterward. The user requested freeing memory after each node completes.

## Decision

- Release the current pipeline after every successful or failed generation request, including PNG encoding failures. Close temporary output/reference images, collect unused Python objects, and clear unused CUDA memory.
- Where supported, call glibc `malloc_trim(0)` after release to return unused host heap pages. Skip this step on platforms without the function.
- Keep inference, PNG encoding, and cleanup inside the same runner semaphore so the next node cannot load its model before cleanup finishes.
- Reload the selected model for each subsequent node from the persistent disk cache. Start without loading weights so an idle runner does not retain model memory. Model load failures are reported during generation. Preserve the existing model allow-list, parameters, and PNG API.
- Treat an unloaded, idle runner as ready; expose `pipeline_loaded` in health responses and retain the last selected model identifier.

## Consequences

[Decision 0008](0008-generation-process-lifetime.md) supersedes the in-process execution mechanism: each generation now exits or is terminated in its own child process, including on disconnection and timeout.

Model reloads add latency, including consecutive nodes using the same model. Model weights on disk and generated artifacts are preserved. Cleanup reduces retained memory between nodes but cannot guarantee that Qwen's inference fits within 8 GiB, or reclaim all memory held by the CUDA context/system allocator.
