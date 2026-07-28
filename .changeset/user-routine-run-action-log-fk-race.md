---
"@memberjunction/actions": patch
"@memberjunction/scheduling-engine": patch
---

Fix a race that could strand a User Routine run at `Status = 'Running'` forever.

`ActionEngineServer.StartActionLog` fire-and-forgets the action log's 'started' INSERT so an action
never sits behind a DB round trip, returning immediately because `NewRecord()` assigns the primary
key client-side. The ID is therefore *valid* before the row *exists*. That is safe for the log's own
later UPDATE — the save queue chains same-key work — but **not** for a different row taking a foreign
key to it.

`MJ: User Routine Runs.ActionExecutionLogID` is exactly such an FK.
`UserRoutineDispatcherDriver.finalizeRunRow` wrote it as soon as the action returned, so when the
log INSERT had not yet landed the write was rejected by
`FK_UserRoutineRun_ActionExecutionLog`. Because `BaseEntity.Save()` returns `false` rather than
throwing, and the failure was only logged, the run row kept its pre-finalize state: `Status`
`'Running'`, `CompletedAt` null, no result — permanently, for a routine that had in fact completed.

Two changes:

- `ActionEngineServer` gains **`FlushActionLogs()`**, which awaits the queued log writes. The
  dispatcher calls it before persisting `ActionExecutionLogID`. (The queue already had `Flush()` and
  an `InsertAfter(entity, dependency)` documented for FK ordering — the dispatcher simply had no way
  to reach them, since the queue is private.)
- `finalizeRunRow` no longer swallows the failure. If the save still fails while linking the log, it
  logs loudly, drops the FK, and retries — the run's own terminal state (`Status`, `CompletedAt`,
  result) is worth more than a convenience link, and an accurate row beats one stuck mid-flight.

This is a **timing** bug, not a platform one: the constraint is identical on both backends and the
same code path runs on each. It was found by the new blocking PostgreSQL integration lane (#3257),
where the tighter timing made it near-deterministic; on SQL Server it fails intermittently and had
been winning the race. Worth noting for anyone re-testing: the dispatcher's `NotifyCondition:
'Always'` path happened to mask this, because it saves the run a second time to set
`NotificationSent` — by then the INSERT has landed and the row is repaired. Only the `OnChange`
path with an unchanged hash left the damage visible.
