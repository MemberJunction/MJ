---
'@memberjunction/core': patch
'@memberjunction/server': patch
'@memberjunction/generic-database-provider': patch
'@memberjunction/graphql-dataprovider': patch
'@memberjunction/redis-provider': patch
'@memberjunction/testing-integration': patch
---

Fix process-wide server cache corruption, and make the cache structurally unable to be
corrupted by consumers.

**Take this bump urgently if you run MJAPI.** `ResolverBase` mapped GraphQL transport field
names onto the data provider's own result rows, which the server cache holds *by reference*.
Preparing one GraphQL response therefore rewrote `__mj_CreatedAt` to the wire alias
`_mj__CreatedAt` **inside the live cache**, and every later read served the corrupted shape —
failing in `BaseEntity.SetMany` with `Field _mj__CreatedAt does not exist on <Entity>`. The
cache is process-wide, so a single response poisoned every subsequent request across all
workers. Fixed by mapping onto copies.

Fixing it at the reader alone left the whole class of bug open — nothing in the type system or
the API surface said "this array is shared, do not mutate," and the exposure runs in both
directions (a cache *hit* returns the stored array; a cache *miss* stores the array it is about
to return). So the cache now defends itself:

- **`ILocalStorageProvider` gains an optional `readonly SharesReferences?: boolean`**, declaring
  whether a provider hands back live references (the in-memory providers) or serialized copies
  (IndexedDB, localStorage, Redis, MMKV). **Fully backward compatible**: existing implementations
  keep compiling, and omitting the property is not an opt-out — `LocalCacheManager` measures any
  provider that does not declare one (store a sentinel, read it back, compare identity), so a
  provider written before this contract still gets the correct protection instead of silently
  losing it to a falsy default.
- **`LocalCacheManager` deep-freezes row data at write time** — rows, their nested values, and
  the array itself — but only when the provider shares references. Mutations then throw a
  `TypeError` at the offending line instead of silently corrupting shared state, and cache
  **hits cost nothing extra** (the freeze is a one-time per-write cost). Applied at both write
  funnels: `SetRunViewResult` / `SetRunQueryResult` and `storeCachedResults`, the in-place
  slot-maintenance path that bypasses the first. Serializing providers are untouched, so
  client behavior is unchanged. The deep-freeze skips **binary payloads**
  (`Buffer`/TypedArray/`ArrayBuffer`, e.g. `varbinary` columns — `Object.freeze` throws on
  non-empty views by spec), freezes parent-first so cycles terminate, and a freeze failure of
  any kind degrades to a logged, unfrozen store — it can never fail a `RunView`/`RunQuery`.
- **`CacheWriteOptions.ProviderInternalScaffolding`** exempts slots whose only consumer is the
  provider that wrote them — scoped to the **`MJ_Metadata` dataset only** at its single write
  site. Metadata bootstrap needs this: the provider's own assembly (`PostProcessEntityMetadata`,
  plus `GetAllMetadata`'s Applications assembly) hydrates its object graph by mutating those
  rows in place. Every **other** dataset's cached rows are frozen shared state like any RunView
  result, because `GetDatasetByName` serves them to arbitrary consumers (`BaseEngine.Load` hands
  the live arrays to every engine subclass). The flag is persisted and carried forward through
  slot maintenance so a later save cannot re-freeze the slot.

Pre-existing consumer bugs surfaced by the freeze and fixed:

- **`BaseEntity.Get()` wrote to its own source row.** The raw-mode fast path keeps the caller's
  row by reference and `Get()` wrote back into it to memoize a converted `Date` or an rtrimmed
  fixed-width string — so on a cache-served row, *reading* a `datetime` or `CHAR(n)` field threw.
  This broke AI cost calculation on `MJ: AI Model Costs.Currency`. The memo is now skipped when
  the source row is frozen; the conversion still returns the correct value, and unfrozen rows
  keep the optimization.
- **`GenericDatabaseProvider.serveFromServerCache` and the smart-cache legs** duplicated
  `CachedRunViewResult` as four inline structural types, which had already caused one silent
  field drop; they now share the canonical type.
- **The singular server RunView path silently dropped a `PostRunView` hook's returned
  replacement result** (`PostRunView` reassigned a local; `RunView` returned the pre-hook
  reference), while the client and batch paths honored it. The freeze un-masked this: with
  in-place row mutation now throwing, no signature-conformant result-modifying hook worked on
  that path at all. `PostRunView` now copies a hook-supplied replacement onto the result object
  it was handed, so the change reaches the caller — its `Promise<void>` signature is unchanged,
  so external subclasses that override it keep compiling. Hook docs (`PostRunViewHook`,
  `BaseServerMiddleware.PostRunView`) now state that rows may be frozen shared cache state:
  modify by mapping onto copies (`results.Results = results.Results.map(r => ({ ...r, ... }))`)
  or return a new result — never mutate rows in place.

The cache result types stay ordinary mutable arrays, documented as shared-and-frozen: the runtime
freeze is the enforcement, and a `readonly` marker would have broken existing downstream readers
without adding protection. **This release contains no breaking changes** — every public signature
it touches is additive or unchanged.

Consumer-facing contract, documented in `guides/CACHING_AND_PUBSUB_GUIDE.md`: **treat rows from
`RunView`/`RunViews`/`RunQuery` as read-only** unless you produced them. Copy before mutating —
`rows.map(r => ({ ...r }))`, `[...rows].sort(...)`. Narrow-`Fields` requests and
`ResultType: 'entity_object'` results are unaffected (both get per-caller objects).
