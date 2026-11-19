---
"@memberjunction/sql-converter": patch
"@memberjunction/sqlglot-ts": patch
"@memberjunction/cli": patch
---

PostgreSQL conversion: `DROP INDEX name ON table` (bare or behind an `IF EXISTS (… sys.indexes …)` guard) becomes `DROP INDEX IF EXISTS schema."name"` on both converter paths (#5955); `WITH c AS (…) DELETE FROM c` over one table becomes a `ctid` delete on that table, and any other CTE-targeted delete is a counted gap (#3166). `mj migrate convert` renumbers EntityField Sequence collisions only in the files the run wrote, never in committed `.pg.sql` files (#3166).
