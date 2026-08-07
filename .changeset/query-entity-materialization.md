---
"@memberjunction/materialization": minor
"@memberjunction/codegen-lib": minor
"@memberjunction/core": minor
"@memberjunction/core-entities": minor
"@memberjunction/generic-database-provider": minor
"@memberjunction/server": minor
"@memberjunction/graphql-dataprovider": minor
"@memberjunction/scheduling-engine": minor
"@memberjunction/ng-core-entity-forms": minor
---

Query & Entity Materialization — snapshot a stored Query's result (or an entity's base view) into a physical table that IS its own read-only entity, refreshed on a schedule with an atomic wrapper-view swap. Base-view (entity) materialization is cross-engine (SQL Server + PostgreSQL); query materialization runs on SQL Server today and becomes cross-engine once the pre-existing `spCreateVirtualEntity` support proc is ported to PostgreSQL (tracked with the broader PG parity effort). The refresh SQL and read path are cross-engine on both.

- **New `@memberjunction/materialization`** package: the refresh engine (`MaterializationRefresher`) — full-rebuild (shadow table + atomic view swap), `DirtyGroupRecompute` and MERGE-upsert `Incremental` strategies for keyed aggregations, combined-key `SHA2_256` surrogate hashing, and the advisory `MaterializationFreshness` mixed-freshness inspector.
- **CodeGen** (`codegen-lib`): materializes flagged stored Queries + entity base views (cross-engine DDL, wrapper view, read-only Virtual Entity minting, migration-reuse detection); parameterization (row-filter → materialize-broad + read-time predicate); aggregation-key auto-detection; RLS-downgrade gate; and `DriftHold` flag-and-hold drift detection.
- **Read path**: `RunViewParams.DataSource: 'Live' | 'Materialized'` (`core`) routed by `GenericDatabaseProvider.GetEffectiveBaseView`, plumbed through the GraphQL layer (`server`, `graphql-dataprovider`).
- **Scheduling** (`scheduling-engine`): `MaterializationRefreshScheduledJobDriver` sweeps due materializations (skips `Disabled`/`DriftHold`).
- **`core-entities` / `ng-core-entity-forms`**: generated `MJ: Materialized Results` entity + `Query.IsMaterialized`/`MaterializedResultID` + forms.

See `plans/query-entity-materialization.md` for the full design.
