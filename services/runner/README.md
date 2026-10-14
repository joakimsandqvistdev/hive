# Local image model runner

This standalone service loads one allow-listed Diffusers image pipeline at a time for the Hive worker. It supports text-to-image, instruction-based image editing, multi-reference editing, and mask-based inpainting. It is separate from the Hive API and database. Keep the development endpoint local; do not expose it directly to the public internet.

## Requirements

- Docker Desktop with the WSL 2 backend on Windows, or Docker Engine on Linux.
- For NVIDIA acceleration, a supported NVIDIA GPU/driver and Docker GPU passthrough. The model card recommends 16 GB VRAM for consumer devices; lower-VRAM systems use slow sequential CPU offload.
- Enough disk space for the CUDA container image and downloaded model weights. The `model_cache` Compose volume is stored as `hive_model_cache` in the default local project. The previous `hive_zimage_model_cache` volume is not mounted by this configuration; its files remain in Docker until that old volume is explicitly removed.

## Start without GPU passthrough

From the repository root:

```powershell
docker compose --profile zimage up --build runner
```

The runner falls back to CPU when CUDA is unavailable. It starts ready without loading model weights. Download supported models explicitly from the authenticated Models view before running workflows; inference uses local model files only. Wait for `/health` to report `"status":"ready"` before starting a run. Readiness verifies the service, not model loading or inference suitability.

## Start with an NVIDIA GPU

```powershell
docker compose -f compose.yaml -f compose.gpu.yaml --profile zimage up --build runner
```

If this fails to reserve a GPU, verify host GPU visibility and Docker GPU support before troubleshooting the Python model setup.

## HTTP API

- `GET http://localhost:8188/health` reports readiness, last selected model, device, `pipeline_loaded`, and `generation_active`. A busy runner is processing a request in its child process; `pipeline_loaded` describes the HTTP process and stays false. An idle runner remains ready when its pipeline has been released; the next request loads it.
- The Hive worker calls `POST http://localhost:8188/generate` as multipart form data. Text-to-image IDs: `z-image-turbo`, `sd15-base`, `sdxl-base-1.0`, `sd35-medium`, `sdxl-turbo`, and `sana-sprint-06b`. Editing IDs: `qwen-image-edit-2511` (1–10 reference images), `instruct-pix2pix` (one source image), `sd15-inpainting` (one source image plus one mask image), `longcat-image-edit-turbo` (one source image), and `flux2-klein-4b` (text-to-image or up to four reference images). The response is PNG.
- `GET http://localhost:8188/models` reports installed/download status and byte progress. Different supported models can download concurrently without a runner-imposed concurrency cap; starting the same active model again is idempotent. Each download has independent progress and cancellation, and `DELETE /models/{id}/download` stops only that model's transfer and removes its incomplete Hub and isolated Xet cache. Completed model caches are preserved. Model weights are not bundled in the application or runner image; generation fails until its model is downloaded.

The generate route is an internal worker interface rather than a public API; model selection is allow-listed, and image references are validated and size-limited. Workflow connections to the receiver's `Image` and `Mask` ports become the corresponding ordered inputs. Inpainting mask images use white pixels for regions to replace and black pixels to preserve.

Pipelines that expose explicit output dimensions receive the selected width and height: 128×128 (minimum, experimental low-memory option), 256×256, 512×512 (default), 768×768, 1024×1024, 512×768, or 768×512. LongCat Edit follows the connected source image dimensions. Qwen's 128×128 option is unverified. Qwen reference-image preprocessing remains controlled by upstream; a smaller output selection can reduce activation memory but does not reduce model-weight loading needs.

Stable Diffusion 3.5 Medium requires accepting the model access conditions on Hugging Face and setting `HF_TOKEN` in the local `.env` before download. Sana Sprint uses its Diffusers-formatted repository and its Gemma 2 encoder terms also apply. SDXL-Turbo uses fixed zero guidance and supports 1–4 inference steps. Its model license limits use to research/non-commercial unless separate commercial terms are obtained. The runner passes the optional token only to its private download process and does not return it through its API.

InstructPix2Pix and SD 1.5 Inpainting are the smaller options for an 8 GiB GPU. FLUX.2 Klein 4B's publisher recommends about 13 GiB VRAM. LongCat Edit Turbo's example uses CPU offload and cites about 18 GB; it is unlikely to fit a host with only 16 GiB RAM or Docker limited to 12 GiB. These models are still listed so users can manage their downloads, but downloading does not guarantee inference will fit the current computer.

The worker uses a dedicated Undici client with one-hour header/body timeouts and an overall one-hour request deadline, retaining worker-lease cancellation. Node's default fetch header timeout can otherwise end slow CPU-offloaded inference after about five minutes even when the abort signal allows an hour. These settings apply only to the image runner. The runner detects client disconnection and terminates the generation child, including when the worker times out or loses its lease. The runner also enforces its own one-hour deadline. Run the client regression tests with `npm run test:runner -w @hive/api`.

The service serializes generation, PNG encoding, and memory cleanup. Model loading, inference, and PNG encoding run in a temporary spawned process. The parent reaps it before returning success/failure or starting the next node, and terminates it on disconnect, timeout, or cancellation so the OS reclaims its model memory. After every request that enters model execution, successful or failed, it closes temporary images, unloads the child model pipeline, collects unused Python objects, and clears unused CUDA allocations before allowing the next request to execute. Subsequent nodes reload their model, even when it is the same model. This trades additional loading time for lower memory use between nodes; cached model files remain in the `model_cache` Compose volume, and generated PNG responses remain available. Startup does not load model weights; model load failures are reported during generation.

## Troubleshooting generation failures

On platforms exposing glibc's `malloc_trim`, cleanup also returns unused CPU heap pages to the operating system after model release. Platforms without it keep normal Python/CUDA cleanup.

A loaded model and healthy endpoint do not confirm enough memory for inference. Cleanup between nodes cannot reduce the memory required while a node is executing, and CUDA context or system allocator memory may remain reserved by the process. HTTP 500 responses include only a fixed failure code (`out_of_memory` or `generation_failed`); the worker translates these into run errors. The runner logs the model, exception type, and stack locations without exception messages, source lines, or submitted inputs. Inspect them with `docker compose logs --tail 100 runner`.

Run mocked failure-handling tests inside an environment with the runner's dependencies using `python -m unittest -v test_app test_generation_process` from this directory. These tests do not load model weights or perform inference.
