---
"@memberjunction/codegen-lib": patch
---

PostgreSQL full-text search no longer depends on a SQL Server precondition: CodeGen's full-text path checks the PostgreSQL objects it actually creates instead of a SQL Server catalog/full-text-index check, so enabling full-text on a PostgreSQL entity generates its objects.
