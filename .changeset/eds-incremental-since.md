---
"@memberjunction/external-data-sources": minor
"@memberjunction/external-data-source-sqlserver": patch
"@memberjunction/external-data-source-mongodb": patch
"@memberjunction/external-data-source-oracle": patch
---

Add a structured `incrementalSince` bound (`{ Field, Value }`, inclusive `>=`) to `ExternalViewParams` so incremental-read consumers can request "rows changed at/after a watermark" WITHOUT writing dialect SQL. The SQL drivers render it to a quoted `WHERE <Field> >= <literal>` via their own `quoteIdent` (shared in `BaseSqlExternalDataSourceDriver.effectiveWhere`, so Postgres/MySQL/Oracle/Snowflake inherit it); the MongoDB driver coerces the value (ISO → `Date`, numeric → number) and ANDs it into the query. Combined with any caller `filter`. Fully additive and backward-compatible — omitting it reproduces prior behavior exactly.
