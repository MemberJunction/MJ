---
"@memberjunction/codegen-lib": patch
---

Large-schema CodeGen fix (PostgreSQL): eliminate the metadata-reconciliation quadratic. `spUpdateExistingEntityFieldsFromSchema` now materializes the catalog-introspection views into temp tables + `ANALYZE` before the reconciliation join (nested-loop → hash join; one call 77.8s → 0.5s at 600 tables), and `spDeleteUnneededEntityFields` uses `SET LOCAL enable_nestloop = off` to survive stale `pg_catalog` statistics in codegen Pass 2 (502s → 0.58s). Net: PG codegen at 2,000 tables ~87 min → ~85s.
