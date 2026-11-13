---
"@memberjunction/core-entities-server": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/server-bootstrap": patch
"@memberjunction/server-bootstrap-lite": patch
---

Editing an active scheduled job's cron or time zone now moves its `NextRunAt` to the new schedule. Before, the job kept the `NextRunAt` computed from the old schedule, so the new one took effect only after one more run. The new `MJScheduledJobEntityServer` recomputes it on save. A `NextRunAt` the caller sets on the same save still wins, and new jobs are still seeded by the scheduler. The Integration schedules screen no longer sets `NextRunAt` to now on every save, so saving a schedule no longer starts a sync right away.
