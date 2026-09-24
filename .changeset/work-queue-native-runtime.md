---
"@memberjunction/work-queue-engine": minor
"@memberjunction/work-queue-server": minor
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
"@memberjunction/cli": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
---

Add the durable work queue's native runtime: `BaseWorkHandler` and ClassFactory handler resolution, the in-process `WorkQueueHost` (long-running and one-shot `RunOnce`), the `WorkQueueSweeper` (lease expiry, dead-lettering, retention purge under the sweep lock), the operator service and the seven `WorkQueue.*` Remote Operations with their metadata, the MJServer `workQueue` configuration section that starts the host after listen, the `@memberjunction/work-queue-server` REST publish extension (`POST /work-queue/topics/{topic}/messages`, API-key only, scope checked before the body is read), the `mj queue` CLI commands (stats, dead-letters, partitions, replay, discard, backlog, work, export-topology, import-bindings, validate-bindings), the bootstrap manifest registrations, the `workqueue:*` scope grants for the MJAPI application, and the IT95 integration bundle.
