---
"@memberjunction/core": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/actions": patch
---

ActionEngine's execution-log saves no longer join the transaction they were queued from. With a durable submitter registered, an After* `Durable` Entity Action runs inside the save's transaction (#6198), and ActionEngine queued its "Submitted for durable execution" log row from there. The queued save inherited the caller's transaction membership, reached SQL behind the save's COMMIT, and was rejected (`The ambient transaction ended before this query ran`), so the run left no Action Execution Log row (#6251, EA6). `BaseEntitySaveQueue` gains an opt-in `detachFromTransaction` option that runs each save through the new optional `IEntityDataProvider.RunOutsideAmbientTransaction` (implemented by `GenericDatabaseProvider`), so the write runs on the pool and commits on its own. Only ActionEngine's log queue turns it on; other queues (agent run steps, prompt runs, process run details) keep joining the caller's transaction, since their owners flush them before commit and their rows reference rows that transaction wrote.
