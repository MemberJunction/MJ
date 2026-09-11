---
"@memberjunction/integration-engine": patch
---

Discovery no longer caps a sampled string width at 4000 when the doubled measurement exceeds it (returns MAX, and `MergeLength` treats MAX as unbounded); fixes that lived only in a deployed patch set — the two-pass first-discovery heal, the run-boundary watermark pin, the prefetch-cache leak — are in source with pinning tests; a relative import without `.js` is a guarded boot error.
