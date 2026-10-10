---
"@memberjunction/sql-parser": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/server": patch
---

Security (C9): a client filter fragment must now be one balanced SQL expression, read the way the database reads it, so it cannot close the parentheses the server wraps it in and take server-side row filters out of force. Text the lexer cannot read with certainty is refused.

- **`IsBalancedSQLFragment` (sql-parser).** Reads a WHERE fragment with the dialect's lexer and refuses it when it closes a parenthesis it did not open, leaves one open, ends inside an unterminated string literal, quoted identifier or comment, contains `;`, or contains a comment (allowed only with the new `AllowComments` option, which the provider uses for admin-written custom view WhereClauses). On PostgreSQL it also refuses characters outside ASCII outside string literals and quoted identifiers, dollar-quoted strings and any other `$` outside a name, an escape string followed by another string literal, and a string placed directly after a name containing `@` or `#` (or a number ending in `e`).
- **`SplitTopLevelAndTerms` (sql-parser).** Splits a fragment at its top-level ANDs (not inside parentheses, CASE … END or a BETWEEN), or returns `null` when it has a top-level OR.
- **`LexSQL` (sql-parser).** A `--` line comment now ends at a CR as well as an LF, as on SQL Server and PostgreSQL.
- **MJServer boundary screen.** `assertClientClauseUsesEntityBaseViews` checks the fragment on its own before its wrapped parse, so `1=1) OR (1=1` is refused for `ExtraFilter`, `OrderBy` and `OverrideExcludeFilter` on `RunDynamicView`, `RunViews`, `RunViewByID` and `RunViewByName`. It also refuses a backslash inside a quoted string or identifier, because the screen's parser reads `\'` inside a plain literal as an escaped quote where SQL Server and PostgreSQL do not.
- **Provider WHERE assembly.** `GenericDatabaseProvider` checks `ExtraFilter`, `OverrideExcludeFilter` and a stored view's rendered `WhereClause` with its own dialect before splicing them next to row-level security, API-key row filters and guest scope, on every RunView path including `RunViewsWithCacheCheck` and `GetRunViewsDatabaseStatus`. When the platform rewrite (`TransformExternalSQLClause`) changes an `ExtraFilter` made of top-level AND terms, the new `PrepareExtraFilterSQL` rewrites, checks and parenthesizes each term on its own, so a predicate a PreRunView hook ANDed on stays a separate term. New protected helpers: `AssertClauseBalanced`, `PrepareExtraFilterSQL`.
- **Multi-tenancy hook.** `CreateTenantPreRunViewHook` refuses a filter that fails the check and builds `(<ExtraFilter>) AND (<tenant predicate>)`, with the tenant predicate in its own parentheses.
