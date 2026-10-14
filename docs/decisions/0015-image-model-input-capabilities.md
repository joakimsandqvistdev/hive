# 0015 — Image model input capabilities

Date: 2026-10-14

## Decision

- Add model IDs for InstructPix2Pix, Stable Diffusion 1.5 Inpainting, LongCat-Image-Edit-Turbo, and FLUX.2 Klein 4B to the existing explicit-download runner catalog.
- Keep each agent's model identity and parameter settings in the existing JSON model-parameter record. Validate the model ID and workflow input connection rules before saving a workflow.
- Image editing models receive generated artifacts through workflow connections. Connections target an `Image` input by default; inpainting also requires a separate `Mask` input. Mask pixels that are white are edited; black pixels are preserved.
- Show model-specific controls for InstructPix2Pix image guidance, inpainting strength and guidance, and FLUX Klein guidance. Hide controls the pipeline does not use; LongCat edit output size follows its source image.
- Keep model weights outside Hive images and use the existing per-model download/cancellation flow. List each model's license and source on the Licenses page.

## Hardware guidance

InstructPix2Pix and SD 1.5 Inpainting are the smaller options for consumer hardware. FLUX.2 Klein 4B's publisher lists about 13 GiB VRAM. LongCat Edit Turbo requires CPU offload on lower VRAM devices and may exceed 16 GiB host RAM; availability in Hive does not mean it will run within every host's limits.

## Consequences

- Existing text-to-image and Qwen multi-reference workflows retain their existing input behavior.
- Workflow edges now preserve the receiver input port (`image` or `mask`) in saved definitions and run snapshots.
- The runner pins Diffusers 0.38.0, which includes the FLUX Klein and LongCat Edit pipelines.
- A model must be downloaded before creating an agent that selects it; successful inference still depends on available GPU and system memory.
