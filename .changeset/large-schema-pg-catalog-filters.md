---
"@memberjunction/codegen-lib": minor
---

Large-schema CodeGen fix (PostgreSQL): filter system namespaces (`pg_catalog`, `information_schema`, `pg_toast*`, `pg_temp*`) in the four catalog-introspection views (`vwForeignKeys`, `vwTablePrimaryKeys`, `vwTableUniqueKeys`, `vwSQLTablesAndEntities`). They previously scanned the entire cluster catalog with no namespace filter, so `vwSQLColumnsAndEntityFields` paid per-column introspection for every system relation — a cost that grows as CodeGen inflates the catalog mid-run. MJ entities can never live in system namespaces, so no legitimate row is dropped.
