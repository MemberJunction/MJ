# BaseEntity Composite Graph — Entity Companions & Graph Save

**Branch**: `feat/base-entity-composite-graph`
**Status**: platform capability complete — all phases implemented, tested and documented. App-repo
adoption (§6) is deliberately out of scope for this branch.
**Owner**: MJ Core

**Verification**: unit 1710/1710 (112 files, 38 new); integration 56/56 deterministic tier;
workspace build 268/268; `check:claude-md` and `check:standards` pass.

---

## 1. Problem

MJ treats a parent record and its child rows as unrelated `BaseEntity` objects. Applications that
need them to load, validate and persist as one unit have each hand-rolled the same pattern:

| | `OrderEntityServer` | `PaymentHeaderEntityServer` | `JournalEntryEntityServer` |
|---|---|---|---|
| Property | `Lines: OrderLineEntity[]` | `Lines: BaseEntity[]` (untyped) | `Lines: JournalEntryLineEntityServer[]` |
| Loads children | ✗ | ✗ | ✓ (`LoadLines`, overrides `Load` **and** `LoadFromData`) |
| Tracks removals | ✗ | ✗ | ✓ (`_deletedLines`) |
| Add/remove API | raw setter | raw setter | ✓ `AddLine`/`RemoveLine`/`CreateLine` + renumber |
| Back-reference | ✗ | ✗ | ✓ `line.ParentJournalEntry` |
| Cross-child invariant | line count | — | debits == credits at penny precision |
| Transaction | `dbProvider.BeginTransaction()` cast | same | same |

All three are **server-only** classes, because `BeginTransaction`/`Commit`/`Rollback` are abstract on
`DatabaseProviderBase` and the client provider has no equivalent.

### Defects this has already caused (all verified in source, not hypothesised)

1. **`OrderEntityServer.ValidateAsync` never runs.** `BaseEntity.DefaultSkipAsyncValidation`
   returns `true`; `OrderEntityServer` does not override it and no caller in `bizapps-orders`
   passes `SkipAsyncValidation: false`. The "cannot confirm an order with no lines" guard *and*
   the entire per-line validation loop are dead on every save.
2. **N+1 in production accounting.** `JournalEntryEntityServer.LoadFromData` calls `LoadLines()`.
   `LoadFromData` is the row-materialisation path for `RunView(ResultType:'entity_object')`, so a
   view returning 500 journal entries fires 500 line queries plus 500 dimension queries.
3. **A clean parent with new children silently skips the save.** `_InnerSave` returns `true` early
   when `!Dirty`, and `Dirty` knows nothing about children.
4. **Orphaned children.** Two of three implementations never delete removed rows.
5. **No type safety on payment lines** — `Lines: BaseEntity[]`, forcing
   `(payment as unknown as { Lines: BaseEntity[] }).Lines = [line]` at `OrderEntityServer.ts:2338`.
6. **Two mutually-blind transaction mechanisms.** `DatabaseProviderBase.BeginTransaction()` is
   depth-counted and re-entrant (savepoints at depth ≥ 2). `BeginISATransaction()` is four lines
   that open a brand-new `sql.Transaction` on the pool with no depth awareness. An entity that hits
   both paths writes into two independent physical transactions; rolling back one leaves the other
   committed.
7. **`EntityRelationshipsToLoad` has never worked.** The server generates field resolvers named
   `{RelatedEntityCodeName}_{JoinField}Array`; the client requests the same name *without* the
   `Array` suffix; `InnerLoad` then reads `data[<entity name>]`. Three-way key mismatch.

---

## 2. What already exists (and is reused)

- **`BaseRemotableOperation`** — typed RPC whose `Execute()` is identical on both tiers, routed via
  `provider.RouteOperation` (GraphQL marshalling on the client, in-process dispatch on the server).
  This is the unified-developer-surface primitive; `bizapps-orders` already uses it for
  `Orders.SaveOrder`, which is what makes browser-side order entry work today.
- **`DatabaseProviderBase.BeginTransaction()`** — a working re-entrant ambient transaction manager.
- **`OldValues___` / `RestoreContext___`** — established precedent for non-field companion payloads
  riding the generated save input, stripped before `SetMany` and consumed by dedicated handlers.
- **`ClassFactory` auto-priority** — a subclass necessarily loads after its base, so registration
  priority auto-increments and the most-derived registered class wins with no configuration.

### Explicitly NOT used

**`TransactionGroup`** is an arbitrary-batch facility, not a composite-save engine. Under a
transaction group `Save()` *defers*: the provider only registers an instruction, the entity returns
`true` before anything persists, the PK is unavailable afterwards, there is no read-your-writes, and
ordering is array position with a flat Define/Use variable namespace. Composite saves are
sequential read-your-writes units of work. See `guides/TRANSACTIONS_AND_BATCHING_GUIDE.md`.

---

## 3. Design

### 3.1 Governing principle

The client/server difference is a **capability of the provider**, not a concern of the entity or the
caller. `BaseEntity` asks the provider whether it can supply a transactional unit of work and does
one of two things. Nothing above `BaseEntity` branches on tier.

### 3.2 Layering

```
EntityTransactionScope        provider capability — one arbiter for all transactions
        ▲
EntityCompanion               named, serialisable side-channel attached to a BaseEntity
        ▲
RelatedRecordCollection<T>            the typed companion everyone actually writes
        ▲
EntitySavePlan                ordered graph of nodes, built from companions
        ▲
Local / Remote executors      same cascade, two placements
```

### 3.3 The three-layer entity class stack

The composite declaration must live in a class **both tiers load**; server-only behaviour extends it.

```
mjBizAppsOrdersOrderEntity     CodeGen       fields
        ▲
OrderEntity                    SHARED pkg    Lines declaration + in-memory invariants
        ▲
OrderEntityServer              server pkg    booking, entitlements, GL posting
```

The server package imports the shared package in order to extend it, so the shared class registers
first and the server class second — `GetEntityObject` returns `OrderEntityServer` on the server and
`OrderEntity` in the browser, with no explicit priorities.

### 3.4 Save routing

```
Save() → _InnerSave
  ├─ build EntitySavePlan (self + companions, recursive, ordered)
  ├─ NodeCount === 1  → existing single-row path, byte-for-byte unchanged
  └─ NodeCount > 1
       ├─ provider.SupportsEntityTransactions  → ExecuteGraphLocal
       └─ otherwise                            → ExecuteGraphRemote → MJ.SaveEntityGraph
                                                   → server re-enters ExecuteGraphLocal
```

There is exactly **one** cascade implementation. The remote path relocates it; it does not
reimplement it.

### 3.5 Hooks, events and platform guarantees

Every node is persisted by calling the child's own `BaseEntity.Save()` / `.Delete()`. No node is
ever written with direct SQL. Consequently Record Changes, entity actions, field validation,
subclass overrides, `PreSave` data hooks, `save_started` / `save` / `delete` events and cache
invalidation all fire per node exactly as they do for a standalone save — for free, with no
graph-specific plumbing.

The graph adds two events of its own so callers can observe the unit of work as a whole:
`graph_save_started` and `graph_save` (payload: node count, per-node outcomes).

### 3.6 Load

Load needs *batching*, not relocation — the client can `RunView` children perfectly well.

- `Load: 'explicit'` (default) — `await order.Lines.Load()`.
- `Load: 'eager'` — populated by `Load()` only, **never** by `LoadFromData()`. This is the
  structural fix for defect #2.
- `Load: 'never'`.
- `RunView.IncludeRelatedRecords` — one `WHERE FK IN (...)` per collection across all returned rows.

### 3.7 Validation

Companion validation fans out inside `Validate()` / `ValidateAsync()` over the full set **including
removals**, before any write. Cross-child invariants therefore see the whole graph.

**Decision:** companion validation runs whenever companions are dirty, regardless of
`DefaultSkipAsyncValidation`. That flag governs an entity's own async rules; silently skipping
cross-child invariants is defect #1. This is a behaviour change for adopters and belongs in release
notes.

### 3.8 Dirty

`Dirty` becomes `fieldsDirty || companions.some(c => c.Dirty)`, fixing defect #3.

---

## 4. Phases

| # | Scope | Ships independently |
|---|---|---|
| 1 | `EntityTransactionScope`; `BeginEntityTransaction` with join semantics; fold IS-A onto it | ✓ (bug fix #6) |
| 2 | `EntityCompanion` + registration + serialise/deserialise round-trip | ✓ (no wire change) |
| 3 | `RelatedRecordCollection<T>` | — |
| 4 | `EntitySavePlan` + `ExecuteGraphLocal` + validation fanout + dirty rollup + events | ✓ (server-side dedup) |
| 5 | `MJ.SaveEntityGraph` + `ExecuteGraphRemote` + result-graph application + scope gating | ✓ (browser composites) |
| 6 | Delete graph (reverse order) + eager/explicit load wiring | — |
| 7 | `RunView.IncludeRelatedRecords` | ✓ (perf) |
| 8 | `EntityRelationship.RelatedRecordCollection` + CodeGen emission of `DeclareRelatedRecords(...)` | ✓ (additive; NULL = today's behaviour) |

Phases 1 and 4 deliver the server-side deduplication on their own.

Phase 8 makes the declaration metadata-driven: two existing columns (`RelatedEntity`,
`RelatedEntityJoinField`) plus one nullable JSONType blob are read by
`EntitySubClassGeneratorBase.GenerateRelatedRecordCollections()`, which emits the field
initialiser onto the generated subclass. Hand-written declarations remain valid — the two paths
produce the same runtime object.

### Security note for phase 5

`MJ.SaveEntityGraph` is the same API-key bypass surface that `TransactionGroupResolver` had to be
patched for (bug-register B1 / SEC1). It must apply the `entity:create` / `entity:update` /
`entity:delete` scope gate per node **before** any entity work. Entity permissions still enforce
inside `Save()`, but the API-key ceiling does not check itself.

---

## 5. Out of scope

- Making composites default-on anywhere. Every collection is opt-in.
- A general identity-map / ObjectContext ORM. MJ's per-record model does not want one.
- Repairing the dead `EntityRelationshipsToLoad` path (defect #7). Tracked separately; the design
  deliberately does not depend on it.

---

## 6. Adoption

- **JournalEntry** — deletes `AddLine`/`RemoveLine`/`CreateLine`/`LoadLines`/`_deletedLines` and the
  transaction block in `Save`. Keeps `assignEntryNumber`; the balance rule moves into `Validate()`
  over `this.Lines.Items` and thereby starts running in the browser too. Fixes the N+1.
- **Order** — keeps its `Save` override for booking; loses `savePendingLines` and its transaction
  block. Async-validation defect fixed by relocating line validation into `Validate()`.
- **PaymentHeader** — gains typing; the `as unknown as { Lines: BaseEntity[] }` cast becomes
  `payment.Lines.Add(line)`.

Adoption happens in the app repos, not here. This branch ships the platform capability, the guide
and the tests.
