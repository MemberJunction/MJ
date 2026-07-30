---
"@memberjunction/integration-engine": minor
"@memberjunction/core-entities": minor
"@memberjunction/schema-engine": minor
"@memberjunction/server": minor
---

Durable sync runs: lease/fence run ownership, DB-backed cancellation and progress, and an opt-in worker mode.

A sync run is now owned by exactly one process for the life of its lease. `MJ: RSU Pending Work` records the queue, and each run carries an owner token, lease expiry, heartbeat, and fence token, so a stalled or killed process releases its work instead of stranding it, and a resumed process cannot write through a newer owner's fence. Cancellation and progress move through the database rather than in-process state, so either is observable and actionable from any process. The engine no longer shares a single provider across concurrent runs — each run carries its own through an `AsyncLocalStorage` context — and run history is pruned to `MJ_INTEGRATION_MAX_RUNS_PER_CI`.
