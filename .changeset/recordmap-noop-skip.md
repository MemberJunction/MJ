---
"@memberjunction/integration-engine": patch
---

One covering index for every record-map lookup, and a per-record write path that matches the batched one.

Every access path to `CompanyIntegrationRecordMap` resolves a row by `(CompanyIntegrationID, EntityID, ExternalSystemRecordID)` — `RecordMapBatch.readExisting` on the hot path of every sync, `LoadAllRecordMaps` for the orphan sweep, and `SaveRecordMap`'s upsert lookup. The table carried only its two single-column auto-FK indexes, so each read picked one and key-looked-up the rest, once per record per sync on a table holding a row for every record ever synced. A composite with `INCLUDE (EntityRecordID)` serves all three with no key lookup.

Separately, `SaveRecordMap` now applies the rule `RecordMapBatch.flushChunk` has always applied: when the row already maps this external ID to this MJ record, return without loading or saving. A row pointing at a *different* MJ record is still loaded and rewritten, and a missing row is still created — only the genuine no-op is skipped.

Scope note: the apply loop builds a `RecordMapBatch`, so the ordinary incremental path was already filtered and never paid the per-record cost. `SaveRecordMap` is reached from call sites outside the apply loop and as the batch's own per-record fallback when a set-based write fails — which is where it mattered most, since that fallback degraded into two round trips per record.
