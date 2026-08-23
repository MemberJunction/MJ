---
"@memberjunction/integration-engine": patch
---

`SaveRecordMap` skips the write when the map row already points at the same MJ record — the common case on every incremental sync, where the Load + Save it always did were two extra round trips per synced record to change nothing (plus a meaningless `__mj_UpdatedAt` bump on every map row). The batched writer (`RecordMapBatch.flushChunk`) has always skipped this case; the per-record fallback now agrees with it. A row pointing at a *different* MJ record is still rewritten. A new covering index `(CompanyIntegrationID, EntityID, ExternalSystemRecordID) INCLUDE (EntityRecordID)` serves the upsert lookup, the batched chunk read, and the orphan-sweep paging without a key lookup (T-SQL migration; the PG counterpart follows the repo's build-engineer transpilation flow).
