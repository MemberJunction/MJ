---
"@memberjunction/scheduling-engine": patch
---

The scheduler no longer runs a job a second time while it is still running, or straight after it finishes.

- `DispatchScheduledJobs` skips a job whose run this process is still tracking. A mid-run reload (any `ScheduledJob` save fires `OnJobChanged` → `Config(true)`) brings back the running job's pre-run `NextRunAt`, so the job read as due on every tick: it contended for its own lock, a `Queue`-mode job got a Cancelled "queued" run per tick, and a `Skip`-policy run that outlasted its next occurrence had its row full-saved mid-run.
- When a run finishes, its statistics and new `NextRunAt` are applied to the live `ScheduledJobs` entry as well as to the object the run started with. After a mid-run reload, the live entry kept the pre-run `NextRunAt`, and the next tick ran the job again. On a production tenant, a nightly sync started a second run 9 seconds after the first one completed.
- When the lease sweep reclaims a hung run, it counts the run as failed and moves the job to its next occurrence. Before, the same tick dispatched the job again, and so did every lease interval after it. A run is counted once: a hung run that settles later is not counted again, and a run that finished just as the sweep looked is not counted as failed.
