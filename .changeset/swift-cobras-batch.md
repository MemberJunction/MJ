---
"@memberjunction/core": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/redis-provider": patch
---

Add `GetItems<T>(keys, category?)` batched read to `ILocalStorageProvider`. IndexedDB implementation uses a single read transaction with N parallel `get()` calls; Redis uses one `MGET` command. Used internally by `LocalCacheManager.GetRunViewResults` to batch the smart-cache-check warm-load reads (eliminating ~85 sequential per-key IDB transactions per coalesced engine bundle), the dataset-cache load (eliminating 3 redundant data-key reads per cached dataset access), and the metadata-snapshot bootstrap (3 keys → 1 batched read). Also fixes `IsDatasetCached` to probe via the tiny `_date` key instead of pulling the multi-MB dataset blob just for an existence check. No on-disk schema change; no version bump needed for the IDB schema. 28 new unit tests cover generic contract behavior, IDB single-transaction verification, and Redis MGET semantics including per-key error tolerance and deduplication.
