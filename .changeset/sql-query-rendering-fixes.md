---
"@memberjunction/sql-parser": patch
"@memberjunction/sql-dialect": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/core": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/postgresql-dataprovider": patch
"@memberjunction/server": patch
"@memberjunction/integration-test-suite": patch
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/query-processor": patch
---

Saved queries, ad-hoc SQL and composed queries now render and run correctly on SQL Server and PostgreSQL in the shapes that previously failed or returned the wrong rows.

- **Row caps and paging.** A query's own `TOP` / `LIMIT` / `OFFSET … FETCH` is kept: when the caller also passes `MaxRows`, the smaller wins and `TotalRowCount` follows. CTEs, `WITH RECURSIVE`, query hints, `SELECT DISTINCT`, set operations, `TOP PERCENT` / `WITH TIES` and SQL the parser cannot read are paged and capped by editing the statement in place, or as a derived table, instead of being rewritten from the syntax tree. Ad-hoc SQL with `MaxRows` is paged in the database instead of fetching every row. A requested cap that cannot be applied is logged; paging a `FOR JSON` / `FOR XML` query fails with an error that says so.
- **Composition.** A dependency's trailing `;`, SQL Server `OPTION (…)` hints, template tags (`{% if %}` and similar) and doubled quotes in static values now compose correctly. The real composition token is resolved, not a copy in a comment or string literal. Composing into an outer `WITH` / `WITH RECURSIVE` produces one valid clause. A query that references the same dependency twice saves one dependency row.
- **PostgreSQL.** Pools get the `statement_timeout` and `idle_in_transaction_session_timeout` that match SQL Server's request timeout. Caller-supplied SQL runs in a rolled-back read-only transaction, and the read-only provider gets its own pool on the read-only login. Column references are read as names, and comment stripping no longer breaks dollar-quoted and `E''` strings.
- **Caller-supplied SQL** must be a single read query. Ad-hoc SQL over GraphQL (`ExecuteAdhocQuery`) now runs through the read-only provider's own ad-hoc path, so it works on PostgreSQL too and pages the same way everywhere. `RunQueryParams.TimeoutSeconds` (ad-hoc SQL) and `ExecuteSQLOptions.timeoutMs` set a per-call limit that the database enforces: the request is cancelled on SQL Server, and `statement_timeout` applies on PostgreSQL.
- **Dialects.** The rendering pipeline reads `SQLDialect` members (`SelectListPagingOrderBy`, `PagingRequiresOrderBy`, `QueryHintKeyword`, `SupportsEscapeStringLiterals`, `SupportsDollarQuotedStrings`, `StringLiteralPrefix`, `EscapeLikePattern`, `BooleanParameterValue`) instead of checking the platform name, so a new dialect declares its behaviour in one class.
- **Text filters.** `sqlString` / `sqlIn` keep non-ASCII text on SQL Server, and the LIKE filters escape `[` (SQL Server) and `\` (PostgreSQL). SQL Server bracket-quoted identifiers escape `]`.
- `RunQueryParams.MaxRows` documents that there is no default row limit, and that `MaxRows` limits the rows returned, not the work the database does.
