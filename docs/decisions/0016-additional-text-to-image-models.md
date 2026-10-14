# 0016 — Additional text-to-image models

Date: 2026-10-14

## Decision

- Add Stable Diffusion 1.5, SDXL Base 1.0, Stable Diffusion 3.5 Medium, SDXL-Turbo, and Sana Sprint 0.6B to the explicit local download catalog and shared image-agent parameter schema.
- Use the published Diffusers Sana Sprint repository (`Sana_Sprint_0.6B_1024px_diffusers`) because it is structured for the pinned Diffusers pipeline. Keep all five models text-only in workflow inputs.
- Configure SDXL-Turbo and Sana Sprint for 1–4 steps; other added models use the regular 4–50 step range. SDXL-Turbo guidance is fixed to 0, as required by its model card. Hide inputs and controls that each pipeline does not use.
- Pass an optional `HF_TOKEN` from local `.env` into the runner for gated models such as SD 3.5 Medium after accepting their publisher terms. Never log or display this token.
- Record each model's license, source, access requirements, and memory estimate in the Models and Licenses views. In particular, Sana's Gemma 2 encoder has additional Google terms; SDXL-Turbo is restricted to non-commercial/research use unless separate commercial terms are obtained.

## Hardware guidance

Stable Diffusion 1.5 and SDXL-Turbo are the lower-memory candidates in this set. SDXL Base may require CPU offload on an 8 GiB GPU. The published Sana BF16 configuration recommends 9 GiB VRAM; Hive does not enable its optional 4-bit route. Stable Diffusion 3.5 Medium has three text encoders and may exceed the current 12 GiB Docker memory budget. Catalog availability is not a guarantee of inference fit.

## Consequences

- No relational database migration is required; the model selection remains in the existing JSON parameter column.
- Existing explicit-download, per-model progress/cancel, and shared model-cache behavior is reused.
- SD 3.5 downloads need an accepted Hugging Face account token in `.env`; Sana's model card also identifies Gemma terms. License conditions are surfaced before use but remain the user's responsibility to review.
