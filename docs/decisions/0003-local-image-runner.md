# Local image model runner

- **Status:** Accepted for the Z-Image-Turbo proof of concept
- **Date:** 2026-10-13

## Decision

Run Z-Image-Turbo in a dedicated Python/Diffusers HTTP service, separate from Hive's TypeScript API. Build it with Docker Compose, expose its development endpoint on localhost only, keep Hugging Face model files in a named persistent volume, and make NVIDIA GPU assignment an optional Compose override.

The runner accepts a bounded prompt, dimensions, and optional seed, and streams a PNG response. It loads the model at process startup and serializes generation requests. A GPU with less than 16 GiB automatically uses sequential CPU offload; 512x512 is the request default. This fallback succeeded on the development machine's NVIDIA RTX 2080 with 8 GiB VRAM, but speed and memory behavior depend on the machine.

## Context

Z-Image-Turbo's documented pipeline is available through Python/PyTorch and Hugging Face Diffusers. Keeping it in a separate runner lets the existing Express API remain the control plane and lets a future background worker call inference without putting long-running GPU work in HTTP request handlers.

The model's first local download occupied about 31 GB in the Hugging Face cache. The CUDA/PyTorch base image adds about 3.7 GB. The parameter count should not be used to estimate download size.

## Consequences

- Developers need substantial persistent disk space and internet access for the initial model download.
- The current endpoint is intended for local development and is bound to `127.0.0.1`; production use needs private worker-to-runner networking and internal authentication.
- The model cache survives container rebuilds. Removing the `zimage_model_cache` volume deletes the downloaded model.
- The current GPU override targets NVIDIA GPUs. Other hardware and CPU-only deployments need separate compatibility checks.
- The service is not connected to Hive run/workflow execution yet.
