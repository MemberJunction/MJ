---
"@memberjunction/core": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/actions-base": patch
"@memberjunction/actions": patch
"@memberjunction/task-graph": patch
"@memberjunction/work-queue-core": patch
"@memberjunction/work-queue-base": patch
"@memberjunction/work-queue-engine": patch
"@memberjunction/server": patch
---

Enable durable `WorkQueue` Database transport by default in `MJServer`, defer `NotifyPublished` and `KickTaskGraphDispatchers` onto `RunAfterCommit`, add `ExhaustionBehavior: 'DeadLetter' | 'Discard'` for ordered partitions, and enlist `DurableEntityActionRegistry` submissions atomically inside `entity.Save()`'s SQL transaction.
