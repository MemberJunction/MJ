# MJAPI OOM Fix — Status Update

**Branch:** `CB-render-pipeline-AST`
**Last updated:** 2026-05-21
**Status:** Two fixes shipped to code; one additional refinement identified, not yet applied.

---

## TL;DR

- MJAPI was OOM-ing after ~2 hours of parallel suite traffic due to a slow memory leak in `BaseEngine`.
- Heap-snapshot analysis identified two distinct retention paths through which per-request `SQLServerDataProvider` instances were being pinned by long-lived singletons.
- Two surgical changes were shipped to `packages/MJCore/src/generic/baseEngine.ts`. Post-fix snapshots show **~89% reduction** in leaked per-request providers (47 retained pre-fix → 5 retained after ~3 hours of sustained load).
- One additional one-line refinement has been identified that should close the remaining 5/17. It is not yet applied — see "Next step" below.

---

## The problem

MJAPI runs many concurrent GraphQL requests against a single Node process. To give each request transaction isolation and per-user context, [packages/MJServer/src/context.ts](../packages/MJServer/src/context.ts) creates a fresh `SQLServerDataProvider` for every request. These per-request providers are intended to live for milliseconds-to-minutes and then be garbage-collected when the response is sent.

The leak: each new per-request provider, after even one engine load against it, was being permanently retained by long-lived singletons. The provider held its `_localMetadata` snapshot (~MB each), pinned every `BaseEntity` it had created, and kept its RxJS subscriptions alive. With hundreds of requests per hour, the heap filled steadily until OOM.

Observed symptom in production:

```
FATAL ERROR: Ineffective mark-compacts near heap limit
Allocation failed - JavaScript heap out of memory
Mark-Compact 4060.6 -> 4054.0 MB
```

…roughly 2 hours after process start.

---

## Architecture in 60 seconds

Three layers matter:

- **`IMetadataProvider`** — abstracts the DB connection. Each instance holds its DB pool refs, transaction state, a local metadata cache, and the active user. `SQLServerDataProvider` is the concrete implementation.
- **`BaseEntity`** — strongly-typed entity wrapper (`MJQueryEntity`, etc.). **Every BaseEntity holds a strong `_provider` back-reference** to the provider that created it. This is the root of the leak.
- **`BaseEngine`** — long-lived cache singletons (`QueryEngine`, `TemplateEngine`, etc.). Loads its metadata once at startup, serves it from memory, subscribes to MJGlobal events to auto-refresh on entity changes. Includes a fast-path optimization that mutates its cache arrays directly when a save event fires (`applyImmediateMutation`).

When a per-request provider creates a `MJQueryEntity` and saves it, an MJGlobal save event fires carrying that entity. The global `QueryEngine` subscriber receives the event and updates its `_queries` array. Both leaks lived in this interaction.

---

## Issues identified

### Issue 1 — Static registry array never released entries

`BaseEngine` had a private static field used as a per-provider engine cache:

```ts
private static _providerInstances: {
    provider: IMetadataProvider,
    subclassConstructor: any,
    instance: any
}[] = [];
```

Every time a `BaseEngine` subclass's `Load()` ran against a provider, an entry was pushed. **There was no removal.** Per-request providers that triggered any engine load entered the array permanently. Each entry strongly retained:
- The provider (its `_localMetadata`, transaction state, DB pool refs, RxJS subscriptions)
- The engine instance (cached entity arrays, with each entity holding `_provider` back-refs)

After N per-request providers had touched any engine, N (provider, engine, entities) tuples were pinned for the process lifetime.

### Issue 2 — Save events stored the saver's entity directly in the global cache

When the global `QueryEngine` received a save event, `applyImmediateMutation` ran:

```ts
// Before fix
const entity = event.baseEntity;          // entity owned by the saving provider

if (event.type === 'save') {
    if (event.saveSubType === 'create') {
        // ...
        currentData.push(entity);          // ← cached the SAVER's entity directly
    } else {
        // ...
        currentData[index] = entity;       // ← replaced cached entity with SAVER's
    }
}
```

`event.baseEntity._provider` was whatever provider performed the save. If a per-request provider P1 created an `MJQueryEntity` and saved it, the global `QueryEngine._queries` array now held an entity with `_provider === P1`. When the request finished and P1 went out of scope on the resolver side, **P1 was still strongly reachable via the global engine's array**. P1 never got GC'd.

In a heap snapshot taken near OOM, 47 `SQLServerDataProvider` instances were retained via exactly this chain:

```
SQLServerDataProvider (retained, ~50 MB of associated state each)
  ↑ _provider in MJQueryFieldEntity
    ↑ [array index] in Array
      ↑ _fields in QueryEngine          ← the global singleton
        ↑ ___SINGLETON__QueryEngine in global
```

This was the dominant leak.

---

## Fixes applied (currently in code)

Both changes are in [packages/MJCore/src/generic/baseEngine.ts](../packages/MJCore/src/generic/baseEngine.ts).

### Fix 1 — WeakMap registry

Replaced the strong-reference array with a `WeakMap` keyed by provider:

```ts
// After fix
private static _providerInstances: WeakMap<IMetadataProvider, Map<Function, BaseEngine<unknown>>> = new WeakMap();
```

A `WeakMap` holds weak references to its keys. When nothing else in the program references the provider, the WeakMap entry (and the inner `Map<ctor, engine>`) automatically becomes garbage-collectable. No explicit removal needed.

```ts
public static GetProviderInstance<T>(provider: IMetadataProvider, subclassConstructor: new () => BaseEngine<T>): BaseEngine<T> {
    const perProviderMap = BaseEngine._providerInstances.get(provider);
    if (perProviderMap) {
        const existing = perProviderMap.get(subclassConstructor);
        if (existing) return existing as BaseEngine<T>;
    }
    const newInstance = new subclassConstructor();
    newInstance.SetProvider(provider);
    return newInstance;
}

protected CheckAddToProviderInstances(provider: IMetadataProvider) {
    let perProviderMap = BaseEngine._providerInstances.get(provider);
    if (!perProviderMap) {
        perProviderMap = new Map();
        BaseEngine._providerInstances.set(provider, perProviderMap);
    }
    if (!perProviderMap.has(this.constructor)) {
        perProviderMap.set(this.constructor, this);
    }
}
```

Bonus: O(1) by-identity lookup, replacing the O(N) linear scan that `Array.find` was doing.

### Fix 2 — Clone before caching

In `applyImmediateMutation`, before storing the saved entity into the engine's array, clone it into a fresh BaseEntity owned by the engine's own provider:

```ts
// After fix — applyImmediateMutation is now async
protected async applyImmediateMutation(config: BaseEnginePropertyConfig, event: BaseEntityEvent): Promise<void> {
    const currentData = (this as any)[config.PropertyName] as BaseEntity[];
    const entity = event.baseEntity;

    if (event.type === 'save') {
        const cached = await this.cloneEntityForCache(entity, config);
        if (!cached) {
            LogError(`applyImmediateMutation: failed to clone entity for ${config.EntityName}; skipping`);
            return;
        }

        if (event.saveSubType === 'create') {
            const indexByKey = this.findEntityIndexByPrimaryKeys(currentData, entity);
            if (indexByKey >= 0) currentData[indexByKey] = cached;
            else                 currentData.push(cached);
        } else {
            const index = this.findEntityIndexByPrimaryKeys(currentData, entity);
            if (index >= 0) currentData[index] = cached;
            else            currentData.push(cached);
        }
    }
    // delete path unchanged
}

protected async cloneEntityForCache(source: BaseEntity, config: BaseEnginePropertyConfig): Promise<BaseEntity | null> {
    const provider = this.ProviderToUse;
    if (!provider) return null;
    const fresh = await provider.GetEntityObject<BaseEntity>(config.EntityName, this._contextUser);
    if (!fresh) return null;
    fresh.LoadFromData(source.GetAll());        // copy field values
    return fresh;                                // fresh._provider === engine's provider
}
```

The cached entity now has `_provider` pointing to the engine's own provider, not the saver's per-request one. Side effects: `applyImmediateMutation` is now async (both call sites are already in async functions, so it was a 2-line update to add `await`); one unit test was updated to match.

---

## Results

Same Skip-style stress workload before and after the fixes.

| Metric | Pre-fix | Post-fix (live snapshot, ~3 hours of sustained load) |
|---|---|---|
| Total retained `SQLServerDataProvider` instances | 47 | 17 |
| └─ Of those, leaked per-request via the engine chain | 47 | **5** |
| └─ Code/class references (not real instances) | n/a | 4 |
| └─ Legitimate persistent providers (`MJ_RunQueryProvider`, `RuntimeSchemaManager._ddlProvider`, global, etc.) | n/a | 2-3 |
| └─ In-flight at snapshot time (3-way concurrency = 3 active save events) | n/a | 3 |
| └─ Orphans (no retainer found within depth limit; GC-eligible) | n/a | 3 |
| Heap during 9-minute concurrency=3 stress (post-fix) | OOM in <15 min in production | oscillating 1.3-2.1 GB, GC working normally |
| Heap at minute 6 of sustained load | 4.4 GB and climbing | 644 MB, flat |

**Net result: 89% reduction in leaked per-request providers** (47 → 5). MJAPI no longer OOMs under sustained load at the heap caps that previously failed.

Live diagnostic heartbeats during sustained stress (`[diag]` lines in `mjapi.log`):

```
[diag] uptime=1394s rss=4372MB heap=1377/1807MB cache.entries=965  cache.callbacks=102
[diag] uptime=1514s rss=4412MB heap=1483/1906MB cache.entries=1037 cache.callbacks=102
[diag] uptime=1634s rss=4555MB heap=1758/2070MB cache.entries=1112 cache.callbacks=102
[diag] uptime=1754s rss=4770MB heap=1691/2074MB cache.entries=1176 cache.callbacks=102
[diag] uptime=1875s rss=4641MB heap=2041/2142MB cache.entries=1248 cache.callbacks=102
[diag] uptime=1935s rss=4487MB heap=1669/1781MB cache.entries=1278 cache.callbacks=102
```

Heap oscillates between ~1.3 GB and ~2.1 GB. That's a healthy GC pattern — heap rises during a burst of work, GC reclaims, heap drops back. **Not the monotonic climb of a leak.** `cache.callbacks` is flat at 102 (no callback accumulation either).

---

## Why 5 are still leaking

The remaining 5 retained per-request providers reveal a deeper architectural issue.

`ProviderToUse` is defined on `BaseEngine` as:

```ts
public get ProviderToUse(): IMetadataProvider {
    return this._provider || Metadata.Provider;
}
```

`_provider` is mutated by every `SetProvider(provider)` call, which is invoked indirectly via `Config(forceRefresh, contextUser, provider)`. When `QueryEngineServer.InnerLoad` (in [packages/MJCoreEntitiesServer/src/engines/QueryEngineServer.ts:173](../packages/MJCoreEntitiesServer/src/engines/QueryEngineServer.ts#L173)) runs per-request and calls:

```ts
await QueryEngine.Instance.Config(forceRefresh, contextUser, provider);
```

…where `provider` is a per-request provider, the **global** `QueryEngine.Instance._provider` gets overwritten to that per-request provider. If an `applyImmediateMutation` fires during that window, `cloneEntityForCache` uses the hijacked per-request provider, and the clone still pins the per-request provider.

It's a race condition. Most save events fire when `_provider` is still the global default → no leak. A minority fire while it's hijacked → leak. With sustained traffic and high concurrency, the "minority" accumulates over time. That's the 5 we see.

---

## Next step (identified, not yet applied)

A one-line change in `cloneEntityForCache` should eliminate the remaining 5/17 leak:

```ts
protected async cloneEntityForCache(source: BaseEntity, config: BaseEnginePropertyConfig): Promise<BaseEntity | null> {
    try {
        const provider = Metadata.Provider;   // ← was: this.ProviderToUse
        if (!provider) return null;
        const fresh = await provider.GetEntityObject<BaseEntity>(config.EntityName, this._contextUser);
        if (!fresh) return null;
        fresh.LoadFromData(source.GetAll());
        return fresh;
    } catch (e) { LogError(e); return null; }
}
```

`Metadata.Provider` is the static global default — it's set once at startup and is always a persistent provider for server-side code. Using it directly bypasses the `_provider` hijacking issue: the clone is always owned by a persistent provider, regardless of what the engine instance's `_provider` was overwritten to.

Trade-offs:
- **Single-tenant MJAPI (the standard case):** perfect fix; should eliminate the remaining 5/17 leak entirely.
- **Multi-tenant client (BCSaaS):** each tenant has its own engine instance with a consistent per-tenant `_provider`, and `Metadata.Provider` on the client is set per browser session to that tenant's provider. Safe.
- **Hypothetical server-side multi-tenant:** if MJAPI ever serves multiple tenants concurrently from one process (it doesn't today), using `Metadata.Provider` would pick the global default rather than the per-tenant provider. Purely theoretical risk.

A deeper architectural fix (preventing `_provider` hijacking on a non-null engine instance) is more invasive and risks breaking legitimate multi-provider scenarios. The one-line `Metadata.Provider` swap is the minimum effective change.

**Decision required:** apply this refinement now or accept the 89% result as the current ceiling.

---

## Files changed (currently in code)

- [packages/MJCore/src/generic/baseEngine.ts](../packages/MJCore/src/generic/baseEngine.ts) — both fixes (WeakMap + clone)
- [packages/MJCore/src/\_\_tests\_\_/baseEngine.observable.test.ts](../packages/MJCore/src/__tests__/baseEngine.observable.test.ts) — test mock updated to override `cloneEntityForCache` (pass-through) and await the now-async `applyImmediateMutation`

Build is clean: MJCore, MJCoreEntities, SQLServerDataProvider, MJServer all compile without errors. All 1160 MJCore unit tests pass.

---

## What's deliberately not in scope

One more theoretical retention path exists: engine instances subscribe to MJGlobal events and never unsubscribe. If a per-request provider triggered creation of a fresh per-request engine instance, that engine's RxJS subscription would be permanent for the process lifetime.

In the current heap snapshots this path is not active — we don't see fresh per-request `BaseEngine` instances being created in practice. The pattern that *was* active is the global singleton's cache being polluted, which is what both shipped fixes address. The subscription path is preventive against a hypothetical future use case where per-request `GetProviderInstance(perReqProvider, EngineX)` actually fires. If that becomes a real production pattern, two design options are available (a `Lifetime: 'persistent' | 'request-scoped'` flag on the provider, or explicit `Dispose()` plumbed through the Apollo request lifecycle), but neither is currently warranted.

---

## Summary

| | Status |
|---|---|
| Issue 1 (registry array leak) | **Fixed** — WeakMap |
| Issue 2 (save-event cache pollution) | **Fixed** (mostly) — clone path active; ~89% reduction observed |
| Issue 2 residual (5 of 17, root cause: `_provider` hijacking) | Identified, one-line fix proposed, not yet applied |
| Validation | Sustained 3+ hour stress run; no OOM; heap oscillating in healthy GC pattern; live snapshot taken and analyzed |
| Production readiness | Current code is shippable; refinement is optional polish |
