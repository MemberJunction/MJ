---
"@memberjunction/postgresql-dataprovider": minor
"@memberjunction/codegen-lib": minor
---

Unblock fresh-DB PostgreSQL end-to-end across baseline migrations, codegen, and runtime data access:

- **PostgreSQLDataProvider**: replace the `Nested transactions are not yet supported` throw with full SAVEPOINT-based nesting, mirroring the SQL Server provider's depth/savepoint-stack model. Fixes `mj sync` of multi-row metadata via TransactionGroups.
- **CodeGenLib config**: add `dbPlatform: 'sqlserver' | 'postgresql'` as an alias of `dbType: 'mssql' | 'postgresql'`, with a normalizer that derives one from the other and fails fast on conflict — eliminates the silent MSSQL fallthrough when only `dbPlatform` was set.
- **PG migration `V202605031857__v5.32.x__Fix_vwSQLColumnsAndEntityFields_Boolean_Types.pg-only.sql`**: idempotent CREATE ROLE for `cdp_Developer` / `cdp_Integration` / `cdp_UI`, GRANT USAGE + ALTER DEFAULT PRIVILEGES on `__mj` so subsequent migrations' new objects inherit grants automatically, plus a CREATE OR REPLACE VIEW that returns BOOLEAN (was INTEGER 0/1) for `IsVirtual` and `AutoIncrement` in `vwSQLColumnsAndEntityFields`. The view fix also resolves the same `operator does not exist: integer = boolean` failure inside the hand-ported `spUpdateExistingEntityFieldsFromSchema` body without requiring a separate SP edit.
