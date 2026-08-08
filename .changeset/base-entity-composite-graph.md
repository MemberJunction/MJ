---
"@memberjunction/core": minor
"@memberjunction/sqlserver-dataprovider": minor
"@memberjunction/generic-database-provider": minor
---

Add **entity companions** and **composite graph saves** to `BaseEntity`, and replace the two transaction mechanisms that were blind to each other with one provider-arbitrated primitive.

### Composites

A parent and its related records can now load, validate and persist as one unit, from one call, on both tiers. Declare a collection on a shared (client + server) entity subclass:

```typescript
public readonly Lines = this.DeclareRelatedRecords<OrderLineEntity>({
    Name: 'Lines',
    RelatedEntity: 'MJ_BizApps_Orders: Order Lines',
    RelatedEntityJoinField: 'OrderHeaderID',
    OrderBy: 'LineNumber ASC',
    Load: 'explicit',                            // 'explicit' | 'immediate' | 'lazy' | 'never'
    OnRemove: 'delete',                          // 'delete' | 'orphan' | 'refuse'
    Sequence: { Field: 'LineNumber', From: 1 },
});
```

On the server the graph executes locally inside one transaction; from the browser the whole unit of work is routed to the server via the new `MJ.SaveEntityGraph` remote operation, which rebuilds the records as their server-side subclasses and runs the *same* executor. One cascade implementation, two placements — and **zero changes to any generated GraphQL type**. Every node is persisted through its own `Save()`/`Delete()`, so Record Changes, entity actions, validation, `PreSave` hooks, per-record events and cache invalidation all fire normally; the root additionally raises `graph_save_started` / `graph_save`.

The option shape mirrors `EntityRelationship` metadata (`RelatedEntity`, `RelatedEntityJoinField`) so the same declaration can be code-generated later — see the schema change below.

New public API: `EntityCompanion`, `RelatedRecordCollection<T>`, `EntitySavePlan`, `EntityTransactionScope`, `RunInEntityTransaction()`, `SaveEntityGraphOperation`, `LoadRelatedRecordsBatched()`, and on `BaseEntity` — `DeclareRelatedRecords()`, `RegisterCompanion()`, `GetCompanion()`, `Companions`, `HasCompanions`, `SerializeCompanions()`, `DeserializeCompanions()`. `RunViewParams` gains `IncludeRelatedRecords` for batched loading (1+K queries instead of N+1).

### Schema

Adds nullable `EntityRelationship.RelatedRecordCollection` (JSONType `IRelatedRecordCollectionConfig`) — the policy half of a `DeclareRelatedRecords(...)` declaration, so CodeGen can eventually emit these instead of every application hand-writing them. `RelatedEntity` / `RelatedEntityJoinField` are read from the row's existing columns and deliberately not duplicated in the JSON. NULL — every existing row — means "not a declared collection", i.e. exactly current behaviour. CodeGen emission is a follow-up; nothing reads the column yet.

### Transaction unification

`DatabaseProviderBase` gains `BeginEntityTransaction()` / `SupportsEntityTransactions`, delegating to the existing depth-counted `BeginTransaction()` — so it starts a physical transaction *or joins one already in flight* as a savepoint. Participants never ask who else is in a transaction. IS-A chains now use it.

This fixes a torn-write defect: `BeginISATransaction()` opened a brand-new physical transaction on the pool with **no depth awareness**, while `BeginTransaction()` (used by every hand-written application cascade) is depth-counted. An IS-A entity saved inside an application transaction therefore wrote into two independent transactions; rolling one back left the other committed, with no error raised.

### 🚨 BREAKING

Removed outright rather than deprecated, since 6.x LTS has not shipped:

- `IMetadataProvider.BeginISATransaction` / `CommitISATransaction` / `RollbackISATransaction`, and their `SQLServerDataProvider` implementations. **Migration:** use `BeginEntityTransaction()`, or `RunInEntityTransaction(provider, work)` which handles commit/rollback for you.
- `BaseEntity.ProviderTransaction` and `BaseEntity.PropagateTransactionToParents()`. Nothing set them after the unification, and the provider reads that consumed them were already dead: every `ExecuteSQL` call without an explicit `connectionSource` picks up the provider's ambient transaction, which is what the unified scope opens. **Migration:** none needed for code that goes through `Save()`/`Delete()`; code that hand-routed a record onto a specific transaction handle should open a scope instead.

### Behaviour changes for adopters

No effect on entities without companions:

- `Dirty` now rolls up companions. A clean parent with new children previously reported `Dirty === false`, took the not-dirty early return, and silently persisted nothing while reporting success.
- Companion validation runs regardless of `DefaultSkipAsyncValidation`. That flag governs an entity's own async rules; applying it to cross-child invariants silently disabled them — which is how `OrderEntityServer.ValidateAsync` became dead code on every save.

Additive and opt-in otherwise — single-record saves take the identical code path they did before.

See `guides/TRANSACTIONS_AND_BATCHING_GUIDE.md` for when to use provider transactions vs Transaction Groups vs entity graphs.
