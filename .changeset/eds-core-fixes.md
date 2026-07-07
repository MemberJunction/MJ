---
"@memberjunction/external-data-sources": minor
"@memberjunction/external-data-source-sqlserver": patch
"@memberjunction/external-data-source-mongodb": patch
"@memberjunction/external-data-source-oracle": patch
---

EDS incremental-read support for structured watermark sync.

- Add a structured `incrementalSince` bound (`{ Field, Value }`, inclusive `>=`) to `ExternalViewParams` so an incremental-read consumer can request "rows changed at/after a watermark" WITHOUT writing dialect SQL. The SQL drivers render `WHERE <Field> >= <literal>` via their own `quoteIdent` (shared in `BaseSqlExternalDataSourceDriver.effectiveWhere`, so Postgres/MySQL/Oracle/Snowflake inherit it); an overridable `formatIncrementalLiteral` lets the Oracle driver wrap an ISO-8601 watermark in `TO_TIMESTAMP` (Oracle's default NLS format rejects the `T`/`Z` form). Combined (ANDed) with any caller `filter`.
- The MongoDB driver / `MongoFilterTranslator` coerce ISO-8601 date-time literals to `Date` (ISO → `Date`, numeric → number) so a watermark predicate matches Mongo's native `Date`-typed fields — a string never `$gte`-matched a BSON `Date`.

Fully additive and backward-compatible: omitting `incrementalSince` reproduces prior behavior exactly for existing RunView / live-read / materialize callers.
