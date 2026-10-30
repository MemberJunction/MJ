---
"@memberjunction/core": patch
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/postgresql-dataprovider": patch
"@memberjunction/redis-provider": patch
"@memberjunction/server": patch
---

Performance and memory optimizations across cache invalidation, entity save/hydration, narrow `RunView` SQL projections, and multi-pool metadata startup:

- **Row-delta (`row_delta`) cross-replica cache invalidation & $O(\Delta)$ `BaseEngine` updates**: `LocalCacheManager.ApplyRowChanges` and `RedisLocalStorageProvider` now broadcast compact `row_delta` pub/sub payloads (`upsertedRows`, `deletedPrimaryKeys`, `rowCount`, `maxUpdatedAt`, `schemaHash`) instead of re-serializing the full `CachedRunViewData` array, and `BaseEngine.OnExternalCacheChange` updates in-memory arrays in $O(\Delta)$ while preserving untouched `BaseEntity` object references (falling back safely on `rowCount` drift, `schemaHash` mismatch, or custom `OrderBy`).
- **In-place `BaseEntity.finalizeSave()` / `Hydrate()` & batched IS-A discovery/hydration**: Reuses hydrated `EntityField` instances and field-name lookup maps across saves (`0` `EntityField` reallocations), adds `FindISAChildEntitiesBatch` (`UNION ALL` `WHERE pk IN (...)`) to `DatabaseProviderBase` / SQL Server / PostgreSQL, batches `TransformSimpleObjectToEntityObject` IS-A child hydration from $2N$ queries to $1\text{–}2$ queries per level, and collapses `CheckForChildRecords()` / `ResolveLeafEntity()` to 1 `UNION ALL` probe.
- **Narrow `Fields` SQL projection preservation on ad-hoc server `RunView` / `RunViews`**: Consults warm superset cache slots first (0-SQL hit projected to `Fields ∪ PK`), and on cache miss preserves narrow `Fields` SQL projections without widening to `SELECT *` or writing partial rows to cache unless `CacheLocal: true` or `ResultType === 'entity_object'`.
- **Shared read-only metadata catalog & multi-pool `ViewColumnOrderCache` deduplication**: `MJServer` CodeGen DDL providers adopt the global `Metadata.Provider` catalog on boot (`ignoreExistingMetadata: false`), `SQLServerDataProvider` keys view-column-order `sys.columns` scans by normalized database target across RW/RO/CodeGen pools with cross-pool invalidation, and `MJServer/src/context.ts` replaces dynamic PostgreSQL provider imports with a static import.
