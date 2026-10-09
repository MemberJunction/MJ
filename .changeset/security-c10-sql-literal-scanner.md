---
"@memberjunction/global": patch
"@memberjunction/core": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/server": patch
"@memberjunction/sqlserver-dataprovider": patch
---

Security: the SQL screens now read quotes, identifiers and comments the way the database does. A new dialect-aware scanner, `ScanSQLForScreening` in `@memberjunction/global`, replaces the regex behind `StripSQLStringLiterals`. It understands T-SQL `[…]` identifiers, double-quoted identifiers, `''` escapes, PostgreSQL `E'…'` and dollar-quoted strings, and `--` and nested block comments. It rejects text it cannot classify, such as an unterminated literal. Before this change, a quote inside a bracket identifier, a comment, or a PostgreSQL string opened a literal the database never saw, so `ValidateUserProvidedSQLClause` and `SQLExpressionValidator` accepted a stacked statement hidden behind it. Providers now pass their dialect to the clause screen and the ad-hoc query screen. `SQLValidationOptions.Dialect` and the optional `dialect` argument of `ValidateFullQuery` and `StripSQLStringLiterals` let other callers do the same. Without a dialect, SQL must pass under both SQL Server and PostgreSQL rules.
