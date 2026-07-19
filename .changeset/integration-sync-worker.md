---
"@memberjunction/integration-sync-worker": minor
---

New optional out-of-process integration-sync worker. Runs the same `SchedulingEngine` + `IntegrationSyncScheduledJobDriver` as MJAPI but in a standalone process (no Apollo/GraphQL), claiming scheduled syncs via the existing DB-atomic lease and propagating writes through the Redis `remote-invalidate` bus. Opt-in via `scheduledJobs.enabled=true` on the worker + `false` on MJAPI; if the worker isn't deployed, in-process behavior is unchanged.
