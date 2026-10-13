# Decision 0006: Add Qwen-Image-Edit-2511 for reference-image workflow nodes

Date: 2026-10-13

## Context

The Z-Image-Turbo adapter only generates images from text. Qwen-Image-Edit-2511 can edit images and accepts multiple references, which is useful for character/background composition workflows.

## Decision

- Add Qwen-Image-Edit-2511 to the allow-listed image model options and use the official Hugging Face checkpoint under Apache 2.0.
- Preserve model choice with existing JSON model parameters so each agent, workflow node, and run snapshot selects the same implementation without adding a model-specific table.
- Treat incoming image workflow edges as reference images to a Qwen edit node. Require one to ten references and execute nodes in topological order. Keep other connected-node semantics unsupported.
- The local runner loads one model at a time and swaps its pipeline when a request selects another allow-listed model.

## Consequences

The Qwen checkpoint occupies about 57.7 GB on disk and may need substantially more host memory than the prior 8 GiB GPU proof of concept. First model switch downloads and loads the checkpoint. Full inference on the current host remains unverified; do not infer hardware suitability from model file size alone.
