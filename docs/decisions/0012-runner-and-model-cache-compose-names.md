# Decision 0012: Rename local runner and model cache resources

## Context

The local image inference service and cache Compose key had model-specific names. The user requested the service key `runner` and volume key `model_cache`, with the Docker volume itself renamed instead of retaining the prior backing volume name.

## Decision

- Rename the Compose service to `runner`; update GPU/local Compose overlays, worker DNS, the worker URL setting, and service-targeting commands.
- Rename the Compose volume key to `model_cache`. In the default `hive` project it creates/uses the Docker volume `hive_model_cache`.
- Do not migrate or delete the old `hive_zimage_model_cache` volume. It remains available but is not mounted. The new cache starts empty and models must be downloaded again.

## Consequences

The worker reaches the image service at `http://runner:8000`. Existing container and volume instances are not renamed in place by Compose; recreated services use the new names and cache volume.
