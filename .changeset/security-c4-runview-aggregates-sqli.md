---
"@memberjunction/sql-parser": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/server": patch
---

Close stacked-SQL injection through RunView `Aggregates[].expression`. The provider no longer runs a caller's aggregate text. Each expression must be a single aggregate function call over the entity's columns, and the query runs the SQL that the new `CheckAggregateExpression` (in `@memberjunction/sql-parser`) rebuilds from the checked parse tree, with the dialect's quoting. Any other expression returns a per-aggregate error, and the rows and the other aggregates still load. Some expressions that used to run are now refused: arithmetic or functions around the aggregate call (`SUM(x) + 1`, `ROUND(AVG(x), 2)`, `SUM(x) / COUNT(*)`), `CONVERT` (use `CAST`), window clauses, PostgreSQL `FILTER (WHERE …)` and `EXTRACT`, a backslash inside a quoted string or identifier, and `COUNT_BIG(*)` and `TRY_CAST`, which the parser cannot read. The GraphQL boundary screen that guards ExtraFilter and OrderBy now also screens aggregate expressions. `SQLParser.HasStackedStatements` now reads tokens with the dialect's lexer, so a statement separator after a PostgreSQL `E'…'` string is no longer missed.
