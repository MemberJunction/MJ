---
"@memberjunction/codegen-lib": patch
---

Large-schema CodeGen fix (PostgreSQL): eliminate the metadata-reconciliation quadratic. `spUpdateExistingEntityFieldsFromSchema` now materializes the catalog-introspection views into temp tables + `ANALYZE` before the reconciliation join (nested-loop → hash join; one call 77.8s → 0.5s at 600 tables), and `spDeleteUnneededEntityFields` uses `SET LOCAL enable_nestloop = off` to survive stale `pg_catalog` statistics in codegen Pass 2 (502s → 0.58s). Net: PG codegen at 2,000 tables ~87 min → ~85s.

Also carries the PostgreSQL half of the U2 soft-PK guard on this same sproc (a field with `IsSoftPrimaryKey` — resolved from `additionalSchemaInfo`, with no physical PK/unique constraint — is excluded from the PK/unique material-change predicate and its flags are frozen in the UPDATE, so the physical-schema sync no longer wipes it). The guard lives here, with the sproc it guards; the SQL Server half ships as a migration in the RSU-lifecycle PR.
