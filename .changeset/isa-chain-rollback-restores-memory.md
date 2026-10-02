---
"@memberjunction/core": patch
---

A failed IS-A chain save or delete now leaves every level of the chain as it was before the call.

Each parent in the chain is finalized as saved and clean when its own write returns, before the leaf writes and the chain commits. When the leaf's write, its validation or the commit then failed, the transaction rolled back, but the parent objects still said they were saved. A new chain's retry updated a parent row that no longer existed, and an edited chain's retry skipped the parent's edit, returned true, and lost it.

- The IS-A initiator captures the chain before the parents save. On every failure path (a parent's save fails, the leaf's write fails or throws, the commit throws) it puts back what the rolled-back writes changed in memory. Each finalized level gets back its saved and loaded flags, its result history, and each field's value and dirty-tracking state. A field edited while the save was in flight keeps the edit, compared with the pre-save baseline.
- The same holds on the client, where `GraphQLDataProvider` records each parent's save in memory and sends the chain in the leaf's one mutation.
- Nothing is put back where the parents' writes were not undone: inside a `TransactionGroup`, or on a provider that reports entity transactions but opened no scope.
- A leaf whose commit failed after an earlier failed attempt now records the failure. `finalizeSave()` empties the result history, and a save records its failure only when the history is as long as when the save started, so that failure went unrecorded and `LatestResult` was null.
- A chain delete had the same problem the other way round. Each parent was reset with `NewRecord()` as soon as its own delete returned, so after a rollback the parent read as a new record under a new key, its link to the leaf was gone, and the retry failed. A chain delete that holds a transaction is now a unit of work: every record it deletes, including the records a parent's related-record collections delete, is reset only once it commits. A rollback leaves each one saved, under the same key and still linked. Without a transaction (the client) nothing rolls back, and each level resets as its delete returns, as before.
- A failed chain delete is now recorded on the leaf. Once the leaf's own row was deleted, its history held the provider's entry for that delete, so a parent's failure and a failed commit went unrecorded and the caller read a failure with no reason. A parent's failure now reads `Failed to delete parent entity '<name>': <reason>`, and a failed commit carries the commit's error.
- A composite (graph) save that rolls back now puts back each node's IS-A parents as well as the node, and each record's values and result history as well as its baseline. A graph delete that holds a transaction resets the records it deletes only once it commits, so a rollback leaves them saved; without one, a record whose delete went through stays reset, because its row is gone.
- `EntityField.GetState()` / `RestoreState()` and the `EntityFieldState` type are new, for the framework's own rollback.
