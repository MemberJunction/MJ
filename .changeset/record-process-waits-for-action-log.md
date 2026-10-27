---
"@memberjunction/global": patch
"@memberjunction/core": patch
"@memberjunction/actions-base": patch
"@memberjunction/actions": patch
"@memberjunction/record-set-processor": patch
---

A Record Process that runs an Action per record no longer loses a record's Process Run Detail row to `FK_ProcessRunDetail_ActionExecutionLog`. The Action engine writes its log row fire-and-forget, so a fast Action let the detail INSERT reach the database first. `ActionResult.LogEntryPersisted` now resolves once the log row's queued writes have settled, and `ActionRecordProcessor` waits for it before it reports the record's result. The new `KeyedSerialTaskQueue.Settled(key)` and `BaseEntitySaveQueue.Settled(entity)` let a caller in one queue wait for a write in another.
