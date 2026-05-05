---
"@memberjunction/sql-dialect": patch
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/postgresql-dataprovider": patch
"@memberjunction/core-actions": patch
---

Fix two runtime SQL paths that referenced an entity's `BaseTable` directly, which fails under tightened DB grants (the runtime app user has SELECT only on BaseViews and EXECUTE on CRUD sprocs). Both paths now read from `BaseView` and route their identifier, string-literal, and bounded-string-cast generation through `SQLDialect` so the same code produces correct SQL on SQL Server, PostgreSQL, and any future supported platform.

Adds three new helpers to `SQLDialect`: `QuoteStringLiteral` (concrete, both dialects share `''`-doubling escape), `QuoteColumnAlias` (abstract — bare on SQL Server, double-quoted on PG to preserve case), and `CastToBoundedString` (concrete, composed from existing `ResolveAbstractType` so it emits `NVARCHAR(450)` on SQL Server and `VARCHAR(450)` on PG).

Refactored sites: `ScheduledGeocodingAction` orphan-cleanup `NOT EXISTS` filter, and `BuildChildDiscoverySQL` (IS-A subtype probe) on both `SQLServerDataProvider` and `PostgreSQLDataProvider` — the latter two also fix the runtime-failing `FROM [schema].[BaseTable]` shape that fired on every IS-A entity load and on the `FindISAChildEntity` GraphQL resolver.
