---
"@memberjunction/sql-dialect": minor
"@memberjunction/global": minor
"@memberjunction/core": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/core-actions": minor
"@memberjunction/ai-agents": minor
"@memberjunction/server": minor
---

fix: the SQL a prompt is asked to write, and the connection its result is re-executed on, are both chosen from `provider.PlatformKey`

MemberJunction assumed SQL Server wherever an agent touched SQL. Two faces of the same problem, fixed together.

**The prompts taught T-SQL unconditionally.** `sql-query-writer` opened with "you are the world's greatest expert in Microsoft SQL Server and T-SQL"; the shipped query-generation prompts taught `ISNULL`, `DATEADD`, `GETDATE` and `[bracketed]` identifiers with no dialect token anywhere under `metadata/prompts`. A PostgreSQL tenant's agent burned LLM turns writing T-SQL, failing, retrying and failing again.

The dialect now reaches templates as a **system placeholder**, not a registry of TemplateIDs: `_SQL_DIALECT`, `_SQL_DIALECT_NAME` and `_SQL_DIALECT_RULES` resolve on every prompt render from the request's own provider (falling back to `Metadata.Provider`, then to SQL Server). Any template that references them is parameterised — nothing has to be registered, so a template added later cannot be left off a list. `_SQL_DIALECT_RULES` is composed by `SQLDialect.PromptGuidance` from the dialect's own primitives (`QuoteIdentifier`, `LimitClause`, `IsNull`, `DateAddExpression`, `NewUUID`, …), so implementing a dialect is sufficient to get correct guidance — there is no second per-dialect prose table to maintain.

**The ad-hoc read-only path reached for an mssql pool.** `AdhocQueryResolver.ExecuteAdhocQuery` required a SQL Server `ConnectionPool` from `context.dataSources` before it would run anything. A PostgreSQL provider never populates one, so every ad-hoc query on PG returned "No read-only data source available for ad-hoc query execution" — rendered downstream as "Showing cached data" — even though the `GetReadOnlyProvider` call directly beneath it already knew the tenant was PostgreSQL. Both questions (which dialect to render, and what to execute on) now come from the same read-only provider, and execution goes through `provider.ExecuteSQL`, which every platform implements.

Also fixed: `Run Ad-hoc Query` resolved `{{query:"..."}}` composition macros against a hardcoded `'sqlserver'`, and `QueryBuilderAgent` re-formatted every tenant's SQL with `sql-formatter`'s `tsql` language.

**The SQL safety allowlists were T-SQL vocabularies.** `ALLOWED_SQL_FUNCTIONS` (`@memberjunction/global`) and `ALLOWED_SQL_KEYWORDS` (`@memberjunction/core`) listed only SQL Server's read-only names, so an ordinary PostgreSQL expression was refused before it ever reached a database that would have run it: `DATE_TRUNC('month', CreatedAt)` came back as "Function 'DATE_TRUNC' is not allowed", and `ARRAY_AGG(Name)` failed both the function allowlist and the "an aggregate context must contain an aggregate" rule. Both lists now carry the UNION of the supported dialects' read-only vocabulary — deliberately, and documented in the code: these are deny-by-default SAFETY screens, not dialect grammars, and a PostgreSQL name that reaches a SQL Server tenant is rejected by the SQL Server parser on its own. Nothing that writes, escalates, or reaches outside the statement was added, and `DANGEROUS_SQL_KEYWORDS` is still checked first, so a name on the allowlist can never unblock one that is denied.

**The row cap's safety net still emitted `TOP`.** `ensureRowLimit`'s AST path (`QueryPagingEngine.WrapWithMaxRows`) was already dialect-aware, but the `catch` arm beneath it rewrote `SELECT` to `SELECT TOP n` unconditionally. That arm is reached precisely when the AST path could not understand the SQL — so on a PostgreSQL tenant a query that merely confused the parser came back as SQL that could not parse at all. The fallback now asks the same `resolvePlatform()` seam as the rest of the action, appends `LIMIT n` on PostgreSQL, and treats an existing `LIMIT` as already capped.

New in `@memberjunction/core`: `ResolvePlatformKey`, `DEFAULT_DATABASE_PLATFORM`, `DescribeSQLDialectForPrompt`, `DescribeSQLDialectName`, `ResolveSQLFormatterLanguage`. New in `@memberjunction/sql-dialect`: `SQLDialect.DisplayName`, `SQLDialect.FormatterLanguage`, `SQLDialect.PromptGuidance`, `IsSupportedPlatform`, `SupportedPlatforms`.

Behaviour on SQL Server tenants is unchanged: every fallback resolves to `sqlserver`, the historical default.
