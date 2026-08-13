# @memberjunction/external-data-sources

## 6.1.0-edge.2

### Patch Changes

- Updated dependencies [255d506]
- Updated dependencies [080f4cd]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [fccd0b2]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [15319b4]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/core-entities@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/credentials@6.1.0-edge.2
  - @memberjunction/sql-dialect@6.1.0-edge.2
  - @memberjunction/sql-parser@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/core-entities@6.1.0-edge.1
  - @memberjunction/credentials@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1
  - @memberjunction/sql-dialect@6.1.0-edge.1
  - @memberjunction/sql-parser@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- Updated dependencies [2412415]
- Updated dependencies [9699d0e]
- Updated dependencies [052b4c7]
- Updated dependencies [9a905e8]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [27e4d09]
  - @memberjunction/core-entities@6.1.0-edge.0
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/credentials@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0
  - @memberjunction/sql-dialect@6.1.0-edge.0
  - @memberjunction/sql-parser@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/credentials@6.0.0
  - @memberjunction/core-entities@6.0.0
  - @memberjunction/global@6.0.0
  - @memberjunction/sql-dialect@6.0.0
  - @memberjunction/sql-parser@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [a8fc549]
  - @memberjunction/core@5.51.0
  - @memberjunction/credentials@5.51.0
  - @memberjunction/core-entities@5.51.0
  - @memberjunction/global@5.51.0
  - @memberjunction/sql-dialect@5.51.0
  - @memberjunction/sql-parser@5.51.0

## 5.50.0

### Patch Changes

- a3bd648: Fix two External Data Sources read/codegen bugs.

  External read paths now resolve the remote object name via a new per-driver `ResolveObjectName(entity)` method on `BaseExternalDataSourceDriver`. SQL drivers (`BaseSqlExternalDataSourceDriver`) schema-qualify a bare name with the entity's `SchemaName` so objects in a non-default schema (e.g. medallion bronze/silver/gold, or any multi-schema source) resolve correctly; non-SQL drivers (e.g. MongoDB) return the name verbatim as a literal collection. The read router (`ExternalDataSourceReadRouterImpl`) no longer schema-qualifies the name itself, so a schema-qualified name can never reach a driver that treats the name literally — fixing a case where a MongoDB collection read would target a non-existent `schema.collection`.

  CodeGen entity-subclass generation now hoists and de-duplicates the base-class import (e.g. `ReadOnlyExternalBaseEntity`) into the file header once per file instead of once per entity, fixing a TS2300 duplicate-identifier error in generated files that contain 2+ external entities. The import is hoisted only for entities that actually emit a class (those with a primary key), so a skipped PK-less entity can't leave a dangling import.

- Updated dependencies [938ae80]
- Updated dependencies [623dfc5]
- Updated dependencies [8ce3356]
- Updated dependencies [12691e3]
- Updated dependencies [1afdc40]
- Updated dependencies [ce6374c]
- Updated dependencies [deb02b4]
- Updated dependencies [764d6f6]
- Updated dependencies [0ba33b3]
- Updated dependencies [dd04a24]
  - @memberjunction/core-entities@5.50.0
  - @memberjunction/core@5.50.0
  - @memberjunction/credentials@5.50.0
  - @memberjunction/global@5.50.0
  - @memberjunction/sql-dialect@5.50.0
  - @memberjunction/sql-parser@5.50.0

## 5.49.0

### Patch Changes

- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [505c8b5]
- Updated dependencies [6c910ef]
- Updated dependencies [1a15bd2]
- Updated dependencies [85575cf]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [70c658c]
  - @memberjunction/core@5.49.0
  - @memberjunction/core-entities@5.49.0
  - @memberjunction/global@5.49.0
  - @memberjunction/sql-parser@5.49.0
  - @memberjunction/credentials@5.49.0
  - @memberjunction/sql-dialect@5.49.0

## 5.48.0

### Patch Changes

- Updated dependencies [09e1b4b]
- Updated dependencies [f613d0d]
  - @memberjunction/core@5.48.0
  - @memberjunction/core-entities@5.48.0
  - @memberjunction/credentials@5.48.0
  - @memberjunction/global@5.48.0
  - @memberjunction/sql-dialect@5.48.0
  - @memberjunction/sql-parser@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
- Updated dependencies [06a1e44]
- Updated dependencies [31da520]
  - @memberjunction/core@5.47.0
  - @memberjunction/sql-dialect@5.47.0
  - @memberjunction/credentials@5.47.0
  - @memberjunction/core-entities@5.47.0
  - @memberjunction/sql-parser@5.47.0
  - @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
- Updated dependencies [33741fc]
- Updated dependencies [ef3e802]
  - @memberjunction/core@5.46.0
  - @memberjunction/core-entities@5.46.0
  - @memberjunction/credentials@5.46.0
  - @memberjunction/global@5.46.0
  - @memberjunction/sql-dialect@5.46.0
  - @memberjunction/sql-parser@5.46.0

## 5.45.1

### Patch Changes

- 00e573c: EDS incremental-read support for structured watermark sync.
  - Add a structured `incrementalSince` bound (`{ Field, Value }`, inclusive `>=`) to `ExternalViewParams` so an incremental-read consumer can request "rows changed at/after a watermark" WITHOUT writing dialect SQL. The SQL drivers render `WHERE <Field> >= <literal>` via their own `quoteIdent` (shared in `BaseSqlExternalDataSourceDriver.effectiveWhere`); an overridable `formatIncrementalLiteral` lets the Oracle driver wrap the watermark in `TO_TIMESTAMP` / `TO_TIMESTAMP_TZ` (Oracle's default NLS format rejects the ISO `T`/`Z` form). Both the row SELECT **and** the paginated `COUNT(*)` (centralized in `buildCountSql`) honor the bound across all five SQL drivers — SQL Server, Postgres, MySQL, Oracle, and Snowflake (whose cast-aware builder now uses `effectiveWhere` too). Combined (ANDed) with any caller `filter`; a blank filter never drops the bound.
  - The MongoDB driver / `MongoFilterTranslator` coerce ISO-8601 date-time literals to `Date` so a watermark predicate matches Mongo's native `Date`-typed fields — a string never `$gte`-matched a BSON `Date`.

  **Behavior changes (deliberate):**
  - **MongoDB date-literal comparisons.** A field that STORES an ISO-looking STRING no longer matches a date-literal predicate (`field >= '<iso>'`): the literal is now a `Date`, which never equals a stored string. This is the mirror of the zero-match bug being fixed; native `Date` fields are the common case and are what a watermark needs. A source that genuinely stores ISO strings should compare via `RunNativeQuery`.
  - **Zoneless timestamps are interpreted as UTC.** An ISO watermark without an explicit `Z`/offset (e.g. `2026-03-01T00:00:00`) is treated as UTC — never the API server's local time — so a watermark is timezone-stable regardless of where the server runs (shared `parseIso8601AsUtc`). For a naive (no-time-zone) source column, incremental correctness remains time-zone sensitive; run against UTC-normalized data or a zone-aware column for exact boundaries.

  Otherwise additive and backward-compatible: omitting `incrementalSince` reproduces prior behavior exactly for existing RunView / live-read / materialize callers.
  - @memberjunction/credentials@5.45.1
  - @memberjunction/core@5.45.1
  - @memberjunction/core-entities@5.45.1
  - @memberjunction/global@5.45.1
  - @memberjunction/sql-dialect@5.45.1
  - @memberjunction/sql-parser@5.45.1

## 5.45.0

### Minor Changes

- b7cf50f: CodeGen-integrated external-entity field sync (`manageExternalEntities`).

  CodeGen now introspects the **remote** schema of external-data-source entities and syncs their `EntityField` metadata — the remote analogue of how it already manages view-backed `VirtualEntity` fields from `INFORMATION_SCHEMA`. This removes the manual-field-definition limitation for external entities.
  - **`@memberjunction/core`**: the schema-introspection contracts (`ExternalObjectType` / `ExternalSchemaColumn` / `ExternalSchemaObject` / `ExternalSchemaDescriptor`) move here from the engine; `ExternalDataSourceReadRouter` gains abstract `IntrospectExternalSchema(externalDataSourceID, schemaName?, contextUser?, provider?)` — so build-time consumers reference them without a hard dependency on the engine/driver SDKs.
  - **`@memberjunction/external-data-sources`**: `ExternalDataSourceReadRouterImpl.IntrospectExternalSchema` resolves the driver and delegates to its `IntrospectSchema`.
  - **`@memberjunction/codegen-lib`**: a new `manageExternalEntities` / `manageSingleExternalEntity` pass (mirroring `manageSingleVirtualEntity`) introspects each external entity's remote object, maps native types to MJ types (`mapExternalNativeTypeToMJ` — best-effort across PostgreSQL/Snowflake/MongoDB, falling back to `nvarchar(MAX)`), and creates/updates/deletes `EntityField` rows, reusing the virtual-entity field machinery. Real PK info from introspection is honored (falling back to first-column-as-PK).

  The pass resolves the router via `MJGlobal.ClassFactory`, so it requires the EDS engine + the relevant driver to be loaded in the CodeGen process; when none is registered it logs a clear message and skips (no effect on non-external entities). Native-type→MJ mapping is best-effort and refined by the existing LLM field-decoration pass + review.

- f4f11fa: External Data Sources — read MJ entities and queries directly from remote systems (Snowflake, MongoDB, PostgreSQL) without replicating their data into the MJ database.

  An Entity (or Query) that carries an `ExternalDataSourceID` is proxied live to a remote system through a pluggable driver, then returned through MJ's standard typed `RunView` / `RunQuery` / `Load` APIs. Behavior is fully additive: any entity/query with a null `ExternalDataSourceID` is unchanged and never touches the new code path.
  - **`@memberjunction/core`**: new abstract `ExternalDataSourceReadRouter` — the dependency-inversion seam (`RunViewExternal` / `RunQueryExternal` / `GetCacheTTLSeconds`) that lets foundational providers reach the EDS engine via `MJGlobal.ClassFactory` without any compile-time dependency on driver SDKs or the credential subsystem. `EntityInfo` gains `ExternalDataSourceID` / `ExternalObjectName`. `LocalCacheManager.SetRunViewResult` gains an optional `ttlMs` (with read-time expiry) so external reads can be time-bounded like RunQuery already is.
  - **`@memberjunction/core-entities`**: `ReadOnlyExternalBaseEntity` — `BaseEntity` subclass whose `Save`/`Delete` reject (populating `LatestResult`); MJ is never the system of record for external data.
  - **`@memberjunction/external-data-sources`**: the server-only engine — `ExternalDataSourceReadRouterImpl` (registered for the ClassFactory), `BaseExternalDataSourceDriver` contract, and `ExternalDataSourceRouter` (per-source driver + connection-pool cache, credential resolution). `BaseExternalDataSourceDriver` now provides `withConnectionRetry` — on an auth/credential failure it evicts the cached connection (forcing a fresh credential resolve) and retries the read once, self-healing rotated/expired credentials without a process restart; each driver implements `invalidateConnection`.
  - **Drivers** — `@memberjunction/external-data-source-postgres`, `…-snowflake` (PAT auth; `snowflake-sdk` as an optional peer loaded by dynamic import to avoid AWS-SDK version skew), `…-mongodb` (SQL-`WHERE`→Mongo filter translation, document-sampling introspection). Each wraps its read operations in the auth-retry self-heal and closes the evicted connection on the failure path.
  - **`@memberjunction/generic-database-provider`**: external dispatch for `RunView`, `RunQuery`, and single-record `Load` — guarded by an `ExternalDataSourceID` null check so MJ-DB entities are untouched. Browser/Explorer reads flow through the same provider path, so they route externally transparently. External `RunQuery` results are checked against the query's declared `QueryField` metadata (case-insensitive); when a remote object's columns have drifted, a warning is logged naming the missing field(s) while the rows are still returned (non-fatal, per the plan). External reads (both `RunView` and `RunQuery`) are cached with a TTL sourced from the data source's `DefaultCacheTTLSeconds` — external data can't be event-invalidated, so it's time-bounded instead (mitigating per-query cost on warehouses); external `RunView` writes without a TTL are refused to prevent stale-forever entries. External reads also **refuse rather than silently bypass** Row-Level Security — if RLS would filter a user's rows the read is rejected with a clear error (RLS can't be enforced on a remote system; users exempt from RLS pass through), and the external single-record `Load` primary-key filter single-quote-escapes values to block SQL injection. Unsupported external RunView params (AfterKey/keyset pagination, Aggregates, a non-empty UserSearchString) now hard-fail with a clear error instead of being silently dropped — a dropped AfterKey would otherwise return the same page on every call (an infinite loop in deep-pagination jobs). External read results now run through the same row post-processing MJ-DB reads get (field decryption + datetime normalization), so an Encrypt-flagged external field no longer surfaces as ciphertext.
  - **`@memberjunction/codegen-lib`**: external-backed entities now generate to extend `ReadOnlyExternalBaseEntity` (explicit custom subclasses still take precedence), and CodeGen skips all SQL-object generation (sprocs/views/permissions/FK-indexes) for them since no MJ table exists. GraphQL Create/Update/Delete mutation resolvers are still generated (gated only by `Allow*API`, like any entity) — they route through `entity.Save()`/`.Delete()`, which `ReadOnlyExternalBaseEntity` rejects before any sproc is reached, so an attempted write **fails loudly** with the read-only reason rather than silently lacking a resolver. (No sproc is generated for these entities, but none is ever called.)

  Additional hardening: the Postgres driver now **verifies TLS server certificates by default** (`sslRejectUnauthorized`, opt-out only for knowingly-accepted self-signed dev endpoints) instead of silently accepting any certificate; an unbounded external `RunView` (no `MaxRows`) is capped to the entity's `UserViewMaxRows` or a 1000-row default so a single read can't pull an entire remote table; caller-supplied `ExtraFilter` / `OrderBy` clauses are screened for forbidden SQL keywords before reaching the driver (the same screen the MJ-DB path applies); and a saved **UserView** over an external entity now has its stored `WhereClause` / `OrderByClause` folded into the remote read (previously the external dispatch returned before they were applied, so a view silently returned unfiltered, unordered rows).

  Dispatch-completeness fixes (an audit found read paths that bypassed external routing): CodeGen's PostgreSQL phased executor now skips external entities (it previously regenerated view/CRUD DDL and would `CREATE VIEW` against a non-existent base table); datasets fail loud per-item for external-backed entities rather than querying a non-existent MJ base view; `RunViewsWithCacheCheck` routes external entities to the standard external-dispatch path instead of issuing MJ-DB `COUNT/MAX` validation SQL; and external saved queries skip the outer `RunQuery` `CacheLocal` layer so only the TTL-correct `runExternalQueryWithCache` caches them. Two further validation tightenings: a saved view's merged `WhereClause`/`OrderByClause` is now re-screened for forbidden SQL keywords before reaching the driver, and non-quoted (numeric/boolean) primary-key values in the external `Load` filter are type-checked to block unquoted injection. Read-only is also enforced at the **provider layer** — `DatabaseProviderBase.Save`/`Delete` refuse any external-data-source entity regardless of its generated base class (a backstop for the edge case where an explicit custom subclass replaces `ReadOnlyExternalBaseEntity`). And the SQL drivers are **secure-by-default on transport**: Postgres/MongoDB refuse a plaintext connection to a non-local host unless TLS is enabled or `allowInsecureTransport: true` is explicitly set (local hosts stay exempt for dev).

  The starter `ExternalDataSourceType` catalog now seeds **PostgreSQL, Snowflake, and MongoDB** (all `Active` — the shipped drivers), and a developer guide ships at `guides/EXTERNAL_DATA_SOURCES_GUIDE.md`.

  Two new metadata tables (`ExternalDataSource`, `ExternalDataSourceType`) and additive `Entity` / `Query` columns ship in migration `v5.42`. Validated live end-to-end against real Snowflake and MongoDB. SQL Server as an external source is a deliberate fast-follow. Comprehensive unit tests across the engine, drivers, and CodeGen, plus CI-runnable Postgres/MongoDB driver integration suites.

### Patch Changes

- Updated dependencies [45d121b]
- Updated dependencies [21e33fe]
- Updated dependencies [b7cf50f]
- Updated dependencies [f4f11fa]
- Updated dependencies [e370816]
- Updated dependencies [fbee64c]
- Updated dependencies [b2927f1]
- Updated dependencies [6125dcd]
- Updated dependencies [c1f2d3d]
- Updated dependencies [0b1e009]
  - @memberjunction/core@5.45.0
  - @memberjunction/core-entities@5.45.0
  - @memberjunction/global@5.45.0
  - @memberjunction/credentials@5.45.0
  - @memberjunction/sql-dialect@5.45.0
  - @memberjunction/sql-parser@5.45.0
