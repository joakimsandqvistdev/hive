# Decision 0008: Isolate each image generation in a temporary process

Date: 2026-10-13

## Context

The user requires memory cleanup on failed runs as well as successful nodes. Unloading pipelines, collecting Python objects, and trimming the heap did not reliably reclaim model RAM on the development host. Client failures could leave the runner computing a disconnected request.

## Decision

- Run each model load, inference, and PNG encoding in a separate Python process created with the spawn context. Keep the HTTP runner process free of model weights.
- Reap the generation process before returning success or failure or permitting the next request to execute. Terminate it on client disconnect, request task cancellation, and the one-hour runner deadline; escalate termination to kill if it fails to exit within five seconds.
- Keep the existing one-at-a-time semaphore, allow-listed models, persistent disk cache, input/output size limits, and safe error codes. Transfer validated references and the resulting PNG through local process IPC; do not expose a generic process or execution endpoint.
- Close decoded references even when a later input fails validation. Preserve already-saved workflow outputs.
- Health reports `generation_active` and a busy status during processing; `pipeline_loaded` is false in the HTTP process.

## Consequences

Process exit lets the OS reclaim generation RAM and CUDA resources instead of relying solely on in-process allocator cleanup. Each node pays process startup and model loading costs. This supersedes decision 0007's in-process execution mechanism while preserving its per-node memory policy. It does not lower peak inference memory or establish Qwen suitability on the 8 GiB GPU.
