---
"@memberjunction/integration-engine": patch
---

Discovery no longer caps a sampled string width at 4000 when the doubled measurement exceeds it (returns MAX, and `MergeLength` treats MAX as unbounded); fixes that lived only in a deployed patch set — the two-pass first-discovery heal, the run-boundary watermark pin, the prefetch-cache leak — are in source with pinning tests; a relative import without `.js` is a guarded boot error. A keyset scan whose page hits the fetch timeout is suspended for the run (no retry, no page-skip re-request stacked on the abandoned attempt) and resumes from its persisted key next run, where the page is retried; the record-map and run-detail saves enrol in an active write group like the entity saves.
