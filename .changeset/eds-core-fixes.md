---
"@memberjunction/external-data-sources": minor
"@memberjunction/external-data-source-sqlserver": patch
"@memberjunction/external-data-source-mongodb": patch
"@memberjunction/external-data-source-oracle": patch
"@memberjunction/external-data-source-postgres": patch
"@memberjunction/external-data-source-mysql": patch
"@memberjunction/external-data-source-snowflake": patch
---

EDS incremental-read support for structured watermark sync.

- Add a structured `incrementalSince` bound (`{ Field, Value }`, inclusive `>=`) to `ExternalViewParams` so an incremental-read consumer can request "rows changed at/after a watermark" WITHOUT writing dialect SQL. The SQL drivers render `WHERE <Field> >= <literal>` via their own `quoteIdent` (shared in `BaseSqlExternalDataSourceDriver.effectiveWhere`); an overridable `formatIncrementalLiteral` lets the Oracle driver wrap the watermark in `TO_TIMESTAMP` / `TO_TIMESTAMP_TZ` (Oracle's default NLS format rejects the ISO `T`/`Z` form). Both the row SELECT **and** the paginated `COUNT(*)` (centralized in `buildCountSql`) honor the bound across all five SQL drivers — SQL Server, Postgres, MySQL, Oracle, and Snowflake (whose cast-aware builder now uses `effectiveWhere` too). Combined (ANDed) with any caller `filter`; a blank filter never drops the bound.
- The MongoDB driver / `MongoFilterTranslator` coerce ISO-8601 date-time literals to `Date` so a watermark predicate matches Mongo's native `Date`-typed fields — a string never `$gte`-matched a BSON `Date`.

**Behavior changes (deliberate):**
- **MongoDB date-literal comparisons.** A field that STORES an ISO-looking STRING no longer matches a date-literal predicate (`field >= '<iso>'`): the literal is now a `Date`, which never equals a stored string. This is the mirror of the zero-match bug being fixed; native `Date` fields are the common case and are what a watermark needs. A source that genuinely stores ISO strings should compare via `RunNativeQuery`.
- **Zoneless timestamps are interpreted as UTC.** An ISO watermark without an explicit `Z`/offset (e.g. `2026-03-01T00:00:00`) is treated as UTC — never the API server's local time — so a watermark is timezone-stable regardless of where the server runs (shared `parseIso8601AsUtc`). For a naive (no-time-zone) source column, incremental correctness remains time-zone sensitive; run against UTC-normalized data or a zone-aware column for exact boundaries.

Otherwise additive and backward-compatible: omitting `incrementalSince` reproduces prior behavior exactly for existing RunView / live-read / materialize callers.
