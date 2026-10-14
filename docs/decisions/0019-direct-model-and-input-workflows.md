# 0019 — Direct model and input workflow nodes

Date: 2026-10-14

## Decision

Workflows own their node configuration directly. A node is either an input node (Text, Image, Audio) or a model node referencing an enabled model in the shared catalog. The Add node picker lists inputs and downloaded models; a saved model node remains editable after its weights are removed, but execution requires a downloaded model.

Every model data input comes from a graph connection. Prompt and optional video negative-prompt ports receive text from a Text input or a compatible model output. Images receive uploaded Image inputs or compatible model outputs. Model editors contain inference controls, not inline data/prompt editors. Input nodes use the same canonical `data_types` IDs as model I/O ports; audio is added to that catalog, without inventing audio model support.

Uploaded image/audio files use owner-scoped artifact storage independently of runs. Workflow and run-node references prevent removal while a file is in use. Inputs are snapshotted at run creation and files are immutable. Run execution resolves typed node outputs in dependency order, preserving queue leases, cancellation, and runner process cleanup.

The user explicitly authorized discarding existing workflow, run, and reusable-definition data. Migration `0016_model_input_workflows` deletes old artifact metadata/runs/workflows and removes the reusable-definition table and columns, without deleting users, sessions, model catalog entries, or downloaded weights. No legacy run-reader or definition migration is retained. Historical SQL migrations and decision records remain for migration replay and audit history.

## Superseded decisions

This replaces the reusable-definition portions of decisions 0002, 0004, and 0005; the inline prompt delivery in decision 0018; and inline video negative-prompt configuration in decision 0017. The current-workflow-only policy, typed-port/cardinality/group registry, local runner, and ownership boundaries remain.

## Consequences

The user manages Models, Workflows, and Runs. Input nodes do not invoke inference. Old definitions and run history cannot be recovered through the app after the authorized reset. Models with no audio input port cannot consume Audio nodes. Uploads abandoned in an editing session are removed when unreferenced; saved/run-referenced inputs remain available.
