---
"@memberjunction/metadata-sync": patch
---

Fix `mj sync push` treating a record created earlier in the same push as missing when a later file addresses it by `primaryKey`. On a preload-cache miss, `SyncEngine.LoadEntity` now confirms against the database on the push's own provider (which sees the open transaction's rows) instead of returning `null`.
