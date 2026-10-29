---
"@memberjunction/core": minor
"@memberjunction/generic-database-provider": minor
"@memberjunction/actions-base": minor
"@memberjunction/actions": minor
"@memberjunction/task-graph": minor
"@memberjunction/work-queue-core": minor
"@memberjunction/work-queue-base": minor
"@memberjunction/work-queue-engine": minor
"@memberjunction/server": minor
---

Enable durable `WorkQueue` Database transport by default in `MJServer`, defer `NotifyPublished` and `KickTaskGraphDispatchers` onto `RunAfterCommit`, add `ExhaustionBehavior: 'DeadLetter' | 'Discard'` for ordered partitions, and enlist `DurableEntityActionRegistry` submissions atomically inside `entity.Save()`'s SQL transaction.
