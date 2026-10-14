# Current work

## 2026-10-14 — Add Kokoro-82M text-to-speech

- Added Kokoro-82M to the local runner download catalog and as a typed text-to-audio model. Its required text prompt produces a WAV artifact; voice and speed are configurable on workflow nodes and outputs use existing audio previews.
- Run details now show each produced model artifact inline with its workflow node, including native audio playback controls for generated WAVs.
- Diagnosed Kokoro inference failure: Misaki attempted a runtime spaCy pipeline download and hit PEP 668. The pinned en_core_web_sm 3.8 wheel is now downloaded and cached alongside Kokoro weights; the readiness check detects the sidecar and supports older installs with a one-time completion download. Added its MIT license entry.
- Added audio modality support, separated enum and catalog migrations, Models page grouping/card, Apache-2.0 notices for weights/package, GPL-3.0-or-later notice for eSpeak NG, and updated architecture/data-model docs plus decision 0020.
- Fixed local migration failure: PostgreSQL rejects use of a just-added enum value in Drizzle's transaction. Migration 0017 now recreates the enum with `audio` and casts the existing model column.
- Python syntax compilation and `git diff --check` passed. Rebuilt and refreshed only the runner while no workflows or model downloads were active; model cache volume was preserved. Downloaded the 12.8 MB English pipeline and verified a short Kokoro request produced a WAV. No test suite or database migration was run.
- Next: verify an end-to-end workflow run with a text input connected to a Kokoro node.

## 2026-10-14 — Consolidate repeated API and workflow UI patterns

- Added a shared frontend API URL/request helper with cookie credentials, shared paginated-table footer and confirmation modal components, common random-seed controls, and a focused workflow node configuration component. Replaced duplicate frontend fetch setup in model, run, workflow, and model-download-hook requests.
- Moved duplicate API pagination parsing and total-page calculation into `pagination.ts` for workflow and run routes. Existing domain logic already lives in focused modules (`workflowDefinition`, `workflowRunSnapshot`, `runQueue`, `modelContracts`), so no generic service/base-class layer was added.
- API/web typechecks passed. API build passed; web production build was blocked when Vite/esbuild attempted to spawn a child process (`spawn EPERM`). `git diff --check` passed. Automated tests were not run.
- Next: run the web build in an environment that permits esbuild process launch and exercise workflow editing, uploading, and confirmations in the browser.

## 2026-10-14 — Replace reusable definitions with direct model/input workflows

- Implemented Input (Text/Image/Audio) and downloaded Model nodes with the Add node picker. All model data, including prompts and optional video negative prompts, comes from typed connections; model panes contain only inference controls. Input and model outputs use the same canonical datatype catalog.
- Removed the reusable-definition page, navigation, routes, seed command, source types, live table, and reference/snapshot columns. Added owner-scoped immutable uploads, image/audio preview, input-output display in run details, reference-safe deletion of abandoned uploads, and direct typed execution for input/image/video nodes. Queue leases, cancellation, explicit downloads, and runner memory cleanup are retained.
- Applied the pending catalog migration and reviewed reset migration 0016_model_input_workflows. As explicitly authorized, removed 5 reusable definitions, 7 workflows, and 20 runs plus their old artifact metadata. Users (3), sessions (1), model catalog, and downloaded Z-Image/Qwen/FLUX weights remain. Historical migration/decision files remain; orphan files from old run metadata were not purged from disk.
- Recorded decision 0019 and rewrote current architecture/data-model/MVP docs. Historical inline-prompt/reusable-definition decisions are superseded. The catalog now includes Audio and optional video negative-prompt text ports. No audio-consuming model is currently supplied.
- API unit tests (14), web tests (8), and database/worker integration tests (8) pass, including ownership, upload validation, required/mistyped connections, missing downloads, uploaded plus generated image references, audio inputs, video frame/negative-prompt bindings, cross-origin mutations, and cancellation. Inference responses are mocked; no live model inference or downloads were requested. Typechecks/builds and Drizzle schema comparison passed. Early checks caught circular schema typing, a video frame field mismatch, stale UI test expectations, and trailing whitespace; all corrected.
- Applied generic API error responses to avoid exposing submitted text/SQL failures; upload/cancel mutations retain origin checks. The initial migration generator required approved subprocess access. Docker installation completed with existing lockfile metadata/audit warnings; web builds retain the >500 kB bundle advisory. Browser inspection confirmed the simplified public navigation and sign-in gate; signed-in editor visual QA was unavailable in the browser session.
- Rebuilt and refreshed API/web/worker; API/database health and web HTTP checks passed, and all local services are up. Runner/cache were left untouched. Next: sign in, create a Text input and downloaded model node, connect Text output to Prompt, save, and run. Actual model suitability remains dependent on available hardware.
## 2026-10-14 — Add relational model I/O contracts

- Added a seeded catalog of the 13 current models and the `text`, `image`, and `video` data types. Model ports record input/output direction, transport, required minimum, maximum cardinality, and display order. Added normalized input groups for cross-port alternatives; no current model needs an alternative group. Mask is an image port role.
- Replaced workflow model-specific edge rules with generic typed-port/cardinality/group validation. Workflow edges now persist source and target handles; old untyped edges are inferred on read when possible. Agent and workflow editors show model data definitions, and workflow node handles render from the catalog. Queued run snapshots carry the model I/O contract.
- Added migration `0015_jazzy_patriot`, model contract API endpoint, and decision 0018 superseding decision 0017's no-model-tables choice. Updated architecture, data-model, and MVP design docs. Inference parameter JSON schemas remain unchanged.
- API/web typechecks, API production compilation, Drizzle schema generation, and `git diff --check` passed. Web production build reached Vite but failed because the sandbox denied esbuild process launch (`spawn EPERM`). No automated tests were run. Migration was not applied and live containers were not restarted.
- Next: apply migration on the next planned service refresh, then verify existing workflows—especially inpainting edges whose older persisted rows had no port handles—and run a workflow end to end.

## 2026-10-14 — Remove machine-specific model guidance

- Replaced model copy that compared requirements to this host's GPU or computer with general publisher requirements and CPU-offload guidance. Updated the image parameter pane warnings to describe model resource needs without referring to this computer's hardware.
- Searched `apps/web/src` for host/computer/GPU-specific references; only a generic note that model needs may exceed a user's hardware remains.
- Web typecheck and `git diff --check` passed.
## 2026-10-14 — Add local text-to-video models

- Added Wan2.1 T2V 1.3B and CogVideoX-2B as downloadable runner models, with dedicated video-agent choices and model-specific parameters (fixed supported output sizes/frame rates, supported frame counts, seed/randomization, inference steps, guidance, and negative prompt). Workflow nodes inherit agent defaults and expose the same video controls. These are text-to-video models, so video nodes do not accept image connections.
- Added queued video execution and MP4 artifacts/previews, a Text-to-video group on the Models page, Apache 2.0 license entries, an additive `video` agent-modality migration, and architecture/runner documentation plus decision 0017.
- API and web typechecks, Python syntax compilation, and `git diff --check` passed. App Docker image build completed. Runner Docker image build stalled while downloading `imageio-ffmpeg` and was canceled due to constrained network bandwidth. FLUX.2 Klein was actively downloading, so no running containers or database migrations were touched. No model weights were downloaded and no inference was attempted.
- Next: after the active model download finishes, safely refresh services so the additive migration and new runner/API images are applied. Then test video generation on this machine; the host's 8 GB VRAM may require CPU offload and substantial system memory.

## 2026-10-14 — Browse model groups with tabs

- Replaced the stacked model groups with accessible Mantine tabs; each tab keeps its model cards, download status, and actions. Text-to-image is selected by default, and FLUX.2 Klein remains under image-to-image/editing.
- Updated the grouping regression test. Web typecheck, all 8 web tests, production build, `git diff --check`, and local web refresh passed. Build retains the existing Vite bundle-size advisory.

## 2026-10-14 — Group Models view by generation input

- Split the Models catalog into **Text-to-image models** and **Image-to-image and editing models**, keeping every model card and its existing download/progress actions. FLUX.2 Klein is in the image-to-image group because it accepts reference images while retaining text-to-image capability.
- Added a grouping regression test. Web typecheck, tests, production build, `git diff --check`, and local web service refresh passed.

## 2026-10-14 — Add the previously shortlisted text-to-image models

- Added Stable Diffusion 1.5, SDXL Base 1.0, Stable Diffusion 3.5 Medium, SDXL-Turbo, and Sana Sprint 0.6B (Diffusers-format repo) to explicit downloads, runner pipeline dispatch, image-agent choices, and the Models page. Added model-specific step/guidance controls, text-only workflow input validation, and model/license/access guidance.
- Added optional `HF_TOKEN` pass-through from local `.env` for gated Hugging Face models. SD 3.5 requires accepted access; Sana Sprint's Gemma encoder terms also apply. No models were downloaded; existing `hive_model_cache` remained mounted.
- API/web typechecks, API runner tests (11), web tests (7), API/web production build, Docker runner unit tests (11), candidate Diffusers imports, Compose validation, and `git diff --check` passed. Rebuilt/refreshed local services; health is ready with CUDA, all five new models report not downloaded, and the original Z-Image model still reports downloaded. The runner remains attached to `hive_model_cache`. Build retains the existing Vite bundle-size advisory.
- Recorded decision 0016. For the current host, SD 1.5 and SDXL-Turbo are the more memory-practical additions; Sana's published BF16 path lists 9 GiB VRAM, SDXL may need CPU offload, and SD 3.5 may exceed the configured Docker memory. No live inference was attempted.

## 2026-10-14 — Add image editing and unified image models

- Added downloadable catalog entries for InstructPix2Pix (one source image), Stable Diffusion 1.5 Inpainting (source plus mask), LongCat-Image-Edit-Turbo (one source image), and FLUX.2 Klein 4B (text-to-image or up to four reference images). Existing Z-Image-Turbo and Qwen Image Edit remain available.
- Added model-specific parameters and editor guidance. Workflow edges retain Image/Mask target ports; workflow validation enforces each model's allowed input counts, and the worker sends references in port order. Added source and license entries for all new weights.
- Pinned Diffusers 0.38.0, which includes the LongCat and FLUX Klein pipelines. The runner and app rebuilt successfully; local services are healthy with CUDA enabled. Existing Z-Image-Turbo remains downloaded in the same model cache. No additional models were downloaded.
- API/web typechecks and builds, API runner tests (11), web tests (6), Docker runner tests (11), pipeline imports, and `git diff --check` passed. Runner pytest/unittest could not run on host Python without PyTorch, but the same suite passed in Docker. No live inference of the new weights was attempted.
- Hardware guidance warns that FLUX.2 Klein lists ~13 GiB VRAM and LongCat uses substantial CPU offload; the latter may exceed this machine's 16 GiB system RAM and Docker memory budget. The smaller SD-based options are more practical for this host.

## 2026-10-14 — Remove the unused legacy tasks table

- Removed the unused `tasks` table from the Drizzle schema and generated migration `0013_free_charles_xavier` to drop it. The local table had zero rows; the migration uses a strict drop without cascading to unrelated database objects.
- Applied the migration to the local database and verified `public.tasks` is absent. API typecheck and `git diff --check` passed. Updated the data model and recorded decision 0014; historical migrations/snapshots remain unchanged.

## 2026-10-14 — Fix local container startup

- Local Compose startup was blocked because migration `0013_free_charles_xavier` attempted to drop `tasks` even though the table was already absent and the migration was not recorded in this database. Changed the migration to `DROP TABLE IF EXISTS` without `CASCADE`, preserving failure on dependent objects while allowing the database state to converge.
- Docker Desktop's Linux engine was stopped/inaccessible after the machine restart; started Docker Desktop. `npm run local` then completed successfully with API, web, worker, database, and runner healthy; `/api/health` returned HTTP 200 with the database connected. The migration completed and `git diff --check` passed.
- Deleted the shutdown monitor for the completed Qwen download to prevent a repeat shutdown.

## 2026-10-14 — Add 128×128 output resolution

- Added 128×128 as the minimum selectable output for Z-Image-Turbo and Qwen-Image-Edit-2511 in the shared agent/node settings, API schema, and runner validation. Existing 512×512 defaults are unchanged.
- Updated existing parameter/UI/runner test cases and model-parameter docs. The UI labels 128×128 as experimental and explains that reducing output size does not remove model loading memory needs; Qwen's publisher demo starts at 256×256.
- API/web typechecks, production build, Python syntax validation, and `git diff --check` passed. Automated tests were not run. No containers were restarted while the Qwen model download is active.

## 2026-10-14 — Use the reusable agent's model in workflow nodes

- Removed the Image model selector from the workflow-node parameter pane. The selected agent now determines model identity in the editor, workflow validation/persistence, and run snapshots; other supported node-level parameter overrides remain available.
- Updated decision 0005. API/web typechecks, production build, and `git diff --check` passed. No automated tests were run.
- No containers were restarted because the Qwen model download is active; the running web container will show the UI update after a later safe restart.

## 2026-10-14 — Remove the model download concurrency cap

- Removed the runner's maximum concurrent model-download count. Different models may now download at the same time; repeated starts for an active model remain idempotent, with per-model progress and cancellation.
- Removed concurrency and combined-resource messaging from the Models page and removed the cap from runner status. Updated decision 0013, runner documentation, and orchestration design.
- API/web typechecks, Python syntax compilation, `git diff --check`, and web production build passed. The rebuilt web service is healthy and returns HTTP 200.
- Two model downloads were active during this change and are still progressing. The runner container was left untouched to preserve them; it must be restarted after they finish to load the uncapped runner code.

## 2026-10-14 — Allow parallel model downloads

- Enabled up to two distinct model downloads at once in the runner. Repeated starts for an already active model are idempotent; each model retains independent progress and cancellation.
- Exposed the concurrency limit through the Models API and updated the Models UI to allow parallel starts while explaining combined bandwidth and disk requirements. Updated decision 0013, runner documentation, and orchestration design.
- API/web typechecks and builds, Python syntax compilation, and `git diff --check` passed. Rebuilt the local app and runner with the NVIDIA configuration; all services are healthy, and the runner reports `maxConcurrentDownloads: 2`. No downloads were started.
- No automated tests were run.

## 2026-10-14 — Rename runner service folder

- Moved the runner code and guide under `services/runner` and updated the Compose build context and README links. This aligns the folder with the existing `runner` Compose service name without changing Docker volumes or cached model files.
- `git diff --check` passed; Compose configuration validation is pending.

## 2026-10-13 — Report model download progress and support cancellation

- The Models API now reports per-model transferred and total bytes. The Models cards show downloaded GB and a progress bar, with a cancel action while a download is queued or running.
- Downloads run in a supervised subprocess so cancellation can stop transfer before removing only that model's Hub cache and isolated Xet cache. Completed model caches remain available.
- Updated the runner API documentation. Python syntax compilation and `git diff --check` passed. Docker was unavailable during this continuation, so production builds and live runner checks could not be repeated; no large model download or automated tests were run.

## 2026-10-13 — Share model download prompt between creation modals

- Extracted the model-checking, no-download, and unavailable states plus consistent Models/Close actions into `ModelDownloadPrompt`, reused by both the agent and workflow creation modals.
- API/web production build passed in Docker and the updated web container is running. `git diff --check` passed. Build retains the Vite advisory for a JavaScript chunk over 500 kB; no tests run.

## 2026-10-13 — Guide creation flows to model downloads

- The create-agent and create-workflow modals check downloaded model status before showing their forms. If none are downloaded, each says “No models are downloaded yet” and offers a direct Models navigation button; creation fields and actions stay hidden.
- Model status errors display a separate unavailable message. The agent form is only gated during creation; editing an existing agent remains available.
- Added a shared downloaded-model status hook. API/web production build passed in Docker and the updated web container is running. `git diff --check` passed. Build retains the Vite advisory for a JavaScript chunk over 500 kB; no tests run.

## 2026-10-13 — Limit agents to downloaded image models

- Removed Text, Audio, and Video from the agent form and API schema. New agent rows must use Image and pass the existing local-runner downloaded-model check.
- Restricted the PostgreSQL `agent_modality` enum to `image`. The migration deletes unreferenced legacy non-image agents and fails with a clear message if any current or saved workflow version still references them. The inspected local database had no agent rows.
- Updated the seed command and data model documentation to include only Image agents. The migration applied successfully to the local database; its only agent enum value is now `image`, and it contains no agent rows. API/web production builds and container restarts passed; `git diff --check` passed. The build reports the existing Vite advisory for a JavaScript chunk over 500 kB. No tests run.

## 2026-10-13 — Require downloaded models for image agents

- Image model choices that are not downloaded in the local runner are disabled in the agent form, with a prompt to get them from Models.
- The API verifies runner availability before creating an image agent or changing an existing agent to a different image model. Editing other fields on an existing agent remains possible if its model is no longer present.
- API and web production builds passed in Docker, and the updated API/web containers are running. `git diff --check` passed. The build reports the existing Vite advisory for a JavaScript chunk over 500 kB; no tests run.

## 2026-10-13 — Explicit local model downloads

- Added an authenticated Models view listing Z-Image-Turbo and Qwen-Image-Edit-2511 with summaries, estimated disk use, hardware recommendations, model-card links, and download status/actions.
- Added authenticated API proxy routes and runner status/background-download endpoints. The runner serializes downloads, stores weights in the existing persistent Docker cache, marks completed downloads, and loads inference pipelines in local-files-only mode; generation returns a specific error until a model is downloaded.
- Added navigation and updated model/license copy, runner documentation, orchestration design, and decision 0013. No model files are included in the application image.
- API and web production builds completed in Docker; `git diff --check` and runner Python syntax compilation passed. After the local model runner was refreshed, its `/models` endpoint returned HTTP 200 through the API network. The active runner uses the new `hive_model_cache` volume; both models correctly report not downloaded. The old `hive_zimage_model_cache` volume was left untouched.

## 2026-10-13 — Finalize interrupted agent-step status

- Fixed retry exhaustion so a terminal failed run also marks its in-flight agent step failed and queued steps skipped. The Runs details modal continues polling if a step remains active even when the run is terminal.
- Corrected the existing interrupted run’s stale agent-step row to `failed`, with its finish time matching the run’s finish time. Rebuilt/restarted API and worker; Docker production build, database state check, and `git diff --check` passed. No automated tests run.
- Simplified Models page download guidance by removing the reference to automatic workflow downloads.
- Updated Home page copy and shortcuts to describe currently supported agent, model, workflow, run, and image-output features; removed “A little room to grow.”
- Reordered Home shortcuts so Models appears to the left of Agents.

## 2026-10-13 — Stop runs and release inference memory

- Added a Stop action for active/queued runs in the Runs list and details. Owner-scoped cancellation marks queued runs immediately and signals claimed runs for cooperative cancellation.
- Worker polls cancellation with its lease heartbeat, aborts the image-runner request, and finalizes the run and unfinished steps as cancelled. The runner reaps the per-generation child process on disconnect, releasing step RAM and CUDA allocations; completed steps and artifacts remain available.
- Added the cancelled run-node database enum migration, recorded decision 0011, and updated orchestration design status. Typecheck/build and automated tests have not yet been run.
- Runs list uses an accessible stop icon in the last column for running workflows; queued runs remain stoppable from run details.
- Workflow list actions are right-aligned. Workflow removal is disabled while queued, running, or cancellation-pending runs exist, with an API guard for stale clients and start/delete races.
- Renamed the Compose image service to `runner` and the cache key to `model_cache`; the new backing volume is `hive_model_cache`. The previous `hive_zimage_model_cache` is left untouched and is no longer mounted, so models need to download into the new volume.

## 2026-10-13 — Single-command local start and stop

- Added `npm run local` / `npm run local:stop`, a Node.js launcher, local Compose overlay, shared app Dockerfile, and build-context exclusions. Startup creates missing `.env` with random database credentials, builds/installs in Docker, applies migrations to Compose PostgreSQL, and starts API/web/worker/runner with readiness checks. NVIDIA detection has explicit CPU/GPU overrides. Stop removes only the current Compose project's containers/networks and preserves persistent volumes/artifacts.
- Updated README setup and recorded decision 0010. Added eight launcher regression tests and a CI step. Host prerequisites are Node.js 22+, Docker with Compose 2.24.4+, and one-time Google OAuth configuration for sign-in. Manually launched dev processes remain controlled by their terminals.
- Eight launcher tests, CPU/GPU Compose config validation, Node syntax check, `git diff --check`, and a clean Linux Docker app build passed. Isolated Compose startup with random localhost ports, empty PostgreSQL, and a dummy runner succeeded: 11 migrations recorded, API database health OK, web HTTP 200, `.env` excluded from image. Actual `local:stop` removed all verification containers while preserving test volumes. Existing app/database/model cache were not touched; no model inference or GPU startup was performed.
- Docker build/test-runner checks initially needed approved sandbox access; one verification attempt was interrupted by an automatic-review usage-limit failure and completed after resuming. Build emitted existing bundle-size/dependency-audit advisories and npm lockfile warnings but completed successfully.


## 2026-10-13 — Apply the selected Soft workspace UI

- Replaced the enforced dark appearance with the user's selected light Soft workspace design: pale gray workspace/sidebar, white rounded panels, blue actions and navigation selection, quieter shadows, and more spacious table rows. Updated shared theme/styles and explicit light-surface text shades across Home, Agents, Runs, and workflow editing.
- Updated `docs/DESIGN_SYSTEM.md` and recorded decision 0009; existing navigation and API behavior are preserved.
- Six existing web tests, web typecheck/build, and `git diff --check` passed. Build retains the known >500 kB bundle advisory. Visually reviewed desktop Home/Licenses, the login dialog, and 390px mobile Home (no horizontal overflow). The review browser was signed out, so authenticated tables and workflow canvas still need visual review in the user's signed-in session. API/database tests were not run for this presentation-only change.


## 2026-10-13 — 256 minimum resolution and cleanup on failed runs

- Added 256×256 to the shared agent/node selector, API resolution schema, and runner validation for both image models. Existing 512×512 defaults and saved settings remain unchanged; no migration required.
- Isolated each model load/inference/PNG encode in a temporary spawned process. Parent waits for process teardown on success, failure, disconnect, timeout, and cancellation before allowing another generation. Decoded reference images also close if a later input fails validation. Recorded decision 0008, updated parameter decision 0005 and cleanup decision 0007.
- Six web tests, nine API runner/parameter tests, and eleven Python tests passed. Python checks include real process success/error/crash/disconnect/timeout/task-cancellation teardown, large IPC output, mocked model-load/inference/encode failures, and partial-reference cleanup. API/web typechecks/builds and `git diff --check` passed. Initial web build was blocked by sandbox `spawn EPERM`; rerun with approved child-process access passed, retaining the existing >500 kB advisory. No API/database integration tests or model inference were run.
- Confirmed no queued/running workflows, rebuilt/recreated the runner with NVIDIA configuration and model cache preserved. Health confirms ready, CUDA, `generation_active: false`; a 256×256 Qwen validation-only request reaches the missing-reference check, confirming form dimension acceptance without loading a model. Qwen's peak-memory requirement and actual 256 inference remain unverified; rerun a saved workflow with the new resolution to check them.

## 2026-10-13 — Fix five-minute image-runner fetch failures

- Latest failed run's two Turbo nodes succeeded; its Qwen node failed with `fetch failed` after 5m04s while the runner remained healthy and continued processing. This strongly indicates Node fetch's default five-minute response-header timeout; the old run did not retain the underlying transport error code, so its exact cause cannot be proven retrospectively.
- Added a runner-scoped Undici client with explicit one-hour header/body timeouts and the existing one-hour overall deadline/worker cancellation. Added safe timeout, unavailable-runner, and connection-closed error summaries without submitted data. Multipart fields/reference ordering and output checks are preserved; no automatic retry was added. Added the Undici dependency and a `test:runner` script, and updated the runner README.
- Seven local HTTP/error regression tests, API typecheck/build, and `git diff --check` passed. Initial typecheck/build caught a native-vs-Undici FormData type mismatch; fixed by using Undici FormData consistently. Install reported five dependency audit findings; no audit fixes or unrelated dependency updates were applied (unrelated npm lockfile metadata changes were removed). No inference request or API integration test was run.
- Confirmed zero queued/running workflows, then restarted the runner to clear the disconnected request belonging to the already-failed run; health confirms ready with CUDA and no loaded pipeline. The watched development worker should pick up the client change; production workers need the rebuilt API/restart. The workflow can now be rerun. Qwen inference/GPU suitability remains unverified.

## 2026-10-13 — Select Qwen agent and node output resolution

- Exposed the shared Resolution selector for Qwen in agent and workflow-node forms, with the same five options as Z-Image-Turbo. Existing settings/snapshots already persist resolution and the worker already sends dimensions, so no migration was required.
- The runner now forwards width/height to the Qwen pipeline. Updated decision 0005 to explicitly replace automatic Qwen output sizing with the selected dimensions, and documented output/reference preprocessing separately in the runner README.
- Five web regression tests (including both shared form configurations) and six mocked Python runner tests passed; the runner tests cover all five dimensions for both pipelines. API/web typechecks and production builds plus `git diff --check` passed. Web build retains its existing >500 kB bundle advisory. The first new form-test run needed an explicit React import; sandbox child-process restrictions required rerunning the test with approved access. No API integration tests or inference request were run.
- Rebuilt/recreated the idle local runner with its NVIDIA override and preserved model cache; health confirms ready with CUDA and no loaded pipeline. Qwen reference preprocessing is unchanged, so reducing output resolution does not guarantee inference fits on the GPU.

## 2026-10-13 — Free current idle runner memory

- Confirmed zero queued/running workflows before restarting the local runner. Its startup Z-Image pipeline was still loaded, with container RAM use at 11.76 GiB and total GPU use at 645 MiB.
- Unloading after startup and glibc heap trimming did not reclaim most RAM on this runtime (about 12.1 GiB remained despite `pipeline_loaded: false`). Switched to loading weights only on generation and recreated the idle runner; health confirms ready with CUDA and no loaded pipeline. The next generation request performs model loading/validation. Added optional glibc heap trimming to normal cleanup; it is best-effort.
- Final runner RAM is 450.9 MiB, down from 11.76 GiB (about 11.3 GiB reclaimed). Total GPU use fell from 645 to 520 MiB; other desktop/runtime GPU use remains. Model disk cache and database/artifacts were preserved. No inference request was made.
- Five mocked Python cleanup/startup tests and `git diff --check` passed. Updated decision 0007, decision 0003, and runner README; no TypeScript checks were rerun for this Python-only change. Qwen's inference OOM remains unresolved; per-node cleanup may still leave runtime-held host memory until process recreation.

## 2026-10-13 — Release image-runner memory after every node

- The runner now encodes each PNG, closes temporary images, unloads the pipeline, collects unused objects, and clears unused CUDA memory before releasing the generation lock, on success and failure. Subsequent nodes reload from the existing disk cache, trading loading latency for lower retained memory.
- Idle health remains ready with `pipeline_loaded: false`. Startup model loading, workflow/artifact behavior, and model parameters remain unchanged. Recorded decision 0007 and updated the runner README and decision 0003.
- Three mocked Python tests (success cleanup/reload, inference failures, encoding failure) and four worker error regression tests passed; `git diff --check` passed. Rebuilt the local runner with the NVIDIA override and preserved cache. Initial readiness polling expired during model startup; a subsequent health probe confirmed ready with CUDA/8 GiB and the new `pipeline_loaded` field. No inference request made by this chat; no additional TypeScript build/typecheck was run for this Python-only change.
- A user-triggered retry captured by the existing diagnostics confirms Qwen CUDA `OutOfMemoryError` inside native attention. Per-node cleanup does not lower this step's peak memory requirement; successful Qwen inference remains unverified.

## 2026-10-13 — Diagnose Qwen inference HTTP 500

- Logs confirm Qwen downloaded and loaded, then failed before completing its first inference step. The original exception was swallowed and cannot be recovered from the existing logs. The RTX 2080 has 8 GiB VRAM; after failure, NVIDIA reported 7559 MiB in use. Memory exhaustion is suspected but not confirmed.
- Added fixed memory/generic failure codes, worker error guidance, and safe runner diagnostics (exception type and stack locations only). Failed pipelines are unloaded and unused CUDA memory cleared so later requests reload cleanly. Updated the runner README; no model or parameter policy changed.
- Four worker error regression tests and mocked Python failure-handling tests (CUDA OOM, host OOM, generic exception, log privacy, pipeline/cache cleanup) passed. API/web typechecks, API build, and `git diff --check` passed. Rebuilt/recreated the local runner with the NVIDIA override and preserved model cache; health confirms ready with CUDA and 8 GiB GPU memory. No inference request made; rerun the workflow to capture the precise underlying failure with the new diagnostics.

## 2026-10-13 — Preserve workflow execution order in run details

- Confirmed that the worker executes nodes serially in topological order. A node becomes ready only after all incoming edges have been satisfied, so all direct predecessors finish before their shared downstream node starts; a failure stops the run before dependent nodes execute.
- Extracted the worker's stable topological ordering into shared API logic and use the same ordering for run-detail agent steps and generated output previews. No database migration was needed.
- API/web typechecks, API build, and `git diff --check` passed. Automated tests were not run.

## 2026-10-13 — Fix multipart numeric dimension validation

- The remaining 422 was caused by declaring multipart `width`/`height` values as numeric `Literal` types; multipart values arrive as strings, so Pydantic rejected even valid values such as 512. Changed them to parsed integers and explicitly allow only the five supported resolution pairs.
- Rebuilt the runner with the NVIDIA Compose override. Health reports CUDA and 8 GiB GPU memory; a non-generating invalid-dimension probe reaches the intended `Unsupported image dimensions` validation, confirming numeric form parsing. API/web typechecks, API build, Python syntax validation, and `git diff --check` passed. No inference request was made; the workflow should now be rerun.

## 2026-10-13 — Diagnose repeated image-runner 422 responses

- Confirmed the rebuilt runner is healthy, sees CUDA, and advertises multipart form fields; the latest failed run still reaches it and fails on a Z-Image-Turbo node. Persisted node values inspected so far (512×512, 9 steps, short prompt) satisfy the published field constraints, so the precise invalid field is not retained in the old run record.
- Updated the worker to retain only safe FastAPI validation locations/messages in run errors, excluding submitted values and prompts. The watched worker should reload automatically; rerun once and inspect the node error for the specific rejected field if the 422 persists.

## 2026-10-13 — Rebuild stale image runner after request validation failure

- Diagnosed HTTP 422: the running local runner advertised the legacy JSON `/generate` schema, while the current worker sends multipart form data. Rebuilt/recreated the runner and restored the existing NVIDIA Compose override.
- Verified `/generate` now advertises `multipart/form-data`; `/health` reports ready with CUDA available and the RTX 2080's 8 GiB detected. No inference request was made; rerun the failed workflow from the UI to confirm its generation.

## 2026-10-13 — Preview workflow node outputs in run details

- Added an authenticated, owner-scoped inline image preview endpoint and image previews in the run detail modal, grouped and labeled by the producing workflow node. Existing download actions remain available.
- API/web typechecks and builds plus `git diff --check` passed. Automated tests were not run.

## 2026-10-13 — Add Qwen-Image-Edit-2511 workflow support

- Added Qwen-Image-Edit-2511 as an image model choice for agents and workflow nodes. Model-specific settings reuse the existing JSON parameters; no additional database migration was needed for this integration.
- Connected image-node outputs now become one to ten references to a Qwen edit node, ordered top-to-bottom then left-to-right on the canvas. The local runner switches between the Qwen and Z-Image-Turbo pipelines and validates uploaded references before loading/switching the model.
- Added the model's Apache 2.0 attribution to Licenses and recorded decision 0006. The model files are about 57.7 GB. Typechecks and `git diff --check` passed. Automated tests and Qwen inference were not run; the current host's ability to load/run this checkpoint remains unverified.

## 2026-10-13 — Configure image model parameters on agents and workflow nodes

- Added agent and per-node image settings for resolution, seed/randomize-seed, and inference steps. Workflow nodes initialize from selected agent settings; runs snapshot settings and persist a randomized seed before execution so retries reuse it.
- Updated the Z-Image-Turbo runner to accept the configured inference steps and added migrations `0009_chilly_iron_patriot` (agent/workflow settings and existing-image defaults) and `0010_lazy_miss_america` (run-node settings). Both migrations applied successfully to the configured local database.
- Recorded the parameter policy in decision 0005 and updated the orchestration data model. API/web typechecks and API/web production builds passed; Vite reports its existing >500 kB bundle advisory. `git diff --check` passed. Automated tests were not run. Docker Compose could not reach the Docker Desktop engine, so the updated runner container was not rebuilt; rebuild it before using custom step counts, and then run an image workflow to verify inference end to end.

## 2026-10-13 — Build run prompts from agent and node prompts

- Removed the prompt dialog from the workflow Run action; it now queues the saved workflow directly.
- The worker now composes model input from the agent prompt and workflow-node prompt, avoids duplicating identical defaults, and still accepts legacy run-level prompt snapshots.
- Run creation no longer requires a user prompt. Updated the orchestration design accordingly.
- API/web typechecks and builds passed; `git diff --check` passed. The existing Vite >500 kB bundle advisory remains. Automated tests were not run.

## 2026-10-13 — Use only the saved workflow-node prompt at execution

- Updated the worker to send only the saved workflow-node prompt to the model. The agent prompt remains the editor's initial value for a node and is not appended at execution.
- Legacy workflow snapshots still read their pre-rename `instructions` field as the node prompt.
- API typecheck/build and `git diff --check` passed. Automated tests were not run.

## 2026-10-13 — Show the selected model in agent modality labels

- Added a shared modality-label map so image agents display `Image (Z-Image-Turbo)` in the agent type selector, agent list, workflow agent picker/configuration/node, and run details.
- Kept stored modality values unchanged (`image`) to preserve API and database compatibility. Other modalities retain their generic names because no concrete runner model is configured for them yet.
- Web typecheck, production build, and `git diff --check` passed. Vite continues to report its known >500 kB bundle advisory.

## 2026-10-13 — Rename agent and workflow-node descriptions to prompts

- Renamed the reusable agent text to `prompt` in the database, API, and Agents UI. Renamed workflow node `instructions` and run-node snapshot text to `prompt`.
- Newly selected workflow agents initialize that node's prompt from the agent prompt; API saves also use the selected agent prompt when a node prompt is omitted. Migration `0008_fearless_centennial` preserves existing text and fills previously empty workflow-node prompts from their agent.
- Kept workflow metadata `description` as-is. Worker parsing remains compatible with snapshots created before this rename.
- API/web typechecks and builds passed; Drizzle reported no schema differences after migration generation; migration `0008_fearless_centennial` applied successfully to the configured local database. Confirmed the three prompt columns exist and existing agent/workflow-node prompt text was retained. `git diff --check` passed. Vite still reports the known >500 kB bundle advisory; automated tests were not run.

## 2026-10-13 — Launch and inspect workflow runs in the UI

- Added a saved-workflow Run workflow action with a prompt dialog, then queues the run through the existing owner-scoped workflow run API and navigates to Runs.
- Replaced the Runs placeholder with a paginated run history, polling for active runs, and a detail modal with per-node states, errors, and authenticated artifact downloads.
- Updated the orchestration design to reflect the initial run UI. API contracts and schema were unchanged.
- Web typecheck, production build, and `git diff --check` passed. The known Vite >500 kB bundle advisory remains. No automated tests were run. Next: connected input binding, modality adapters, cancellation, and run/artifact cleanup UX.

## 2026-10-13 — Execute image runs and store artifacts locally

- Added an API workspace worker that polls and claims durable runs, renews leases, resumes interrupted work, and limits worker-crash retries to three claims. The current runner adapter executes disconnected image nodes only; unsupported modalities and connected graphs fail clearly.
- Added an `artifacts` table and migration `0007_slim_silver_samurai`. The worker validates and stores PNG output under `.data/artifacts` (or `ARTIFACT_ROOT`), with 25 MB limit, checksum, and opaque keys. Authenticated artifact downloads and run-detail artifact metadata are available.
- Added `worker:dev` and production worker scripts. Updated the orchestration design and decision 0004.
- API typecheck/build, migration application, and `git diff --check` passed. Automated tests and a live model-generation run were not performed in this slice. Remaining: run submission/progress/artifact UI, graph input binding, more modality adapters, cancellation, and orphan-file cleanup.

## 2026-10-13 — Add durable run records and PostgreSQL queue foundation

- Added `runs` and `run_nodes` with owner constraints, queued/running/final statuses, workflow/agent snapshots, node states, attempt counts, and worker lease fields. Generated migration `0006_tricky_killer_shrike` and applied it to the configured local `hive` database.
- Added authenticated, owner-scoped run create/list/detail APIs. Creating a run locks and snapshots the saved workflow and agent metadata, then inserts its run and queued node rows in one transaction.
- Added atomic PostgreSQL queue claim and lease-heartbeat primitives using `FOR UPDATE SKIP LOCKED`; the actual polling worker and model execution handlers are still outstanding.
- Updated the orchestration design and recorded the database-backed queue decision in decision 0004. The Runs page remains a placeholder and artifacts are not implemented.
- API typecheck, API build, Drizzle schema-diff check, and `git diff --check` passed. Migration generation initially exposed an index/foreign-key ordering issue; the migration was corrected and applied successfully.

## 2026-10-13 — Add Z-Image-Turbo local runner proof of concept

- Added a standalone FastAPI/Diffusers runner with health and image generation endpoints, Dockerfile, dependency list, usage guide, a persistent Hugging Face cache volume, and an optional NVIDIA GPU Compose override.
- Confirmed Docker GPU passthrough on the development host (NVIDIA RTX 2080, 8 GiB). The runner automatically enables sequential CPU offload below 16 GiB and a 512x512 PNG generation request succeeded; the response was 322 KB.
- Initial model cache download used about 31 GB. The PyTorch/CUDA base layer was about 3.7 GB. Initial setup is therefore storage- and download-heavy.
- Recorded the runner architecture and local-development security boundaries in decision 0003. Workflow worker/queue integration is still outstanding.
- Validated CPU and NVIDIA GPU Compose configurations and `git diff --check`. Full Hive build/typecheck were not run because this change adds an independent Python inference service.

## 2026-10-10 — Add behavior checks and extract navigation state

- Added a root `npm test` command with navigation-state unit tests and workflow API integration coverage for graph save/load/replacement, cycle validation, database edge storage, and agent deletion constraints.
- Extracted hash routing and sidebar persistence/transitions into `src/navigation/navigationState.ts` and `useAppNavigation.ts`; `App.tsx` now composes the navigation hook with the view shell.
- Navigation tests, API integration tests, API/web typechecks, production build, and `git diff --check` passed. Integration tests use temporary records in the configured development database and clean them up. Vite continues to report its >500 kB bundle-size advisory.

## 2026-10-10 — Keep only the current workflow definition

- Replaced version-scoped graph storage with workflow-scoped node and edge tables. Workflow saves now replace the current graph transactionally, and the editor no longer shows version status.
- Added migration `0005_lush_toad_men` to preserve the latest saved graph for each workflow and remove workflow version tables and the counter. Updated agent usage checks and architecture/data-model documentation.
- API/web typechecks, production build, schema generation check, and migration application passed. Vite still reports the known bundle-size advisory above 500 kB.

## 2026-10-10 — Persist workflow node connections relationally

- Added `workflow_version_nodes` and `workflow_version_edges` alongside the existing immutable JSONB definition. Workflow saves now insert node settings, agent references, and source/target edges in the same transaction as each version.
- Added ownership and same-version endpoint foreign keys, plus a migration that backfills graph data from existing JSONB versions. Updated the data model and orchestration design and recorded the storage decision.
- API/web production build and `git diff --check` passed; migration `0004_salty_black_widow` applied successfully to the configured development database. Vite reports the existing >500 kB bundle-size advisory.

## 2026-10-10 — Persist sidebar collapse across workflow editor navigation

- Moved desktop sidebar state to the top-level app and made editor collapse temporary: the state is saved before entering a workflow editor, the editor opens collapsed, and the latest state selected in the editor is restored after leaving.
- Verified with the API/web production build and `git diff --check`. The build passes with Vite's >500 kB bundle-size advisory.

## 2026-10-10 — Workflow canvas and open-source notices

- Added `@xyflow/react` and replaced the Workflows placeholder with an interactive canvas preview: users can add, drag, connect, and delete agent nodes. Workflow persistence and agent binding remain unimplemented; the page identifies this clearly. The external starter-kit repository is a full app rather than an installable package, so its source was not copied.
- Added a public Licenses view linked quietly at the bottom of the side navigation. It includes MIT notices for the Chatbot Flow Builder Starter Kit reference and React Flow dependency, plus upstream source links, providing a pattern for future third-party entries.
- Added hash navigation for Licenses and kept it accessible while signed out.
- Verified with `npm --cache .npm-cache run build` and `git diff --check`. The build passes with Vite's existing >500 kB bundle-size advisory.

## 2026-10-10 — Workflow CRUD and node editor

- Replaced the single workflow canvas with a paginated, owner-scoped workflow library and a separate editing route. Users can create named/description workflows, edit details, and remove workflows with confirmation.
- Added authenticated workflow API endpoints to list, create, load, version-save, and delete workflows using the existing workflow and version tables. Saved graph definitions validate node/edge references, reject cycles, and record restrictive user-owned agent references.
- The editor collapses the side navigation and stores that preference locally. The full-width canvas includes add-node and confirmed remove-node actions; the right configuration pane selects an existing agent and stores per-node instructions. Agent name, modality, and description appear on each node.
- No schema migration was required because the workflow tables and ownership constraints already existed. Existing version references intentionally continue to prevent removal of an agent used in a saved workflow version.
- API/web production build passes; Vite reports its >500 kB bundle-size advisory. `git diff --check` verified. No automated tests were run.

## 2026-10-10 — Prevent deleting agents used by workflows

- Added workflow, immutable workflow-version, and workflow-version-agent reference tables. The agent foreign key uses `ON DELETE RESTRICT` so the database blocks deletion while any saved workflow version uses the agent.
- Added workflow-use counts to the agent list API and a `DELETE /api/agents/:id` route that rejects referenced agents with HTTP 409; the database constraint remains the race-safe final guard.
- Added remove icons to each agent row and the edit modal. Both show confirmation and disable removal when the agent is in use; the table shows workflow-use counts.
- Generated and applied migrations `0002_workflow_agent_references` and `0003_workflow_agent_ownership`. Composite foreign keys also prevent references across users.
- API/web typechecks, production build, and `git diff --check` passed. Vite reports its existing-style bundle-size advisory above 500 kB; no tests were run.

## 2026-10-10 — Separate agent removal confirmation

- Agent-list removal now opens only the dedicated confirmation modal; it no longer opens the create/edit modal first.
- The edit modal’s remove icon opens the same confirmation modal, stacked above the editor.
- Verified with the production build and `git diff --check`.

## 2026-10-10 — Preserve selected workspace view

- Synced Home, Agents, Workflows, and Runs to URL hash navigation so refresh restores the active view and browser history can move between views.
- Verified with the production build and `git diff --check`.

## 2026-10-10 — Public home and sign-in gated workspace

- Updated Home with a concise description of Hive’s AI orchestration purpose and a clear note about which capabilities are available versus planned.
- Hid workspace navigation and shortcuts while signed out. Direct links to Agents, Workflows, or Runs now render a sign-in gate instead of protected views.
- Added a sign-in CTA on Home and protected-view gates, reusing the header’s login modal.
- Verified with the production build and `git diff --check`.

## 2026-10-10 — Fix agent form input crash

- Capture name and description input values synchronously before updating React state, avoiding access to a cleared `currentTarget` inside deferred state updater callbacks.
- Verified with the production build and `git diff --check`.

## 2026-10-10 — Agent library CRUD

- Added an owner-scoped `agents` table with modality enum, name, description, timestamps, a per-user case-insensitive unique name index, and a pagination index; applied migration `0001_agents` to the local database.
- Added authenticated paginated list, create, read, and update API routes. Mutations require the configured web origin; duplicate names return a conflict response.
- Replaced the Agents placeholder with a paginated table and a shared create/edit modal. The UI supports Text, Image, Audio, and Video agents, and reports sign-in, duplicate-name, validation, and connection errors.
- Added an idempotent, account-scoped sample seed command and seeded one sample per modality for the sole existing local user. New users remain empty unless the seed command is run for them.
- Initially preserved the legacy `tasks` table discovered in the initial migration; migration `0013_free_charles_xavier` now removes it because the app does not use it.
- Verified API/web typechecks, the production build, migration application, and one seeded agent per modality in the local database. Vite reports a bundle-size advisory above 500 kB; no test suite was run.

## 2026-10-10 — Orchestration workspace navigation

- Added app navigation for Agents, Workflows, and Runs, with working Home shortcuts and cross-links between the workspace views.
- Added initial empty-state views that explain the planned agent catalog, versioned workflow graph, run progress, and artifact history.
- Added explicit Home shortcut buttons and cross-view buttons so Agents, Workflows, and Runs are reachable from related views.
- Creation actions remain disabled until the agent/workflow APIs, local model catalog, and run execution are implemented; no persistence is implied by these screens.
- Verified with `npm --cache .npm-cache run build` and `git diff --check`.

## 2026-10-10 — AI orchestration MVP design

- Added `docs/ORCHESTRATION_MVP_DESIGN.md` describing a proposed MVP architecture, data model, local inference options, artifact storage, execution, security, and delivery sequence.
- Recommended a browser control plane with an authenticated API, durable worker queue, isolated allow-listed local model runners, PostgreSQL metadata, and persistent local artifact storage for a single-host POC.
- This is design only; no runtime, schema, or product behavior has been implemented. Hardware target and model/license selection remain open.

## 2026-10-10 — Slate Sky visual theme

- Applied Slate Sky as the app's dark Mantine theme, with lighter developer-tool surfaces and a restrained sky-blue accent.
- Centralized palette, typography, spacing, radii, shadows, and shared component defaults in `apps/web/src/theme.ts`.
- Simplified Home into a flatter, more compact layout; preserved AppShell navigation and Google authentication behavior.
- Verify with the web production build and inspect the running browser view.

## 2026-10-13 — Show account credentials in header

- Replaced the signed-in profile image in the header account-menu trigger with the user's name and email. The existing account menu and logout behavior remain available.
- No tests run; small presentation change. Typecheck not run.

## 2026-10-13 — Crop account profile photo to a circle

- Restored the top-right profile photo in the account menu trigger and set circular cropping with centered cover sizing. Name and email remain in the account dropdown.
- No tests run; Docker Desktop was unavailable for a live local rebuild.

## 2026-10-13 — Add subtle avatar border

- Added a one-pixel gray token border to the circular profile photo.

## 2026-10-13 — Theme avatar border and show active view in header

- Changed the profile photo border to the existing hiveSky theme token. Replaced the static header tagline with the current navigation title, including on mobile.
- Production build runs through the local launcher; no separate test suite run.

## 2026-10-13 — Show run and agent step timing

- Added live elapsed minutes and seconds for running workflow runs and agent steps, using the existing start timestamps. Terminal runs and steps show their elapsed duration and localized finish date/time; queued work shows that it is waiting to start.
- No schema or migration change; timing fields were already stored. Production build runs through the local launcher; no separate test suite run.

## 2026-10-13 — Simplify run duration column heading

- Renamed the run history column heading to “Duration”; elapsed and finish details remain in its values.

## 2026-10-13 — List Z-Image-Turbo model license

- Added Z-Image-Turbo model weights to the in-app licenses page as Apache License 2.0, with links to the Hugging Face model and license sources.
- Verified the model card identifies its license as Apache 2.0. Production build runs through the local launcher; no separate test suite run.

## 2026-10-13 — Split workflow UI and domain logic

- Split the workflow library and editor into route-level components with local state, preserving hash navigation and existing interactions. Shared UI workflow types now live in a dedicated module.
- Moved workflow request schemas and agent/model/connection validation into `workflowDefinition.ts`. Moved immutable run and run-node snapshot mapping into `workflowRunSnapshot.ts`; HTTP routes retain request handling and transactional persistence.
- Production TypeScript/Vite build and `git diff --check` passed. No separate test suite run. One run was active, so the running containers were not restarted; the updated app image was built without interrupting it.
