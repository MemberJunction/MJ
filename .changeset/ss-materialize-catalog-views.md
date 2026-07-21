---
"@memberjunction/codegen-lib": minor
---

SQL Server large-schema CodeGen fix: materialize the catalog-introspection views into #temp tables in `spUpdateExistingEntityFieldsFromSchema` before the reconciliation join. Joined directly, these views (over the `sys.*` catalog) get poor cardinality estimates and the optimizer nested-loops, going super-linear as CodeGen inflates the catalog mid-run — a single call measured 140s at 600 tables. #temp tables auto-get statistics so the join hash-joins (140s → 1.1s in isolation). Mirrors the pattern `spDeleteUnneededEntityFields` already uses. Migration only; behavior otherwise identical.
