---
"@memberjunction/codegen-lib": minor
"@memberjunction/core": minor
"@memberjunction/generic-database-provider": minor
"@memberjunction/server": minor
"@memberjunction/graphql-dataprovider": minor
---

Query Materialization — Phase 2: parameterized RowFilterBroad read-time injection. A caller can now run a materialized parameterized stored Query with `RunQueryParams.DataSource: 'Materialized'` and the provider serves it from the broad materialized table with the query's row-filter parameters injected as **bound** read-time predicates, falling back to the live query on any uncertainty (serving live is always correct).

- **`codegen-lib`**: the render-and-diff verifier now captures each row-filter predicate's operator + value shape (normalized to `column <op> value`, flipping `value < column`); `qualifyParameterizedQuery` builds a structured `ReadFilterSpec` and gates it to a safe operator whitelist (`=, !=, <>, <, >, <=, >=, IN, NOT IN` — `LIKE`/`IS`/`BETWEEN` stay live-only); `manage-metadata` persists the spec and enables Bucket-1 materialization. New migration adds `MaterializedResult.ReadFilterSpec` (+ the CodeGen-regenerated view/procs/EntityField).
- **`core`**: `RunQueryParams.DataSource: 'Live' | 'Materialized'` (mirrors `RunViewParams`).
- **`generic-database-provider`**: `InternalRunQuery` redirects a `DataSource:'Materialized'` read to `SELECT … FROM <materialized view> WHERE <spec predicates>` with values **bound** (never interpolated), and falls back to live on any doubt — not opted in, not fresh/Active, a parameter absent from the spec, an unsafe operator, or an execution error.
- **`server` / `graphql-dataprovider`**: `DataSource` threaded through the RunQuery GraphQL surface (singular, batch, cache-check, and SystemUser paths).

Proven by a differential reconstruction proof (13/13, real SQL Server) and a full provider-level `RunQuery` E2E (16/16). See `plans/query-entity-materialization-phase2.md`. Stacks on the Phase 1 materialization PR (merges after it).
