# Decision 0038: Model cache manager and recoverable downloads

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

Hive downloads large model weights into a persistent Docker volume. The Models page reports download progress, but the runner keeps progress in memory, does not support pause/resume, and cannot report cache capacity or remove one model's weights. Users need visibility into runner storage without allowing cache cleanup to affect saved workflow data.

## Decision

- Use the Media Library's two top-level tabs, Library and Storage. Show active downloads at the top of Library, followed by model type filters and the inventory. Put cache capacity and per-model cache review in Storage.
- Allow all requested model downloads to run concurrently; add no concurrency limit, queue pause control, or queue scheduling layer.
- Support pausing and resuming an individual download while preserving its partial files. Persist status in the mounted runner cache so downloads active before a runner restart automatically resume; explicitly paused downloads remain paused.
- Keep Cancel distinct from Pause: Cancel may remove only that allow-listed model's incomplete transfer data.
- Warn, but do not block, when available runner-filesystem space is below estimated model size plus 10% headroom.
- Allow reviewed cache removal for one downloaded model at a time. Show approximate size and direct workflow and Custom Node reference counts; preserve all definitions and explain that future runs require a re-download.
- Keep unknown cache files untouched. Restrict removal to known model paths under configured cache roots and serialize it against model inference.
- Scope storage and download state to the shared local runner/cache. Report filesystem capacity as container-visible and do not expose host paths.

## Consequences

Runner download state and partial files must live in persistent storage and be recoverable after process restart. Users can still start enough simultaneous downloads to exhaust disk; Hive warns and lets them proceed by choice. Cache removal can make referenced workflows and Custom Nodes unable to run until the model is downloaded again, but it never deletes those definitions or run data.
