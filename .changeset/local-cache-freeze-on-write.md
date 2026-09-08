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
  slot-maintenance path that bypasses the first. The freeze lands immediately after the only
  gate that can decline a write (the synchronous oversized-entry check) and **before** the
  awaited eviction steps — callers do not always await these methods, so any yield point
  before the freeze is a window in which shared rows are handed out still mutable. Browser
  clients are untouched (IndexedDB / localStorage serialize), but **Node-side clients — the
  CLI, MetadataSync, and anything else on an in-memory provider — do get the freeze**, so
  "client behavior is unchanged" holds only for the browser. The freeze decision also follows
  the provider across `SetStorageProvider`: MJAPI initializes on the in-memory provider during
  engine loading and swaps to Redis afterward, two providers with opposite semantics in one
  process. The deep-freeze skips **binary payloads**
  (`Buffer`/TypedArray/`ArrayBuffer`, e.g. `varbinary` columns — `Object.freeze` throws on
  non-empty views by spec), freezes parent-first so cycles terminate, and a freeze failure of
  any kind degrades to a logged, unfrozen store — it can never fail a `RunView`/`RunQuery`.
- **Dataset cache slots get their own key namespace.** `GetDatasetByName` keyed its
  write-through cache with the same fingerprint builder ordinary reads use, passing only
  `{ EntityName, ExtraFilter }` — and every shipped dataset item has a NULL `WhereClause`, so a
  dataset item and a plain unfiltered `RunView` of the same entity produced an IDENTICAL key and
  silently shared one slot. That leaked the `MJ_Metadata` scaffolding exemption below to ordinary
  callers of `MJ: Entities` / `MJ: Entity Fields` (the most-read entities in the process, served
  unfrozen), and in the other direction let an ordinary read repopulate an evicted slot FROZEN so
  the next metadata refresh threw. `GenerateRunViewFingerprint` now takes an optional dataset
  segment, appended only when supplied — ordinary reads keep their exact pre-existing key, so no
  existing cache entry is invalidated.
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
  This broke AI cost calculation on `MJ: AI Model Costs.Currency`. `Get()` now memoizes into a
  per-instance side table and never writes to the row at all. Gating the write on a once-sampled
  `Object.isFrozen` was not sufficient: the freeze is asynchronous relative to the consumer (cache
  writes are not always awaited), so the sample could be stale by the first read and the write
  still threw. Keeping the memo off the row makes freeze timing irrelevant AND restores the
  optimization for frozen rows, which the isFrozen-guard version had given up.
- **`ResolverBase.MapFieldNamesToCodeNames` renamed fields on its argument.** Callers pass rows
  straight from `findBy`/`RunView` — the cache's own objects — so with the freeze in place
  `UserByEmail`, `UserByID`, `UserByEmployeeID` and every CodeGen-generated single-record resolver
  over a cached entity threw `Cannot add property _mj__CreatedAt, object is not extensible`
  (reproduced live against a running MJAPI). Before the freeze it did something quieter and worse:
  it rewrote the cached row's keys. It now returns a copy, which fixes every call site at once;
  `ArrayMapFieldNamesToCodeNames` likewise returns a new array of new objects.
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

- **Cache-served reads skipped the `PostRunView` hook chain entirely.** `PostRunView` is the
  OUTPUT half of the data-hook enforcement seam (masking / audit) and hooks receive
  `contextUser`, so masking is per-user while a cache slot is shared — there is no correct way
  to apply it once at write time for a reader who has not arrived yet. Three of the four server
  paths already ran the chain (miss, mixed batch, client smart-cache); the singular cache hit and
  the all-cached batch returned early, so masking depended on whether a *sibling* view in the same
  batch happened to miss. This looked correct before only by accident: the cache write precedes
  the hooks, so an in-place masking hook wrote through into the cached rows — which both made
  later hits appear masked and baked one user's masking decision into a shared slot. Both hit
  paths now run the chain against the per-hit result wrapper, so a hook's replacement reaches the
  caller and can never write back into the cache. The zero-hook path (the default — no shipped
  middleware overrides `PostRunView`) costs ~80ns, down from ~2.4µs: `GetDataHooks` now memoizes
  the resolved global object store, whose `GetGlobalObjectStore()` probe throws and catches a
  `ReferenceError` on every call under Node (~1.4µs), and the hit paths check for registered hooks
  before awaiting the chain.

The cache result types stay ordinary mutable arrays, documented as shared-and-frozen: the runtime
freeze is the enforcement, and a `readonly` marker would have broken existing downstream readers
without adding protection. **This release contains no breaking changes** — every public signature
it touches is additive or unchanged.

Consumer-facing contract, documented in `guides/CACHING_AND_PUBSUB_GUIDE.md`: **treat rows from
`RunView`/`RunViews`/`RunQuery` as read-only** unless you produced them. Copy before mutating —
`rows.map(r => ({ ...r }))`, `[...rows].sort(...)`. Narrow-`Fields` requests and
`ResultType: 'entity_object'` results are unaffected (both get per-caller objects).
