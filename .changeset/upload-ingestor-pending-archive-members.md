---
"@memberjunction/content-pipeline": patch
---

Require `ExtractionStatus === 'Complete'` in `ContentUploadIngestor` before advancing items to `Segment` and `Tag` during `RunNow` uploads so deferred archive members stay `Pending`, and log load or save failures instead of throwing in `markItemsFailed`.
