# 0013 — Explicit local model downloads

Date: 2026-10-13

## Decision

Model weights are not bundled with Hive and must be explicitly downloaded from the authenticated Models view before they can be used. Downloads are stored in the local runner's persistent Docker model-cache volume. Inference must use local-only model loading and reject requests when the required model is absent; generation must never trigger an implicit download.

The API exposes authenticated model status and download routes and proxies them to the runner over the private Compose network. Different supported models can download concurrently without a runner-imposed concurrency cap. The runner reports per-model queued, downloading, downloaded, or failed status and byte progress. Repeated requests for the same active model are idempotent. Cancellation affects only the selected model. Model metadata in the UI gives approximate disk sizes and clearly labels Hive's hardware guidance as recommendations.

## Rationale

Users should control the timing and large disk/network cost of model downloads, and should be able to inspect the expected resource needs first. Explicit availability also makes it clear why a model cannot be selected for successful inference yet.

## Consequences

- New installations require a separate model download before the first workflow run.
- Model files survive runner restarts through the existing persistent cache volume.
- Concurrent downloads share available network and disk resources. The runner does not impose a concurrency cap; users decide which model downloads to start.
- Download status is derived from the runner cache after restarts; active download state is held by the runner while it is running.
- No new model-weight copies are added to the Hive application image.
