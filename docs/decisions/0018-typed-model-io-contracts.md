# 0018 — Store model input and output contracts

Date: 2026-10-14

## Decision

- Add a seeded, relational model catalog and canonical data-type catalog. Stable runner model IDs remain the model keys.
- Describe model inputs and outputs as named ports with a data type and minimum/maximum cardinality. A required input has `min_count > 0`; a repeatable input may have `max_count > 1`.
- Represent cross-port alternatives with normalized input groups and group-member rows. This supports constraints such as requiring at least one value from an image or text input.
- Keep prompts as text inputs delivered through existing node prompt configuration. A mask is an image data type with a `mask` port role, not a separate media type. Seed only types currently used by models; add audio when an audio model is integrated.
- Validate workflow connections from the registry, render model ports from the same contracts, persist both edge handles, and snapshot each run's contract.
- Continue storing inference controls such as resolution, seed, steps, and guidance in the existing JSONB parameter objects; these are not data ports.

## Consequences

- The migration adds and seeds `models`, `data_types`, `model_data_types`, `model_input_groups`, and `model_input_group_ports`, and adds source/target port columns to workflow edges.
- API model allow-list checks and workflow connection validation use the database catalog. The workflow editor loads the contracts from `GET /api/models/contracts`.
- Existing model-specific parameter schemas remain in code. Adding a model still requires a runner adapter and parameter schema, but its I/O shape no longer requires a special-case workflow validator.
- This supersedes decision 0017's choice not to add model-specific relational tables. It does not change the local-runner or no-workflow-versioning decisions.
