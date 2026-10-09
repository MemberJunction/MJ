---
"@memberjunction/sql-parser": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/server": patch
---

Security (C9): a client filter fragment must now be one balanced SQL expression, so it cannot close the parentheses the server wraps it in and take server-side row filters out of force.

- **`IsBalancedSQLFragment` (sql-parser).** Reads a WHERE fragment with the dialect's lexer and refuses it when it closes a parenthesis it did not open, leaves one open, ends inside an unterminated string literal, quoted identifier or comment, or contains `;`. On PostgreSQL it also refuses a string placed directly after a name containing `@` or `#` (or a number ending in `e`), where the lexer and PostgreSQL disagree on where the string starts.
- **MJServer boundary screen.** `assertClientClauseUsesEntityBaseViews` checks the fragment on its own before its wrapped parse, so `1=1) OR (1=1` is refused for `ExtraFilter`, `OrderBy` and `OverrideExcludeFilter` on `RunDynamicView`, `RunViews`, `RunViewByID` and `RunViewByName`.
- **Provider WHERE assembly.** `GenericDatabaseProvider` checks `ExtraFilter`, `OverrideExcludeFilter` and a stored view's rendered `WhereClause` (including `CustomWhereClause` views) with its own dialect before splicing them next to row-level security, API-key row filters and guest scope. This covers every RunView caller, including `RunViewsWithCacheCheck` and `GetRunViewsDatabaseStatus`. New protected helper: `AssertClauseBalanced`.
- **Multi-tenancy hook.** `CreateTenantPreRunViewHook` refuses an unbalanced `ExtraFilter` and now builds `(<ExtraFilter>) AND (<tenant predicate>)`, with the tenant predicate in its own parentheses.
