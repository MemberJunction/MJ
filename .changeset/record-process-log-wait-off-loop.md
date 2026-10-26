---
"@memberjunction/global": patch
"@memberjunction/core": patch
"@memberjunction/record-set-processor-base": patch
"@memberjunction/record-set-processor": patch
---

Record Processes that run an Action per record are fast again (#6045). Since #6027 each record waited in the loop until its Action Execution Log row was inserted and updated, which made runs of fast actions up to 13x slower. The wait now lives in the queued Process Run Detail write instead: `ActionRecordProcessor` passes the log row's promise on as `RecordResult.ActionExecutionLogPersisted`, and `GenericProcessRunTracker` saves the detail with the new `BaseEntitySaveQueue.InsertWhen`, so the detail row still never reaches the database before its log row, and the loop moves on at once. `KeyedSerialTaskQueue.Enqueue` gains a `ready` option that holds a task back until a promise from outside the queue settles; `Flush` still waits for it.
