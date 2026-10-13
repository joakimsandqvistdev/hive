# Local image model runner

- **Status:** Accepted for local image inference
- **Date:** 2026-10-13

## Decision

Run image models in a dedicated Python/Diffusers HTTP service, separate from Hive's TypeScript API. The allow-listed models currently are Z-Image-Turbo and Qwen-Image-Edit-2511. The runner switches models on demand so only one large pipeline is resident at a time. Build it with Docker Compose, expose its development endpoint on localhost only, keep Hugging Face model files in a named persistent volume, and make NVIDIA GPU assignment an optional Compose override.

The runner accepts a bounded prompt, dimensions, and optional seed, and streams a PNG response. It loads the model at process startup and serializes generation requests. A GPU with less than 16 GiB automatically uses sequential CPU offload; 512x512 is the request default. This fallback succeeded on the development machine's NVIDIA RTX 2080 with 8 GiB VRAM, but speed and memory behavior depend on the machine.

## Context

Both model pipelines are available through Python/PyTorch and Hugging Face Diffusers. Qwen's model uses `QwenImageEditPlusPipeline` and accepts one or more image references. Connected workflow edges provide those references to the receiving edit node. Keeping inference separate lets the existing Express API remain the control plane and prevents long-running GPU work from occupying HTTP request handlers.

The model's first local download occupied about 31 GB in the Hugging Face cache. The CUDA/PyTorch base image adds about 3.7 GB. The parameter count should not be used to estimate download size.

## Consequences

- Developers need substantial persistent disk space and internet access for the initial model download.
- Qwen-Image-Edit-2511 adds about 57.7 GB of model files and needs one to ten image references. Successful loading/inference has not yet been verified on the existing 8 GiB GPU host.
- The current endpoint is intended for local development and is bound to `127.0.0.1`; production use needs private worker-to-runner networking and internal authentication.
- The model cache survives container rebuilds. Removing the `zimage_model_cache` volume deletes the downloaded model.
- The current GPU override targets NVIDIA GPUs. Other hardware and CPU-only deployments need separate compatibility checks.
- The runner API is private to the local Hive worker; model IDs are allow-listed and reference payloads are bounded.
