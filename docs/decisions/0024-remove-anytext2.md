# Decision 0024: Remove AnyText2 from Hive

AnyText2 is removed from the model catalog and workflow system because its editing workflow does not fit the desired source-image-plus-text experience. Existing AnyText2 workflows and jobs are deleted, and their generated run artifacts are cleaned up. Uploaded source assets are preserved.

The dedicated runner, model cache, and AnyText2-specific API, worker, frontend, Compose, and documentation code are removed. Migration `0023_remove_anytext2` removes the catalog record. The earlier integration record in decision 0023 is retained as history and is superseded by this decision.
