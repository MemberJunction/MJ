---
"@memberjunction/core": patch
"@memberjunction/generic-database-provider": patch
---

Fire-and-forget saves queued through `BaseEntitySaveQueue` no longer join the enqueuer's transaction. With a durable submitter registered, an After* `Durable` Entity Action runs inside the save's transaction (#6198), and ActionEngine's "Submitted for durable execution" log row was queued from there. The queued save inherited the caller's transaction membership, reached SQL behind the save's COMMIT, and was rejected (`The ambient transaction ended before this query ran`), so the run left no Action Execution Log row (#6251, EA6). The queue now runs each save through the new optional `IEntityDataProvider.RunOutsideAmbientTransaction`, which `GenericDatabaseProvider` implements, so the write runs on the pool and commits on its own. This applies to every `BaseEntitySaveQueue` user: action execution logs, agent run steps and AI prompt runs.
