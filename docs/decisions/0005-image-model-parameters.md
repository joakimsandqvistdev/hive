# Decision 0005: Persist image model parameters per agent and workflow node

Date: 2026-10-13

## Context

Image agents need reproducible, bounded generation settings, while a workflow node must be able to override its selected agent's defaults. A run must preserve the settings used even if its workflow or agent is edited later.

## Decision

- Store declarative model settings as JSONB on agents, workflow nodes, and run nodes. Validate image settings in the API with a shared schema rather than accepting arbitrary runner parameters.
- Keep Z-Image-Turbo as the default image model (512×512, 9 steps, randomized seed). Qwen-Image-Edit-2511 defaults to 40 steps and true CFG scale 4. Both models use explicitly selected output dimensions: 256×256 (minimum), 512×512 (default), 768×768, 1024×1024, 512×768, or 768×512. The user's requests on 2026-10-13 supersede Qwen's prior automatic output sizing and the prior 512×512 minimum; existing saved resolution values continue to control output.
- Initialize a node's settings from its selected agent, then snapshot those node settings when creating a run.
- When randomization is enabled, choose the seed at execution and persist resolved dimensions, steps, and seed on the run node before calling the runner. Retried execution reuses the persisted seed.
- Keep settings model-specific. Qwen edit nodes require one to ten incoming image-node connections; the worker passes their generated PNGs to the local runner in edge order and processes the graph topologically.

## Consequences

Model settings are isolated from workflow topology and remain extensible without a schema migration for every runner-specific option. JSONB values must remain validated and version-compatible. A later multi-model catalog may need an explicit model identifier and parameter schema version.
