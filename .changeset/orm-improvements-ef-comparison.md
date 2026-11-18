---
"@memberjunction/core": minor
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/generic-database-provider": minor
"@memberjunction/sqlserver-dataprovider": minor
"@memberjunction/postgresql-dataprovider": minor
"@memberjunction/graphql-dataprovider": minor
"@memberjunction/server": minor
"@memberjunction/codegen-lib": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ng-filter-builder": patch
---

Implement ORM improvements across three workstreams:
1. Server-side concurrency and delta-only `spUpdate*` / `fn_update*` bindings (`DeltaUpdates` / `databaseSettings.deltaUpdates`, default `true` with `false` kill-switch), `UPDLOCK, ROWLOCK` (SQL Server) / `FOR UPDATE` (PostgreSQL) row locking, shared `DetectFieldConcurrencyConflicts` detector, `ConcurrencyCheckMode` (`'off' | 'log' | 'enforce'`, default `'off'` server-wide and `'enforce'` on GraphQL `UpdateRecord` mutations supplying `OldValues___`), subclass-setter-routed `@JSONType` `JSONFieldBinding` flushes, and multi-level IS-A chain concurrency rollback & baseline propagation.
2. First-class structured `CompositeFilter` support in `RunView`, `BaseEngine` (`Where()` and in-memory/local-cache slot maintenance), `FilterOf<T>()` fluent builder, parameterized `CompositeFilterSQLCompiler` (with literal compilation and FLS enforcement for `MJUserViewEntityExtended.GenerateWhereClauseFromFilterState`), and GraphQL `RunView` inputs.
3. CodeGen-generated `TypedQuerySpec<TParams, TRow>` descriptors (`typed_query_codegen.ts`) and `RunQuery(spec, params, options)` overloads with SHA-256 signature drift detection (`typedQueryDrift: 'off' | 'warn' | 'throw'`).
