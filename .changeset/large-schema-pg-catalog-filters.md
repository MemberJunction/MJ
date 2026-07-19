---
"@memberjunction/sql-converter": patch
"@memberjunction/codegen-lib": patch
---

Large-schema CodeGen fix (PostgreSQL): filter system namespaces (`pg_catalog`, `information_schema`, `pg_toast*`, `pg_temp*`) in the four catalog-introspection views (`vwForeignKeys`, `vwTablePrimaryKeys`, `vwTableUniqueKeys`, `vwSQLTablesAndEntities`). They previously scanned the entire cluster catalog with no namespace filter, so `vwSQLColumnsAndEntityFields` paid per-column introspection for every system relation — a cost that grows as CodeGen inflates the catalog mid-run. MJ entities can never live in system namespaces, so no legitimate row is dropped.

The fix is applied in BOTH channels so it survives a PG baseline regeneration: the migration patches the deployed views, and `@memberjunction/sql-converter`'s `CatalogViewRule` (the generator that emits these views when a PG baseline is cut) now emits the same filter — previously only the migration carried it, so the next regenerated baseline would have silently reverted the fix.
