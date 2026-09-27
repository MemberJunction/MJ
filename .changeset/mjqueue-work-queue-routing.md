---
"@memberjunction/queue": minor
"@memberjunction/work-queue-legacy-bridge": minor
---

Repair `QueueTask.Status` (accepts `'Pending'`, widened to `nvarchar(20)`), fit `QueueManager.CreateQueue` process
fields to their columns so a queue row saves on Linux, enqueue Entity AI Actions as serialisable record references, add
`QueueBase.ExecuteTask` and a routing seam (`LegacyQueueRouterRegistry`). The new
`@memberjunction/work-queue-legacy-bridge` package lets each legacy queue type opt in to durable processing on the work
queue through a seeded (disabled) `mjqueue.<type>` topic handled by `MJQueue.LegacyQueueDriver`.
