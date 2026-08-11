---
"@memberjunction/integration-engine": minor
"@memberjunction/core-entities": minor
"@memberjunction/schema-engine": minor
"@memberjunction/server": minor
---

Durable sync runs: lease/fence run ownership, DB-backed cancellation and progress, and an opt-in worker mode.

A sync run is now owned by exactly one process for the life of its lease. `MJ: RSU Pending Work` records the queue, and each run carries an owner token, lease expiry, heartbeat, and fence token, so a stalled or killed process releases its work instead of stranding it, and a resumed process cannot write through a newer owner's fence. Cancellation and progress move through the database rather than in-process state, so either is observable and actionable from any process. The engine no longer shares a single provider across concurrent runs — each run carries its own through an `AsyncLocalStorage` context — and run history is pruned to `MJ_INTEGRATION_MAX_RUNS_PER_CI`.

RSU post-restart work moves the same way: `RuntimeSchemaManager` now registers it as `MJ: RSU Pending Work` rows instead of `.rsu_pending` files that were deleted as they were read, so a crash mid-consumption leaves visible, resumable work rather than losing it silently. Registration failures are reported on the pipeline result — a migration whose post-restart work never persisted no longer reports success, since the restart discards that work.

**Additive on the public API.** Reading progress and requesting cancellation now hit the database, which cannot be done from a synchronous method, so they ship under new names: `IntegrationEngine.GetSyncProgressAsync()` and `IntegrationEngine.CancelSyncAsync()`. The three published statics they supersede — `GetSyncProgress`, `CancelSync`, `GetAllSyncProgress` — keep their exact original signatures so a consumer taking this minor upgrade still compiles. They are marked `@deprecated` and are no longer functional, because the in-process map they read no longer exists; each logs once naming its replacement, and each returns the value that previously meant "nothing to report" (`undefined`, `false`, empty map) rather than pretending to have succeeded.

`RuntimeSchemaManager`'s pending-work entry points follow the same rule, since it too is exported from a published package. `ReadAndClearPendingWork()` keeps its zero-argument signature, warns once, and returns an empty array. `WritePendingWork(data)` keeps compiling — its new `contextUser` parameter is optional — but the one-argument form throws rather than returning a fabricated ID, because a durability queue that silently discards work is worse than one that fails loudly. Both replacements, `ReadPendingWork()` and `WritePendingWork(data, contextUser)`, are named in the messages.
