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

The runner falls back to CPU when CUDA is unavailable. It starts ready without loading model weights; the first generation request loads its selected model. The first Qwen-Image-Edit-2511 workflow run downloads about 57.7 GB of weights to the persistent cache; allow substantial disk space, system RAM, and time. Hardware suitability has not been confirmed on the existing 8 GiB development GPU. Wait for `/health` to report `"status":"ready"` before starting a run. Readiness verifies the service, not model loading or inference suitability.

## Start with an NVIDIA GPU

```powershell
docker compose -f compose.yaml -f compose.gpu.yaml --profile zimage up --build zimage-runner
```

If this fails to reserve a GPU, verify host GPU visibility and Docker GPU support before troubleshooting the Python model setup.

## HTTP API

- `GET http://localhost:8188/health` reports readiness, last selected model, device, `pipeline_loaded`, and `generation_active`. A busy runner is processing a request in its child process; `pipeline_loaded` describes the HTTP process and stays false. An idle runner remains ready when its pipeline has been released; the next request loads it.
- The Hive worker calls `POST http://localhost:8188/generate` as multipart form data. It selects `z-image-turbo` or `qwen-image-edit-2511`; Qwen edit requests include one to ten PNG reference files from connected workflow image nodes. The response is PNG.

The generate route is an internal worker interface rather than a public API; model selection is allow-listed, and image references are validated and size-limited.

Both pipelines receive the selected output width and height: 256×256 (minimum), 512×512 (default), 768×768, 1024×1024, 512×768, or 768×512. Qwen's reference-image preprocessing remains controlled by the upstream pipeline; a smaller output selection does not guarantee inference will fit the available GPU memory.

The worker uses a dedicated Undici client with one-hour header/body timeouts and an overall one-hour request deadline, retaining worker-lease cancellation. Node's default fetch header timeout can otherwise end slow CPU-offloaded inference after about five minutes even when the abort signal allows an hour. These settings apply only to the image runner. The runner detects client disconnection and terminates the generation child, including when the worker times out or loses its lease. The runner also enforces its own one-hour deadline. Run the client regression tests with `npm run test:runner -w @hive/api`.

The service serializes generation, PNG encoding, and memory cleanup. Model loading, inference, and PNG encoding run in a temporary spawned process. The parent reaps it before returning success/failure or starting the next node, and terminates it on disconnect, timeout, or cancellation so the OS reclaims its model memory. After every request that enters model execution, successful or failed, it closes temporary images, unloads the child model pipeline, collects unused Python objects, and clears unused CUDA allocations before allowing the next request to execute. Subsequent nodes reload their model, even when it is the same model. This trades additional loading time for lower memory use between nodes; cached model files remain in `zimage_model_cache`, and generated PNG responses remain available. Startup does not load model weights; model load failures are reported during generation.

## Troubleshooting generation failures

On platforms exposing glibc's `malloc_trim`, cleanup also returns unused CPU heap pages to the operating system after model release. Platforms without it keep normal Python/CUDA cleanup.

A loaded model and healthy endpoint do not confirm enough memory for inference. Cleanup between nodes cannot reduce the memory required while a node is executing, and CUDA context or system allocator memory may remain reserved by the process. HTTP 500 responses include only a fixed failure code (`out_of_memory` or `generation_failed`); the worker translates these into run errors. The runner logs the model, exception type, and stack locations without exception messages, source lines, or submitted inputs. Inspect them with `docker compose logs --tail 100 zimage-runner`.

Run mocked failure-handling tests inside an environment with the runner's dependencies using `python -m unittest -v test_app test_generation_process` from this directory. These tests do not load model weights or perform inference.
