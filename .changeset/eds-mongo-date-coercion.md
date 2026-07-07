---
"@memberjunction/external-data-source-mongodb": patch
---

`MongoFilterTranslator` now coerces ISO-8601 date-time string literals (with a `T` time component) to `Date` in comparison and `IN` predicates, so range/equality filters match Mongo's native `Date`-typed fields. Without this, an incremental-sync watermark predicate like `updatedAt >= '2026-03-01T00:00:00Z'` silently matched zero documents (a string never compares equal to a BSON `Date`). Date-only and non-temporal strings pass through unchanged.
