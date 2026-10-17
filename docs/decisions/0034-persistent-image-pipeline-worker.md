# Decision 0034: Retain image pipelines in a persistent worker

Date: 2026-10-17

## Context

Image model loading is a substantial portion of request latency. Decision 0008's temporary process per image generation reliably released RAM and CUDA allocations, but also forced the runner to reload model weights for every image node.

## Decision

- Keep image generation isolated from the HTTP process in a dedicated spawned worker that is created on the first image request and retains its most recently used pipeline after successful requests.
- Serialize work through the existing runner generation lock. Replace the cached pipeline when another image model is requested.
- Terminate the image worker on cancellation, timeout, inference failure, a video/audio/text request, or runner shutdown. This remains the boundary that releases host and CUDA allocations after interrupted or unsuccessful work.
- Keep video, audio, and text generation in temporary per-request processes.
- Report the image pipeline as loaded only after a successful image request.

## Consequences

Repeated successful image requests avoid process startup and model loading. The runner retains the image pipeline's host and device memory while idle; users requiring that memory for another workload can restart the runner or run another modality, which terminates the image worker. Cancellation still releases memory by killing the worker. This supersedes decision 0008's per-request process lifetime for successful image generation while keeping model inference out of the HTTP process.
