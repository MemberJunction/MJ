---
"@memberjunction/core": patch
---

A failed IS-A chain save now leaves every level of the chain as it was before `Save()`.

Each parent in the chain is finalized as saved and clean when its own write returns, before the leaf writes and the chain commits. When the leaf's write, its validation or the commit then failed, the transaction rolled back, but the parent objects still said they were saved. A new chain's retry updated a parent row that no longer existed, and an edited chain's retry skipped the parent's edit, returned true, and lost it.

- The IS-A initiator captures the chain before the parents save, and on every failure path (a parent's save fails, the leaf's write fails or throws, the commit throws) puts back what the rolled-back writes changed in memory: each finalized level's saved and loaded flags, and each field's value and dirty-tracking state. A field edited while the save was in flight keeps the edit, compared with the pre-save baseline.
- The same holds on the client, where `GraphQLDataProvider` records each parent's save in memory and sends the chain in the leaf's one mutation.
- A composite (graph) save that rolls back now puts back each node's IS-A parents as well as the node, and each record's values as well as its baseline. A graph delete that rolls back puts back the records it had already deleted and reset.
- `EntityField.GetState()` / `RestoreState()` and the `EntityFieldState` type are new, for the framework's own rollback.
