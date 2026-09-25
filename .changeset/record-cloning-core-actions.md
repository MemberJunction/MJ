---
"@memberjunction/core-actions": minor
---

Add the `Clone Record` and `Clone Records` actions, thin wrappers over the record-cloning engine. `Clone Records` requires the `Clone Records: Batch` authorization, clones each root in its own transaction, and reports per-record results (`PARTIAL` when only some succeed). Both honor `DryRun`.
