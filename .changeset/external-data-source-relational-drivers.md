---
'@memberjunction/external-data-source-sqlserver': minor
'@memberjunction/external-data-source-mysql': minor
'@memberjunction/external-data-source-oracle': minor
'@memberjunction/server-bootstrap': patch
---

Add SQL Server, MySQL, and Oracle External Data Source drivers.

Three new relational drivers, each registered via `@RegisterClass(BaseExternalDataSourceDriver, ...)` and structured like the reference PostgreSQL driver (per-`ExternalDataSource` connection pooling so a single driver instance holds any number of independent connections, secure-by-default transport, auth-retry self-heal, read-only):

- **`@memberjunction/external-data-source-sqlserver`** (`SQLServerExternalDriver`, node-mssql) — T-SQL: bracket-quoted identifiers, `TOP` / `OFFSET..FETCH` paging, `@named` parameters, `INFORMATION_SCHEMA` + `sys.*` introspection of tables/views/columns/primary keys and foreign keys.
- **`@memberjunction/external-data-source-mysql`** (`MySQLExternalDriver`, mysql2) — backtick-quoted identifiers, `LIMIT/OFFSET` paging, `?` positional parameters, `INFORMATION_SCHEMA` introspection including foreign keys (referenced table/column read directly from `KEY_COLUMN_USAGE`).
- **`@memberjunction/external-data-source-oracle`** (`OracleExternalDriver`, node-oracledb in **Thin mode** — no Instant Client required) — double-quoted identifiers, `OFFSET..FETCH` paging, `:named` bind parameters, and `ALL_*` catalog introspection (tables/views/columns/primary keys/foreign keys).

All three introspect **foreign keys** (composite-key aware) into the schema contract's `Relationships`. Each seeds an `ExternalDataSourceType` row (`metadata/external-data-source-types`) and is registered in the server-bootstrap class manifest. Each ships unit tests (SQL building, FK grouping, and — for MySQL, whose pool is lazy — per-source connection caching) plus an opt-in live integration suite (`RUN_SQLSERVER_INTEGRATION` / `RUN_MYSQL_INTEGRATION` / `RUN_ORACLE_INTEGRATION`) that self-seeds a customers/orders/view fixture (with a FK) and exercises connect, read, projection, filtered paging, view reads, single-record load, parameterized native joins, full introspection, and clean error handling — verified live against SQL Server, MySQL, and Oracle respectively.
