---
"@memberjunction/scheduling-engine": minor
---

Scheduling engine: a job switched from Disabled to Active while the server is running now
gets its `NextRunAt` seeded at once (through the new targeted `spSetScheduledJobNextRunAt`
sproc, so live locks are never overwritten) and becomes due on its next cron tick. Before,
a null `NextRunAt` was never due, so an activated job silently waited for a restart.
