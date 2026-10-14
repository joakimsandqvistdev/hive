# 0017 — Add local text-to-video models

Date: 2026-10-14

## Decision

- Add Wan2.1 T2V 1.3B and CogVideoX-2B to the explicit local model-download catalog. Both are Apache 2.0 model-weight releases; record the exact source and license on the user-facing Licenses page.
- Extend the existing agent modality enum additively with `video`. Store model ID and bounded settings in the existing JSONB parameters field; do not create model-specific relational tables.
- Keep these integrations text-to-video only. Their video agents accept the node prompt, optional negative prompt, seed, frame count, inference steps, and guidance scale. Output dimensions and FPS are model-specific fixed values in this MVP. Video workflow nodes do not accept image connections.
- Generate MP4 files in the private local runner. Store them as authenticated filesystem artifacts with normal artifact metadata; do not store binary data in PostgreSQL or add S3 for the single-host MVP.
- Use Diffusers sequential CPU offload on GPUs below 16 GiB. This may reduce GPU memory needs at the cost of speed and system RAM; it is not a guarantee that either model fits the current host. The CogVideoX INT8 route is not enabled.

## Consequences

- New installations and existing databases apply migration `0014_black_tempest`; existing image agents remain unchanged.
- Runner/model availability is still explicitly managed from Models. Downloads persist in the existing model cache volume.
- Run previews support both PNG and MP4 artifacts. The UI and workflow do not imply image-to-video support from these text-to-video checkpoints.
- No model weights are bundled or downloaded automatically. No external inference service or per-generation API is used.
