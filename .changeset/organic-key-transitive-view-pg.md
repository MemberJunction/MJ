---
'@memberjunction/codegen-lib': patch
---

CodeGen now creates organic-key `TransitiveView` bridge views on PostgreSQL (#4409).

The DDL was hardcoded as SQL Server's `CREATE OR ALTER VIEW`, which PostgreSQL rejects, so any
PostgreSQL deployment declaring a `TransitiveView` got neither the view nor the organic key it
backs — and the run still reported success, because the failure is caught per key and logged.

The statement now comes from a new provider hook, `CodeGenDatabaseProvider.generateCreateOrReplaceViewSQL`:

- **SQL Server** — `CREATE OR ALTER VIEW`, unchanged in behavior.
- **PostgreSQL** — `CREATE OR REPLACE VIEW`, falling back to drop-and-recreate when the body changes
  the column list (SQLSTATE `42P16`). The drop is not `CASCADE`: if a user-owned object depends on
  the view, the run fails with PostgreSQL's dependency error instead of silently destroying it.

Also fixed: on SQL Server the view was logged to the `CodeGen_Run_*.sql` migration without a `GO`
after it, so replaying that migration failed on the next statement. The view body is now documented
as dialect-specific — on PostgreSQL it is not auto-quoted, so mixed-case identifiers must be quoted.
