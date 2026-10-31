---
"@memberjunction/core": minor
"@memberjunction/content-pipeline-base": minor
"@memberjunction/content-pipeline": minor
"@memberjunction/content-autotagging": minor
---

Add an `Upload` content source type for content an application pushes instead of the pipeline discovering it. `ContentUploadIngestor.Ingest` takes a stored `MJ: Files` row (plus an optional origin record, linked through `MJ: Entity Record Documents` using `CompositeKey.ToCompactURLSegment()` so search's origin check applies) and creates the Content Item with `URL = upload://<FileID>` and `CallerTitle` confidence on `Name`, then can run Extract, Segment, Tag, and Embed in order for that item; `Remove` detaches `FileID` on the root `upload://<FileID>` row and marks the item, its descendants, and their chunks for deletion. Discover and Sync skip push-only sources instead of failing, so uploaded items are never treated as orphans. Delete treats a stored file as the caller's if and only if the item's locator is `upload://<FileID>` (push-only sources get no special case and there is no "keep when unsure" path; items moved onto an Upload source must be re-ingested through `ContentUploadIngestor` so they receive the `upload://` locator, otherwise their file is treated as a pipeline copy). Embed skips a read-only vector index instead of retrying.
