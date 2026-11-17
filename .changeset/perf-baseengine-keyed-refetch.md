---
"@memberjunction/core": patch
---

BaseEngine: a remote invalidation without row data re-reads only the rows its events named (one keyed RunView per coalesced round, up to `BaseEngine.KeyedRefetchMaxKeys`, default 200) and applies them in place, instead of reloading the whole config. Configs with an `OrderBy`, datasets, composite keys, events without a key, and failed keyed reads still reload in full. A keyed read that finishes after a full reload began is discarded in favour of a reload, and rows are applied to a copy of the held array.
