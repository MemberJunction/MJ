---
"@memberjunction/sql-dialect": minor
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

New in `@memberjunction/core`: `ResolvePlatformKey`, `DEFAULT_DATABASE_PLATFORM`, `DescribeSQLDialectForPrompt`, `DescribeSQLDialectName`, `ResolveSQLFormatterLanguage`. New in `@memberjunction/sql-dialect`: `SQLDialect.DisplayName`, `SQLDialect.FormatterLanguage`, `SQLDialect.PromptGuidance`, `IsSupportedPlatform`, `SupportedPlatforms`.

Behaviour on SQL Server tenants is unchanged: every fallback resolves to `sqlserver`, the historical default.
