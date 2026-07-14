# @memberjunction/external-data-source-mysql

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
  - @memberjunction/core@5.47.0
  - @memberjunction/external-data-sources@5.47.0
  - @memberjunction/core-entities@5.47.0
  - @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
- Updated dependencies [33741fc]
- Updated dependencies [ef3e802]
  - @memberjunction/core@5.46.0
  - @memberjunction/core-entities@5.46.0
  - @memberjunction/external-data-sources@5.46.0
  - @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- 00e573c: EDS incremental-read support for structured watermark sync.
  - Add a structured `incrementalSince` bound (`{ Field, Value }`, inclusive `>=`) to `ExternalViewParams` so an incremental-read consumer can request "rows changed at/after a watermark" WITHOUT writing dialect SQL. The SQL drivers render `WHERE <Field> >= <literal>` via their own `quoteIdent` (shared in `BaseSqlExternalDataSourceDriver.effectiveWhere`); an overridable `formatIncrementalLiteral` lets the Oracle driver wrap the watermark in `TO_TIMESTAMP` / `TO_TIMESTAMP_TZ` (Oracle's default NLS format rejects the ISO `T`/`Z` form). Both the row SELECT **and** the paginated `COUNT(*)` (centralized in `buildCountSql`) honor the bound across all five SQL drivers — SQL Server, Postgres, MySQL, Oracle, and Snowflake (whose cast-aware builder now uses `effectiveWhere` too). Combined (ANDed) with any caller `filter`; a blank filter never drops the bound.
  - The MongoDB driver / `MongoFilterTranslator` coerce ISO-8601 date-time literals to `Date` so a watermark predicate matches Mongo's native `Date`-typed fields — a string never `$gte`-matched a BSON `Date`.

  **Behavior changes (deliberate):**
  - **MongoDB date-literal comparisons.** A field that STORES an ISO-looking STRING no longer matches a date-literal predicate (`field >= '<iso>'`): the literal is now a `Date`, which never equals a stored string. This is the mirror of the zero-match bug being fixed; native `Date` fields are the common case and are what a watermark needs. A source that genuinely stores ISO strings should compare via `RunNativeQuery`.
  - **Zoneless timestamps are interpreted as UTC.** An ISO watermark without an explicit `Z`/offset (e.g. `2026-03-01T00:00:00`) is treated as UTC — never the API server's local time — so a watermark is timezone-stable regardless of where the server runs (shared `parseIso8601AsUtc`). For a naive (no-time-zone) source column, incremental correctness remains time-zone sensitive; run against UTC-normalized data or a zone-aware column for exact boundaries.

  Otherwise additive and backward-compatible: omitting `incrementalSince` reproduces prior behavior exactly for existing RunView / live-read / materialize callers.

- Updated dependencies [00e573c]
  - @memberjunction/external-data-sources@5.45.1
  - @memberjunction/core@5.45.1
  - @memberjunction/core-entities@5.45.1
  - @memberjunction/global@5.45.1

## 5.45.0

### Minor Changes

- bc085e0: Add SQL Server, MySQL, and Oracle External Data Source drivers.

  Three new relational drivers, each registered via `@RegisterClass(BaseExternalDataSourceDriver, ...)` and structured like the reference PostgreSQL driver (per-`ExternalDataSource` connection pooling so a single driver instance holds any number of independent connections, secure-by-default transport, auth-retry self-heal, read-only):
  - **`@memberjunction/external-data-source-sqlserver`** (`SQLServerExternalDriver`, node-mssql) — T-SQL: bracket-quoted identifiers, `TOP` / `OFFSET..FETCH` paging, `@named` parameters, `INFORMATION_SCHEMA` + `sys.*` introspection of tables/views/columns/primary keys and foreign keys.
  - **`@memberjunction/external-data-source-mysql`** (`MySQLExternalDriver`, mysql2) — backtick-quoted identifiers, `LIMIT/OFFSET` paging, `?` positional parameters, `INFORMATION_SCHEMA` introspection including foreign keys (referenced table/column read directly from `KEY_COLUMN_USAGE`).
  - **`@memberjunction/external-data-source-oracle`** (`OracleExternalDriver`, node-oracledb in **Thin mode** — no Instant Client required) — double-quoted identifiers, `OFFSET..FETCH` paging, `:named` bind parameters, and `ALL_*` catalog introspection (tables/views/columns/primary keys/foreign keys).

  All three introspect **foreign keys** (composite-key aware) into the schema contract's `Relationships`. Each seeds an `ExternalDataSourceType` row (`metadata/external-data-source-types`) and is registered in the server-bootstrap class manifest. Each ships unit tests (SQL building, FK grouping, and — for MySQL, whose pool is lazy — per-source connection caching) plus an opt-in live integration suite (`RUN_SQLSERVER_INTEGRATION` / `RUN_MYSQL_INTEGRATION` / `RUN_ORACLE_INTEGRATION`) that self-seeds a customers/orders/view fixture (with a FK) and exercises connect, read, projection, filtered paging, view reads, single-record load, parameterized native joins, full introspection, and clean error handling — verified live against SQL Server, MySQL, and Oracle respectively.

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
  - @memberjunction/external-data-sources@5.45.0
  - @memberjunction/core-entities@5.45.0
  - @memberjunction/global@5.45.0
