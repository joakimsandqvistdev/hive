# Local image model runner

This standalone service loads one allow-listed Diffusers image pipeline at a time for the Hive worker. It supports Z-Image-Turbo text-to-image and Qwen-Image-Edit-2511 image editing with up to ten reference images. It is separate from the Hive API and database. Keep the development endpoint local; do not expose it directly to the public internet.

## Requirements

- Docker Desktop with the WSL 2 backend on Windows, or Docker Engine on Linux.
- For NVIDIA acceleration, a supported NVIDIA GPU/driver and Docker GPU passthrough. The model card recommends 16 GB VRAM for consumer devices; lower-VRAM systems use slow sequential CPU offload.
- Enough disk space for the CUDA container image and downloaded model weights. The named `zimage_model_cache` volume preserves the weights across container rebuilds.

## Start without GPU passthrough

From the repository root:

```powershell
docker compose --profile zimage up --build zimage-runner
```

The runner falls back to CPU when CUDA is unavailable. It loads Z-Image-Turbo at startup. The first Qwen-Image-Edit-2511 workflow run switches models and downloads about 57.7 GB of weights to the persistent cache; allow substantial disk space, system RAM, and time. Hardware suitability has not been confirmed on the existing 8 GiB development GPU. Wait for `/health` to report `"status":"ready"` before starting a run.

## Start with an NVIDIA GPU

```powershell
docker compose -f compose.yaml -f compose.gpu.yaml --profile zimage up --build zimage-runner
```

If this fails to reserve a GPU, verify host GPU visibility and Docker GPU support before troubleshooting the Python model setup.

## HTTP API

- `GET http://localhost:8188/health` reports readiness, loaded model, and device.
- The Hive worker calls `POST http://localhost:8188/generate` as multipart form data. It selects `z-image-turbo` or `qwen-image-edit-2511`; Qwen edit requests include one to ten PNG reference files from connected workflow image nodes. The response is PNG.

The generate route is an internal worker interface rather than a public API; model selection is allow-listed, and image references are validated and size-limited.

The service serializes generation and model switching to keep peak GPU memory predictable. It unloads the current pipeline before loading another; cached model files remain in `zimage_model_cache`.
