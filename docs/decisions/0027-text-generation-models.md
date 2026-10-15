# 0027 — Add local text-to-text generation models

Date: 2026-10-16

## Decision

- Add text as a first-class runner/model modality alongside image, video, and audio.
- Add Qwen3-0.6B and Qwen3-1.7B as downloadable local models using their public Hugging Face repositories.
- Model nodes take one connected Text input and produce a generated Text output. Store generation instructions, maximum output tokens, and temperature in the node's existing JSON settings.
- Display these models under a new **Text-to-text models** category on the Models page. Keep them in the existing **Models** group in the workflow node picker.
- Run each generation in the existing temporary child-process lifecycle so model memory is released after completion or cancellation.

## Consequences

- The model modality enum and catalog gain the text modality and two seeded model contracts.
- The local runner adds a Transformers causal-language-model adapter and plain-text generation endpoint; no new Python package is required because Transformers is already installed.
- Text model outputs are persisted as typed run-node output JSON rather than media artifacts. They can be connected to downstream Text inputs and are visible in run details.
- Both model weights use Apache-2.0 licensing. Downloaded weights remain in the persistent runner cache and are not bundled with Hive.
