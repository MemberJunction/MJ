---
paths:
  - "**/*.ts"
---

# MemberJunction Data Access & Performance Rules

Everything about reading and writing MJ data: entity metadata, `BaseEntity`, `RunView`/`RunViews`,
caching, and the performance patterns that go with them.

---

## Entity Metadata Best Practices (CRITICAL)

### 🚨 GROUND TRUTH FOR SCHEMA IS THE ORM LAYER — NOT MIGRATIONS 🚨
- **When you need to know an entity's real schema — its fields, types, nullability, value-lists, relationships, primary keys — read the generated ORM layer in `packages/MJCoreEntities` (the `entity_subclasses.ts` classes + their Zod schemas), NOT the migration SQL.**
- **Why**: migrations are an *append-only history* of changes over time. The current true shape of a table/entity is the sum of the baseline plus every subsequent ALTER — reconstructing it from migrations is error-prone and often wrong. CodeGen regenerates `MJCoreEntities` from the live database after every schema change, so the generated entity classes are the **authoritative, current** projection of the schema. A field you see added in one migration may have been altered or dropped in a later one; the ORM class reflects the net result.
- **Practical rule**: to answer "what fields does entity X have / what type is field Y / what are the allowed values / what does it relate to", open the `X`-entity class in `packages/MJCoreEntities/src/generated/entity_subclasses.ts`. Use `SomeEntity['FieldName']` for a field's type. Only read migration SQL when you specifically need the *history* of a change, the *view/stored-proc body* (which isn't in the ORM), or to author a *new* migration.

### Finding Entity Names
- **ALWAYS** use `/packages/MJCoreEntities/src/generated/entity_subclasses.ts` to find correct entity names
- Entity names are in the `@RegisterClass` decorator JSDoc comments
- Examples:
  - `MJAIPromptEntity` → `"MJ: AI Prompts"`
  - `MJAIAgentEntity` → `"MJ: AI Agents"`
  - `MJAIModelEntity` → `"MJ: AI Models"`
  - `MJAIPromptRunEntity` → `"MJ: AI Prompt Runs"`
  - `MJAIAgentRunEntity` → `"MJ: AI Agent Runs"`
- **As of v5.0, ALL core entities use the `MJ: ` prefix** (and `MJ*` class names) — an unprefixed name like `'AI Agents'` no longer resolves and throws `Entity AI Agents not found in metadata`

### Using Metadata Class
- Create a single instance: `const md = new Metadata()`
- Use for entity object creation: `const entity = await md.GetEntityObject<EntityType>('Entity Name')`
- **NEVER** directly instantiate entity classes with `new EntityClass()`
- **NEVER** look up entity names at runtime - they are fixed in the schema

### Looking Up an EntityInfo by Name — ALWAYS use `EntityByName`

When you need to find an `EntityInfo` from the metadata, **always use `md.EntityByName(name)`**, never `md.Entities.find(...)`.

```typescript
// ✅ CORRECT — case-insensitive, trim-handling, O(1) lookup via the entity-by-name map
const entity = new Metadata().EntityByName(params.EntityName);
if (entity && !this.IsCachingEnabledForEntity(entity)) { ... }

// ❌ WRONG — case-sensitive, whitespace-sensitive, O(N) array scan
const entity = md.Entities.find(e => e.Name === params.EntityName);
```

**Why:**
- `Entities.find(e => e.Name === ...)` is **case-sensitive** and **whitespace-sensitive** by string equality. Real-world callers pass `'channel actions'`, `'Channel Actions'`, or `' Channel Actions '` interchangeably; `find` only matches the exact registered casing. Bugs from this skew slip through code review easily.
- `EntityByName` lowercases and trims internally, then uses the pre-populated `_entityMapByName` for O(1) resolution. It also handles the unset-Provider case (returns `undefined`) so your code can fail-open on boot.
- `EntityByName` returns `EntityInfo | undefined`, so always guard with `if (entity)` before dereferencing.

This rule applies to any code that needs to look up a single entity by name. Use `Entities` (the array) only when you genuinely need to iterate over all entities (e.g. to filter by `SchemaName`).

### 🚨 CRITICAL: Don't Reach for the Global `Metadata` Provider in Per-Provider Code Paths

`new Metadata()` and the static `Metadata.Provider` both resolve to the **process-global default provider**. That's fine in single-provider apps, but **wrong** in any code path that may run under a non-default provider — most importantly:

- **Multi-provider client setups** (a client connecting to multiple MJ servers in parallel — each server is a separate `IMetadataProvider` with its own entities, roles, AllowCaching flags, and CurrentUser).
- **Server-side code servicing multiple tenants/connections** where the active provider is bound to the request, not to the process.

The rule:

1. **If a class instance already owns a provider** (e.g. `ProviderBase`, `BaseEngine`, `BaseEntity`), use **`this`** / **`this.ProviderToUse`** — never `new Metadata()`.
2. **If a function/method receives a provider via parameter or event**, use **that** provider — never `new Metadata()`. Examples: cache writes pass the provider that produced the data; `BaseEntityEvent.provider` carries the publishing provider for `remote-invalidate` events.
3. **If neither of the above applies**, accept an optional `provider?: IMetadataProvider` parameter and fall back to the global only as a last resort:
   ```typescript
   public DoThing(name: string, provider?: IMetadataProvider) {
       const md = provider ?? Metadata.Provider;     // explicit fallback
       const entity = md?.EntityByName(name);
       // ...
   }
   ```

```typescript
// ❌ WRONG — silently uses the global provider, even if the caller is on a different one
const md = new Metadata();
const entity = md.EntityByName(name);

// ✅ CORRECT (inside a provider class) — use `this`, which IS an IMetadataProvider
const entity = this.EntityByName(name);

// ✅ CORRECT (helper that doesn't own a provider) — accept it as a parameter
function gateCacheWrite(name: string, provider?: IMetadataProvider) {
    const md = provider ?? Metadata.Provider;
    return md?.EntityByName(name);
}
```

**Why this matters**: `LocalCacheManager.SetRunViewResult`, `BaseEntityEvent` consumers, `AuthorizationEvaluator`, and `BaseEngine.applyRemoteRecordData` all read per-provider state (entity flags, roles, current user). When they reach for `new Metadata()` in a multi-provider client, they read the wrong server's metadata and produce subtly wrong cache decisions, role evaluations, or entity instances. These are latent bugs that don't surface until parallel-server scenarios exist.

**When `new Metadata()` IS fine**: methods that genuinely operate on the global default — e.g., a one-off CLI script, application bootstrap, a singleton initializer that explicitly registers itself as the global provider.

### 🚨 CRITICAL: Entity Naming Convention Warning

**ALWAYS** use the correct entity names with the "MJ: " prefix. To prevent naming collisions on client systems, ALL core entities use the "MJ: " prefix as of v5.0 — pre-v5 unprefixed names (e.g. `'AI Agents'`) no longer resolve in metadata.

#### Examples of Core Entities with "MJ: " Prefix (MUST use full name):
- **AI Entities**: `MJ: AI Agent Prompts`, `MJ: AI Agent Run Steps`, `MJ: AI Agent Runs`, `MJ: AI Agent Types`, `MJ: AI Configuration Params`, `MJ: AI Configurations`, `MJ: AI Model Costs`, `MJ: AI Model Price Types`, `MJ: AI Model Price Unit Types`, `MJ: AI Model Vendors`, `MJ: AI Prompt Models`, `MJ: AI Prompt Runs`, `MJ: AI Vendor Type Definitions`, `MJ: AI Vendor Types`, `MJ: AI Vendors`
- **Artifact Entities**: `MJ: Artifact Types`, `MJ: Conversation Artifact Permissions`, `MJ: Conversation Artifact Versions`, `MJ: Conversation Artifacts`
- **Dashboard Entities**: `MJ: Dashboard User Preferences`, `MJ: Dashboard User States`
- **Report Entities**: `MJ: Report User States`, `MJ: Report Versions`

#### Common Mistakes to Avoid:
```typescript
// ❌ WRONG - Missing "MJ: " prefix
const agentRun = await md.GetEntityObject<MJAIAgentRunEntity>('AI Agent Runs', contextUser);
const agentPrompt = await md.GetEntityObject<MJAIAgentPromptEntity>('AI Agent Prompts', contextUser);

// ✅ CORRECT - Full entity name with "MJ: " prefix
const agentRun = await md.GetEntityObject<MJAIAgentRunEntity>('MJ: AI Agent Runs', contextUser);
const agentPrompt = await md.GetEntityObject<MJAIAgentPromptEntity>('MJ: AI Agent Prompts', contextUser);
```

**Always verify entity names** by checking `/packages/MJCoreEntities/src/generated/entity_subclasses.ts` or the `@RegisterClass` decorator JSDoc comments.

---

## MemberJunction Entity and Data Access Patterns

### Entity Object Creation
**Never directly instantiate BaseEntity subclasses** - always use the Metadata system to ensure proper class registration and potential subclassing:

```typescript
// ❌ Wrong - bypasses MJ class system
const entity = new TemplateContentEntity();

// ✅ Correct - uses MJ metadata system
const md = new Metadata();
const entity = await md.GetEntityObject<TemplateContentEntity>('Template Contents');
```

### BaseEntity Spread Operator Limitation
**CRITICAL**: Never use the spread operator (`...`) directly on BaseEntity-derived classes. BaseEntity properties are implemented as getters/setters, not plain JavaScript properties, so they won't be captured by the spread operator.

```typescript
// ❌ Wrong - spread operator doesn't capture getter properties
const promptData = {
  ...promptEntity,  // This will NOT include ID, Name, etc.
  extraField: 'value'
};

// ✅ Correct - use GetAll() to get plain object with all properties
const promptData = {
  ...promptEntity.GetAll(),  // Returns { ID: '...', Name: '...', etc. }
  extraField: 'value'
};
```

**Why this matters:**
- BaseEntity uses getter/setter methods for all entity fields
- JavaScript spread operator only copies enumerable own properties
- Getters are not enumerable properties, so they're skipped
- `GetAll()` returns a plain object with all field values

### Server-Side Context User Requirements
When working on server-side code, **ALWAYS** pass `contextUser` to `GetEntityObject` and `RunView` methods:

```typescript
// ❌ Wrong - missing contextUser on server
const entity = await md.GetEntityObject<SomeEntity>('Entity Name');
const results = await rv.RunView({ EntityName: 'Entity Name' });

// ✅ Correct - includes contextUser for server-side operations
const entity = await md.GetEntityObject<SomeEntity>('Entity Name', contextUser);
const results = await rv.RunView({ EntityName: 'Entity Name' }, contextUser);
```

**Important:**
- **Server-side code** serves multiple users concurrently and MUST include `contextUser` parameter
- **Client-side code** (Angular components) can omit `contextUser` as the context is already established
- This ensures proper data isolation, security, and audit tracking in multi-user environments

### Loading Multiple Records with RunView
For loading collections of records, use the RunView class with proper generic typing and ResultType parameter:

```typescript
// ✅ Optimal pattern for loading entity collections
const rv = new RunView();
const results = await rv.RunView<TemplateContentEntity>({
    EntityName: 'Template Contents',
    ExtraFilter: `TemplateID='${recordId}'`,
    OrderBy: 'Priority ASC, __mj_CreatedAt ASC',
    ResultType: 'entity_object'  // Returns actual entity objects, not raw data
});

// results.Results is now properly typed as TemplateContentEntity[]
const entities = results.Results; // No casting needed!
```

### RunView Error Handling
**Important**: RunView does NOT throw exceptions when it fails. Instead, it returns a result object with `Success` and `ErrorMessage` properties:

```typescript
const result = await rv.RunView<ActionParamEntity>({
    EntityName: 'Action Params',
    ExtraFilter: `ActionID='${actionId}'`,
    OrderBy: 'Name',
    ResultType: 'entity_object'
});

// ✅ Always check the Success property
if (result.Success) {
    const params = result.Results || [];
    console.log(`Loaded ${params.length} parameters`);
} else {
    console.error('Failed to load params:', result.ErrorMessage);
    // Handle the error appropriately
}

// ❌ Don't assume success - this won't catch failures
try {
    const result = await rv.RunView({...});
    // RunView won't throw, so this catch block won't be reached
} catch (error) {
    // This won't catch RunView failures!
}
```

### BaseEntity Save/Delete Error Handling
**Critical**: `BaseEntity.Save()` and `BaseEntity.Delete()` do NOT throw exceptions on failure. They return `boolean` — `true` on success, `false` on failure. Error details are available via `entity.LatestResult.CompleteMessage` which combines all error info into a single string.

```typescript
// ✅ CORRECT — Always check the return value
const saved = await entity.Save();
if (!saved) {
    LogError(`Save failed: ${entity.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    return; // Handle the failure
}

// ✅ CORRECT — Same pattern for Delete
const deleted = await entity.Delete();
if (!deleted) {
    LogError(`Delete failed: ${entity.LatestResult?.CompleteMessage ?? 'unknown error'}`);
}

// ❌ WRONG — Don't ignore the return value
await entity.Save(); // Silent failure — you'll never know it failed

// ❌ WRONG — Don't use try/catch for Save/Delete failures
try {
    await entity.Save();
} catch (error) {
    // This won't catch Save failures! Save returns false, it doesn't throw.
}

// ❌ WRONG — Don't use LatestResult.Message, use CompleteMessage
LogError(`Error: ${entity.LatestResult?.Message}`); // Incomplete info
```

**Rules:**
- **Always** check the boolean return value of `Save()` and `Delete()`
- **Always** use `LatestResult?.CompleteMessage` (not `.Message`) for error details — `CompleteMessage` combines all error info
- **Never** wrap `Save()`/`Delete()` in try/catch expecting them to throw on business logic failures
- Save/Delete CAN still throw for infrastructure errors (network, connection), but logical failures (validation, permissions, FK violations) return `false`

### Saving a parent AND its children — use an entity graph, not a hand-rolled cascade

**Do not hand-roll a parent/children save.** Declaring a child collection gets you atomicity,
validation ordering, dirty tracking, orphan handling and client/server parity for free — and avoids
the five defects every hand-rolled version in this codebase has shipped at least one of.

```typescript
// On a SHARED (client + server) entity subclass — not a server-only one
public readonly Lines = this.DeclareRelatedRecords<OrderLineEntity>({
    Name: 'Lines',
    RelatedEntity: 'MJ_BizApps_Orders: Order Lines',
    RelatedEntityJoinField: 'OrderHeaderID',
    OrderBy: 'LineNumber ASC',
    Load: 'explicit',                        // 'eager' | 'explicit' | 'never'
    OnRemove: 'delete',                      // 'delete' | 'orphan' | 'refuse'
    Sequence: { Field: 'LineNumber', From: 1 },
});

// Then, on either tier:
await order.Save();   // header + lines, atomically
```

**The three mechanisms are not interchangeable:**

| Need | Use | Never use |
|---|---|---|
| Parent + its children | `DeclareRelatedRecords()` + `entity.Save()` | ❌ a TransactionGroup — saves are *deferred*, so the parent's PK is unavailable, there is no read-your-writes, and `Save()` returns `true` before anything persists |
| Several server-side writes together | `RunInEntityTransaction(this.ProviderToUse, work)` | ❌ `ProviderToUse as DatabaseProviderBase` then `BeginTransaction()` — that cast is what makes a class server-only |
| Unrelated records in one client round trip | TransactionGroup + `Submit()` | — |

Other rules that follow from this:

- **`Load: 'eager'` never fires from `LoadFromData()`.** For result sets use
  `RunView({ ..., ResultType: 'entity_object', IncludeRelatedRecords: ['Lines'] })`, which costs `1 + K`
  queries instead of N+1.
- **Declare collections on a shared subclass**, with server-only behaviour in a class that extends
  it. `ClassFactory` priority auto-increments by load order, so the server subclass wins server-side
  with no configuration — and the browser still sees the collection.
- **`BeginISATransaction()`, `ProviderTransaction` and `PropagateTransactionToParents()` were removed in 6.2.** Use `BeginEntityTransaction()` / `RunInEntityTransaction()`.

Read [`guides/TRANSACTIONS_AND_BATCHING_GUIDE.md`](../../guides/TRANSACTIONS_AND_BATCHING_GUIDE.md)
before writing anything that saves more than one record together.

### 🚨 NEVER WRITE DIRECT SQL DML AGAINST AN ENTITY — unless it opts in

**Do not write `INSERT`, `UPDATE`, or `DELETE` against an entity's base table.** All mutations go through `BaseEntity.Save()` / `.Delete()`, because that is the only path where the platform's guarantees actually run:

| Guarantee | What skipping it looks like |
|---|---|
| Record Changes (`TrackRecordChanges`) | An audit trail that **looks** complete but silently isn't |
| Cache invalidation (`TrustServerCacheCompletely`) | The server RunView cache serves stale rows **indefinitely** |
| Entity Actions | Create/update/delete hooks never fire |
| Validation | Field rules and `BaseEntity` subclass overrides never run |
| Soft delete (`DeleteType='Soft'`) | The row is **destroyed** instead of having `DeletedAt` set |

None of these fail loudly. That's the point — raw DML produces a database that looks fine and is quietly wrong.

**The opt-in.** Three flags on `Entity` declare, per verb, that direct SQL is sanctioned:

```typescript
const entity = new Metadata().EntityByName('Some Entity');
if (!entity?.AllowDirectSQLUpdate) {
    // Not sanctioned — go through BaseEntity.Save()
}
```

- `AllowDirectSQLInsert` — bulk loads, ETL/integration sync, rows created as a side effect of a proc
- `AllowDirectSQLUpdate` — bulk backfills, maintenance routines
- `AllowDirectSQLDelete` — purge/retention, integration reconciliation

All default to `false`. **They declare; they do not enforce** — nothing stops you executing SQL, so a `false` is a statement that the platform does not expect raw DML here, not a barrier that will catch you.

Setting any of them requires `TrackRecordChanges = 0` **and** `TrustServerCacheCompletely = 0` (a database CHECK enforces it), since direct DML writes no audit row and fires no invalidation event. `AllowDirectSQLDelete` additionally requires `DeleteType = 'Hard'`.

**If you need a bulk operation**, reach for the substrate before reaching for SQL — see [Record Set Processing & Record Processes Guide](../../guides/RECORD_SET_PROCESSING_GUIDE.md), which gives you batching, resume, rate limiting and audit without leaving the `BaseEntity` path.

### Key Benefits of This Pattern
- **Type Safety**: Generic method provides full TypeScript typing
- **Performance**: `ResultType: 'entity_object'` eliminates manual conversion loops
- **Class System Compliance**: Respects MJ's entity registration and potential subclassing
- **Clean Code**: No type casting or manual data loading required

### What to Avoid
```typescript
// ❌ Manual conversion approach (inefficient)
const results = await rv.RunView({...});
for (const result of results.Results) {
    const entity = await md.GetEntityObject<SomeEntity>('EntityName');
    entity.LoadFromData(result);
    entities.push(entity);
}

// ❌ Type casting approach (unnecessary with proper generics)
const entities = results.Results as SomeEntity[];

// ❌ Using any or unknown types
const results: any = await rv.RunView({...});
const data = results.Results as unknown as SomeEntity[];
```

---

## Performance Best Practices

### Server-Side Caching (Critical Architecture)

MemberJunction's multi-tier caching system is a cornerstone of server performance. **Always consult [guides/CACHING_AND_PUBSUB_GUIDE.md](../../guides/CACHING_AND_PUBSUB_GUIDE.md)** when working on caching, RunView optimization, or data loading patterns.

### Reactive UIs over entity caches — use `BaseEngine` + `ObserveProperty`

**Before you build a new "reload after mutation" loop in Angular, check whether a `BaseEngine` subclass already caches the entity.** If one does, subscribe to its observable instead of polling/reloading. If one doesn't and the entity-set is small enough to cache (a few dozen rows, not 100MB+), **build a new engine** — it's the canonical MJ pattern and gives you reactivity for free.

The key APIs (see [packages/MJCore/src/generic/baseEngine.ts](../../packages/MJCore/src/generic/baseEngine.ts)):

- **`ObserveProperty<E>(propertyName): Observable<E[]>`** — lazy-created BehaviorSubject for any engine array property. Subscribers receive the current array on subscribe, then auto-receive it again on save / delete / remote-invalidate. Zero cost if no one observes.
- **`DataChange$: Observable<EngineDataChangeEvent>`** — engine-wide observable for any refresh.
- **`Configs` entries auto-subscribe to BaseEntity events** for the configured `EntityName`. Save / delete / remote-invalidate on a matching row triggers an in-place array mutation (or full refresh when filters/orderby prevent in-place updates) and emits to all `ObserveProperty` subscribers. **You don't write invalidation code yourself.**
- **Lazy-load pattern**: every caller does `await MyEngine.Instance.Config(false, user, provider)` at entry — no-op when already loaded; never penalizes users who don't touch the feature.

**Reference implementations**: `ConversationEngine`, `InteractiveFormsEngine`, `ComponentMetadataEngine`, `UserInfoEngine`, `KnowledgeHubMetadataEngine`. Copy the shape — `Config()` declares `BaseEnginePropertyConfig[]`; engine exposes `get Forms` (sync array) and `get Forms$` (RxJS observable). Angular components use `async` pipe on the observable.

**Getter pattern**: Engine getters MUST use `GetConfigData<E>(propertyName)` to return their backing arrays. This method checks the data map for permission denial and throws `PermissionConstrainedError` if the user lacks read access — preventing consumers from silently operating on empty arrays. Example:
```typescript
public get Models(): MJAIModelEntityExtended[] {
    return this.GetConfigData<MJAIModelEntityExtended>('_models');
}
```
Consumers that want graceful degradation check `engine.IsPermissionConstrained` before accessing properties.

**Caching boundary**: If the entity has a huge column (e.g., `Specification` text) AND many rows, don't bulk-load — punt to `RunView` with targeted filters (see `ComponentMetadataEngine`'s comment about why `MJ: Components` isn't fully cached there). If the entity is small or you can narrow with `Filter`, do cache it.

See [guides/CACHING_AND_PUBSUB_GUIDE.md § BaseEngine Integration](../../guides/CACHING_AND_PUBSUB_GUIDE.md#baseengine-integration) for the full pattern + the cross-server invalidation flow.

Key principles:
- **Server trusts its cache completely** (`TrustLocalCacheCompletely = true`) — BaseEntity event-driven invalidation guarantees freshness
- **All RunView/RunViews calls check the server cache first** — even without explicit `CacheLocal`, if data is in cache it's returned with zero DB queries
- **Auto-cache**: Small (≤250 rows), unfiltered, unsorted results are automatically cached on the server because they can be safely maintained in-place via upsert/remove
- **Filtered/sorted caches are invalidated (not updated)** on entity changes — we can't evaluate SQL predicates in JS, so the safe approach is to blow away the cache entry and let it repopulate on next request
- **ResultType is excluded from cache fingerprints** — cache stores plain JSON regardless; transformation to BaseEntity objects happens post-cache
- **`BypassCache: true`** — per-query escape hatch that skips all server-side caching (both read and write). Use for maintenance actions, scheduled jobs, or any query that needs true DB state after direct SQL operations that bypassed `BaseEntity.Save()`

### Check the Registry Before You Query (MJ Convention)

**Before any code bulk-loads an entity's full row set, ask `BaseEngineRegistry` whether a loaded engine already holds it in memory.** In any process that bootstraps via `StartupManager` (MJAPI, MJCLI commands, mj-sync), every `@RegisterForStartup` engine has already paid for its caches — AI Models, Prompts, Queries, Integrations, Dashboards, and dozens more are sitting in RAM before your code runs. Re-querying them doubles the DB round trips, doubles the memory, and triggers the `REDUNDANT DATA LOADING` warning.

The API (see [packages/MJCore/src/generic/baseEngineRegistry.ts](../../packages/MJCore/src/generic/baseEngineRegistry.ts)):

```typescript
import { BaseEngineRegistry } from '@memberjunction/core';

// "Best cache or null" — the common one-liner
const rows = BaseEngineRegistry.Instance.TryGetCachedRecords<UserInfo>('Users', { unfilteredOnly: true });
if (rows) { /* serve from memory */ } else { /* RunView fallback */ }

// Full matches — when you need to vet the donor's config before trusting it
const matches = BaseEngineRegistry.Instance.FindCachedEntity('MJ: AI Prompts', { unfilteredOnly: true });
```

**Vet the donor before reusing its cache.** A match is safe to treat as the authoritative full set only when ALL of these hold:

1. **`unfilteredOnly: true`** — a `Filter` means a subset, useless as a full cache (always pass this option unless you genuinely want subsets)
2. **No `OrderBy`** on the config — ordered configs fail `canUseImmediateMutation`, so the donor responds to entity events with a full refresh that **reassigns** the array property; if you hold the array across mutations, resolve it per-access via donor engine + `config.PropertyName` instead of capturing the reference
3. **`ResultType` is not `'simple'`** (and `records[0] instanceof BaseEntity` when rows exist) — if your code calls `.Get()` / `.Save()` / `.PrimaryKey` on the rows
4. **Not yourself** — guard `match.engine === this` so a prior run's own slot can't masquerade as a donor

**The returned array is the donor's live array — read it, never mutate it** (unless you understand the donor's event-mutation semantics; see `SyncMetadataEngine` for a correctly-engineered exception). The donor's BaseEntity event subscription keeps unfiltered/unordered/`entity_object` arrays current on save/delete automatically, so a live reference stays fresh for free.

**Why this is a convention, not an optimization**: donors are discovered dynamically at runtime, so consumers get faster automatically as new engines ship — no version coupling, no hardcoded donor lists. If no engine caches the entity, the lookup returns empty and you fall back to your own `RunView`/`Load` — graceful by construction.

**Reference implementation**: `SyncMetadataEngine.delegateEntityIfCached()` in [packages/MetadataSync/src/lib/sync-metadata-engine.ts](../../packages/MetadataSync/src/lib/sync-metadata-engine.ts) — partitions a dynamic entity set into "delegate to donor" vs. "self-load", resolves donor arrays per-access, and documents the write-path dedup rules.

**When NOT to use**: per-request user-scoped data (donor caches are typically process-wide, not per-user), entities where you need true DB state after out-of-band SQL writes (use `BypassCache: true` on a RunView instead), or one-off point lookups where a single filtered `RunView` is cheaper than vetting a cache.

### Batch Database Operations
- Use `RunViews` (plural) instead of multiple `RunView` calls
- Group related queries together in a single batch operation
- Example: Load all dashboard data in 2-3 calls instead of 30+

### Deep Pagination — Use Keyset (`AfterKey`), not `StartRow`

For background jobs, scheduled actions, or bulk processing that iterates through *all* records of a large entity, use **`RunViewParams.AfterKey`** (keyset / seek pagination) instead of `StartRow`. Keyset stays O(log N) per page regardless of depth — `StartRow` becomes progressively expensive as the offset grows (each page must enumerate and discard the skipped rows).

```typescript
import { CompositeKey } from '@memberjunction/core';

let lastSeenKey: CompositeKey | undefined;
while (true) {
    const result = await rv.RunView({
        EntityName: 'Tax Returns',
        ExtraFilter: 'AddressLine1 IS NOT NULL',
        AfterKey: lastSeenKey,
        MaxRows: 500,
        ResultType: 'entity_object'
    }, contextUser);

    if (!result.Success || result.Results.length === 0) break;
    for (const r of result.Results) { /* process */ }
    if (result.Results.length < 500) break;

    const last = result.Results[result.Results.length - 1];
    lastSeenKey = CompositeKey.FromID(last.ID);
}
```

**Constraints**: single-column PK only; throws `AfterKeyNotSupportedError` for composite-PK entities (fall back to `StartRow`). UI grid pagination (a few hundred pages of a few hundred rows) should stay on `StartRow` — keyset isn't necessary there.

See **[guides/KEYSET_PAGINATION_GUIDE.md](../../guides/KEYSET_PAGINATION_GUIDE.md)** for full details, examples, and the reference implementations (`ScheduledGeocodingAction`, `VectorBase`, `EntityVectorSyncer`).

### Client-Side Data Aggregation
- Load raw data once, aggregate in memory
- More efficient than multiple filtered queries
- Reduces database round trips significantly

### Observable Patterns
- Use shareReplay(1) for caching data streams
- Implement proper loading states with BehaviorSubject
- Ensure streams are reactive to parameter changes

### RunView ResultType and Fields Optimization

Understanding when to use `ResultType: 'entity_object'` vs `ResultType: 'simple'` is critical for performance:

#### When to Use `entity_object` (Full BaseEntity Objects)
- When you need to **mutate and save** the records
- When you need access to BaseEntity methods (`Save()`, `Delete()`, `Validate()`, etc.)
- When the records will be stored and used across multiple operations
- **DO NOT** use `Fields` parameter with `entity_object` - it is **automatically ignored**
  - `ProviderBase.PreRunView()` ([providerBase.ts:470-477](../../packages/MJCore/src/generic/providerBase.ts#L470-L477)) overrides `Fields` with ALL entity fields
  - This is by design: entity objects need all fields to be valid for mutation/validation

```typescript
// ✅ GOOD - Need to modify and save records
const rv = new RunView();
const result = await rv.RunView<UserEntity>({
    EntityName: 'Users',
    ExtraFilter: `Status='Active'`,
    ResultType: 'entity_object'  // Full BaseEntity objects for mutation
});
for (const user of result.Results) {
    user.LastLoginAt = new Date();
    await user.Save();  // Can save because it's a real entity object
}
```

#### When to Use `simple` (Plain JavaScript Objects)
- When you only need to **read/display** data (no mutation)
- When doing lookups or validation checks
- When the results are temporary and won't be stored
- **USE `Fields` parameter** to narrow the query scope and improve performance

```typescript
// ✅ GOOD - Read-only lookup, narrow field scope
const rv = new RunView();
const result = await rv.RunView<{ID: string; Name: string; Status: string}>({
    EntityName: 'MJ: AI Agent Runs',
    Fields: ['ID', 'Name', 'Status', 'ConversationID'],  // Only fields we need
    ExtraFilter: `Status='Running' AND UserID='${userId}'`,
    ResultType: 'simple'  // Plain objects, no BaseEntity overhead
});
// result.Results is plain objects, cannot call .Save()
```

#### Performance Impact
- **`entity_object`**: Creates full BaseEntity subclass instances with getters/setters, validation, dirty tracking
- **`simple`**: Returns plain JavaScript objects with just the data - much faster for read-only operations
- **`Fields` parameter**: Reduces data transfer by excluding large columns (JSON blobs, text fields)

#### Anti-Patterns
```typescript
// ❌ BAD - Using entity_object when only reading
const result = await rv.RunView<SomeEntity>({
    EntityName: 'Some Entity',
    ResultType: 'entity_object'  // Unnecessary overhead
});
const ids = result.Results.map(r => r.ID);  // Only needed IDs!

// ❌ BAD - Using Fields with entity_object (Fields IS IGNORED - ProviderBase overrides it)
const result = await rv.RunView<SomeEntity>({
    EntityName: 'Some Entity',
    Fields: ['ID', 'Name'],  // IGNORED! ProviderBase.PreRunView() overrides with ALL fields
    ResultType: 'entity_object'
});

// ✅ GOOD - Simple type for read-only with narrow fields
const result = await rv.RunView<{ID: string}>({
    EntityName: 'Some Entity',
    Fields: ['ID'],
    ResultType: 'simple'
});
const ids = result.Results.map(r => r.ID);
```

### Efficient Data Loading with RunViews

#### Batch Multiple Independent Queries
- **ALWAYS** use `RunViews` (plural) when loading multiple independent entities
- This dramatically reduces database round trips and improves performance
- Example - **DO THIS**:
  ```typescript
  const rv = new RunView();
  const [actions, categories, executions] = await rv.RunViews([
    {
      EntityName: 'Actions',
      ExtraFilter: '',
      OrderBy: 'UpdatedAt DESC',
      MaxRows: 1000,
      ResultType: 'entity_object'
    },
    {
      EntityName: 'Action Categories',
      ExtraFilter: '',
      OrderBy: 'Name',
      MaxRows: 1000,
      ResultType: 'entity_object'
    },
    {
      EntityName: 'Action Execution Logs',
      ExtraFilter: '',
      OrderBy: 'StartedAt DESC',
      MaxRows: 1000,
      ResultType: 'entity_object'
    }
  ]);
  ```
- **DON'T DO THIS** (inefficient):
  ```typescript
  // Multiple separate calls - AVOID!
  const [actions, categories, executions] = await Promise.all([
    new RunView().RunView({ EntityName: 'Actions', ... }),
    new RunView().RunView({ EntityName: 'Action Categories', ... }),
    new RunView().RunView({ EntityName: 'Action Execution Logs', ... })
  ]);
  ```

#### Use View Fields Instead of Lookups
- Most MJ views include denormalized fields from related entities
- Example: `AIPromptRunEntity` has both `ModelID` and `Model` (name) fields
- **DO THIS**: Use `run.Model` directly
- **DON'T DO THIS**: Look up model name with a separate query using `ModelID`

#### Avoid Per-Item Queries in Loops
- **NEVER** make RunView calls inside loops
- Load all data once, then process client-side
- Example - **DO THIS**:
  ```typescript
  // Load all data for time range once
  const [promptRuns, agentRuns] = await rv.RunViews([
    { EntityName: 'MJ: AI Prompt Runs', ExtraFilter: dateRangeFilter, ... },
    { EntityName: 'MJ: AI Agent Runs', ExtraFilter: dateRangeFilter, ... }
  ]);

  // Then aggregate into buckets client-side
  for (const bucket of timeBuckets) {
    const bucketData = allRuns.filter(run => isInBucket(run, bucket));
    // Process bucket data
  }
  ```
- **DON'T DO THIS**:
  ```typescript
  // Making queries per bucket - AVOID!
  for (const bucket of timeBuckets) {
    const data = await rv.RunView({
      ExtraFilter: `Date >= '${bucket.start}' AND Date < '${bucket.end}'`
    });
  }
  ```

---

## 🚨 PERSIST USER PREFERENCES VIA `UserInfoEngine` — NEVER `localStorage`

**Never use `window.localStorage` (or `sessionStorage`) to persist user preferences.** All per-user preferences MUST go through `UserInfoEngine.Instance` in `@memberjunction/core-entities`, which writes to the `MJ: User Settings` table.

### Why this matters
- `localStorage` is **per-browser, per-origin** — your preference dies if the user switches browsers, clears site data, signs in from a different machine, or uses incognito. That's a broken cross-device UX.
- `MJ: User Settings` is **per-user, server-side, replicated**. The same person sees the same preferences on every device they sign in from.
- `UserInfoEngine` already has an **in-memory cache** populated at user bootstrap, so `GetSetting()` is a synchronous cache hit — no extra latency vs. localStorage on the read path.
- `SetSettingDebounced()` handles UI write storms (resize, drag, rapid clicks) without hammering the DB.

### The API
```typescript
import { UserInfoEngine } from '@memberjunction/core-entities';

// Read — synchronous, returns string | undefined
const raw = UserInfoEngine.Instance.GetSetting('mj.myFeature.somePref');
const pref = raw ? JSON.parse(raw) : null;

// Write — debounced, fire-and-forget. Preferred for UI handlers.
UserInfoEngine.Instance.SetSettingDebounced('mj.myFeature.somePref', JSON.stringify(value));

// Write — explicit await, returns boolean. Use when you need confirmation.
const saved = await UserInfoEngine.Instance.SetSetting('mj.myFeature.somePref', JSON.stringify(value));

// Delete — async, returns boolean. Fire-and-forget is fine for cleanup paths.
void UserInfoEngine.Instance.DeleteSetting('mj.myFeature.somePref');
```

### Key naming convention
- Prefix with the dashboard/feature root, dot-separated: `mj.<feature>.<prefName>`. Examples already in the codebase:
  - `mj.formBuilder.cockpitPrefs.v1` — Form Builder cockpit pane sizes
  - `mj.formVariant.<entityname>` — per-entity form-variant choice
  - `search.showFilterPanel`, `HomeApp.HidePinEmptyState` — dashboard-scoped flags
- Use **lowercased** entity names / IDs in keys when scoping to a record. This avoids case-variant duplicates in the settings table.
- For non-trivial shapes, serialize as JSON. Include a `v1`/`v2` suffix in the key when the shape may evolve so future code can read the old shape and migrate.

### When `localStorage` IS acceptable
- **Auth/MSAL tokens**: the auth providers manage these themselves; don't second-guess them.
- **Truly ephemeral, throwaway state** that has no value across sessions and you don't want hitting the DB. Rare — most "transient" state is more sticky than you think.
- **Test fixtures**: the Playwright workflow uses `.playwright-cli/profile` to persist auth across runs. That's tooling, not application UX.

### Anti-patterns to avoid

```typescript
// ❌ WRONG — preference dies on browser switch / cache clear
window.localStorage.setItem('mj.somePref', JSON.stringify(value));

// ❌ WRONG — same problem, different syntax
sessionStorage.setItem('mj.somePref', value);

// ✅ CORRECT — server-persisted, cross-device
UserInfoEngine.Instance.SetSettingDebounced('mj.somePref', JSON.stringify(value));
```

If you're tempted to use `localStorage` because "it's just a little thing" — that's exactly the kind of preference users notice when it disappears on the next laptop. Default to `UserInfoEngine`. Only deviate with a documented reason.

---

## Entity Version Control
- MemberJunction includes built-in version control called "Record Changes" for all entities
- This feature tracks all changes to entity records unless explicitly disabled
- No need to implement custom versioning - it's handled automatically by the framework
- Access historical versions through the Record Changes entities

## Related guides

- **[Search Overview](../../guides/SEARCH_OVERVIEW_GUIDE.md)** — decision tree across `EntityByName`/`SearchEntity`/`FullTextSearch`/`SearchEngine.Search`. Read first when you need to *find* records.
- **[Caching & Pub/Sub](../../guides/CACHING_AND_PUBSUB_GUIDE.md)** — the authoritative caching guide.
- **[Keyset Pagination](../../guides/KEYSET_PAGINATION_GUIDE.md)** — deep pagination via `AfterKey`.
- **[BaseEntity Server-Side Patterns](../../guides/BASE_ENTITY_SERVER_PATTERNS.md)** — before writing a server-side entity subclass.
- **[Unified Permissions](../../guides/UNIFIED_PERMISSIONS_GUIDE.md)** — before gating any action or filtering rows.
- Full guide index: [`guides/README.md`](../../guides/README.md)
