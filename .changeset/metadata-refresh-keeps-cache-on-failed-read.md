---
'@memberjunction/core': patch
'@memberjunction/generic-database-provider': patch
---

fix: a failed metadata dataset read no longer replaces loaded metadata with an empty set, and a member-change refresh waits for the ambient transaction

`GetDatasetByName` treated a thrown data batch as an empty result: every uncached item reported Success with zero rows, the empty rows were written through to the cache, and for `MJ_Metadata` the provider installed a metadata cache with no entities, after which every `EntityByName` in the process failed until restart. A batch failure now fails the affected items and the dataset, carrying the error in `Status`, and caches nothing. `GetAllMetadata` additionally refuses an `Entities` item with no rows, keeping the metadata already loaded. The debounced refresh that runs after a write to a metadata-member entity is timer-driven and could fire while the same provider was committing an ambient transaction, putting the metadata batch on the transaction's connection alongside the COMMIT (tedious `EINVALIDSTATE` / `ECLOSE`, never retried); it now waits for the transaction to end and runs on the pool. Fixes MJ#4486; the residual commit window itself remains MJ#4454.
