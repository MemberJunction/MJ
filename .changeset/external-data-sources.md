---
'@memberjunction/external-data-sources': minor
'@memberjunction/external-data-source-postgres': minor
'@memberjunction/external-data-source-snowflake': minor
'@memberjunction/external-data-source-mongodb': minor
'@memberjunction/core': minor
'@memberjunction/core-entities': minor
'@memberjunction/generic-database-provider': minor
'@memberjunction/codegen-lib': minor
---

External Data Sources — read MJ entities and queries directly from remote systems (Snowflake, MongoDB, PostgreSQL) without replicating their data into the MJ database.

An Entity (or Query) that carries an `ExternalDataSourceID` is proxied live to a remote system through a pluggable driver, then returned through MJ's standard typed `RunView` / `RunQuery` / `Load` APIs. Behavior is fully additive: any entity/query with a null `ExternalDataSourceID` is unchanged and never touches the new code path.

- **`@memberjunction/core`**: new abstract `ExternalDataSourceReadRouter` — the dependency-inversion seam (`RunViewExternal` / `RunQueryExternal`) that lets foundational providers reach the EDS engine via `MJGlobal.ClassFactory` without any compile-time dependency on driver SDKs or the credential subsystem. `EntityInfo` gains `ExternalDataSourceID` / `ExternalObjectName`.
- **`@memberjunction/core-entities`**: `ReadOnlyExternalBaseEntity` — `BaseEntity` subclass whose `Save`/`Delete` reject (populating `LatestResult`); MJ is never the system of record for external data.
- **`@memberjunction/external-data-sources`**: the server-only engine — `ExternalDataSourceReadRouterImpl` (registered for the ClassFactory), `BaseExternalDataSourceDriver` contract, and `ExternalDataSourceRouter` (per-source driver + connection-pool cache, credential resolution).
- **Drivers** — `@memberjunction/external-data-source-postgres`, `…-snowflake` (PAT auth; `snowflake-sdk` as an optional peer loaded by dynamic import to avoid AWS-SDK version skew), `…-mongodb` (SQL-`WHERE`→Mongo filter translation, document-sampling introspection).
- **`@memberjunction/generic-database-provider`**: external dispatch for `RunView`, `RunQuery`, and single-record `Load` — guarded by an `ExternalDataSourceID` null check so MJ-DB entities are untouched. Browser/Explorer reads flow through the same provider path, so they route externally transparently.
- **`@memberjunction/codegen-lib`**: external-backed entities now generate to extend `ReadOnlyExternalBaseEntity` (explicit custom subclasses still take precedence), and CodeGen skips all SQL-object generation (sprocs/views/permissions/FK-indexes) for them since no MJ table exists.

Two new metadata tables (`ExternalDataSource`, `ExternalDataSourceType`) and additive `Entity` / `Query` columns ship in migration `v5.42`. Validated live end-to-end against real Snowflake and MongoDB. SQL Server as an external source is a deliberate fast-follow. 41 unit tests across the engine, drivers, and CodeGen base-class selection.
