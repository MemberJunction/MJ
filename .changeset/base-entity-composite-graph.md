---
"@memberjunction/core": minor
---

Add **entity companions** and **composite graph saves** to `BaseEntity`, and unify the two transaction mechanisms that were previously blind to each other.

**Composites.** A parent and its children can now load, validate and persist as one unit, from one call, on both tiers. Declare a collection on a shared (client + server) entity subclass and call `entity.Save()`:

```typescript
public readonly Lines = this.DeclareChildren<OrderLineEntity>({
    Name: 'Lines', ChildEntity: 'MJ_BizApps_Orders: Order Lines',
    ForeignKey: 'OrderHeaderID', OrderBy: 'LineNumber ASC',
    Load: 'explicit', OnRemove: 'delete', Sequence: { Field: 'LineNumber', From: 1 },
});
```

On the server the graph executes locally inside one transaction; from the browser the whole unit of work is routed to the server via the new `MJ.SaveEntityGraph` remote operation, which rebuilds the records as their server-side subclasses and runs the *same* executor. One cascade implementation, two placements — and **zero changes to any generated GraphQL type**. Every node is persisted through its own `Save()`/`Delete()`, so Record Changes, entity actions, validation, `PreSave` hooks, per-record events and cache invalidation all fire normally; the root additionally raises `graph_save_started` / `graph_save`.

New public API: `EntityCompanion`, `ChildCollection<T>`, `EntitySavePlan`, `EntityTransactionScope`, `RunInEntityTransaction()`, `SaveEntityGraphOperation`, `LoadChildCollectionsBatched()`, and on `BaseEntity` — `DeclareChildren()`, `RegisterCompanion()`, `GetCompanion()`, `Companions`, `HasCompanions`, `SerializeCompanions()`, `DeserializeCompanions()`. `RunViewParams` gains `IncludeChildren` for batched child loading (1+K queries instead of N+1).

**Transaction unification.** `DatabaseProviderBase` gains `BeginEntityTransaction()` / `SupportsEntityTransactions`. It delegates to the existing depth-counted `BeginTransaction()`, so it starts a physical transaction *or joins one already in flight* as a savepoint — participants never ask who else is in a transaction. IS-A chains now use it.

This fixes a torn-write defect: `BeginISATransaction()` opened a brand-new physical transaction on the pool with **no depth awareness**, while `BeginTransaction()` (used by every hand-written application cascade) is depth-counted. An IS-A entity saved inside an application transaction therefore wrote into two independent transactions; rolling one back left the other committed, with no error raised.

**Deprecated (removal in 7.0):** `IMetadataProvider.BeginISATransaction` / `CommitISATransaction` / `RollbackISATransaction`, and `BaseEntity.PropagateTransactionToParents()` / `ProviderTransaction` for IS-A use. All retained for external callers; MJ core no longer calls them.

**Behaviour changes for adopters** (no effect on entities without companions):
- `Dirty` now rolls up companions. A clean parent with new children previously reported `Dirty === false`, took the not-dirty early return, and silently persisted nothing.
- Companion validation runs regardless of `DefaultSkipAsyncValidation`. That flag governs an entity's own async rules; applying it to cross-child invariants silently disabled them.

Additive and opt-in throughout — single-record saves take the identical code path they did before.

See `guides/TRANSACTIONS_AND_BATCHING_GUIDE.md` for when to use provider transactions vs Transaction Groups vs entity graphs.
