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

- **`ILocalStorageProvider` requires `readonly SharesReferences: boolean`**, declaring whether a
  provider hands back live references (the in-memory providers) or serialized copies
  (IndexedDB, localStorage, Redis, MMKV). It is required rather than optional so every
  implementation must state its isolation semantics instead of inheriting a default that may be
  wrong for it.
- **`LocalCacheManager` deep-freezes row data at write time** — rows, their nested values, and
  the array itself — but only when the provider shares references. Mutations then throw a
  `TypeError` at the offending line instead of silently corrupting shared state, and cache
  **hits cost nothing extra** (the freeze is a one-time per-write cost). Applied at both write
  funnels: `SetRunViewResult` / `SetRunQueryResult` and `storeCachedResults`, the in-place
  slot-maintenance path that bypasses the first. Serializing providers are untouched, so
  client behavior is unchanged.
- **`CacheWriteOptions.ProviderInternalScaffolding`** exempts slots whose only consumer is the
  provider that wrote them. Metadata bootstrap needs this: `GetDatasetByName` caches dataset
  items through this cache, and `PostProcessEntityMetadata` hydrates its object graph by
  sorting that row array in place and attaching child collections onto each row. The flag is
  persisted and carried forward through slot maintenance so a later save cannot re-freeze the
  slot.

Two pre-existing consumer bugs were surfaced by the freeze and fixed:

- **`BaseEntity.Get()` wrote to its own source row.** The raw-mode fast path keeps the caller's
  row by reference and `Get()` wrote back into it to memoize a converted `Date` or an rtrimmed
  fixed-width string — so on a cache-served row, *reading* a `datetime` or `CHAR(n)` field threw.
  This broke AI cost calculation on `MJ: AI Model Costs.Currency`. The memo is now skipped when
  the source row is frozen; the conversion still returns the correct value, and unfrozen rows
  keep the optimization.
- **`GenericDatabaseProvider.serveFromServerCache` and the smart-cache legs** duplicated
  `CachedRunViewResult` as four inline structural types, which had already caused one silent
  field drop; they now share the canonical type.

`CachedRunViewData.results` / `CachedRunViewResult.results` are typed `readonly` so
cache-adjacent code gets a compile-time signal matching the runtime freeze. `RunViewResult.Results`
remains a mutable `T[]` for ordinary callers.

Consumer-facing contract, documented in `guides/CACHING_AND_PUBSUB_GUIDE.md`: **treat rows from
`RunView`/`RunViews`/`RunQuery` as read-only** unless you produced them. Copy before mutating —
`rows.map(r => ({ ...r }))`, `[...rows].sort(...)`. Narrow-`Fields` requests and
`ResultType: 'entity_object'` results are unaffected (both get per-caller objects).
