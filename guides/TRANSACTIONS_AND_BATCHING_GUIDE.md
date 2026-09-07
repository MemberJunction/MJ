# Transactions, Batching & Entity Graphs

> **Deep dive on entity graphs specifically** — metadata declaration, flow diagrams for the local
> save and the network round trip, cache-backed sources and load modes:
> [Related-Record Collections](../packages/MJCore/docs/related-record-collections.md) (1:N, FK on
> the related row) and [Embedded Records](../packages/MJCore/docs/embedded-records.md) (1:1, FK on
> the owner).

MemberJunction has **three** different mechanisms that all sound like "do several things at once,"
and picking the wrong one produces bugs that do not announce themselves — torn writes, saves that
report success without persisting, children that duplicate on every edit.

This guide names the three, says exactly what each is for, and gives you a decision tree.

---

## The three mechanisms at a glance

| | Provider transactions | Transaction Groups | Entity graphs |
|---|---|---|---|
| **What it is** | An ambient SQL transaction on a provider | A batch of arbitrary records shipped in one round trip | A parent plus its companion-contributed children, saved as one unit |
| **Where you can use it** | Server only | Client or server | Client or server |
| **Records involved** | Whatever you save inside it | Any, unrelated | One root plus its declared companions |
| **Execution** | Sequential, read-your-writes | **Deferred** until `Submit()` | Sequential, read-your-writes |
| **Can you read what you just wrote?** | ✅ Yes | ❌ No | ✅ Yes |
| **Is the PK available after saving the parent?** | ✅ Yes | ❌ No | ✅ Yes |
| **Does `Save()` return after persisting?** | ✅ Yes | ❌ No — returns `true` early | ✅ Yes |
| **Atomic** | ✅ | ✅ | ✅ server-side; client routes to server |
| **API** | `provider.BeginEntityTransaction()` | `md.CreateTransactionGroup()` | `entity.Save()` |

---

## 1. Provider transactions

**Use when:** server-side code writes several records that must land together, and you are writing
the orchestration yourself.

```typescript
import { RunInEntityTransaction } from '@memberjunction/core';

await RunInEntityTransaction(this.ProviderToUse, async () => {
    await header.Save();
    for (const line of lines) {
        line.HeaderID = header.ID;   // read-your-writes: header.ID exists here
        await line.Save();
    }
});
```

`BeginEntityTransaction()` returns an {@link EntityTransactionScope} that is **settle-once** — the
first `Commit()` or `Rollback()` wins, so the `try`/`catch` shape above is safe even when the work
already unwound its own scope. `RunInEntityTransaction()` wraps that for you and is preferred.

### Join semantics — the important part

The provider arbitrates. If a transaction is **already in flight**, `BeginEntityTransaction()` joins
it (a dialect savepoint — SQL Server `SAVE TRANSACTION`, PostgreSQL `SAVEPOINT`) rather than starting
a second physical transaction; only the outermost commit commits for real. **Participants never ask
whether someone else already opened a transaction.** Inspect `TransactionDepth` (public on
`DatabaseProviderBase`), not `IsInTransaction` — SQL Server deliberately leaves `IsInTransaction`
false so `RunMaybeSerial` can fan out. After a server abort, call `ResetTransactionState()` rather
than poking private fields.

That is not a nicety, it is a correctness requirement. Before 6.2 MemberJunction had two transaction
mechanisms that were blind to each other:

- `GenericDatabaseProvider.BeginTransaction()` — depth-counted, re-entrant, dialect savepoints. A server abort of the ambient TX is not recoverable (`DoomedTransactionError`); the outer `Commit` fails and `Save()` returns false. While doomed, every statement without an explicit `connectionSource` throws. Concurrent nested scopes on one provider instance are unsupported — do not let a nested unit outlive its outer scope (`Promise.all` over throwing units on one provider starts a fresh physical TX); use `allSettled` or serialize.
- `BeginISATransaction()` — four lines that opened a brand-new `sql.Transaction` on the pool with no
  depth awareness at all.

An entity that hit both paths — an IS-A entity saved inside an application cascade, or a composite
whose child is an IS-A leaf — wrote into **two independent physical transactions on the same pool**.
Rolling one back left the other committed. No error was raised.

The `BeginISATransaction` / `CommitISATransaction` / `RollbackISATransaction` trio was **removed** in
6.2, along with `BaseEntity.ProviderTransaction` and `PropagateTransactionToParents()`. IS-A now uses
the same `BeginEntityTransaction()` everything else does, which is why the two can no longer
disagree. If you called any of them, switch to `BeginEntityTransaction()` — or better,
`RunInEntityTransaction()`.

> **Concurrency note.** The ambient transaction lives on the *provider instance*, not a global.
> MJServer builds per-request providers, so an ambient transaction is effectively request-scoped.
> Long-lived single-provider processes (CLI tools, workers) must not run concurrent transactional
> work on one provider instance.

### Client-side

`GraphQLDataProvider` reports `SupportsEntityTransactions === false` and has no
`BeginEntityTransaction`. There is no local transaction to open, and there is no way to hold a
server transaction open across round trips. **If you need atomicity from the browser, do not
orchestrate — route the unit of work to the server** (see §3, or write a `BaseRemotableOperation`).

---

## 2. Transaction Groups

**Use when:** you want to ship several *unrelated* record writes to the server in one round trip and
have them land atomically.

```typescript
const tg = await md.CreateTransactionGroup();
recordA.TransactionGroup = tg;
recordB.TransactionGroup = tg;
await recordA.Save();      // does NOT persist yet
await recordB.Save();      // does NOT persist yet
const ok = await tg.Submit();   // one round trip, one server-side SQL transaction
```

A transaction group is an **arbitrary batch facility**. Its value is network efficiency plus
atomicity across records that have nothing structurally to do with one another. `TransactionVariable`
adds simple value forwarding between items (`Define` a field on one, `Use` it on another), which
covers straightforward FK threading.

### Why a transaction group is NOT a composite-save engine

This is the trap. Under a transaction group `Save()` **defers** — the provider registers an
instruction and the entity returns `true` immediately, finalising later off
`TransactionNotifications$`. Four consequences make it structurally unsuitable for a parent/children
save:

1. **No primary key after the parent's save.** `line.OrderID = header.ID` reads blank.
   `TransactionVariable` papers over the simple case, but only forwards *a field value into a
   field* — not into arbitrary code that needs the value.
2. **No read-your-writes.** Anything that reads back what it just wrote (recompute totals from
   persisted lines, book from the saved rows) sees nothing, because nothing has been written.
3. **`Save()` returns `true` before persistence.** Every `if (!saved) throw` in your cascade becomes
   a lie, and errors surface asynchronously via a subscription instead of at the call site.
4. **No dependency graph.** Ordering is array position with a flat `Define`/`Use` namespace. Two
   levels of nesting (payment → line → allocation) cannot be expressed.

Use a transaction group for what it is good at. Reach for an entity graph for parent/children.

---

## 3. Entity graphs (composites)

**Use when:** a record and its children should load, validate and persist as one unit — order and
its lines, journal entry and its lines, payment and its allocations.

Declare the collection on a **shared (client + server)** subclass:

```typescript
@RegisterClass(BaseEntity, 'MJ_BizApps_Accounting: Journal Entries')
export class JournalEntryEntity extends mjBizAppsAccountingJournalEntryEntity {
    public readonly Lines = this.DeclareRelatedRecords<JournalEntryLineEntity>({
        Name: 'Lines',
        RelatedEntity: 'MJ_BizApps_Accounting: Journal Entry Lines',
        RelatedEntityJoinField: 'JournalEntryID',
        OrderBy: 'LineNumber ASC',
        Load: 'explicit',                       // 'explicit' | 'immediate' | 'lazy' | 'never'
        OnRemove: 'delete',                     // 'delete' | 'orphan' | 'refuse'
        Sequence: { Field: 'LineNumber', From: 1 },
    });

    public override Validate(): ValidationResult {
        const result = super.Validate();          // fans out to companions
        assertBalanced(this.Lines.Items, result); // sees the WHOLE graph, before any write
        return result;
    }
}
```

When the FK lives on **this** record (`Deal.OrderID`) the join inverts and so does the save
order: the peer persists first, the owner stamps the FK, then the owner persists. That is an
**embedded record**, not a collection. Declare it on the FK field
(`EntityField.EmbeddedRecord`) and CodeGen emits `deal.OrderID_Object` /
`deal.OrderID_EnsureObject()`. Same graph executor, same `MJ.SaveEntityGraph` wire path,
recursive companion payload so the order's lines ride along. See
[Embedded Records](../packages/MJCore/docs/embedded-records.md).

```typescript
const deal = await md.GetEntityObject<DealEntity>('Deals');
// OrderID is nullable — Ensure() provisions the peer (required FKs exist after NewRecord).
const order = deal.OrderID_EnsureObject();
order.OrderDate = new Date('2002-01-01');
await deal.Save(); // Order first, stamp Deal.OrderID, save Deal
```

Then use it. The API is the same on both tiers:

```typescript
const je = await md.GetEntityObject<JournalEntryEntity>('MJ_BizApps_Accounting: Journal Entries');
je.NewRecord();
(await je.Lines.Create()).DebitAmount = 100;
(await je.Lines.Create()).CreditAmount = 100;
await je.Save();      // header + both lines, atomically
```

### Where it executes

`BaseEntity.Save()` builds an `EntitySavePlan`. If it has more than one node:

- **Provider supports entity transactions** (server) → execute locally in one transaction.
- **It does not** (browser) → serialise the graph and hand the whole unit of work to the server via
  the `MJ.SaveEntityGraph` remote operation, which rebuilds the records as their **server-side**
  registered subclasses and runs the *same* local executor there.

There is exactly one cascade implementation. The remote path relocates it; it never reimplements it.

### Platform guarantees

Every node is persisted by calling that record's own `Save()` / `Delete()` — never direct SQL. So
Record Changes, entity actions, field validation, subclass `Save` overrides, `PreSave` data hooks,
`save_started` / `save` / `delete` events and cache invalidation all fire per node, exactly as for a
standalone save.

The root additionally raises `graph_save_started` and `graph_save`, so a UI can refresh once per unit
of work rather than once per line.

### Loading children

| Mode | Behaviour |
|---|---|
| `'explicit'` (default) | Nothing loads until `await entity.Lines.Load()` |
| `'immediate'` | Populated by `Load()` — **never** by `LoadFromData()` |
| `'lazy'` | Populated on first read of `Items` — requires `Source: 'cache'` and read-only, and **throws** on a cache miss rather than returning an empty array |
| `'never'` | Write-only staging buffer |

For result sets, use one batched query rather than eager loading per row:

```typescript
const result = await rv.RunView<JournalEntryEntity>({
    EntityName: 'MJ_BizApps_Accounting: Journal Entries',
    ExtraFilter: `PeriodID = '${periodId}'`,
    ResultType: 'entity_object',
    IncludeRelatedRecords: ['Lines'],   // 1 query for ALL entries' lines
});
```

> **Why `immediate` excludes `LoadFromData()`.** `LoadFromData()` is the per-row materialisation path for
> `RunView(ResultType:'entity_object')`. Loading children there turns one view into N+1 queries. This
> is a real defect that shipped: a `LoadFromData` override calling `LoadLines()` meant listing 500
> journal entries issued 500 line queries plus 500 dimension queries. `IncludeRelatedRecords` costs
> `1 + K` regardless of row count.

### Declaring in metadata instead of code

The option shape deliberately mirrors `EntityRelationship`, so the same declaration can be driven
from metadata rather than hand-written:

| Option | Metadata source |
|---|---|
| `RelatedEntity` | `EntityRelationship.RelatedEntity` (column) |
| `RelatedEntityJoinField` | `EntityRelationship.RelatedEntityJoinField` (column) |
| `Name`, `Load`, `OnRemove`, `OrderBy`, `Sequence`, `ClearAfterSave` | `EntityRelationship.RelatedRecordCollection` (JSONType `IRelatedRecordCollectionConfig`) |

The two column-backed values are **not** duplicated inside the JSON — one source of truth each.
`NULL` means "this relationship is not a declared collection", which is the default for every
existing row.

The column and its type definition ship in 6.2; **CodeGen emission of `DeclareRelatedRecords(...)`
from these rows is a follow-up**, so hand-written declarations remain the only working path for now.
When adding an option, keep `RelatedRecordCollectionOptions` and
`metadata/entities/JSONType-interfaces/IRelatedRecordCollectionConfig.ts` in step.

---

## Decision tree

```
Do the records form a parent + its children?
├── YES → Entity graph. Declare a RelatedRecordCollection; call entity.Save().
└── NO
    ├── Are you on the server, orchestrating writes yourself?
    │   └── YES → Provider transaction: RunInEntityTransaction(provider, work)
    └── Are you on the client, batching unrelated writes into one round trip?
        └── YES → Transaction group: CreateTransactionGroup() + Submit()
            └── ...but if you need read-your-writes or the parent's new PK,
                you need a server-side unit of work instead — write a
                BaseRemotableOperation and call it from both tiers.
```

---

## Anti-patterns

**❌ Using a transaction group to save a parent and its children.**
The parent's PK is unavailable, nothing can be read back, and `Save()` lies about success. Use an
entity graph.

**❌ Casting `ProviderToUse` to `DatabaseProviderBase` in code that might run client-side.**
```typescript
// ❌ Server-only by construction — this is what made every composite class server-only
const db = this.ProviderToUse as unknown as DatabaseProviderBase;
await db.BeginTransaction();

// ✅ Capability-checked, works on both tiers
await RunInEntityTransaction(this.ProviderToUse, async () => { /* ... */ });
```

**❌ Declaring a child collection only on the server subclass.**
The browser then cannot see it, stage children, or validate them — which is exactly the limitation
this feature removes. Declare on a shared subclass; put server-only behaviour in a class that
extends it. `ClassFactory` priority auto-increments by load order, so the server subclass wins
server-side with no configuration.

**❌ Calling `BeginISATransaction()`.**
Deprecated since 6.2. It opens a second physical transaction blind to any already in flight. Use
`BeginEntityTransaction()`.

**❌ Setting `Load: 'immediate'` on a collection whose parent is commonly listed in grids.**
Use `'explicit'` plus `IncludeRelatedRecords` on the specific views that need children.

**❌ Inventing a "header-only" save that skips companions.**
The graph executor's recursion guard is private on `BaseEntity`. Application
code that previously passed a public `IsGraphNodeSave` flag dropped *every*
companion, including owner-held embeds. Use `SkipRelatedCollections: true` —
embeds still persist, collections do not.

---

## Related

- [`packages/MJCore/src/generic/entityTransactionScope.ts`](../packages/MJCore/src/generic/entityTransactionScope.ts) — scope contract and the torn-write history
- [`packages/MJCore/src/generic/entityCompanion.ts`](../packages/MJCore/src/generic/entityCompanion.ts) — the companion abstraction
- [`packages/MJCore/src/generic/relatedRecordCollection.ts`](../packages/MJCore/src/generic/relatedRecordCollection.ts) — the typed collection
- [`packages/MJCore/src/generic/entitySavePlan.ts`](../packages/MJCore/src/generic/entitySavePlan.ts) — plan and executor
- [`packages/MJCore/src/generic/saveEntityGraphOperation.ts`](../packages/MJCore/src/generic/saveEntityGraphOperation.ts) — the remote operation
- [Remote Operations Guide](REMOTE_OPERATIONS_GUIDE.md) — the typed RPC substrate composites use
- [BaseEntity Server-Side Patterns](BASE_ENTITY_SERVER_PATTERNS.md)
- [Data access rules](../.claude/rules/data-access.md)
