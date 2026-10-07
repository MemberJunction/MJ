---
"@memberjunction/core": patch
"@memberjunction/testing-integration": patch
---

A transaction group now updates each cached result set once for the whole group instead of once per row. `TransactionGroupBase.Submit` runs the item callbacks and the outcome notification — where each entity in the group raises its save or delete event — inside an entity-event batch for every provider the group's entities use. On a shared cache this means one published message per affected result set rather than one per row: a group of 40 `MJ: AI Models` updates went from 40 messages (12.2 MB) to 1 (0.3 MB). A group that does not fully succeed invalidates the affected result sets instead of applying part of it. Browser-side groups get the same batching.

`Submit()` now waits for that cache maintenance before it resolves, where per-row maintenance used to run without waiting: one wait per provider per group, including any wait on a shared cache's cross-process lock, the same as `BeginEntityTransaction`. Batches are keyed by provider, so a save raised for the same provider while the group's callbacks run joins its batch, and is invalidated rather than applied if the group fails. In a browser, where every entity shares one provider, that can include an unrelated save made in that window; it reloads on its next read.

`BaseEngine` no longer rewrites its own cached result set for an event a batch already took: `LocalCacheManager.WasTakenByEntityEventBatch(event)` reports it, so an engine whose update lands after the batch has closed leaves the slot to the batch.

`InstrumentedLocalStorageProvider` gains `SetCountForKey(key)`, the number of writes to a single cache key.

The per-row cache-invalidation messages MJAPI pushes to connected browsers are unchanged.
