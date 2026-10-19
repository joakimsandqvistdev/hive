# Decision 0025: Built-in processing nodes

Date: 2026-10-15

## Decision

Workflows support `processing` nodes alongside input and downloaded model nodes. Processing operations have static typed input/output contracts, validated settings stored in the existing node parameters JSON, and execute in the worker without a model download or model runner request.

The first operation is **Text Overlay**. It accepts one image and one text input and emits a PNG. Its fixed Google Fonts catalog is bundled as metadata; selected font binaries are downloaded from the catalog's Google Fonts CDN URLs on first use and cached locally for both API previews and worker output. Configuration supports each family's available static weights/styles or variable font axes, plus size, color, outline, shadow, decoration, placement, alignment, margin, line spacing, and an optional square-cornered full-width background strip with configurable color, opacity, and vertical padding. The strip is disabled by default so existing workflows retain their rendering. The editor can render a temporary preview with directly connected input nodes without starting a workflow run. Users can save typography, strip, and placement settings as account-scoped defaults for newly added Text Overlay nodes; node names are never part of those defaults. Generated images use existing owner-scoped run artifacts and cleanup behavior.

The workflow picker groups these built-in operations under **Processing**, leaving the category open to future deterministic operations such as image/audio cropping and logic gates. Operations do not enter the downloadable model catalog.

## Consequences

The persisted workflow node kind constraint accepts `processing`; no new tables or artifact formats are needed. The API and editor both define the initial static Text Overlay port contract, while the API validates the operation settings before saving or queueing. The worker executes the operation in dependency order, so outputs can feed later nodes and scheduled jobs.
