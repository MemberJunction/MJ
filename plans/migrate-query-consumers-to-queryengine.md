# Plan: Migrate Query Consumers from Metadata.Provider to QueryEngine

## Status: Phases 1–5 Complete. Phase 6 (Deprecation) Pending.

## Context

When a query is saved, `MJQueryEntityServer.RefreshRelatedMetadata(true)` called `provider.Refresh()` which reloaded the **entire metadata dataset** (entities, fields, applications, roles, queries — everything) from the database. For large-entity deployments like NSTA (thousands of entities), this was the core performance bottleneck — Skip failed to save queries because of it.

`QueryEngine` (a BaseEngine subclass) already had **event-driven cache invalidation** — it updates its arrays immediately on save/delete via BaseEntity events, with zero DB round-trip. The fix was to redirect all query-data consumers to use QueryEngine and eliminate the wasteful `provider.Refresh()` calls.

### Team Alignment
- **Madhav**: Confirmed this is the biggest problem with runtime saves for large entity sets
- **Caeleb**: Confirmed the approach sounds right
- **Amith**: Agreed, pushed to lean on QueryEngine completely — rely on built-in event-driven cache invalidation

---

## Phase 1: QueryEngine Enhancements — DONE

- Added 3 missing data types to QueryEngine: `MJ: Query Dependencies`, `MJ: Query SQLs`, `MJ: SQL Dialects`
- QueryEngine now returns `MJQueryEntityExtended[]` from its `Queries` getter

## Phase 2: MJQueryEntityExtended — DONE

Created `MJQueryEntityExtended` in `@memberjunction/core-entities` with:
- Child-relationship getters: `QueryFields`, `QueryParameters`, `QueryEntities`, `QueryPermissions`, `QueryDependencies`, `QueryDependents`
- IQueryInfoBase-compatible aliases: `Fields`, `Parameters`, `Entities`
- Business logic: `UserCanRun()`, `UserHasRunPermissions()`, `IsApproved`, `IsComposable`
- Category navigation: `CategoryPath`, `CategoryEntity`, `BuildCategoryPath()`
- Platform SQL resolution: `GetPlatformSQL()`
- Cache configuration: `CacheConfig` (with category inheritance)
- `MJQueryEntityServer` now extends `MJQueryEntityExtended`

## Phase 3: Eliminate provider.Refresh() — DONE

Removed `provider.Refresh()` from all query save/delete paths:
- `MJQueryEntityServer.RefreshRelatedMetadata()` — removed entirely
- `QuerySystemUserResolver` — removed `provider.Refresh()` after query creation
- `save-query-dialog` — removed `md.Refresh()`
- `data-artifact-viewer` — removed redundant `md.Refresh()`
- `query-browser-resource` — reads from `QueryEngine.Instance` instead of provider

## Phase 4: Migrate All Consumers — DONE

Migrated every consumer of `QueryInfo` outside MJCore to use `MJQueryEntityExtended` and entity types:

**Server packages:**
- `GenericDatabaseProvider.ts` — full migration, `resolveQueryInfo()` → `resolveQuery()`
- `queryCompositionEngine.ts` — introduced `IComposableQuery` interface
- `renderPipeline.ts` — `QueryParameterInfo` → `MJQueryParameterEntity`
- `QueryResolver.ts` — uses `QueryEngine.Instance.Queries`
- `skip-sdk.ts` — uses `QueryEngine` for query/category building
- `QuerySystemUserResolver.ts` — entity types for map methods
- `MJQueryEntityServer.server.ts` — extends `MJQueryEntityExtended`
- `pipeline.ts`, `resolve.ts`, `types.ts` — full extraction pipeline migration

**Angular components:**
- `query-form.component.ts` — synchronous reads from `MJQueryEntityExtended` getters (eliminates 5 RunView calls)
- `query-browser-resource.component.ts` — reads from `QueryEngine.Instance.Queries`
- `query-viewer`, `query-data-grid`, `query-parameter-form`, `query-row-detail`, `query-info-panel` — all migrated
- `code-editor` — composition tooltip uses `QueryEngine.Instance.Queries`
- `query-category-dialog` — uses `QueryEngine.Instance.Categories`

**Other packages:**
- `QueryProcessor` — `QueryParameterInfo` → `MJQueryParameterEntity`
- `MJDataContext` — `QueryInfo` → `MJQueryEntityExtended`
- `SQLServerDataProvider` — updated override signatures
- `SkipTypes` — added `SQLDialectID`, `UsesTemplate`, `IsApproved` to `SkipQueryInfo`

## Phase 5: Optimize Redundant RunView Calls — DONE

Eliminated 12 redundant RunView calls for entities already cached by QueryEngine:
- `sync.ts` — 4 calls (Parameters, Fields, Entities, Dependencies)
- `MJQueryEntityServer.ts` — 2 calls (QuerySQLs lookup + cleanup)
- `QuerySystemUserResolver.ts` — 1 call (permissions delete-before-recreate)
- `query-category-dialog.component.ts` — 1 call (category tree)
- `MCPServer/Server.ts` — 1 call (query discovery; also fixed bug: `'Active'` → `'Approved'`)
- `QueryGen export.ts` — 1 call (batch export)
- `QueryDatabaseWriter.ts` — 1 call (category existence check)
- `backfill-query-embeddings.ts` — 1 call (approved queries)

## Cleanup — DONE

- Removed `QueryCacheManager` (dead code — all caching was bypassed, `LocalCacheManager` is the active layer)
- Updated `IQueryInfoBase` interface: added `SQLDialectID`, `UsesTemplate`, `IsApproved`
- Updated all test files with `QueryEngine.Instance` mocking pattern
- Updated class registration manifests

---

## Phase 6: Deprecation — FUTURE

The final step is to deprecate the query-related properties on `IMetadataProvider` and the `QueryInfo` class hierarchy in MJCore. **All external consumers have been migrated** — the only remaining dependents on these types are within MJCore itself:

### What to deprecate
- `IMetadataProvider.Queries`, `.QueryFields`, `.QueryCategories`, `.QueryPermissions`, `.QueryEntities`, `.QueryParameters`, `.QueryDependencies`, `.SQLDialects`, `.QuerySQLs` getters
- `QueryInfo`, `QueryFieldInfo`, `QueryCategoryInfo`, `QueryPermissionInfo`, `QueryEntityInfo`, `QueryParameterInfo`, `QueryDependencyInfo`, `QuerySQLInfo`, `SQLDialectInfo` classes
- `ProviderBase` storage and loading of query arrays in `AllMetadata`
- `Metadata` class delegation methods for queries

### What to keep
- `IQueryInfoBase`, `IQueryFieldInfoBase`, `IQueryParameterInfoBase`, `IQueryEntityInfoBase`, `IQueryPermissionInfoBase` interfaces — these are clean data contracts used by SkipTypes and cross-package exchange
- `QueryCacheConfig` interface — used by `MJQueryEntityExtended.CacheConfig` and `GenericDatabaseProvider`
- `QueryExecutionSpec` and `RunQueryParams` — query execution infrastructure
- `IComposableQuery` — composition engine contract

### Rationale
The metadata provider should be a static snapshot loaded once at startup. Schema-level changes (DDL) already require CodeGen + a server restart, so that mental model holds for entities, fields, roles, etc. Queries break that pattern because users and AI agents create and modify them at runtime. They are runtime data, not metadata, and should live exclusively in `QueryEngine` which is purpose-built for that lifecycle.

### Blocked by
Moving `QueryInfo` out of MJCore is a significant breaking change — it's referenced by `IMetadataProvider`, `ProviderBase`, `AllMetadata`, `RunQueryParams`, and `QueryExecutionSpec`. This requires careful planning and coordination with the team.
