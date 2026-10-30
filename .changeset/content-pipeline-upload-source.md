---
"@memberjunction/core": minor
"@memberjunction/content-pipeline": minor
"@memberjunction/content-autotagging": minor
---

Add an `Upload` content source type for content an application pushes instead of the pipeline discovering it. `ContentUploadIngestor.Ingest` takes a stored `MJ: Files` row (plus an optional origin record, linked through `MJ: Entity Record Documents` so search's origin check applies) and creates the Content Item, then can run Extract, Segment, Embed and Tag for that one item; `Remove` marks it for deletion. Discover and Sync now skip push-only sources instead of failing, so uploaded items are never treated as orphans. Delete removes a stored file only when the pipeline made it (an `upload://` item or a push-only source is the caller's), and keeps the file whenever ownership can't be confirmed. Embed skips a read-only vector index instead of retrying.
