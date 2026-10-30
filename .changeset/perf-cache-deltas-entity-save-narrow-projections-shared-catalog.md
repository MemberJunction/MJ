---
"@memberjunction/core": patch
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/postgresql-dataprovider": patch
"@memberjunction/redis-provider": patch
"@memberjunction/server": patch
"@memberjunction/testing-integration": patch
---

Performance and memory optimizations across cache invalidation, entity save/hydration, narrow `RunView` SQL projections, and multi-pool metadata startup:

- **Row-delta (`row_delta`) cross-replica cache invalidation & $O(\Delta)$ `BaseEngine` updates**: `LocalCacheManager.ApplyRowChanges` and `RedisLocalStorageProvider` now broadcast compact `row_delta` pub/sub payloads (`upsertedRows`, `deletedPrimaryKeys`, `rowCount`, `maxUpdatedAt`, `schemaHash`) instead of re-serializing the full `CachedRunViewData` array, and `BaseEngine.OnExternalCacheChange` updates in-memory arrays in $O(\Delta)$ while preserving untouched `BaseEntity` object references (falling back safely on `rowCount` drift, `schemaHash` mismatch, or custom `OrderBy`).
- **In-place `BaseEntity.finalizeSave()` / `Hydrate()` & batched IS-A discovery/hydration**: Reuses hydrated `EntityField` instances and field-name lookup maps across saves (`0` `EntityField` reallocations), adds `FindISAChildEntitiesBatch` (`UNION ALL` `WHERE pk IN (...)`) to `DatabaseProviderBase` / SQL Server / PostgreSQL, batches `TransformSimpleObjectToEntityObject` IS-A child hydration from $2N$ queries to $1\text{–}2$ queries per level, and collapses `CheckForChildRecords()` / `ResolveLeafEntity()` to 1 `UNION ALL` probe.
- **Narrow `Fields` server `RunView` / `RunViews`: cache-first read and an explicit opt-out**: On the server (`TrustLocalCacheCompletely`), a narrow `Fields` request first consults a warm superset cache slot (0-SQL hit projected to `Fields ∪ PK`). On a miss, cache-allowed entities still widen to the full entity superset and populate the shared slot (so later `Fields` subsets hit); `CacheLocal: false` or `BypassCache: true` now opts out end-to-end, preserving the narrow SQL `SELECT` without writing partial rows to the cache. Batched `RunViews` project each miss to its own param's `Fields`.
- **Test harness**: `InstrumentedLocalStorageProvider` records each write's options (`Writes` / `RowDeltaWrites`) so integration checks can assert what a distributed provider would broadcast.
- **Shared read-only metadata catalog & multi-pool `ViewColumnOrderCache` deduplication**: `MJServer` CodeGen DDL providers adopt the global `Metadata.Provider` catalog on boot (`ignoreExistingMetadata: false`), `SQLServerDataProvider` keys view-column-order `sys.columns` scans by database target and login (same-login pools share one scan; the read-only and CodeGen logins never stand in for the read-write one) with cross-pool invalidation, and `MJServer/src/context.ts` replaces dynamic PostgreSQL provider imports with a static import.
