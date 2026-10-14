# Workflow orchestration MVP

## Product flow

Users manage Models, Workflows, and Runs. Download an allow-listed model from Models, create a workflow, and choose **Add node** to add a Text/Image/Audio input or a downloaded model. Text nodes are edited directly; Image/Audio nodes accept bounded uploads with preview/playback. Connect outputs to model input ports with matching datatypes, save the graph, then run it.

Model prompts and other data inputs come exclusively from connections. Inference controls such as resolution, seed, steps, and guidance remain on model nodes. Video negative prompts are optional text connections. Input outputs and model I/O ports use the same canonical datatype catalog. Audio upload support does not imply an audio-consuming model exists.

## Implemented architecture

React/Vite/Mantine and React Flow provide the editor. Express/Drizzle/PostgreSQL provide authenticated ownership, model I/O contracts, graph persistence, and durable run queueing. A separate worker resolves typed outputs in dependency order. Allow-listed local image and text-to-video adapters perform inference in temporary runner processes. A persistent model cache survives app refreshes; downloaded availability is checked before queueing model workflows.

All workflow data/model contracts/settings are snapshotted per run. Uploaded inputs are immutable files referenced by workflow and run nodes. Generated PNG/MP4 outputs and uploaded PNG/JPEG/WebP/WAV/MP3/Ogg/FLAC inputs use opaque-key local storage, owner-scoped preview/download routes, file size limits, and checksums. Cleanup cannot delete inputs referenced by saved workflows or runs.

## Contracts and constraints

Model ports define datatype, required minimum, maximum cardinality, direction, and named roles. The same contracts drive editor handles and API validation. Text input nodes can fan out to multiple prompt ports; image outputs can feed edit or mask ports. Invalid/missing/excess connections and cycles are rejected. No automatic hidden prompt concatenation or inline model data input exists.

Authenticated mutations retain origin checks. Uploads are bounded and content-sniffed; filenames cannot choose filesystem paths. The worker only reads owner-accessible input/output artifacts and the runner has no database credentials. Queue leases, retries with persisted settings, user cancellation, and process teardown are retained.

## Scope and remaining work

This is a single-host local inference application. It does not promise that every downloaded model fits the deployment's memory, or support arbitrary code/plugins/model IDs. New model families need a runner adapter and parameter schema as well as catalog I/O definitions. Future text/audio generation models can use the existing canonical datatypes but are not supplied by the current image/video catalog.

Larger deployments may need shared object storage, retention policies, backup of metadata and files together, quotas, distributed scheduling, or collaboration. Those are separate from this workflow simplification. See [ARCHITECTURE.md](ARCHITECTURE.md), [DATA_MODEL.md](DATA_MODEL.md), and [decision 0019](decisions/0019-direct-model-and-input-workflows.md).
