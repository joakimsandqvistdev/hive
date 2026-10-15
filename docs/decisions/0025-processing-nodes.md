# Decision 0025: Built-in processing nodes

Date: 2026-10-15

## Decision

Workflows support `processing` nodes alongside input and downloaded model nodes. Processing operations have static typed input/output contracts, validated settings stored in the existing node parameters JSON, and execute in the worker without a model download or model runner request.

The first operation is **Text Overlay**. It accepts one image and one text input and emits a PNG. The user can configure one of the bundled Liberation Sans/Serif/Mono families, font size and weight, hex color, nine placements, text alignment, margin, and line spacing. Hive renders the overlay locally with Sharp and system fonts installed in the app image. Generated images use existing owner-scoped run artifacts and cleanup behavior.

The workflow picker groups these built-in operations under **Processing**, leaving the category open to future deterministic operations such as image/audio cropping and logic gates. Operations do not enter the downloadable model catalog.

## Consequences

The persisted workflow node kind constraint accepts `processing`; no new tables or artifact formats are needed. The API and editor both define the initial static Text Overlay port contract, while the API validates the operation settings before saving or queueing. The worker executes the operation in dependency order, so outputs can feed later nodes and scheduled jobs.
