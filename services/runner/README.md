# Local image and video model runner

This standalone service loads one allow-listed local model at a time for the Hive worker. It supports text-to-text, text-to-image, image editing, text-to-audio, and text-to-video generation. It is separate from the Hive API and database. Keep the development endpoint local; do not expose it directly to the public internet.

Every runner route requires `Authorization: Bearer <RUNNER_API_TOKEN>`. The local launcher supplies a fresh random token to the API, worker, and runner at startup. When starting Compose manually, set the same non-empty `RUNNER_API_TOKEN` for all three services.

The runner is divided by responsibility: `model_catalog.py` owns the model allow-list; `model_downloads.py` manages persistent model caches and download routes; and the image, audio, and video generation modules own modality-specific inference. `app.py` assembles the HTTP interface and shared runtime cleanup. The API worker's `runInputResolver.ts` turns typed workflow connections and node settings into runner requests, while `modelRunnerClient.ts` owns modality-neutral HTTP transport.

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

- `GET http://localhost:8188/health` reports readiness, last selected model, device, `pipeline_loaded`, and `generation_active`. Image models run in a dedicated spawned process. The API worker sets `keep_model_cached` when another queued or remaining run step uses that image model; otherwise, the runner releases it after the request. Cancellation, timeout, generation failure, switching to video/audio/text, or runner shutdown also terminates the process and releases its memory.
- The Hive worker calls `POST http://localhost:8188/generate-text` with a connected text prompt, node instructions, model ID (`qwen3-0.6b` or `qwen3-1.7b`), maximum output tokens, and temperature. The response is generated plain text.
- The Hive worker calls `POST http://localhost:8188/generate` as multipart form data. Text-to-image IDs: `z-image-turbo`, `sd15-base`, `sdxl-base-1.0`, `sd35-medium`, `sdxl-turbo`, and `sana-sprint-06b`. Editing IDs: `qwen-image-edit-2511` (1–10 reference images), `instruct-pix2pix` (one source image), `sd15-inpainting` (one source image plus one mask image), `longcat-image-edit-turbo` (one source image), and `flux2-klein-4b` (text-to-image or up to four reference images). The response is PNG.
- The Hive worker calls `POST http://localhost:8188/generate-audio` for Kokoro text-to-speech using a text prompt, voice, and speed; the response is WAV.
- Video agents call `POST http://localhost:8188/generate-video`. The allow-listed text-to-video models are `wan2.1-t2v-1.3b` (832×480 at 16 fps, 41/61/81 frames) and `cogvideox-2b` (720×480 at 8 fps, 25/49 frames). Video nodes do not accept image connections in this MVP. The response is MP4 and is stored alongside image artifacts.
- `GET http://localhost:8188/models` reports installed/download status, per-model cache bytes, active-download progress, and container-visible filesystem free/total bytes. Different supported models can download concurrently without a cap. `POST /models/{id}/download/pause` preserves partial Hub/Xet cache, and `POST /models/{id}/download/resume` resumes that model. Active downloads automatically recover after runner restart; explicitly paused downloads remain paused. `DELETE /models/{id}/download` cancels and removes incomplete files for only that model. `DELETE /models/{id}/cache` removes only the selected allow-listed model's known cache paths and returns a conflict during inference. Model weights are not bundled in the application or runner image; generation fails until its model is downloaded.

Download status and progress are stored in `.hive-model-downloads.json` inside `HF_HOME`, which is mounted on the persistent `model_cache` volume. A runner restart reuses Hugging Face's cached snapshot/partial files. Cache removal reports known catalog model bytes and safely identifiable unrecognized files; unknown files are left untouched. Filesystem capacity is container-visible for the mounted cache filesystem, not a host-wide storage report.

The generate routes are internal worker interfaces rather than public APIs; model selection is allow-listed, and image references are validated and size-limited. Workflow connections to the receiver's `Image` and `Mask` ports become the corresponding ordered inputs. Inpainting mask images use white pixels for regions to replace and black pixels to preserve.

Pipelines that expose explicit output dimensions receive the selected width and height: 128×128 (minimum, experimental low-memory option), 256×256, 512×512 (default), 768×768, 1024×1024, 512×768, 768×512, 768×960 (Instagram portrait 4:5), 1024×1280 (Instagram portrait 4:5), or 768×1360 (Instagram Reel 9:16). LongCat Edit follows the connected source image dimensions. Qwen's 128×128 option is unverified. Qwen reference-image preprocessing remains controlled by upstream; a smaller output selection can reduce activation memory but does not reduce model-weight loading needs.

Stable Diffusion 3.5 Medium requires accepting the model access conditions on Hugging Face and setting `HF_TOKEN` in the local `.env` before download. Sana Sprint uses its Diffusers-formatted repository and its Gemma 2 encoder terms also apply. SDXL-Turbo uses fixed zero guidance and supports 1–4 inference steps. Its model license limits use to research/non-commercial unless separate commercial terms are obtained. The runner passes the optional token only to its private download process and does not return it through its API.

InstructPix2Pix and SD 1.5 Inpainting are the smaller image options for an 8 GiB GPU. Z-Image-Turbo uses NF4 4-bit transformer weights, VAE tiling, a CPU-resident text encoder, and model CPU offload on CUDA GPUs. These settings reduce its memory demand but do not guarantee every resolution fits or runs quickly. FLUX.2 Klein 4B's publisher recommends about 13 GiB VRAM. LongCat Edit Turbo's example uses CPU offload and cites about 18 GB; it is unlikely to fit a host with only 16 GiB RAM or Docker limited to 12 GiB. Wan's publisher reports 8.19 GiB VRAM for its tested 1.3B path; Hive enables sequential CPU offload on smaller GPUs, which is unverified on the current host. CogVideoX-2B's documented FP16 Diffusers path needs more than 8 GiB; its INT8 figure is not used by Hive. Both video pipelines may require substantial system memory and long generation times. Downloading a model does not guarantee inference will fit the current computer.

The worker uses a dedicated Undici client with one-hour header/body timeouts and an overall one-hour request deadline, retaining worker-lease cancellation. Node's default fetch header timeout can otherwise end slow CPU-offloaded inference after about five minutes even when the abort signal allows an hour. The runner detects client disconnection and terminates the generation child, including when the worker times out or loses its lease. The runner also enforces its own one-hour deadline. Run the client regression tests with `npm run test:runner -w @hive/api`.

Image generation runs in a dedicated spawned process. The API worker checks pending run nodes and queued run snapshots and requests retention only while another queued step uses the same image model; otherwise, the pipeline is released after the request. Cancellation, timeout, inference failure, or a non-image generation also terminates the process so the OS reclaims its model and CUDA memory. Video, audio, and text generation use temporary spawned processes that are reaped after each request. This retains process isolation from the HTTP API while removing repeated image-model startup cost within queued sequences. Startup does not load model weights; model load failures are reported during generation.

## Troubleshooting generation failures

On platforms exposing glibc's `malloc_trim`, cleanup also returns unused CPU heap pages to the operating system after model release. Platforms without it keep normal Python/CUDA cleanup.

A loaded model and healthy endpoint do not confirm enough memory for inference. Cleanup between nodes cannot reduce the memory required while a node is executing, and CUDA context or system allocator memory may remain reserved by the process. HTTP 500 responses include only a fixed failure code (`out_of_memory` or `generation_failed`); the worker translates these into run errors. The runner logs the model, exception type, and stack locations without exception messages, source lines, or submitted inputs. Inspect them with `docker compose logs --tail 100 runner`.

Run mocked failure-handling tests inside an environment with the runner's dependencies using `python -m unittest -v test_app test_generation_process` from this directory. These tests do not load model weights or perform inference.
