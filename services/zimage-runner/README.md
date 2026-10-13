# Z-Image-Turbo runner

This standalone service loads Z-Image-Turbo and exposes a small HTTP API for the Hive worker to call. It is intentionally separate from the Hive API and database. The first request path is local development only; do not expose this runner directly to the public internet.

## Requirements

- Docker Desktop with the WSL 2 backend on Windows, or Docker Engine on Linux.
- For NVIDIA acceleration, a supported NVIDIA GPU/driver and Docker GPU passthrough. The model card recommends 16 GB VRAM for consumer devices.
- Enough disk space for the CUDA container image and downloaded model weights. The named `zimage_model_cache` volume preserves the weights across container rebuilds.

## Start without GPU passthrough

From the repository root:

```powershell
docker compose --profile zimage up --build zimage-runner
```

The runner falls back to CPU when CUDA is unavailable. Initial startup downloads the model and can take a while. Wait for the `/health` endpoint to report `"status":"ready"`.

## Start with an NVIDIA GPU

```powershell
docker compose -f compose.yaml -f compose.gpu.yaml --profile zimage up --build zimage-runner
```

If this fails to reserve a GPU, verify host GPU visibility and Docker GPU support before troubleshooting the Python model setup.

## HTTP API

- `GET http://localhost:8188/health` reports readiness, model, and device.
- `POST http://localhost:8188/generate` accepts JSON with `prompt` and optional `width`, `height`, and `seed`; it returns a PNG response.

Example PowerShell request:

```powershell
$body = @{ prompt = "Photorealistic portrait of an adult character in a sunlit studio"; width = 512; height = 512; seed = 42 } | ConvertTo-Json
Invoke-WebRequest -Uri http://localhost:8188/generate -Method Post -ContentType "application/json" -Body $body -OutFile .\zimage-output.png
```

The service serializes generation requests to keep peak GPU memory predictable. The model is loaded once at process startup; the first startup after an empty cache downloads its weights.
