---
"@memberjunction/postgresql-dataprovider": patch
"@memberjunction/metadata-sync": patch
---

Parse PostgreSQL NUMERIC/DECIMAL and BIGINT values to JS numbers. node-postgres returns both types as strings by default, so on Postgres-backed installs every decimal/bigint column surfaced as a string through RunView/GraphQL — Explorer UI code that assumes numbers threw `TypeError: cost.toFixed is not a function` on every change-detection cycle (AI Agent Run → Analytics tab console flood) and token totals string-concatenated instead of summing (e.g. 16,972 + 437 rendered as 16,972,437). New pool-scoped `MJPostgresTypes` parser config (exported for external pool creators): NUMERIC → parseFloat (matching the SQL Server provider's tedious semantics), BIGINT → Number with string passthrough beyond the safe-integer range. Applied to the provider's own pool and MetadataSync's shared pool; binary-format values and all other OIDs keep pg defaults.
