---
"@memberjunction/sql-dialect": patch
"@memberjunction/codegen-lib": patch
---

Wide-table correctness floor (SQL Server). CRUD stored procedures emit ~2 parameters per nullable column (a `_Clear` companion + the value), so a wide or sparse-column table can exceed SQL Server's hard 2,100-parameter procedure limit and silently generate an un-creatable procedure. This adds:

- `SQLDialect.MaxProcedureParams` (SQL Server 2100, PostgreSQL 100, base null).
- An emit-time guard in `generateCRUDParamString` (base + the PostgreSQL override) that throws with a diagnosed message when the projected parameter count exceeds the limit, and warns above 85% — before any SQL is written, replacing a late "missing routine" failure. Only fires on the typed-parameter path, so it never false-fires on PostgreSQL wide entities (which auto-route to the single-JSON-argument shape).
- Failed `CREATE`/`CREATE OR ALTER` of a procedure/view/function/trigger in `executeSQLFileViaShell` now logs at error severity with the object name (benign batch failures stay warnings); control flow is unchanged so the downstream CRUD-validator self-heal still runs.

Roadmap for the follow-on work (SQL Server JSON-arg shape, boot-heap reduction, measurement harness) is in `plans/wide-table-scaling.md`.
