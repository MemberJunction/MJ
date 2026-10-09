---
"@memberjunction/sql-parser": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/server": patch
---

Close stacked-SQL injection through RunView `Aggregates[].expression`. The provider now accepts an aggregate expression only when it is a single aggregate function call over the entity's columns, read with the dialect's tokenizer (new `CheckAggregateExpression` in `@memberjunction/sql-parser`), and returns any other expression as a per-aggregate error without running it. The GraphQL boundary screen that already guards ExtraFilter and OrderBy now screens every aggregate expression too.
