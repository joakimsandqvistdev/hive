# Workflow orchestration MVP

## Product flow

Users manage Models, Workflows, and Runs. Download an allow-listed model from Models, create a workflow, and choose **Add node** to add a Text/Image/Audio input or a downloaded model. Text nodes are edited directly; Image/Audio nodes accept bounded uploads with preview/playback. Connect outputs to model input ports with matching datatypes, save the graph, then run it.

Model prompts and other data inputs come exclusively from connections. Inference controls such as resolution, seed, steps, and guidance remain on model nodes. Video negative prompts are optional text connections. Kokoro-82M adds text-to-speech: a connected text prompt produces a WAV audio output, with voice and speech speed configured on the model node. Input outputs and model I/O ports use the same canonical datatype catalog.

## Product and implementation boundaries

The editor offers typed input and model nodes. Model ports determine which edges can be connected; text and media inputs are configured through input nodes. Model inference settings remain on model nodes. A workflow run uses the saved graph and model settings as its input snapshot.

Connection rules, input validation, queue lifecycle, ownership, artifact retention and deletion behavior are documented in [ARCHITECTURE.md](ARCHITECTURE.md) and [DATA_MODEL.md](DATA_MODEL.md). This document describes the user-facing orchestration scope and decisions; those references are canonical for system behavior and storage details.

## Scope and remaining work

This is a single-host local inference application. It does not promise that every downloaded model fits the deployment's memory, or support arbitrary code/plugins/model IDs. New model families need a runner adapter and parameter schema as well as catalog I/O definitions.

Larger deployments may need shared object storage, retention policies, backup of metadata and files together, quotas, distributed scheduling, or collaboration. Those are separate from this workflow simplification. See [ARCHITECTURE.md](ARCHITECTURE.md), [DATA_MODEL.md](DATA_MODEL.md), and [decision 0019](decisions/0019-direct-model-and-input-workflows.md).
