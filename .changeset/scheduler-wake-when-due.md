---
"@memberjunction/scheduling-engine-base": patch
"@memberjunction/scheduling-engine": patch
"@memberjunction/server": patch
---

The scheduler wakes only when a job is due: the poll timer is armed for the next due time (at most `scheduledJobs.routineIndexRefreshMinutes`, default 60), and the User Routine Dispatcher runs only when a user routine is due or needs seeding, so an idle MJAPI with scheduled jobs on lets a serverless database pause (#6217).
